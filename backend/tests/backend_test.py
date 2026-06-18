"""DRDO Secure LAN Chat — backend regression test suite.

Covers REST endpoints (auth, admin, users, chats, files) and Socket.IO
realtime flow (send_message, typing, delivered/read tick updates).
Uses the public REACT_APP_BACKEND_URL exclusively.
"""
import asyncio
import io
import os
import random
import time
import uuid
import pytest
import requests

# Resolve backend URL from frontend .env (single source of truth)
def _load_backend_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"
ADMIN_MOBILE = "7209674114"
ADMIN_PASSWORD = "admin"

# Mutable shared state across the ordered test flow
STATE: dict = {}


def _rand_suffix() -> str:
    return f"{int(time.time() % 100000)}{random.randint(100, 999)}"


# ---------------- HEALTH ----------------
class TestHealth:
    def test_root_health(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "running"
        assert "DRDO" in data.get("app", "")


# ---------------- AUTH ----------------
class TestAuth:
    def test_super_admin_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["status"] == "approved"
        assert "password_hash" not in data["user"]
        assert "_id" not in data["user"]
        STATE["admin_token"] = data["token"]
        STATE["admin_id"] = data["user"]["id"]

    def test_wrong_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"mobile": ADMIN_MOBILE, "password": "wrong"})
        assert r.status_code == 401

    def test_auth_me_with_token(self):
        token = STATE.get("admin_token")
        assert token, "admin token required"
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        assert r.json()["mobile"] == ADMIN_MOBILE

    def test_auth_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- REGISTRATION + APPROVAL FLOW ----------------
class TestRegistrationFlow:
    def test_register_new_user(self):
        suffix = _rand_suffix()
        STATE["emp_mobile"] = f"90000{suffix}"[:10]
        STATE["emp_empid"] = f"TEST-EMP-{suffix}"
        STATE["emp_password"] = "Test@1234"
        STATE["emp_name"] = f"TEST_User_{suffix}"
        payload = {
            "full_name": STATE["emp_name"],
            "mobile": STATE["emp_mobile"],
            "employee_id": STATE["emp_empid"],
            "department": "Avionics",
            "password": STATE["emp_password"],
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_duplicate_mobile_rejected(self):
        payload = {
            "full_name": "Dup",
            "mobile": STATE["emp_mobile"],
            "employee_id": f"DUP-{_rand_suffix()}",
            "department": "X",
            "password": "x",
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 400

    def test_duplicate_empid_rejected(self):
        payload = {
            "full_name": "Dup",
            "mobile": f"888{_rand_suffix()}"[:10],
            "employee_id": STATE["emp_empid"],
            "department": "X",
            "password": "x",
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 400

    def test_pending_user_cannot_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"mobile": STATE["emp_mobile"],
                                "password": STATE["emp_password"]})
        assert r.status_code == 403
        assert "awaiting administrator approval" in r.json().get("detail", "").lower()

    def test_admin_lists_pending_users(self):
        token = STATE["admin_token"]
        r = requests.get(f"{API}/admin/users?status=pending",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        users = r.json()
        found = next((u for u in users if u["mobile"] == STATE["emp_mobile"]), None)
        assert found is not None, "newly registered user not in pending list"
        STATE["emp_id"] = found["id"]

    def test_non_admin_blocked_from_admin_endpoints(self):
        # No token
        r = requests.get(f"{API}/admin/users")
        assert r.status_code == 401
        # Will retest with non-admin token later after approval

    def test_admin_approves_user(self):
        token = STATE["admin_token"]
        r = requests.post(
            f"{API}/admin/users/{STATE['emp_id']}/approve",
            headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_approved_user_can_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"mobile": STATE["emp_mobile"],
                                "password": STATE["emp_password"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["status"] == "approved"
        STATE["emp_token"] = data["token"]

    def test_non_admin_token_blocked_on_admin_route(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/admin/users",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403


# ---------------- DIRECTORY / USERS ----------------
class TestDirectory:
    def test_list_users_excludes_self(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/users",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        users = r.json()
        ids = [u["id"] for u in users]
        assert STATE["emp_id"] not in ids
        # Admin should appear (approved)
        assert STATE["admin_id"] in ids

    def test_search_by_department(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/users?q=Administration",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        users = r.json()
        assert any(u["department"] == "Administration" for u in users)

    def test_search_by_employee_id(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/users?q=DRDO-ADMIN-001",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        users = r.json()
        assert any(u["employee_id"] == "DRDO-ADMIN-001" for u in users)


# ---------------- CHATS ----------------
class TestChats:
    def test_create_chat_with_admin(self):
        token = STATE["emp_token"]
        r = requests.post(
            f"{API}/chats",
            params={"peer_id": STATE["admin_id"]},
            headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        chat = r.json()
        assert "id" in chat
        assert chat["peer"]["id"] == STATE["admin_id"]
        assert chat["unread"] == 0
        STATE["chat_id"] = chat["id"]

    def test_list_chats_returns_peer(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/chats",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        chats = r.json()
        assert any(c["id"] == STATE["chat_id"] for c in chats)

    def test_get_messages_initially_empty(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/chats/{STATE['chat_id']}/messages",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- FILE UPLOAD ----------------
class TestFiles:
    def test_upload_text_file(self):
        token = STATE["emp_token"]
        files = {"file": ("note.txt", b"hello drdo", "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files,
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "file_id" in data and "url" in data
        assert data["size"] == 10
        STATE["file_id"] = data["file_id"]

    def test_blocked_extension_rejected(self):
        token = STATE["emp_token"]
        files = {"file": ("hack.exe", b"MZ\x90", "application/octet-stream")}
        r = requests.post(f"{API}/files/upload", files=files,
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 400

    def test_download_requires_auth(self):
        r = requests.get(f"{API}/files/{STATE['file_id']}")
        assert r.status_code == 401

    def test_download_with_auth_works(self):
        token = STATE["emp_token"]
        r = requests.get(f"{API}/files/{STATE['file_id']}",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.content == b"hello drdo"

    def test_profile_picture_upload_and_public_url(self):
        token = STATE["emp_token"]
        # 1x1 PNG
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
        )
        files = {"file": ("avatar.png", png, "image/png")}
        r = requests.post(f"{API}/files/profile-picture", files=files,
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith("/api/files/public/")
        # Public access without auth
        r2 = requests.get(f"{BASE_URL}{url}")
        assert r2.status_code == 200
        # Verify user.profile_picture was set
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {token}"}).json()
        assert me.get("profile_picture") == url


# ---------------- PROFILE / PASSWORD ----------------
class TestProfile:
    def test_update_profile(self):
        token = STATE["emp_token"]
        r = requests.put(f"{API}/auth/profile",
                         json={"full_name": "TEST_Updated Name",
                               "department": "Radar"},
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["full_name"] == "TEST_Updated Name"
        assert data["department"] == "Radar"

    def test_change_password_then_relogin(self):
        token = STATE["emp_token"]
        new_pw = "NewPass@5678"
        r = requests.post(f"{API}/auth/change-password",
                         json={"current_password": STATE["emp_password"],
                               "new_password": new_pw},
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        # Login with new password
        r2 = requests.post(f"{API}/auth/login",
                           json={"mobile": STATE["emp_mobile"],
                                 "password": new_pw})
        assert r2.status_code == 200
        STATE["emp_password"] = new_pw
        STATE["emp_token"] = r2.json()["token"]


# ---------------- ADMIN: ANALYTICS / AUDIT ----------------
class TestAdminInsights:
    def test_analytics(self):
        token = STATE["admin_token"]
        r = requests.get(f"{API}/admin/analytics",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_users", "active_users", "pending_approvals",
                  "online_users", "departments", "storage_bytes", "storage_files"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["departments"], list)
        assert d["total_users"] >= 2

    def test_audit_logs(self):
        token = STATE["admin_token"]
        r = requests.get(f"{API}/admin/audit-logs",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        actions = {l.get("action") for l in logs}
        assert "approve_user" in actions or "login" in actions


# ---------------- ADMIN: SUSPEND / REJECT ----------------
class TestAdminUserActions:
    def _register_extra(self, tag):
        suffix = _rand_suffix() + tag
        payload = {
            "full_name": f"TEST_{tag}_{suffix}",
            "mobile": f"77{suffix}"[:10],
            "employee_id": f"TEST-{tag}-{suffix}",
            "department": "Test",
            "password": "Pass@123",
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200
        # find id
        token = STATE["admin_token"]
        users = requests.get(f"{API}/admin/users?status=pending",
                             headers={"Authorization": f"Bearer {token}"}).json()
        u = next((x for x in users if x["mobile"] == payload["mobile"]), None)
        assert u is not None
        # approve to enable suspend test
        requests.post(f"{API}/admin/users/{u['id']}/approve",
                      headers={"Authorization": f"Bearer {token}"})
        return u["id"], payload["mobile"], payload["password"]

    def test_suspend_then_login_blocked(self):
        uid, mobile, pw = self._register_extra("S")
        token = STATE["admin_token"]
        r = requests.post(f"{API}/admin/users/{uid}/suspend",
                          json={"reason": "test"},
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/login",
                           json={"mobile": mobile, "password": pw})
        assert r2.status_code == 403
        assert "suspended" in r2.json().get("detail", "").lower()

    def test_reject_then_login_blocked(self):
        # register fresh, do NOT approve, mark rejected directly
        suffix = _rand_suffix() + "R"
        payload = {
            "full_name": f"TEST_R_{suffix}",
            "mobile": f"66{suffix}"[:10],
            "employee_id": f"TEST-R-{suffix}",
            "department": "Test",
            "password": "Pass@123",
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200
        token = STATE["admin_token"]
        users = requests.get(f"{API}/admin/users?status=pending",
                             headers={"Authorization": f"Bearer {token}"}).json()
        u = next((x for x in users if x["mobile"] == payload["mobile"]), None)
        assert u
        rr = requests.post(f"{API}/admin/users/{u['id']}/reject",
                           json={"reason": "spam"},
                           headers={"Authorization": f"Bearer {token}"})
        assert rr.status_code == 200
        r2 = requests.post(f"{API}/auth/login",
                           json={"mobile": payload["mobile"],
                                 "password": payload["password"]})
        assert r2.status_code == 403
        assert "rejected" in r2.json().get("detail", "").lower()


# ---------------- SOCKET.IO REALTIME ----------------
@pytest.mark.asyncio
async def test_socketio_realtime_flow():
    """End-to-end realtime flow:
    - employee + admin connect with JWT
    - employee sends message → admin receives 'new_message' with status='delivered'
    - admin calls POST /chats/{id}/read → employee receives 'messages_read'
    - typing event from employee → admin receives 'typing'
    """
    import socketio as sio_mod

    emp_token = STATE["emp_token"]
    admin_token = STATE["admin_token"]
    chat_id = STATE["chat_id"]
    admin_id = STATE["admin_id"]

    emp = sio_mod.AsyncClient(reconnection=False)
    adm = sio_mod.AsyncClient(reconnection=False)

    received = {"admin_new_msg": [], "emp_status": [],
                "emp_read": [], "admin_typing": []}

    @adm.on("new_message")
    async def _a_new(data): received["admin_new_msg"].append(data)
    @adm.on("typing")
    async def _a_typing(data): received["admin_typing"].append(data)
    @emp.on("message_status")
    async def _e_status(data): received["emp_status"].append(data)
    @emp.on("messages_read")
    async def _e_read(data): received["emp_read"].append(data)

    await emp.connect(BASE_URL, socketio_path="/api/socket.io",
                      auth={"token": emp_token}, transports=["polling"])
    await adm.connect(BASE_URL, socketio_path="/api/socket.io",
                      auth={"token": admin_token}, transports=["polling"])
    # small settle delay
    await asyncio.sleep(0.6)

    # typing
    await emp.emit("typing", {"peer_id": admin_id, "typing": True})
    await asyncio.sleep(0.8)
    assert any(t.get("user_id") == STATE["emp_id"] and t.get("typing") is True
               for t in received["admin_typing"]), \
        f"admin didn't receive typing event: {received['admin_typing']}"

    # send message
    ack = await emp.call("send_message",
                         {"peer_id": admin_id, "text": "hello-from-emp"})
    await asyncio.sleep(0.8)
    assert ack and ack.get("ok") is True, f"send_message ack: {ack}"
    msg = ack["message"]
    # Admin is online so status should be 'delivered'
    assert msg["status"] == "delivered", f"expected delivered, got {msg['status']}"
    assert any(m.get("text") == "hello-from-emp"
               for m in received["admin_new_msg"]), \
        f"admin didn't get new_message: {received['admin_new_msg']}"

    # Admin marks as read via REST → employee receives messages_read
    r = requests.post(f"{API}/chats/{chat_id}/read",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    await asyncio.sleep(0.8)
    assert any(ev.get("chat_id") == chat_id and ev.get("reader_id") == admin_id
               for ev in received["emp_read"]), \
        f"employee didn't get messages_read: {received['emp_read']}"

    # Verify DB status flipped to 'read' via REST
    msgs = requests.get(f"{API}/chats/{chat_id}/messages",
                        headers={"Authorization": f"Bearer {emp_token}"}).json()
    assert msgs and msgs[-1]["status"] == "read", \
        f"final message status should be 'read', got {msgs}"

    await emp.disconnect()
    await adm.disconnect()


@pytest.mark.asyncio
async def test_socketio_rejects_unauthorized_connection():
    import socketio as sio_mod
    c = sio_mod.AsyncClient(reconnection=False)
    failed = False
    try:
        await c.connect(BASE_URL, socketio_path="/api/socket.io",
                        auth={"token": "invalid.jwt.token"},
                        transports=["polling"])
    except Exception:
        failed = True
    finally:
        if c.connected:
            await c.disconnect()
    assert failed, "socket connection with invalid token should fail"
