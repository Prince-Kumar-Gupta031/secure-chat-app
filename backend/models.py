"""Pydantic models and helpers for DRDO Chat application."""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- USERS ----------
class UserBase(BaseModel):
    full_name: str
    mobile: str
    employee_id: str
    department: str


class UserRegister(UserBase):
    password: str
    profile_picture: Optional[str] = None  # URL/path


class UserLogin(BaseModel):
    mobile: str
    password: str


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    full_name: str
    mobile: str
    employee_id: str
    department: str
    role: str = "employee"  # employee | admin | super_admin
    status: str = "pending"  # pending | approved | rejected | suspended
    profile_picture: Optional[str] = None
    online: bool = False
    last_seen: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    must_change_password: bool = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    profile_picture: Optional[str] = None
    mobile: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ---------- CHATS & MESSAGES ----------
class MessageCreate(BaseModel):
    chat_id: Optional[str] = None  # if absent, create from peer_id
    peer_id: Optional[str] = None
    text: Optional[str] = None
    attachment: Optional[dict] = None  # {file_id, name, mime, size}


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    chat_id: str
    sender_id: str
    receiver_id: str
    text: Optional[str] = None
    attachment: Optional[dict] = None
    status: str = "sent"  # sent | delivered | read
    delivered_at: Optional[str] = None
    read_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

    # here is msg delete buttion
    deleted_for: List[str] = Field(default_factory=list)
    deleted_for_everyone: bool = False
    deleted_at: Optional[str] = None
    #------------------------------


class Chat(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    participants: List[str]  # 2 for 1:1, >=2 for groups
    is_group: bool = False
    group_name: Optional[str] = None
    group_icon: Optional[str] = None
    group_admins: List[str] = Field(default_factory=list)
    created_by: Optional[str] = None
    last_message_at: Optional[str] = None
    last_message_preview: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class GroupCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    participant_ids: List[str] = Field(default_factory=list)


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None


class GroupMembers(BaseModel):
    user_ids: List[str]


# ---------- ADMIN ----------
class AdminUserAction(BaseModel):
    reason: Optional[str] = None


class AdminAnalytics(BaseModel):
    total_users: int
    active_users: int
    pending_approvals: int
    online_users: int
    departments: List[dict]
    storage_bytes: int
    storage_files: int
