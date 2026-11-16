# HearSay

HearSay is a music discovery and review app using React, Vite, Express and the native MongoDB driver. Users browse Spotify music and manage song, album and artist reviews.

## Documentation

- [Backend API and data model](docs/BACKEND_REFERENCE.md)
- [Frontend routes and behavior](docs/FRONTEND_REFERENCE.md)
- [Architecture and diagrams](docs/ARCHITECTURE.md)
- [Database setup, import/export and backups](db/mongo-cli.md)

## Prerequisites

Docker Desktop/Engine with Compose, or Node.js 20.19+ / 22.12+ with npm and an accessible MongoDB server. The locked Vite version is 7.2.1. Spotify credentials are needed for music features; Google credentials are optional when using local sign-in.

## Docker setup

From the repository root (PowerShell):

```powershell
Copy-Item .env.example .env
```

Edit `.env`: replace the database password and session secret, add Spotify credentials, and set Google credentials if using Google login. Use server variables `GOOGLE_CLIENT_SECRET` and `SPOTIFY_CLIENT_SECRET`; secrets must not have a `VITE_` prefix. For HTTP at localhost:8080 set `SESSION_COOKIE_SECURE=false`; use true with HTTPS. Set `API_ORIGIN` to the actual browser origin. Google's registered redirect URI must match the browser origin plus `/auth/callback`.

```powershell
docker compose up --build -d mongodb backend frontend
docker compose ps
```

Open http://localhost:8080. The backend is exposed on port 5174. Frontend Nginx serves the SPA and proxies `/api` to the backend. The optional `nginx-rev-proxy` service is Nginx Proxy Manager (80/443, management UI 8181); public host/TLS configuration is separate.

The backend applies validators before starting. Sample-data import is a separate operation. Data persists in `db/data`. `docker compose down` stops containers without deleting that directory.

Frontend configuration is embedded at build time. The Dockerfile forwards the Google client ID and redirect URI build arguments. AuthPage's default API base is `http://localhost:5174/api`; see the frontend reference for configuration used by each API client.

## Native development

From the root, configure `.env` for MongoDB and run:

```powershell
docker compose -f compose.db.yml up -d
Copy-Item .env.example hearsay/.env.development
Set-Location hearsay
npm ci
```

Edit `hearsay/.env.development`: set `NODE_ENV=development`, `MONGO_HOST=localhost`, the matching MongoDB credentials, `SESSION_COOKIE_SECURE=false`, `API_ORIGIN=http://localhost:5173,http://127.0.0.1:5173`, `VITE_API_BASE=/api`, and `VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback` if using Google. Keep `MONGO_DB_NAME=hearsay` explicit. Run npm commands from `hearsay`, because backend env paths are relative to the working directory.

```powershell
npm run db:apply-schemas
npm run dev:all
```

Open http://localhost:5173. Vite proxies `/api` to localhost:5174. On Linux use `cp`/`cd` in place of `Copy-Item`/`Set-Location`. Do not run both Compose configurations together: container names, ports and static addresses overlap. Schema application requires database privileges to create/modify validators.

## Build and verification

From `hearsay`:

```powershell
npm run build
npm run lint
```

Build output is `dist/`. `npm run preview` has no configured API proxy and is not the complete deployment. `npm run start:backend` uses production mode; supply `.env.production` or process variables and serve the frontend behind an `/api` proxy.

There is no npm test script. The optional scripts in `docs/audit-*.mjs` support developer verification; their runtime requirements are described in their file headers.
