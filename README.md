# DRDO Secure LAN Chat

A production-grade, WhatsApp-style internal messaging platform designed for **DRDO** (Defence Research and Development Organisation). Runs entirely over a Local Area Network — no internet, no cloud, no external services.

> Military-grade. Air-gap ready. Built for sovereignty.

---

## Highlights

- **Real-time 1-to-1 messaging** with WhatsApp-style ticks (sent / delivered / read)
- **Online presence**, **last seen**, and **typing indicators**
- **Admin approval workflow** — only verified personnel can sign in
- **Secure media transfer** — images, PDF, DOC/DOCX, XLSX, PPTX, ZIP up to 100 MB
- **Encrypted authentication** — bcrypt hashes + JWT tokens
- **Role-based access control** — Employee, Admin, Super Admin
- **Immutable audit logs** for every admin action
- **Admin dashboard** with live analytics (users, online, departments, storage)
- **Dark / Light themes**, military-tactical aesthetic
- **Privacy-first**: admins **cannot** read user messages

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Tailwind CSS, ShadCN UI, lucide-react, socket.io-client, recharts |
| Backend | FastAPI (Python 3.11+), python-socketio, motor (async Mongo driver), bcrypt, PyJWT |
| Database | MongoDB |
| Real-time | Socket.IO over WebSockets (auto-reconnect, polling fallback) |
| Auth | JWT (Bearer), bcrypt password hashing |
| Storage | Local filesystem (`/app/backend/uploads`) |

---

## Quick Start (Local / Dev)

The platform is already wired into the workspace.

1. **Backend** runs on `0.0.0.0:8001` via `supervisorctl`.
2. **Frontend** runs on `0.0.0.0:3000` via `supervisorctl`.
3. **MongoDB** runs locally.

```bash
sudo supervisorctl status
```

Open the public preview URL (or the LAN URL) — the React app talks to the backend via the value of `REACT_APP_BACKEND_URL`.

### Default Super Admin (seeded at first start)

| Field | Value |
|---|---|
| Mobile | `7209674114` |
| Password | `admin` |
| Role | `super_admin` |

The Super Admin is prompted to change the default password after first login.

---

## Project Structure

See [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md).

---

## Deployment (LAN / Production)

See [`DEPLOYMENT.md`](./DEPLOYMENT.md). Quick recipe:

```bash
# On the LAN server (e.g. 192.168.1.100)
docker compose up -d
# Then on any LAN client:  http://192.168.1.100:3000
```

---

## Environment Variables

Copy `.env.example` to `.env` and update values. Never commit the real `.env`.

| Variable | Purpose |
|---|---|
| `MONGO_URL` | Mongo connection string |
| `DB_NAME` | Mongo database name |
| `JWT_SECRET` | HMAC secret for JWT signing (rotate in production) |
| `JWT_ALGORITHM` | Algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL (default 30 days for persistent login) |
| `SEED_ADMIN_MOBILE` / `SEED_ADMIN_PASSWORD` | Initial Super Admin |
| `UPLOAD_DIR` | Path for uploaded files |
| `MAX_UPLOAD_MB` | Max single-file size |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `REACT_APP_BACKEND_URL` | (frontend) Backend base URL (no trailing slash) |

---

## API Surface (REST)

All routes prefixed with `/api`.

**Auth**
- `POST /api/auth/register` — submit registration (status = pending)
- `POST /api/auth/login` — returns JWT + user
- `GET  /api/auth/me` — current user
- `POST /api/auth/change-password`
- `PUT  /api/auth/profile`

**Users / Directory**
- `GET  /api/users?q=` — search approved peers
- `GET  /api/users/{id}`

**Chats / Messages**
- `GET  /api/chats` — list with last-message preview & unread count
- `POST /api/chats?peer_id=` — get-or-create
- `GET  /api/chats/{id}/messages?before=&limit=`
- `POST /api/chats/{id}/read`

**Files**
- `POST /api/files/upload` (multipart) → returns `{ file_id, url, ... }`
- `GET  /api/files/{id}` — authenticated download
- `POST /api/files/profile-picture` — avatar upload
- `GET  /api/files/public/{id}` — public avatar read

**Admin** (requires admin role)
- `GET  /api/admin/users?status=`
- `POST /api/admin/users/{id}/approve` | `reject` | `suspend` | `reinstate`
- `GET  /api/admin/analytics`
- `GET  /api/admin/audit-logs`

---

## Socket.IO Events

- Client → Server: `send_message`, `typing`, `mark_delivered`
- Server → Client: `new_message`, `message_status`, `messages_read`, `typing`, `presence`

Authenticate by passing `{ auth: { token } }` when connecting.

---

## Security Controls

- bcrypt password hashing (cost factor default 12)
- JWT with configurable expiry; tokens are stored client-side in `localStorage` and sent as `Bearer`
- RBAC enforced server-side on every admin route
- File type allow-list + executable extension block-list (`.exe`, `.bat`, `.sh`, `.js`, ...)
- 100 MB hard upload cap, streamed to disk
- Audit log entries for login, approve, reject, suspend, reinstate
- Mongo unique indexes on `mobile` and `employee_id`
- Admin endpoints never return message contents; admins cannot list messages

---

## Roadmap

**Phase 2** (planned):
- Department channels / group chats
- Broadcast & high-priority emergency alerts (admin)
- Star messages, pin chats, forward, reply
- Emoji picker
- Voice notes
- LAN audio / video calling (WebRTC)
- E2E message encryption (libsodium)
- Refresh tokens + token rotation

---

## License

Internal use only — DRDO and authorised personnel.
