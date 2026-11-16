# HearSay backend reference

Reviewed November 16, 2026 against `hearsay/server`, schema tooling and Compose.

## Architecture

Express 5 uses the native MongoDB driver, express-session, connect-mongo and bcryptjs; Mongoose is not used. Spotify client-credentials tokens are cached in server memory. Google login exchanges a PKCE code, fetches Google userinfo, upserts the user and stores OAuth data in the session. The server does not independently verify a JWT signature.

MongoDB must connect before the API listens. Startup attempts user/review unique indexes and logs index creation errors. `/api/health` reports process health; `/api/test` actually pings the database.

## Endpoint inventory

Authenticated routes require a server session with `user.oid`. Review mutations are scoped to that user. All paths below include `/api`.

| Method/path | Access | Behavior |
| --- | --- | --- |
| GET `/api/health` | Public | `{ok:true}` |
| GET `/api/test` | Public | MongoDB ping |
| GET `/api/me` | Public | `{authenticated:true,user}` or `{authenticated:false}` |
| GET `/api/session` | Public | Session ID, creation time and incremented visit count |
| POST `/api/logout` | Session | Destroy session and clear cookie |
| POST `/api/auth/local/signup` | Public | `{email,password}`; create user or currently link password to existing passwordless user |
| POST `/api/auth/local/login` | Public | Normalize email, bcrypt password check, establish session |
| POST `/api/auth/local/set-password` | Authenticated | `{password}`; set/change password and Local account kind |
| POST `/api/auth/google/exchange` | Public | `{code,redirect_uri,code_verifier}`; Google exchange/userinfo/session |
| GET `/api/profile` | Authenticated | Safe profile/account kinds, name/picture from session |
| POST `/api/profile/update` | Authenticated | Optional trimmed firstname/lastname, max 100 characters each; immutable email |
| POST `/api/reviews/upsert` | Authenticated | Own song/album/artist review create/update |
| GET `/api/reviews/my?type=...&oid=...` | Authenticated | Own review or null |
| DELETE `/api/reviews/my?type=...&oid=...` | Authenticated | Delete own review; type/oid also accepted in JSON body; attempts to remove linked references |
| GET `/api/reviews/my/list?limit=5&offset=0` | Authenticated | Own reviews sorted updatedAt/_id descending, default 5/max 20 |
| GET `/api/reviews/recent?limit=20&offset=0&type=song` | Public | Reviews sorted createdAt/_id descending, optional song/album/artist filter, max 50 |
| GET `/api/reviews/:reviewId` | Public | Enriched review DTO, author and media details, canEdit; invalid ID returns 400 |
| GET `/api/artists/:id` | Public | Cached artist by Spotify ID, `_id` excluded; null if absent |
| GET `/api/albums/:id` | Public | Cached album by Spotify ID, `_id` excluded; null if absent |

There are no PUT/PATCH routes. Updates use POST. Generic DB CRUD helpers do not expose HTTP CRUD for every collection.

## Review contract

Example body: `{"type":"song","oid":"spotify-id","rating":4.5,"text":"A review"}`.

Type must be song/album/artist; oid is a nonempty string. Ratings in 0.5..5 are rounded to half stars and stored as doubled BSON Int32 (1..10). Responses convert numeric ratings to stars. Text-only inserts use 0 for unrated. Invalid ratings are ignored if usable text exists. Text is trimmed with a maximum of 1,000 whitespace-separated words.

The API accepts album `trackRatings` objects without checking their keys/value ranges. Song reviews are submitted separately by the album page.

Upserts attempt to maintain `users.reviewIds`, media review arrays, cached Spotify documents and artist/album/song links. These writes are not transactional; errors in related writes often log a warning while the review succeeds. Metadata is saved on review writes, not every Spotify GET. Media rating/like fields are not maintained as community aggregates.

Own-review/upsert responses are database-shaped (`_id`, `item`, `user`, etc.). Public single-review responses are display-shaped (`id`, `type`, `oid`, `userName`, `media`, `canEdit`).

## Spotify routes

| GET path | Query/defaults |
| --- | --- |
| `/api/spotify/search` | q required; type=track, limit=10, optional market |
| `/api/spotify/track/:id` | Track details |
| `/api/spotify/tracks` | Comma-separated ids, optional market; chunks of 50 |
| `/api/spotify/album/:id` | Album details and returned tracks page |
| `/api/spotify/albums` | Comma-separated ids, optional market; chunks of 20 |
| `/api/spotify/artist/:id` | Artist details |
| `/api/spotify/artist/:id/albums` | include_groups=album,single, limit=50, optional market |
| `/api/spotify/new-releases` | country=US, limit=50 |
| `/api/spotify/recommendations` | Query passthrough; default seed_genres=pop,rock |

Upstream availability depends on the configured Spotify application. Batch routes chunk IDs, while album details return the embedded tracks page. Search/new-release helpers accept the listed parameters; they do not forward offset. Clients should inspect both HTTP status and the returned data when handling API failures.

## Diagnostics

The server includes `/api/test`, `/api/session`, `/api/debug/routes`, `/api/reviews/debug/find`, `/api/reviews/debug/list` and `/api/spotify/debug/token` for development diagnostics. They are not general application UI features. Review diagnostics require a user session. Avoid publishing diagnostic responses or logs containing session/token data.

Most route errors use `{ok:false,error}`; Google forwarding and Express default errors can have other shapes or HTML responses.

## Database and schema ownership

Database defaults to `hearsay`; collection names are lowercase.

| Collection | Data |
| --- | --- |
| users | email, firstname/lastname, accounts `{kind,uid}`, optional passwordHash and runtime reviewIds |
| reviews | user.oid, item `{type,oid}`, root type=review, doubled Int32 rating, text, comments, likes/dislikes, ISO-string timestamps, optional trackRatings |
| artists | Spotify identity/metadata; album/song/review references |
| albums | Spotify identity, artist reference, genre, releaseDate, song/review references |
| songs | spotifyTrackID, title, artist/album references with Spotify IDs, genres/date, review references |
| expressSessions | Actual connect-mongo session store (configurable), expires/session |

`dbAPI.Sessions` points to `sessions`; middleware defaults to `expressSessions`. User references in reviews are internal ObjectId strings; review item IDs are Spotify IDs. Media references usually use internal ObjectId strings with some Spotify-ID fallbacks. They are application-maintained, not foreign keys. Media likes/dislikes/rating are string placeholders in active schemas.

**Automatic schema source:** `db/schemas/schema-HearSay-*.json`, read/converted by `server/scripts/apply-schemas.mjs`. Compose mounts it at `/app/db-schemas` and the backend Docker command applies five validators before startup. Native startup requires an explicit `npm run db:apply-schemas`.

`create-*.js` are separate manual shell/GUI scripts with different, more permissive types; they are not used by automatic initialization. `HearSay.*.json` are sample exports.

Validation level is moderate: new inserts and updates to already-valid documents are checked; existing invalid documents can remain invalid even when updated. See [MongoDB validation levels](https://www.mongodb.com/docs/manual/core/schema-validation/specify-validation-level/).

Code attempts unique email, account-kind/uid and user+item review indexes. No code creates unique Spotify-ID indexes for media collections.

## Configuration

Run from `hearsay`. The API/db helper load `.env.development` or `.env.production`; modules also load `.env`. Avoid conflicting values. Compose injects root `.env` values as process variables.

| Variable(s) | Meaning/default |
| --- | --- |
| NODE_ENV, PORT | Development unless production; port 5174 |
| MONGO_URI | Explicit URI takes precedence |
| MONGO_USERNAME/MONGO_USER, MONGO_PASSWORD/MONGO_PASS | DB credentials |
| MONGO_HOST, MONGO_PORT, MONGO_PROTOCOL, MONGO_AUTH_SOURCE | localhost, 27017, mongodb, admin |
| MONGO_DB_NAME | hearsay; set explicitly for consistent domain/session storage |
| SESSION_SECRET, SESSION_NAME | Stable secret; otherwise regenerated each restart; cookie hsid |
| SESSION_TTL_SECONDS, SESSION_ROTATE_MS | 3600 seconds, 3600000 milliseconds |
| SESSION_COOKIE_SECURE | Exact string true enables Secure; default true in production |
| SESSIONS_COLLECTION | expressSessions |
| API_ORIGIN | Comma-separated production origin allowlist; development allows all origins |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Server Google credentials |
| SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET | Server Spotify credentials |
| BCRYPT_ROUNDS | 12 |
| SCHEMA_DIR | Optional initializer directory override |

Legacy VITE-prefixed server fallbacks exist but must not be used for secrets. Cookies are httpOnly, SameSite=Lax, rolling and TTL-backed. Authenticated requests periodically regenerate session IDs.
