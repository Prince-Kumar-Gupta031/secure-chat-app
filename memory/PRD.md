# DRDO Secure LAN Chat — PRD

## Problem Statement
Build a production-grade Secure Internal LAN Messaging Platform for DRDO. WhatsApp-style real-time chat that runs entirely on a LAN with admin approval workflow, presence, ticks, media transfer and military-grade security.

## Stack (chosen)
- Frontend: React 19 + Tailwind + ShadCN UI + Socket.IO client
- Backend: FastAPI + python-socketio + Motor (MongoDB) + bcrypt + PyJWT
- DB: MongoDB
- Storage: Local disk (`/app/backend/uploads`)

## Users / Personas
1. **Employee** — registers, awaits approval, chats with peers, transfers files.
2. **Admin / Super Admin** — approves/rejects/suspends users, views analytics, **cannot read chats**.

## Phase 2 — Implemented (Feb 2026)
- ✅ Group chats (create, edit name/icon, add/remove members, multiple admins, leave)
- ✅ Real-time group messaging via Socket.IO (broadcasts to all participants; sender name shown above bubbles in group view)
- ✅ Group file & image sharing
- ✅ Group icon upload (re-uses avatar upload pipeline)
- ✅ Group last-admin protection + auto-promote on last-admin leave
- ✅ Group typing indicator (aggregates "X typing… / X, Y typing…")
- ✅ Search across chat list (groups + 1:1)
- ✅ In-chat message search (chat-msg-search)
- ✅ Global message search endpoint `/api/search/messages`
- ✅ Mobile responsive UI — list-only / chat-only swap, back button, hamburger drawer for nav
- ✅ Improved attachment cards: image hover-download, PDF view+download, file download button
- ✅ Group read receipts (per-recipient `read_by[]`, no per-message ticks shown in group view to keep UI clean)
- ✅ `chat_updated` socket event for live membership/edit updates
- ✅ GET `/api/chats/{id}` enriched chat lookup

## Phase 1 — Implemented (Feb 2026)
- ✅ Registration (full name, mobile, employee_id, department, password)
- ✅ Admin approval workflow (pending → approved/rejected/suspended)
- ✅ Login (mobile + password, JWT, persistent via localStorage)
- ✅ Status-aware login errors (pending / rejected / suspended popups)
- ✅ Super Admin seed on startup (mobile `7209674114`, password `admin`, must_change_password flag)
- ✅ 1-to-1 real-time chat via Socket.IO
- ✅ Sent / Delivered / Read ticks
- ✅ Online presence + last seen
- ✅ Typing indicator
- ✅ File upload (images/PDF/DOC/DOCX/XLSX/PPTX/ZIP up to 100 MB) with extension blocklist
- ✅ Profile picture upload (≤10 MB) + public avatar endpoint
- ✅ Employee directory with name/empID/department search
- ✅ Admin dashboard: stats + bar chart by department + approvals tab + audit logs tab
- ✅ Audit logs (login, approve, reject, suspend, reinstate)
- ✅ Dark / Light theme toggle, IBM Plex Sans + Chivo fonts, tactical military design
- ✅ Profile edit + change password
- ✅ MongoDB indexes (unique mobile, employee_id; chat/messages compound index)

## Phase 3 — Backlog (Prioritized)
- P0: Broadcast announcements (admin-only, system-wide)
- P0: Emergency / HIGH PRIORITY alerts (popup to all users)
- P1: Star messages · pin chats · reply-to · forward
- P1: Emoji picker · message reactions
- P2: Voice notes
- P2: LAN audio / video calling (WebRTC)
- P2: Refresh tokens + rotation · optional E2E encryption (libsodium)
- P2: Docker compose package + LAN install script
- P2: Message edit/delete · push notifications
- P2: Extend in-chat search to match `attachment.name`

## Phase 2 — Backlog (Prioritized)
- P0: Department channels / group chats
- P0: Broadcast announcements (admin-only)
- P0: Emergency alerts (priority popup to all users)
- P1: Star messages, pin chats
- P1: Reply-to, forward
- P1: Emoji picker
- P2: Voice notes
- P2: LAN audio / video calling (WebRTC)
- P2: Refresh tokens + rotation, optional E2E encryption (libsodium)
- P2: Docker compose + production hardening guide

## Known / Deferred
- No refresh token rotation (Phase 2). JWT expiry default 30 days for persistent login.
- Rate-limiting handled by reverse proxy in production (not in-app).
- Admin "Departments" CRUD currently auto-derived from user records.

## Next Tasks
1. Department channels + auto-membership
2. Broadcast + emergency alert UI
3. Star / Pin / Reply / Forward
4. Docker compose package + LAN install script
