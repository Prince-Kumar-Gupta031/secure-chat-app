"""Phase 2 — Group chat, search, group socket events."""
import asyncio
import os
import random
import time
import pytest
import requests


def _load_backend_url() -> str:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"
ADMIN_MOBILE = "7209674114"
ADMIN_PASSWORD = "admin"
S: dict = {}


def _suf() -> str:
    return f"{int(time.time() % 100000)}{random.randint(100, 999)}"


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_and_approve(admin_token, tag="U"):
    suf = _suf() + tag
    payload = {
        "full_name": f"TEST_{tag}_{suf}",
        "mobile": f"73{suf}"[:10],
        "employee_id": f"TEST-{tag}-{suf}",
        "department": "Phase2",
        "password": "Pass@123",
    }
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    users = requests.get(f"{API}/admin/users?status=pending",
                         headers=_hdr(admin_token)).json()
    u = next((x for x in users if x["mobile"] == payload["mobile"]), None)
    assert u
    requests.post(f"{API}/admin/users/{u['id']}/approve",
                  headers=_hdr(admin_token)).raise_for_status()
    login = requests.post(f"{API}/auth/login",
                          json={"mobile": payload["mobile"],
                                "password": payload["password"]}).json()
    return {"id": u["id"], "token": login["token"],
            "mobile": payload["mobile"], "password": payload["password"],
            "name": payload["full_name"]}


# ---------- Bootstrap: admin + 3 users ----------
class TestBootstrap:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"mobile": ADMIN_MOBILE,
                                "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        S["admin_token"] = r.json()["token"]
        S["admin_id"] = r.json()["user"]["id"]

    def test_create_three_users(self):
        S["u1"] = _register_and_approve(S["admin_token"], "A")
        S["u2"] = _register_and_approve(S["admin_token"], "B")
        S["u3"] = _register_and_approve(S["admin_token"], "C")
        assert S["u1"]["id"] != S["u2"]["id"] != S["u3"]["id"]


# ---------- Group CRUD ----------
class TestGroupCRUD:
    def test_create_group_requires_name(self):
        r = requests.post(f"{API}/groups",
                          json={"name": "", "participant_ids": [S["u2"]["id"]]},
                          headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 400

    def test_create_group_requires_member(self):
        r = requests.post(f"{API}/groups",
                          json={"name": "Solo", "participant_ids": []},
                          headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 400

    def test_create_group_success(self):
        r = requests.post(
            f"{API}/groups",
            json={"name": "TEST_Project Falcon",
                  "participant_ids": [S["u2"]["id"], S["u3"]["id"]]},
            headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["is_group"] is True
        assert g["group_name"] == "TEST_Project Falcon"
        assert S["u1"]["id"] in g["group_admins"]
        assert set(g["participants"]) == {S["u1"]["id"], S["u2"]["id"], S["u3"]["id"]}
        assert g["members"] and len(g["members"]) == 3
        assert g["peer"] is None
        S["gid"] = g["id"]

    def test_get_chat_for_group(self):
        r = requests.get(f"{API}/chats/{S['gid']}",
                         headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 200
        g = r.json()
        assert g["is_group"] is True
        assert g["group_name"] == "TEST_Project Falcon"

    def test_get_chat_404_for_non_member(self):
        other = _register_and_approve(S["admin_token"], "X")
        r = requests.get(f"{API}/chats/{S['gid']}",
                         headers=_hdr(other["token"]))
        assert r.status_code == 404
        S["outsider"] = other

    def test_list_chats_includes_group(self):
        r = requests.get(f"{API}/chats", headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 200
        chats = r.json()
        g = next((c for c in chats if c["id"] == S["gid"]), None)
        assert g and g["is_group"] is True
        assert g["group_name"] == "TEST_Project Falcon"

    def test_update_group_admin_only(self):
        # u2 is not admin
        r = requests.put(f"{API}/groups/{S['gid']}",
                         json={"name": "Hacked"},
                         headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 403
        # admin can update
        r2 = requests.put(f"{API}/groups/{S['gid']}",
                          json={"name": "TEST_Falcon v2",
                                "icon": "https://x/icon.png"},
                          headers=_hdr(S["u1"]["token"]))
        assert r2.status_code == 200
        assert r2.json()["group_name"] == "TEST_Falcon v2"
        assert r2.json()["group_icon"] == "https://x/icon.png"


# ---------- Members & Admins ----------
class TestMembership:
    def test_add_member(self):
        out = S["outsider"]
        r = requests.post(f"{API}/groups/{S['gid']}/members",
                          json={"user_ids": [out["id"]]},
                          headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        assert out["id"] in r.json()["participants"]

    def test_add_member_non_admin_forbidden(self):
        # u2 is not admin; try to add some user
        r = requests.post(f"{API}/groups/{S['gid']}/members",
                          json={"user_ids": [S["admin_id"]]},
                          headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 403

    def test_promote_to_admin(self):
        r = requests.post(f"{API}/groups/{S['gid']}/admins/{S['u2']['id']}",
                          headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        # confirm
        g = requests.get(f"{API}/chats/{S['gid']}",
                        headers=_hdr(S["u1"]["token"])).json()
        assert S["u2"]["id"] in g["group_admins"]

    def test_demote_admin(self):
        r = requests.delete(f"{API}/groups/{S['gid']}/admins/{S['u2']['id']}",
                            headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        g = requests.get(f"{API}/chats/{S['gid']}",
                         headers=_hdr(S["u1"]["token"])).json()
        assert S["u2"]["id"] not in g["group_admins"]

    def test_cannot_demote_last_admin(self):
        r = requests.delete(f"{API}/groups/{S['gid']}/admins/{S['u1']['id']}",
                            headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 400

    def test_remove_member_by_admin(self):
        r = requests.delete(
            f"{API}/groups/{S['gid']}/members/{S['outsider']['id']}",
            headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        g = requests.get(f"{API}/chats/{S['gid']}",
                         headers=_hdr(S["u1"]["token"])).json()
        assert S["outsider"]["id"] not in g["participants"]

    def test_user_can_remove_self(self):
        # u3 removes self
        r = requests.delete(
            f"{API}/groups/{S['gid']}/members/{S['u3']['id']}",
            headers=_hdr(S["u3"]["token"]))
        assert r.status_code == 200

    def test_non_admin_cannot_remove_other(self):
        # add u3 back first
        requests.post(f"{API}/groups/{S['gid']}/members",
                      json={"user_ids": [S["u3"]["id"]]},
                      headers=_hdr(S["u1"]["token"]))
        # u2 (non-admin) tries to remove u3
        r = requests.delete(
            f"{API}/groups/{S['gid']}/members/{S['u3']['id']}",
            headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 403

    def test_leave_group_promotes_admin(self):
        # Create a fresh group where u1 is only admin and leaves
        r = requests.post(f"{API}/groups",
                          json={"name": "TEST_LeaveTest",
                                "participant_ids": [S["u2"]["id"]]},
                          headers=_hdr(S["u1"]["token"]))
        gid = r.json()["id"]
        # u1 leaves
        lr = requests.post(f"{API}/groups/{gid}/leave",
                           headers=_hdr(S["u1"]["token"]))
        assert lr.status_code == 200
        # u2 should now be admin
        g = requests.get(f"{API}/chats/{gid}",
                         headers=_hdr(S["u2"]["token"])).json()
        assert S["u2"]["id"] in g["group_admins"]
        assert S["u1"]["id"] not in g["participants"]


# ---------- Group messages via Socket.IO ----------
@pytest.mark.asyncio
async def test_group_send_message_broadcast():
    import socketio as sio_mod
    c1 = sio_mod.AsyncClient(reconnection=False)
    c2 = sio_mod.AsyncClient(reconnection=False)
    c3 = sio_mod.AsyncClient(reconnection=False)
    msgs = {"c1": [], "c2": [], "c3": []}

    @c1.on("new_message")
    async def _1(d): msgs["c1"].append(d)
    @c2.on("new_message")
    async def _2(d): msgs["c2"].append(d)
    @c3.on("new_message")
    async def _3(d): msgs["c3"].append(d)

    await c1.connect(BASE_URL, socketio_path="/api/socket.io",
                     auth={"token": S["u1"]["token"]}, transports=["polling"])
    await c2.connect(BASE_URL, socketio_path="/api/socket.io",
                     auth={"token": S["u2"]["token"]}, transports=["polling"])
    await c3.connect(BASE_URL, socketio_path="/api/socket.io",
                     auth={"token": S["u3"]["token"]}, transports=["polling"])
    await asyncio.sleep(0.6)

    ack = await c1.call("send_message",
                        {"chat_id": S["gid"], "text": "TEST_group-hello"})
    await asyncio.sleep(1.0)
    assert ack and ack.get("ok"), f"ack: {ack}"
    m = ack["message"]
    assert m["is_group"] is True
    assert m["receiver_id"] is None
    assert m["status"] == "sent"
    assert S["u1"]["id"] in m["read_by"]
    # All three should have received
    assert any(x.get("text") == "TEST_group-hello" for x in msgs["c1"])
    assert any(x.get("text") == "TEST_group-hello" for x in msgs["c2"])
    assert any(x.get("text") == "TEST_group-hello" for x in msgs["c3"])
    S["last_group_msg_id"] = m["id"]

    await c1.disconnect()
    await c2.disconnect()
    await c3.disconnect()


@pytest.mark.asyncio
async def test_group_typing_broadcast():
    import socketio as sio_mod
    c1 = sio_mod.AsyncClient(reconnection=False)
    c2 = sio_mod.AsyncClient(reconnection=False)
    typing_ev = []
    @c2.on("typing")
    async def _t(d): typing_ev.append(d)

    await c1.connect(BASE_URL, socketio_path="/api/socket.io",
                     auth={"token": S["u1"]["token"]}, transports=["polling"])
    await c2.connect(BASE_URL, socketio_path="/api/socket.io",
                     auth={"token": S["u2"]["token"]}, transports=["polling"])
    await asyncio.sleep(0.5)

    await c1.emit("typing", {"chat_id": S["gid"], "typing": True})
    await asyncio.sleep(0.8)
    assert any(
        e.get("chat_id") == S["gid"] and e.get("user_id") == S["u1"]["id"]
        and e.get("typing") is True for e in typing_ev), f"typing: {typing_ev}"

    await c1.disconnect()
    await c2.disconnect()


# ---------- read_by tracking ----------
class TestGroupRead:
    def test_read_adds_to_read_by(self):
        # u2 marks as read
        r = requests.post(f"{API}/chats/{S['gid']}/read",
                          headers=_hdr(S["u2"]["token"]))
        assert r.status_code == 200
        # Verify read_by contains u2
        msgs = requests.get(f"{API}/chats/{S['gid']}/messages",
                            headers=_hdr(S["u1"]["token"])).json()
        last = msgs[-1]
        assert S["u2"]["id"] in last.get("read_by", []), \
            f"read_by missing u2: {last.get('read_by')}"


# ---------- in-chat search ----------
class TestSearch:
    def test_in_chat_message_search(self):
        r = requests.get(f"{API}/chats/{S['gid']}/messages",
                         params={"q": "group-hello"},
                         headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        msgs = r.json()
        assert any("group-hello" in (m.get("text") or "") for m in msgs)
        # negative
        r2 = requests.get(f"{API}/chats/{S['gid']}/messages",
                          params={"q": "zzz_no_match_xyz"},
                          headers=_hdr(S["u1"]["token"]))
        assert r2.json() == []

    def test_global_message_search(self):
        r = requests.get(f"{API}/search/messages",
                         params={"q": "group-hello"},
                         headers=_hdr(S["u1"]["token"]))
        assert r.status_code == 200
        results = r.json()
        assert results, "global search returned empty"
        first = results[0]
        assert "chat_label" in first
        assert first["chat_label"] == "TEST_Falcon v2"
