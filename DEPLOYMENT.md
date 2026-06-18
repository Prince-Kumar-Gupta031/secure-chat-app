# Deployment Guide — DRDO Secure LAN Chat

This guide covers running the platform on an **internal LAN server** so that any device on the same network can use it via `http://SERVER_IP:PORT`.

---

## 1. Prerequisites

| Component | Version |
|---|---|
| Linux (Ubuntu 22.04+ / Debian 12+) or Windows Server 2019+ | — |
| Docker | 24+ |
| Docker Compose | v2+ |
| Free ports | `3000`, `8001`, `27017` |
| RAM | 2 GB minimum |
| Disk | 20 GB minimum (depends on file traffic) |

---

## 2. LAN Deployment (Docker Compose) — Recommended

### 2.1 Folder layout on the server

```
/opt/drdo-chat/
├── backend/         # cloned backend folder
├── frontend/        # cloned frontend folder (pre-built static)
├── data/            # mongo persistent data
├── uploads/         # file storage
├── docker-compose.yml
└── .env             # production env values (chmod 600)
```

### 2.2 Sample `docker-compose.yml`

```yaml
version: "3.9"

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - ./data:/data/db
    networks: [drdo]

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    environment:
      MONGO_URL: mongodb://mongo:27017
      DB_NAME: drdo_chat
      UPLOAD_DIR: /app/uploads
      CORS_ORIGINS: "http://${SERVER_IP}:3000"
    volumes:
      - ./uploads:/app/uploads
    ports:
      - "8001:8001"
    depends_on: [mongo]
    networks: [drdo]

  frontend:
    build:
      context: ./frontend
      args:
        REACT_APP_BACKEND_URL: "http://${SERVER_IP}:8001"
    restart: unless-stopped
    ports:
      - "3000:3000"
    networks: [drdo]

networks:
  drdo:
```

### 2.3 `.env` for compose

```env
SERVER_IP=192.168.1.100
JWT_SECRET=<64-char-random>
SEED_ADMIN_MOBILE=7209674114
SEED_ADMIN_PASSWORD=ChangeMeOnFirstLogin
```

### 2.4 Bring it up

```bash
cd /opt/drdo-chat
docker compose up -d --build
docker compose logs -f backend
```

Then from any LAN device, navigate to:

```
http://192.168.1.100:3000
```

Sign in with the seeded Super Admin and **change the default password immediately**.

---

## 3. Bare-metal Deployment (no Docker)

### 3.1 Backend (Linux)

```bash
sudo apt install -y python3.11 python3.11-venv mongodb
git clone <repo> /opt/drdo-chat
cd /opt/drdo-chat/backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # edit values
# Run with uvicorn (production)
uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
```

Create a systemd unit `/etc/systemd/system/drdo-chat-backend.service`:

```ini
[Unit]
Description=DRDO Chat Backend
After=network.target mongodb.service

[Service]
WorkingDirectory=/opt/drdo-chat/backend
EnvironmentFile=/opt/drdo-chat/backend/.env
ExecStart=/opt/drdo-chat/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
Restart=always
User=drdo

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now drdo-chat-backend
```

### 3.2 Frontend (static build)

```bash
cd /opt/drdo-chat/frontend
yarn install
REACT_APP_BACKEND_URL="http://192.168.1.100:8001" yarn build
# Serve build/ via nginx or:
npx serve -s build -l 3000
```

### 3.3 Windows Server

Use **WSL2** + Docker Desktop with the same `docker-compose.yml`, or install Python 3.11 + MongoDB community edition natively and run via `nssm` (service manager).

---

## 4. Reverse Proxy & TLS (optional, recommended for prod)

Place nginx (or Caddy) in front of both services:

```nginx
server {
  listen 80;
  server_name drdo-chat.local;

  location /api/      { proxy_pass http://127.0.0.1:8001;  proxy_http_version 1.1; }
  location /socket.io { proxy_pass http://127.0.0.1:8001;
                        proxy_http_version 1.1;
                        proxy_set_header Upgrade $http_upgrade;
                        proxy_set_header Connection "upgrade"; }
  location /          { proxy_pass http://127.0.0.1:3000; }
}
```

For TLS on an air-gapped LAN, issue a self-signed certificate via an internal CA and trust it on every client device.

---

## 5. Backups

```bash
# Mongo dump (daily cron)
docker exec drdo-chat-mongo-1 mongodump --archive=/data/db/dump-$(date +%F).gz --gzip --db drdo_chat

# Uploads
rsync -a /opt/drdo-chat/uploads/ /backup/drdo-chat-uploads/
```

Restore:

```bash
docker exec -i drdo-chat-mongo-1 mongorestore --gzip --archive=/data/db/dump-2025-01-01.gz
```

---

## 6. Hardening Checklist

- [ ] Change the seeded Super Admin password
- [ ] Generate a fresh `JWT_SECRET` (≥ 64 chars random)
- [ ] Lock down `CORS_ORIGINS` to the LAN host(s) only
- [ ] Set Mongo auth (`SCRAM`) and disable external Mongo port
- [ ] Run backend behind a firewall — only ports 3000/443 exposed to LAN
- [ ] Enable fail2ban or rate-limit /api/auth/login on the proxy
- [ ] Schedule nightly backups & test restore
- [ ] Rotate JWT secret on a quarterly basis
- [ ] Enable disk-level encryption on the server (LUKS / BitLocker)

---

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Frontend cannot reach backend | `REACT_APP_BACKEND_URL` not set at build time |
| Socket disconnects on LAN | Reverse proxy not forwarding `Upgrade` header |
| Uploads fail at 100 MB | Reverse-proxy `client_max_body_size` not raised |
| Login says “awaiting approval” | Account status still `pending` — admin must approve |

Inspect logs:

```bash
docker compose logs backend  | tail -n 200
sudo journalctl -u drdo-chat-backend -f
```
