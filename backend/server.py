"""DRDO Secure LAN Chat - FastAPI + Socket.IO backend."""
import os
import logging
import shutil
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import (
    FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio

from models import (
    UserRegister, UserLogin, UserPublic, UserUpdate, ChangePasswordRequest,
    MessageCreate, Message, Chat, AdminAnalytics, AdminUserAction,
    now_iso, new_id,
)
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user_id, get_current_user_payload, require_admin,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "100")) * 1024 * 1024

BLOCKED_EXTENSIONS = {".exe", ".bat", ".cmd", ".sh", ".msi", ".com", ".scr",
                      ".vbs", ".js", ".jar", ".ps1", ".dll", ".app", ".apk"}
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf",
                         "application/msword",
                         "application/vnd.openxmlformats-officedocument",
                         "application/vnd.ms-excel",
                         "application/vnd.ms-powerpoint",
                         "application/zip",
                         "text/")

# --- FastAPI app + Socket.IO ASGI mount ---
fastapi_app = FastAPI(title="DRDO Secure LAN Chat")
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*",
                           ping_interval=20, ping_timeout=40)

api = APIRouter(prefix="/api")
logger = logging.getLogger("drdo")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

# In-memory presence map: user_id -> set of sids
ONLINE: dict = {}
SID_TO_USER: dict = {}


def _public_user(doc: dict) -> dict:
    if not doc:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    doc["online"] = doc["id"] in ONLINE
    return doc


def _chat_pair_id(a: str, b: str) -> List[str]:
    return sorted([a, b])


# ---------- AUTH ----------
@api.post("/auth/register")
async def register(body: UserRegister):
    if await db.users.find_one({"mobile": body.mobile}):
        raise HTTPException(400, "Mobile number already registered")
    if await db.users.find_one({"employee_id": body.employee_id}):
        raise HTTPException(400, "Employee ID already registered")
    user = {
        "id": new_id(),
        "full_name": body.full_name,
        "mobile": body.mobile,
        "employee_id": body.employee_id,
        "department": body.department,
        "password_hash": hash_password(body.password),
        "profile_picture": body.profile_picture,
        "role": "employee",
        "status": "pending",
        "must_change_password": False,
        "last_seen": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    return {"ok": True, "message": "Registration submitted. Awaiting admin approval."}


@api.post("/auth/login")
async def login(body: UserLogin):
    user = await db.users.find_one({"mobile": body.mobile})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid mobile number or password")
    status_ = user.get("status", "pending")
    if status_ == "pending":
        raise HTTPException(403, "Your account is awaiting administrator approval.")
    if status_ == "rejected":
        raise HTTPException(403, "Your account has been rejected. Please contact administrator.")
    if status_ == "suspended":
        raise HTTPException(403, "Your account has been suspended.")
    token = create_access_token(user["id"], user.get("role", "employee"))
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"last_seen": now_iso()}})
    await db.audit_logs.insert_one({
        "id": new_id(), "user_id": user["id"], "action": "login",
        "at": now_iso(), "meta": {}
    })
    return {"token": token, "user": _public_user(user)}


@api.get("/auth/me")
async def me(uid: str = Depends(get_current_user_id)):
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "User not found")
    return _public_user(user)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordRequest,
                          uid: str = Depends(get_current_user_id)):
    user = await db.users.find_one({"id": uid})
    if not user or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_password(body.new_password),
                  "must_change_password": False}}
    )
    return {"ok": True}


@api.put("/auth/profile")
async def update_profile(body: UserUpdate, uid: str = Depends(get_current_user_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    if "mobile" in updates:
        existing = await db.users.find_one({"mobile": updates["mobile"],
                                            "id": {"$ne": uid}})
        if existing:
            raise HTTPException(400, "Mobile number already in use")
    await db.users.update_one({"id": uid}, {"$set": updates})
    user = await db.users.find_one({"id": uid})
    return _public_user(user)


# ---------- USERS / DIRECTORY ----------
@api.get("/users")
async def list_users(q: Optional[str] = None,
                     uid: str = Depends(get_current_user_id)):
    query = {"status": "approved", "id": {"$ne": uid}}
    if q:
        query["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"employee_id": {"$regex": q, "$options": "i"}},
            {"department": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.users.find(query).to_list(500)
    return [_public_user(d) for d in docs]


@api.get("/users/{user_id}")
async def get_user(user_id: str, uid: str = Depends(get_current_user_id)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Not found")
    return _public_user(user)


# ---------- CHATS / MESSAGES ----------
async def _get_or_create_chat(a: str, b: str) -> dict:
    participants = _chat_pair_id(a, b)
    chat = await db.chats.find_one({"participants": participants})
    if chat:
        chat.pop("_id", None)
        return chat
    chat = {
        "id": new_id(),
        "participants": participants,
        "last_message_at": None,
        "last_message_preview": None,
        "created_at": now_iso(),
    }
    await db.chats.insert_one(chat)
    chat.pop("_id", None)
    return chat


@api.get("/chats")
async def list_chats(uid: str = Depends(get_current_user_id)):
    chats = await db.chats.find({"participants": uid}).sort("last_message_at", -1).to_list(500)
    out = []
    for c in chats:
        c.pop("_id", None)
        peer_id = next((p for p in c["participants"] if p != uid), None)
        peer = await db.users.find_one({"id": peer_id}) if peer_id else None
        c["peer"] = _public_user(peer) if peer else None
        c["unread"] = await db.messages.count_documents({
            "chat_id": c["id"], "receiver_id": uid, "status": {"$ne": "read"}
        })
        out.append(c)
    return out


@api.post("/chats")
async def create_chat(peer_id: str = Query(...),
                      uid: str = Depends(get_current_user_id)):
    if peer_id == uid:
        raise HTTPException(400, "Cannot chat with self")
    peer = await db.users.find_one({"id": peer_id})
    if not peer:
        raise HTTPException(404, "User not found")
    chat = await _get_or_create_chat(uid, peer_id)
    chat["peer"] = _public_user(peer)
    chat["unread"] = 0
    return chat


@api.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, before: Optional[str] = None,
                       limit: int = 50,
                       uid: str = Depends(get_current_user_id)):
    chat = await db.chats.find_one({"id": chat_id, "participants": uid})
    if not chat:
        raise HTTPException(404, "Chat not found")
    q = {"chat_id": chat_id}
    if before:
        q["created_at"] = {"$lt": before}
    msgs = await db.messages.find(q).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    for m in msgs:
        m.pop("_id", None)
    return list(reversed(msgs))


@api.post("/chats/{chat_id}/read")
async def mark_read(chat_id: str, uid: str = Depends(get_current_user_id)):
    chat = await db.chats.find_one({"id": chat_id, "participants": uid})
    if not chat:
        raise HTTPException(404, "Chat not found")
    res = await db.messages.update_many(
        {"chat_id": chat_id, "receiver_id": uid, "status": {"$ne": "read"}},
        {"$set": {"status": "read", "read_at": now_iso()}}
    )
    # Notify sender via socket
    peer_id = next((p for p in chat["participants"] if p != uid), None)
    if peer_id and peer_id in ONLINE:
        for sid in list(ONLINE[peer_id]):
            await sio.emit("messages_read",
                           {"chat_id": chat_id, "reader_id": uid}, to=sid)
    return {"updated": res.modified_count}


# ---------- FILE UPLOAD ----------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...),
                      uid: str = Depends(get_current_user_id)):
    # Validate
    ext = Path(file.filename or "").suffix.lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(400, "File type not allowed")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if not any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise HTTPException(400, f"MIME type not allowed: {mime}")

    fid = new_id()
    safe_name = f"{fid}{ext}"
    dest = UPLOAD_DIR / safe_name
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(400, "File exceeds maximum size of 100MB")
            out.write(chunk)
    record = {
        "id": fid, "owner_id": uid, "original_name": file.filename,
        "stored_name": safe_name, "mime": mime, "size": size,
        "created_at": now_iso(),
    }
    await db.files.insert_one(record)
    return {"file_id": fid, "name": file.filename, "mime": mime, "size": size,
            "url": f"/api/files/{fid}"}


@api.get("/files/{file_id}")
async def download_file(file_id: str, uid: str = Depends(get_current_user_id)):
    rec = await db.files.find_one({"id": file_id})
    if not rec:
        raise HTTPException(404, "File not found")
    path = UPLOAD_DIR / rec["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(path, media_type=rec["mime"], filename=rec["original_name"])


# Profile picture upload (returns relative path stored on user)
@api.post("/files/profile-picture")
async def upload_profile_picture(file: UploadFile = File(...),
                                 uid: str = Depends(get_current_user_id)):
    mime = file.content_type or "image/jpeg"
    if not mime.startswith("image/"):
        raise HTTPException(400, "Only images allowed")
    ext = Path(file.filename or "img.jpg").suffix.lower() or ".jpg"
    fid = new_id()
    safe_name = f"avatar_{fid}{ext}"
    dest = UPLOAD_DIR / safe_name
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > 10 * 1024 * 1024:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(400, "Avatar too large (max 10MB)")
            out.write(chunk)
    rec = {"id": fid, "owner_id": uid, "original_name": file.filename,
           "stored_name": safe_name, "mime": mime, "size": size,
           "created_at": now_iso()}
    await db.files.insert_one(rec)
    url = f"/api/files/public/{fid}"
    await db.users.update_one({"id": uid}, {"$set": {"profile_picture": url}})
    return {"url": url}


@api.get("/files/public/{file_id}")
async def public_file(file_id: str):
    """Public read access for avatars (no auth)."""
    rec = await db.files.find_one({"id": file_id})
    if not rec:
        raise HTTPException(404, "File not found")
    path = UPLOAD_DIR / rec["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing")
    return FileResponse(path, media_type=rec["mime"])


# ---------- ADMIN ----------
@api.get("/admin/users")
async def admin_list_users(status_: Optional[str] = Query(None, alias="status"),
                           _: dict = Depends(require_admin)):
    q = {}
    if status_:
        q["status"] = status_
    docs = await db.users.find(q).sort("created_at", -1).to_list(1000)
    return [_public_user(d) for d in docs]


@api.post("/admin/users/{user_id}/approve")
async def admin_approve(user_id: str, payload: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "approved"}})
    await db.audit_logs.insert_one({"id": new_id(), "user_id": payload["sub"],
                                    "action": "approve_user",
                                    "target": user_id, "at": now_iso()})
    return {"ok": True}


@api.post("/admin/users/{user_id}/reject")
async def admin_reject(user_id: str, body: AdminUserAction,
                       payload: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "rejected"}})
    await db.audit_logs.insert_one({"id": new_id(), "user_id": payload["sub"],
                                    "action": "reject_user", "target": user_id,
                                    "at": now_iso(),
                                    "meta": {"reason": body.reason}})
    return {"ok": True}


@api.post("/admin/users/{user_id}/suspend")
async def admin_suspend(user_id: str, body: AdminUserAction,
                        payload: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "suspended"}})
    await db.audit_logs.insert_one({"id": new_id(), "user_id": payload["sub"],
                                    "action": "suspend_user", "target": user_id,
                                    "at": now_iso(),
                                    "meta": {"reason": body.reason}})
    return {"ok": True}


@api.post("/admin/users/{user_id}/reinstate")
async def admin_reinstate(user_id: str, payload: dict = Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "approved"}})
    await db.audit_logs.insert_one({"id": new_id(), "user_id": payload["sub"],
                                    "action": "reinstate_user", "target": user_id,
                                    "at": now_iso()})
    return {"ok": True}


@api.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin)):
    total = await db.users.count_documents({})
    approved = await db.users.count_documents({"status": "approved"})
    pending = await db.users.count_documents({"status": "pending"})
    online_count = len(ONLINE)
    dept_agg = await db.users.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": "$department", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(50)
    departments = [{"name": d["_id"] or "Unknown", "count": d["count"]} for d in dept_agg]
    storage_agg = await db.files.aggregate([
        {"$group": {"_id": None, "size": {"$sum": "$size"},
                    "count": {"$sum": 1}}}
    ]).to_list(1)
    sb = storage_agg[0]["size"] if storage_agg else 0
    sf = storage_agg[0]["count"] if storage_agg else 0
    return {
        "total_users": total,
        "active_users": approved,
        "pending_approvals": pending,
        "online_users": online_count,
        "departments": departments,
        "storage_bytes": sb,
        "storage_files": sf,
    }


@api.get("/admin/audit-logs")
async def admin_audit(_: dict = Depends(require_admin), limit: int = 100):
    logs = await db.audit_logs.find({}).sort("at", -1).limit(min(limit, 500)).to_list(500)
    for log in logs:
        log.pop("_id", None)
    return logs


# ---------- HEALTH ----------
@api.get("/")
async def root():
    return {"app": "DRDO Secure LAN Chat", "status": "running"}


fastapi_app.include_router(api)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- SOCKET.IO HANDLERS ----------
@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token") if isinstance(auth, dict) else None
    if not token:
        return False
    try:
        payload = decode_token(token)
    except Exception:
        return False
    uid = payload["sub"]
    user = await db.users.find_one({"id": uid})
    if not user or user.get("status") != "approved":
        return False
    SID_TO_USER[sid] = uid
    ONLINE.setdefault(uid, set()).add(sid)
    await db.users.update_one({"id": uid}, {"$set": {"last_seen": now_iso()}})
    # Notify everyone of presence change
    await sio.emit("presence", {"user_id": uid, "online": True})
    # Send pending messages that should be delivered (status=sent -> delivered)
    pending = await db.messages.find({"receiver_id": uid, "status": "sent"}).to_list(1000)
    for m in pending:
        m.pop("_id", None)
        await db.messages.update_one({"id": m["id"]},
                                     {"$set": {"status": "delivered",
                                               "delivered_at": now_iso()}})
        # Notify sender
        sender_sids = ONLINE.get(m["sender_id"], set())
        for ss in list(sender_sids):
            await sio.emit("message_status",
                           {"id": m["id"], "chat_id": m["chat_id"],
                            "status": "delivered"}, to=ss)
    logger.info(f"socket connect: {uid} sid={sid}")
    return True


@sio.event
async def disconnect(sid):
    uid = SID_TO_USER.pop(sid, None)
    if uid:
        sids = ONLINE.get(uid)
        if sids:
            sids.discard(sid)
            if not sids:
                ONLINE.pop(uid, None)
                await db.users.update_one({"id": uid},
                                          {"$set": {"last_seen": now_iso()}})
                await sio.emit("presence",
                               {"user_id": uid, "online": False,
                                "last_seen": now_iso()})
    logger.info(f"socket disconnect sid={sid}")


@sio.event
async def send_message(sid, data):
    uid = SID_TO_USER.get(sid)
    if not uid:
        return {"error": "unauthorized"}
    peer_id = data.get("peer_id")
    text = data.get("text")
    attachment = data.get("attachment")
    if not peer_id or (not text and not attachment):
        return {"error": "invalid payload"}
    peer = await db.users.find_one({"id": peer_id})
    if not peer:
        return {"error": "peer not found"}
    chat = await _get_or_create_chat(uid, peer_id)
    now = now_iso()
    recipient_online = peer_id in ONLINE
    msg = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": uid,
        "receiver_id": peer_id,
        "text": text,
        "attachment": attachment,
        "status": "delivered" if recipient_online else "sent",
        "delivered_at": now if recipient_online else None,
        "read_at": None,
        "created_at": now,
    }
    await db.messages.insert_one(dict(msg))
    msg.pop("_id", None)
    preview = text if text else (attachment.get("name") if attachment else "Attachment")
    await db.chats.update_one(
        {"id": chat["id"]},
        {"$set": {"last_message_at": now, "last_message_preview": preview[:120]}}
    )
    # Emit to recipient
    for rs in list(ONLINE.get(peer_id, [])):
        await sio.emit("new_message", msg, to=rs)
    # Echo back to sender (all their sids)
    for ss in list(ONLINE.get(uid, [])):
        await sio.emit("new_message", msg, to=ss)
    return {"ok": True, "message": msg}


@sio.event
async def typing(sid, data):
    uid = SID_TO_USER.get(sid)
    if not uid:
        return
    peer_id = data.get("peer_id")
    is_typing = bool(data.get("typing"))
    if not peer_id:
        return
    for rs in list(ONLINE.get(peer_id, [])):
        await sio.emit("typing",
                       {"user_id": uid, "typing": is_typing}, to=rs)


@sio.event
async def mark_delivered(sid, data):
    uid = SID_TO_USER.get(sid)
    msg_id = data.get("id")
    if not uid or not msg_id:
        return
    msg = await db.messages.find_one({"id": msg_id, "receiver_id": uid})
    if not msg:
        return
    if msg.get("status") == "sent":
        await db.messages.update_one(
            {"id": msg_id},
            {"$set": {"status": "delivered", "delivered_at": now_iso()}}
        )
        for ss in list(ONLINE.get(msg["sender_id"], [])):
            await sio.emit("message_status",
                           {"id": msg_id, "chat_id": msg["chat_id"],
                            "status": "delivered"}, to=ss)


# Combine ASGI app: Socket.IO at /api/socket.io, FastAPI everywhere else
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="api/socket.io")


# ---------- STARTUP: seed super admin ----------
@fastapi_app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("mobile", unique=True)
    await db.users.create_index("employee_id", unique=True)
    await db.users.create_index("id", unique=True)
    await db.chats.create_index("participants")
    await db.messages.create_index([("chat_id", 1), ("created_at", -1)])
    await db.messages.create_index("receiver_id")
    await db.files.create_index("id", unique=True)
    # Seed admin
    admin_mobile = os.environ.get("SEED_ADMIN_MOBILE")
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD")
    if admin_mobile and admin_password:
        existing = await db.users.find_one({"mobile": admin_mobile})
        if not existing:
            doc = {
                "id": new_id(),
                "full_name": os.environ.get("SEED_ADMIN_NAME", "Super Admin"),
                "mobile": admin_mobile,
                "employee_id": os.environ.get("SEED_ADMIN_EMPID", "DRDO-ADMIN-001"),
                "department": "Administration",
                "password_hash": hash_password(admin_password),
                "profile_picture": None,
                "role": "super_admin",
                "status": "approved",
                "must_change_password": True,
                "last_seen": None,
                "created_at": now_iso(),
            }
            await db.users.insert_one(doc)
            logger.info(f"Seeded super admin mobile={admin_mobile}")


@fastapi_app.on_event("shutdown")
async def shutdown():
    client.close()
