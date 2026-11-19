# HearSay

HearSay is a music discovery and review app built with React, Vite, Express, and MongoDB. Browse Spotify music, rate songs, albums, and artists, and discuss reviews in threaded conversations. Discover and Community show charts and tables based on the app’s data.

Choose the example for the way you run the app. Copy it only when creating a new configuration.

| Setup | Example | Local file to create |
| --- | --- | --- |
| Docker on localhost | [`.env.example`](.env.example) | `.env` in the repository root |
| [Production (online access)](#production-setup-online-access) | [`.env.production.example`](.env.production.example) | `.env` in the repository root |
| Native development | [`hearsay/.env.example`](hearsay/.env.example) | `hearsay/.env.development` |

## From-scratch setup checklist

1. Copy the example that matches the setup: `.env.example` for Docker development or `.env.production.example` for public deployment.
2. Replace every placeholder credential. Keep `MONGO_USERNAME`/`MONGO_PASSWORD` for the MongoDB administrative account. Set a separate strong `MONGO_APP_USERNAME`/`MONGO_APP_PASSWORD`; startup creates or updates that runtime account with `readWrite` access to `MONGO_DB_NAME`.
3. Set `SESSION_SECRET` to a stable random secret of at least 32 bytes. Set `SESSION_COOKIE_SECURE=false` only for local HTTP; keep it `true` for production.
4. Set `API_ORIGIN` to the exact allowed browser origin. Production also requires HTTPS except for explicit localhost origins.
5. Set Spotify and Google credentials only if those integrations are needed. Keep all `GOOGLE_CLIENT_SECRET`, `SPOTIFY_CLIENT_SECRET`, database passwords, session secrets, and tunnel tokens outside frontend `VITE_*` variables.
6. Start Docker:

   ```sh
   docker compose up --build -d mongodb backend frontend
   docker compose ps
   docker compose logs --tail 100 mongodb backend frontend
   ```

7. Open `http://localhost:8080` for Docker development. The backend startup applies schemas and analytical views using the administrative MongoDB credentials, then serves requests using the runtime account.
8. Run `docker compose exec -T backend npm run db:validate` before and after database migrations.
9. For native development, start `compose.db.yml`, copy `hearsay/.env.example` to `hearsay/.env.development`, and run `npm run db:apply-schemas` and `npm run dev:all` from `hearsay`.

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
   | `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD`, `MONGO_APP_AUTH_SOURCE` | Backend runtime account. Docker creates/updates this account using the existing `MONGO_USERNAME`/`MONGO_PASSWORD` admin credentials at startup. |
   | `SESSION_SECRET` | Set a long random value for signing sessions. |
   | `SESSION_COOKIE_SECURE` | Keep `false` for local HTTP. The production template enables secure cookies. |
   | `API_ORIGIN` | Use `http://localhost:8080`. Access the app at this same address. |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Required for Spotify search and live music details. The app can start without them. |
   | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | Set these before first startup if you want custom admin credentials. Later changes to these settings leave the existing admin account in place. |
   | Google sign-in (optional) | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` using the same Google OAuth client. Register `http://localhost:8080/auth/callback` and use it as `VITE_GOOGLE_REDIRECT_URI`. Local email/password registration works without Google. |

3. Build and start MongoDB, the API, and the web frontend.

   ```sh
   docker compose up --build -d mongodb backend frontend
   docker compose ps
   ```

4. When the backend and frontend are healthy, open **http://localhost:8080**. Create a local account from the sign-in page to write reviews. To populate a fresh development database with a sample catalogue, reviews, and discussions, see [Example data](db/mongo-cli.md#example-data).

The standard Compose stack and [`compose.db.yml`](compose.db.yml) publish MongoDB only on host loopback. Do not remove the `127.0.0.1:` host binding or expose MongoDB directly to a network or the internet.

To validate the database or diagnose a startup failure from the repository root, use:

```sh
docker compose exec -T backend npm run db:validate
docker compose logs --tail 100 mongodb backend frontend
```

Run `docker compose down` to stop the app. MongoDB data persists in the `hearsay_mongodb_data` named volume. After changing Google frontend settings, rebuild the frontend with `docker compose up --build -d frontend`.

## Production setup (online access)

These steps deploy HearSay at `https://hearsay.gripe` using Docker, Nginx Proxy Manager, and a Cloudflare Tunnel. For a different domain, replace `hearsay.gripe` throughout. You need a running Docker installation, an active domain in Cloudflare, and a host that stays online. The tunnel connects outbound, so you do not need router port forwarding. Compose publishes the local service and management ports on `127.0.0.1`.

### 1. Configure the production environment

From the repository root, create `.env` from the production example. If you already have `.env`, merge in the settings below and keep your existing credentials.

```powershell
Copy-Item .env.production.example .env
```

On macOS or Linux, use `cp .env.production.example .env`.

| Setting | Production value |
| --- | --- |
| `NODE_ENV` and `SESSION_COOKIE_SECURE` | `production` and `true` |
| `API_ORIGIN` | `https://hearsay.gripe` or your public HTTPS origin, with no trailing slash |
| MongoDB settings | Keep `MONGO_HOST=mongodb` for Docker. Set a strong `MONGO_PASSWORD` for a new database, or reuse the existing credentials. See [database upgrades](#upgrade-an-existing-database) if bringing older data forward. |
| Runtime MongoDB account | Set `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD`, and `MONGO_APP_AUTH_SOURCE=hearsay`. Docker provisions this account with `readWrite` access using the existing admin credentials in `MONGO_USERNAME`/`MONGO_PASSWORD`. |
| `SESSION_SECRET` | A long, randomly generated signing secret. Changing it signs out existing sessions. |
| `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` | Set unique credentials before first startup. If an admin already exists, change any example password on that account before sharing the site. |
| `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` | Set these for Spotify search and music details. |
| Google sign-in (optional) | Set `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` for the same OAuth client. Set `VITE_GOOGLE_REDIRECT_URI=https://hearsay.gripe/auth/callback` and register that exact URL under **Authorized redirect URIs** in Google Cloud. Use one callback URL per frontend build. |

### 2. Start HearSay and configure Nginx Proxy Manager

```sh
docker compose up --build -d mongodb backend frontend nginx-rev-proxy
docker compose ps
```

Open the Nginx Proxy Manager admin page at `http://localhost:8181` on the Docker host. Complete its initial setup, then choose **Hosts → Proxy Hosts → Add Proxy Host** and enter:

| Field | Value |
| --- | --- |
| Domain Names | `hearsay.gripe` |
| Scheme | `http` |
| Forward Hostname / IP | `frontend` |
| Forward Port | `80` |
| SSL certificate / Force SSL | Leave the certificate unset and **Force SSL** off. Cloudflare handles public TLS for this HTTP origin. |

Add the following in the proxy host's **Advanced** tab before saving. It accepts the HTTPS scheme from the Compose tunnel connector at `172.19.0.105` and redirects public HTTP to HTTPS. The API needs the forwarded scheme to issue secure session cookies.

```nginx
set_real_ip_from 172.19.0.105;
real_ip_header CF-Connecting-IP;
real_ip_recursive off;

set $hearsay_origin_proto $scheme;
if ($realip_remote_addr = 172.19.0.105) {
  set $hearsay_origin_proto $http_x_forwarded_proto;
}
set $x_forwarded_proto $hearsay_origin_proto;

set $hearsay_tunnel_request "$realip_remote_addr:$http_x_forwarded_proto";
if ($hearsay_tunnel_request = "172.19.0.105:http") {
  return 308 https://hearsay.gripe$request_uri;
}
```

The first three directives pass Cloudflare's client address through Nginx for per-client login and signup rate limits. Keep the trusted addresses in this snippet and the frontend Nginx configuration aligned with the Compose network.

### 3. Start the Cloudflare Tunnel and publish the domain

1. In Cloudflare, go to **Networking → Tunnels** and create a remotely managed tunnel. Choose **Docker**. Copy only the value after `--token` in the install command into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. Keep that token private. [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
2. Start the Compose connector and confirm Cloudflare shows it as healthy.

   ```sh
   docker compose --profile tunnel up -d cloudflared
   docker compose --profile tunnel logs --tail 50 cloudflared
   ```

3. Add a **Published application** route with domain `hearsay.gripe`, a blank subdomain for the root domain, and service URL `http://nginx-rev-proxy:80`. Select HTTP as the service type if the dashboard asks separately. The connector reaches the proxy by service name on the Compose network. Cloudflare creates the DNS record for the route.

### 4. Verify public access

- Open `https://hearsay.gripe` from a browser outside the host network. `https://hearsay.gripe/api/health` should return `{"ok":true}`, and `http://hearsay.gripe` should redirect to HTTPS.
- Sign in at the public HTTPS URL and reload the page to verify your session persists. The direct local HTTP URL can still serve pages, but public settings require HTTPS for sign-in sessions.
- If Google sign-in is configured, start a fresh flow and confirm Google returns to the public `/auth/callback` URL. Rebuild the frontend after changing its Google settings with `docker compose up --build -d --no-deps frontend`.

If the public URL fails, check `docker compose --profile tunnel ps` and the connector logs. An unknown-domain error points to DNS, while a Cloudflare 502 usually means the connector cannot reach the proxy or the proxy cannot reach the frontend. To disconnect public access while keeping the application and database running, use `docker compose --profile tunnel stop cloudflared`.

## Run natively for development

Use Node.js **24 LTS** with npm, matching the Docker build and runtime. Run MongoDB separately, or start just the project’s MongoDB container. If switching from the full Docker setup, stop it with `docker compose down` first to free the shared ports and container name.

1. From the repository root, create and configure `.env` as described above if needed, then run `docker compose -f compose.db.yml up -d`. Skip this command if you already have a reachable MongoDB server.
2. From the repository root, set up the development environment:

   ```powershell
   Copy-Item hearsay/.env.example hearsay/.env.development
   Set-Location hearsay
   npm ci
   ```

   On macOS or Linux, use `cp` and `cd`. Keep your existing `hearsay/.env.development` if you already have one.
3. Edit `hearsay/.env.development` to use the same MongoDB credentials and database name as the server. If using Google sign-in, fill in the client credentials and register `http://localhost:5173/auth/callback` on the Google OAuth client.
4. From `hearsay`, apply the database schemas and run both development servers:

   ```sh
   npm run db:apply-schemas
   npm run dev:all
   ```

Open **http://localhost:5173**. Vite proxies `/api` to Express on port **5174**. If the browser opens on another port because 5173 is occupied, free port 5173 and restart the dev servers so the configured origin and Google callback remain valid. Stop the servers with Ctrl+C. To stop a MongoDB container started for native development, run `docker compose -f compose.db.yml down` from the repository root.

## Upgrade an existing database

Both Compose files use the same `hearsay_mongodb_data` named volume. Existing files under `db/data` are not imported automatically; back up and restore that database explicitly before switching an older bind-mount installation. `docker compose down` retains the named volume; adding `--volumes` deletes it.

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
