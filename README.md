# HearSay

HearSay is a music discovery and review app built with React, Vite, Express, and MongoDB. Browse Spotify music, rate songs, albums, and artists, and discuss reviews in threaded conversations. Discover and Community show charts and tables based on the app’s data.

## Run locally with Docker

Docker Desktop or Docker Engine with the Compose plugin is the recommended setup. Start Docker, then run the commands below from the repository root. You need ports **8080**, **5174**, and **27017** available. Node.js on your host is required only for the native development option.

1. Create the local configuration file. If you already have a `.env` file, keep it and check the settings in step 2.

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env`.

2. Edit `.env` for your local environment.

   | Setting | Local value or purpose |
   | --- | --- |
   | `MONGO_HOST`, `MONGO_DB_NAME` | Keep `mongodb` and `hearsay` for Docker. Set your own `MONGO_PASSWORD` on a fresh database. If the database already exists, use its existing credentials. |
   | `SESSION_SECRET` | Set a long random value for signing sessions. |
   | `SESSION_COOKIE_SECURE` | Set to `false` for local HTTP. Use `true` on HTTPS. |
   | `API_ORIGIN` | Use `http://localhost:8080`. Access the app at this same address. |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Required for Spotify search and live music details. The app can start without them. |
   | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | Set these before first startup if you want custom admin credentials. Later changes to these settings leave the existing admin account in place. |
   | Google sign-in (optional) | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` using the same Google OAuth client. Register `http://localhost:8080/auth/callback` and use it as `VITE_GOOGLE_REDIRECT_URI`. Local email/password registration works without Google. |

3. Build and start MongoDB, the API, and the web frontend.

   ```sh
   docker compose up --build -d mongodb backend frontend
   docker compose ps
   ```

4. When the backend and frontend are healthy, open **http://localhost:8080**. Create a local account from the sign-in page to write reviews. Fresh databases start without sample reviews. An optional demo seed is documented in [MongoDB operations](db/mongo-cli.md#demo-seed).

To validate the database or diagnose a startup failure from the repository root, use:

```sh
docker compose exec -T backend npm run db:validate
docker compose logs --tail 100 mongodb backend frontend
```

Run `docker compose down` to stop the app. MongoDB data persists in `db/data`. After changing Google frontend settings, rebuild the frontend with `docker compose up --build -d frontend`.

## Run natively for development

Use Node.js **20.19+** or **22.12+** with npm. Run MongoDB separately, or start just the project’s MongoDB container. If switching from the full Docker setup, stop it with `docker compose down` first to free the shared ports and container name.

1. From the repository root, create and configure `.env` as described above if needed, then run `docker compose -f compose.db.yml up -d`. Skip this command if you already have a reachable MongoDB server.
2. From the repository root, set up the development environment:

   ```powershell
   Copy-Item .env hearsay/.env.development
   Set-Location hearsay
   npm ci
   ```

   On macOS or Linux, use `cp` and `cd`. Keep your existing `hearsay/.env.development` if you already have one.
3. Edit `hearsay/.env.development`. Set `NODE_ENV=development`, `MONGO_HOST=localhost` for the local MongoDB container, `API_ORIGIN=http://localhost:5173`, and `SESSION_COOKIE_SECURE=false`. Keep the same MongoDB credentials and database name as the server. If using Google sign-in, register `http://localhost:5173/auth/callback` and set `VITE_GOOGLE_REDIRECT_URI` to that address.
4. From `hearsay`, apply the database schemas and run both development servers:

   ```sh
   npm run db:apply-schemas
   npm run dev:all
   ```

Open **http://localhost:5173**. Vite proxies `/api` to Express on port **5174**. If the browser opens on another port because 5173 is occupied, free port 5173 and restart the dev servers so the configured origin and Google callback remain valid. Stop the servers with Ctrl+C. To stop a MongoDB container started for native development, run `docker compose -f compose.db.yml down` from the repository root.

## Upgrade an existing database

If your database has old album reviews with `trackRatings` stored as maps, run the [one-time track-rating migration](db/mongo-cli.md#upgrade-existing-track-ratings) before starting the updated app. It preserves review content and rating values. Fresh installs and previously migrated databases can use the startup steps above directly.

## Build and verify

From `hearsay`, run `npm run lint` and `npm run build`. The production client is written to `dist/`. Use Compose to serve it with the API proxy, or configure an equivalent proxy in your deployment. Run `npm run db:validate` from `hearsay` for a read-only check of the database configured for native development.

On Windows, run `.\scripts\tests\run.cmd --setup` from the repository root to install temporary test tools in the backend container and run the regression suites. See the [developer test guide](scripts/tests/README.md) for individual suites.

## Project references

- [Backend API and data model](docs/BACKEND_REFERENCE.md)
- [Frontend routes and behavior](docs/FRONTEND_REFERENCE.md)
- [Architecture and diagrams](docs/ARCHITECTURE.md)
- [MongoDB setup, upgrades, and backups](db/mongo-cli.md)
- [Developer tests](scripts/tests/README.md)
