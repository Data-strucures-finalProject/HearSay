# HearSay backend reference

## Architecture

Express 5 uses the native MongoDB driver, express-session, connect-mongo and bcryptjs; Mongoose is not used. Spotify client-credentials tokens are cached in server memory. Google authorization starts with a server-session state and PKCE challenge, exchanges a code and fetches Google userinfo. Sign-in establishes a session; linking adds a provider to the initiating user. The server does not independently verify a JWT signature.

MongoDB, email-alias initialization, default-admin bootstrap and discussion indexes complete before the API listens. Alias/default-admin/discussion index failures stop startup; other legacy index failures are logged. `/api/health` reports process health; `/api/test` actually pings the database.

Startup reconciles analytical views through `server/insights.js`; installation errors stop startup. Pipelines are defined in `server/analyticsViews.js`, and display metadata is in `shared/insights.js`. Run `npm run db:apply-views` to reconcile views manually.

## Endpoint inventory

Authenticated routes require a server session with `user.oid`. Review mutations are scoped to that user. All paths below include `/api`.

| Method/path | Access | Behavior |
| --- | --- | --- |
| GET `/api/health` | Public | `{ok:true}` |
| GET `/api/test` | Public | MongoDB ping |
| GET `/api/me` | Public | `{authenticated:true,user}` or `{authenticated:false}` |
| GET `/api/session` | Public | Session ID, creation time and incremented visit count |
| POST `/api/logout` | Session | Destroy session and clear cookie |
| POST `/api/auth/local/signup` | Public | `{email,password}`; create a user; existing email returns 409 |
| POST `/api/auth/local/login` | Public | Normalize email, bcrypt password check, establish session |
| POST `/api/auth/local/set-password` | Authenticated | `{password}`; set/change password and Local account kind |
| POST `/api/auth/google/start` | Public for signin; authenticated for link | `{intent: signin\|link,code_challenge}`; saves a ten-minute session-bound flow and returns state |
| POST `/api/auth/google/exchange` | Matching initiating session | `{code,state,redirect_uri,code_verifier}`; verifies/consumes the flow, then signs in or links according to the server-stored intent |
| GET `/api/profile` | Authenticated | Safe profile, role, saved emails, Google display details and account kinds |
| GET `/api/admin/overview` | Admin only | Counts of users, reviews and cached music; the entire `/api/admin` namespace is protected |
| GET `/api/insights/:id` | Public | Analytical views 1–3 and 5–10 |
| GET `/api/admin/insights/4` | Admin only | User/review integrity view |
| GET `/api/profile/export.csv` | Authenticated | Download own account, reviews and track ratings as UTF-8 CSV |
| GET `/api/profile/export.pdf` | Authenticated | Download the same records as a paginated PDF |
| DELETE `/api/profile` | Authenticated | `{confirmation:"DELETE"}`; permanently delete own account, reviews, ratings, media references and sessions |
| POST `/api/profile/update` | Authenticated | Optional trimmed firstname/lastname, max 100 characters each; refreshes session display name and returns profile/user |
| POST `/api/profile/google-details` | Authenticated | Independent boolean firstname/lastname/email choices; values come from the saved Google profile |
| POST `/api/profile/emails/primary` | Authenticated | Make an existing saved email primary |
| DELETE `/api/profile/emails` | Authenticated | Remove a non-primary email; removing the Google email also disconnects Google; prevent loss of the last sign-in method |
| POST `/api/reviews/upsert` | Authenticated | Own song/album/artist review create/update |
| GET `/api/reviews/my?type=...&oid=...` | Authenticated | Own review or null |
| DELETE `/api/reviews/my?type=...&oid=...` | Authenticated | Delete own review; type/oid also accepted in JSON body; attempts to remove linked references |
| GET `/api/reviews/my/list?limit=5&offset=0` | Authenticated | Own reviews sorted updatedAt/_id descending, default 5/max 20 |
| GET `/api/reviews/recent?limit=20&offset=0&type=song` | Public | Reviews sorted createdAt/_id descending, optional song/album/artist filter, max 50 |
| GET `/api/reviews/:reviewId` | Public | Enriched review DTO, author and media details, canEdit; media includes title/route, related artists `{name,route}` and a song's album `{name,route}`; invalid ID returns 400 |
| GET `/api/discussions?type=album&oid=...` | Public | Media reviews; `sort=newest` or `top`, `limit=10` (max 30), `offset=0`; returns items, total, nextOffset and ownReview |
| GET `/api/discussions/:id` | Public | Review/comment with author, counts, viewerVote and ownership; excludes voter identities |
| GET `/api/discussions/:id/replies` | Public | Immediate replies, oldest first; same limit/offset contract |
| POST `/api/discussions/:id/replies` | Authenticated | `{text,clientRequestId}`; create a comment referencing its parent; repeated identical requests reuse the entry |
| PUT `/api/discussions/:id/vote` | Authenticated | `{value:1}`, `-1` or `0`; set, switch or remove the caller's vote atomically |
| PATCH `/api/discussions/:id` | Author only | Edit `{text}`; media reviews additionally require `rating` on the 0–5 half-star scale |
| DELETE `/api/discussions/:id` | Author only | Delete a media review's entire thread, or anonymize a comment while preserving its descendants |
| GET `/api/artists/:id` | Public | Cached artist by Spotify ID, `_id` excluded; null if absent |
| GET `/api/albums/:id` | Public | Cached album by Spotify ID, `_id` excluded; null if absent |

Generic DB CRUD helpers do not expose HTTP CRUD for every collection.

Comments are documents in `reviews` with `type:"review"`, `item:{type:"review",oid:parentReviewId}`, `threadRoot` and `depth`. Parent `comments` arrays contain only `{oid:childId}` references; authors' `reviewIds` include their comments. Comments have a zero stored rating and do not enter media-review feeds or reviewer rankings. Thread depth is capped at 64; text is capped at 8,000 characters and 1,000 words. One vote per user/entry is stored in `votes`; likes/dislikes are derived counts. The unique media-review index excludes comments so one author can post multiple replies to the same parent.

Discussion writes and thread cleanup are serialized within the single backend process. Deleting a root removes descendants and user/media references. Deleting a comment clears its author, text and votes but retains its parent/children as a deleted placeholder. Account deletion also removes owned root threads, anonymizes comments in other threads and removes the account's votes. These operations require a distributed concurrency strategy before running multiple backend instances.

Account exports use the session identity only and exclude password hashes, provider tokens and session credentials. CSV has account/review/comment/track_rating rows, quotes embedded commas/newlines and neutralizes spreadsheet formulas. Ratings are exported on the displayed 0–5 scale. PDFKit and bundled DejaVu fonts provide formatted, paginated PDF output from the same records.

Account deletion removes the user document, credentials/provider links, owned media-review threads, vote activity, references and sessions. Comments in threads owned by other users become anonymous deleted placeholders. Shared music metadata remains. A permanent confirmation is required in the UI and the API. Authenticated requests are serialized per user in the current server process. The standalone MongoDB deployment does not support multi-document transactions: deletionPending blocks normal operations while cleanup is incomplete, permits profile access and retry, and is removed with the account only after cleanup succeeds. Existing local credentials or the already-linked Google identity can authenticate to finish an interrupted deletion. Deleted users cannot authorize requests even with stale sessions. Multiple server instances would require a distributed concurrency strategy.

### Google sign-in and linking

Both flows verify state, expiry and the PKCE verifier before contacting Google.
Linking also requires the same authenticated user who started the flow. A Google
identity or email owned by another user returns 409 google_account_in_use;
the original session and both user documents remain unchanged. A different Google
identity cannot replace one already linked to the current user. Linking preserves
the user's primary email, password and reviews and returns to Profile. Accounts
are not merged. Normal Google sign-in resolves the stable provider UID first,
retaining the linked user's primary email even when the Google email differs.

## Analytical queries

Analytical endpoints accept `q` (literal case-insensitive text, max 100 characters), `sort` (displayed column key), `direction` (`asc`/`desc`), `limit` (1–100, default 20), and `offset` (0–100000). View 5 also accepts `mediaType=album|song`; view 4 accepts `status=matched|user_without_review|review_without_user`.

Responses contain `ok`, `items`, `total`, `offset`, nullable `nextOffset`, and `chart` label/value pairs. Charts and counts cover all matches independently of table pagination. Queries have a five-second timeout and disable response caching. Invalid parameters return 400, unknown/private views 404, and query failures 503. Admin routes additionally return 401/403 for missing or insufficient authorization.

## Review contract

Example body: `{"type":"song","oid":"spotify-id","rating":4.5,"text":"A review"}`.

Type must be song/album/artist; oid is a nonempty string. Ratings in 0.5..5 are rounded to half stars and stored as doubled BSON Int32 (1..10). Responses convert numeric ratings to stars. Text-only inserts use 0 for unrated. Invalid ratings are ignored if usable text exists. Text is trimmed with a maximum of 1,000 whitespace-separated words.

The API accepts album `trackRatings` objects with nonblank track IDs and numeric half-star values in 0.5..5. Nonobjects, arrays, invalid values and trackRatings on other media types return 400 invalid_track_ratings. Song reviews are submitted separately by the album page.

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

The server includes `/api/test` and `/api/session` for health/session inspection. `/api/debug/routes`, `/api/reviews/debug/find`, `/api/reviews/debug/list` and `/api/spotify/debug/token` return 404 in production. Development review diagnostics also require a user session. Spotify diagnostics return only hasToken/expiresAt, never the cached token. OAuth exchange logs status rather than token contents, and request logging masks authorization codes/verifiers and password/token fields.

Most route errors use `{ok:false,error}`; Google forwarding and Express default errors can have other shapes or HTML responses.

## Database and schema ownership

Database defaults to `hearsay`; collection names are lowercase.

| Collection | Data |
| --- | --- |
| users | Primary email, loginEmails, emailHistory, firstname/lastname, role, optional isDefaultAdmin, accounts `{kind,uid}`, googleProfile `{uid,email,firstname,lastname}`, passwordHash, reviewIds and deletionPending |
| reviews | user.oid, item `{type,oid}`, type=review, doubled Int32 rating, text, child comments `{oid}`, votes and counts, ISO-string timestamps; optional threadRoot/depth/deleted/trackRatings |
| artists | Spotify identity/metadata; album/song/review references |
| albums | Spotify identity, artist reference, genre, releaseDate, song/review references |
| songs | spotifyTrackID, title, artist/album references with Spotify IDs, genres/date, review references |
| expressSessions | Actual connect-mongo session store (configurable), expires/session |

`dbAPI.Sessions` points to `sessions`; middleware defaults to `expressSessions`. User references in reviews are internal ObjectId strings; media-review item IDs are Spotify IDs, while comment item IDs are parent-review ObjectId strings. Media references usually use internal ObjectId strings with some Spotify-ID fallbacks. They are application-maintained, not foreign keys. Media likes/dislikes/rating are string placeholders in active schemas.

**Canonical schema source:** `db/schemas/schema-HearSay-*.json`, loaded by `server/scripts/apply-schemas.mjs`. Compose mounts it at `/app/db-schemas`; the backend command applies six validators before startup. Native startup requires an explicit `npm run db:apply-schemas`. Existing data and duplicate Spotify identities are checked before any validator changes.

`create-*.js` are generated manual collection-creation scripts with identical validators. Regenerate them with `npm run db:sync-schema-scripts`; the runtime suite checks synchronization. `HearSay.*.json` are historical data exports, not schema definitions.

Validation uses `strict`/`error` for every insert and update, including updates to invalid legacy records. The explicit `db:normalize-schema-defaults` migration fills missing application defaults without changing credentials or review content; remaining incompatible data stops schema preflight. See [MongoDB validation levels](https://www.mongodb.com/docs/manual/core/schema-validation/specify-validation-level/).

| Collection | Enforced document requirements |
| --- | --- |
| users | Required identity/provider fields, normalized login emails, primary-email membership and alias history, user/admin roles, bcrypt hash shape for Local sign-in, matching Google account/profile identity, unique author references and valid timestamps |
| reviews | Media review or parent-referencing comment shape, stored integer ratings 0–10, text at most 8,000 characters/1,000 words, reference-only children, comment depth 1–64, deleted placeholders without author/text/votes, unique voters and exact vote counters; album-only track ratings in half-star steps |
| albums/songs/artists | Required identity/metadata fields, typed genres/references, unique reference IDs, nonnegative cached counter strings, cached rating strings 0–5; artist followers nonnegative and popularity 0–100 |
| expressSessions | String ID, BSON expiry date and object session envelope; middleware-owned session contents remain flexible; the configured session collection name is honored |

Document validators check reference shape; cross-collection existence and cleanup are maintained by application routes and checked by the read-only relationship validator. Cache relationships may retain empty IDs while provider metadata is unavailable. Session expiration and TTL indexes remain managed by connect-mongo.

Startup requires a unique multikey loginEmails index. Strict-schema upgrades require complete alias/history arrays; existing arrays are retained so removed emails stay removed. Both active addresses work with the same local password. Historical addresses are retained for provenance only and never authorize login or reserve ownership. Linking saves Google details but changes names/primary email only after independent opt-in choices. Users can change primary address before removing an old one; removing the Google address also unlinks its provider. Passwords and review ownership are preserved.

Code also attempts unique primary email and account-kind/uid indexes. Required discussion indexes enforce one media review per user/item and unique reply request keys; comments are excluded from the media-review constraint. Required unique indexes on album/song/artist Spotify IDs prevent duplicate cached identities. Media identity indexes are declared in `server/schemaIndexes.js` and applied by both schema setup and API startup.

Run `npm run db:validate` from `hearsay` for read-only canonical-schema checks, installed-validator drift, enforcement mode, required identity indexes, review-author/media backlinks, parent/child threads, tombstones and votes. The report contains counts and issue categories; it excludes credentials and review text and returns a nonzero exit code on failure. For exact demo catalogue coverage, use the seed utility's `--verify` mode described in the [database guide](../db/mongo-cli.md#demo-seed).

## Configuration

`DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` seed one default administrator at startup, defaulting to `admin@hearsay.com` / `password`. Set them in the root `.env` for Compose, or the backend's environment for native development. Change the initial password before a public deployment. Passwords are bcrypt-hashed. A unique `isDefaultAdmin` marker persists independently of email/password changes: later restarts or environment edits do not reset credentials or create another default admin. If the configured email/alias is already owned by a regular user, bootstrap refuses to promote it and reports the conflict; choose an unused address.

Users have a server-owned `role` of `user` or `admin`; legacy users without a role are treated as users. Unauthenticated visitors are guests and have no stored role. Public signup, profile updates and Google linking cannot assign roles. Each authenticated request refreshes the role from MongoDB, and admin middleware independently checks it. The UI uses `/api/me` to show the Admin tab and protect `/admin`; localStorage is not authorization. Role changes take effect on the next request. The initial Admin page is an overview, not a user-management console.

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
| DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD | One-time admin seed; ignored after a default admin exists |
| SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET | Server Spotify credentials |
| BCRYPT_ROUNDS | 12 |
| SCHEMA_DIR | Optional initializer directory override |

Legacy VITE-prefixed server fallbacks exist but must not be used for secrets. Cookies are httpOnly, SameSite=Lax, rolling and TTL-backed. Authenticated requests periodically regenerate session IDs.
