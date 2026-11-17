# HearSay frontend reference

Reviewed November 17, 2026 against `hearsay/src`. React 19, React Router 7, Vite 7 and Tailwind 4 provide an SPA. `main.jsx` mounts StrictMode and AuthProvider; App adds ThemeProvider, ToastProvider, Router and Header. API access mixes direct fetch with config wrappers.

## Routes

| Route | Component | Current behavior |
| --- | --- | --- |
| `/` | LandingPage | Spotify new releases/search, sampled/popularity-sorted cards, locale selector and refresh |
| `/auth` | AuthPage | Local login/register and Google PKCE redirect |
| `/auth/callback` | AuthCallback | Validate tab-scoped OAuth state, exchange code once, then return to home or Profile according to intent |
| `/search?q=...` | SearchPage | Spotify artist/album/track search; ten initial cards/category and Show All within fetched results |
| `/artist/:artistId` | ArtistPage | Cached artist metadata with Spotify fallback; live albums/singles; artist review/rating |
| `/album/:albumId` | AlbumRatingPage | Spotify album/track details, written review, direct album rating and track submissions |
| `/song/:songId` | SongRatingPage | Spotify track/player, own review/rating and delete |
| `/my-reviews` | MyReviewsPage | Protected; own reviews, live metadata enrichment, pagination, editing and deletion |
| `/recent-reviews` | RecentReviewsPage | Public song/album/artist sections with independent pagination and links to details |
| `/review/:reviewId` | ReviewPage | Public review details; author edit controls |
| `/profile` | ProfilePage | Protected; profile, name editing, password setup, Google linking, Google detail choices, email management, CSV/PDF downloads, account deletion and logout |
| `/admin` | AdminPage | Admin-only overview counts and user/review integrity table; server session role verified before rendering |
| `/discover?view=2` | InsightsPage | Community favourites; other categories are stored catalogue (5), album ratings (6), genres (8), first-review opportunities (9), Popular on Spotify (10) |
| `/community?view=1` | InsightsPage | Album review table; other categories are above-average opinions (3) and reviewer activity (7) |
| `/random` | RandomPage | Song/album discovery from Spotify results |

ProtectedRoute checks `/api/me` and redirects guests to `/auth`. Ordinary protected pages may initially accept cached user presence while waiting; `/admin` always waits for the server role and redirects non-admins home. Backend session/role/ownership checks protect API operations. Navbar, Layout and TrackList are not mounted by App; TrackList contains a duplicate profile implementation.

## Review behavior and limits

Discover/Community use a shared InsightsPanel with captioned HTML tables, database-side literal text search, allowlisted sorting, 20-row pagination, loading/empty/error/retry states and media/review links. Catalogue adds a song/album filter; admin adds a relationship-status filter. Views 6/7/8/10 have accessible HTML/CSS bar charts computed from up to ten matching database results independently of table pagination. Navigation includes desktop/mobile links and home/Recent Reviews entry points. See [analytical view semantics and validation](ANALYTICAL_VIEWS.md).

Headphone controls use half-star increments. Most forms enforce 1,000 words; client sanitizeInput additionally caps text at 5,000 characters and strips selected markup patterns. The server uses word count instead. Stored ratings are doubled; API responses use stars. Zero means unrated.

Album track submission requires at least one rated track, not all tracks. It sequentially saves each song review, averages rated tracks, then saves a rounded album rating. Writes can partially succeed. Existing track values load through individual song reviews. My Reviews lists those records as well as albums. The server also accepts optional trackRatings objects from API clients; see the backend contract.

AlbumRatingPage uses Spotify for its album track list. ArtistPage uses cached artist details with live album/single requests. Public ReviewPage displays author/media details from a dedicated backend response, while review editing submits through the upsert endpoint.

## Authentication state

Header reads `/api/me` on mount, browser focus and window auth events. Local login/signup, Google callback and profile logout emit window events through `utils/authBus.js`. AuthProvider and Header subscribe to the same event stream. `hs_user` in localStorage is a UI cache, not authorization. The backend validates sessions for protected operations.

`utils/googleAuth.js` starts both Google flows with explicit signin/link intent,
server-issued state and a PKCE challenge. Pending flow data is kept in the same
tab's sessionStorage and cleared after the callback. Linking succeeds or displays
a conflict/cancellation error on Profile; it does not switch to an existing
Google account. AuthCallback avoids exchanging a one-time code twice under
StrictMode. Google authorization requires localhost or HTTPS for Web Crypto.

After linking, `GoogleProfileChoices` opens automatically with three unchecked replacement choices for first name, last name and primary email. Opening focuses the heading and scrolls the choices into view. The menu and its labeled reopen button appear only while Google is connected; the button explains which details can be copied. Keeping current details leaves all three unchanged. `AccountEmails` lists saved login addresses, allows choosing a primary and removing other addresses, and explicitly confirms Google disconnection when its email is removed. Profile updates refresh the auth cache and shared events. Historical addresses are server-only and do not grant login access.

## Frontend configuration

| Variable | Usage |
| --- | --- |
| VITE_GOOGLE_CLIENT_ID | Public Google client ID |
| VITE_GOOGLE_REDIRECT_URI | Redirect; otherwise browser origin + /auth/callback |
| VITE_API_BASE | Only AuthPage/review wrapper; not a universal base |

AuthPage and review wrappers default to `/api`; Spotify wrappers and many components use `/api` directly. Native development uses Vite's same-origin proxy. Vite values are embedded at build time. Compose runtime variables do not reconfigure static JavaScript; Dockerfile forwards only the Google build arguments. Never prefix secrets with VITE_.

From `hearsay`: npm ci; npm run dev:all; npm run build; npm run lint. Separate watch commands are dev:backend and dev:frontend. Vite runs on 5173 and proxies `/api` to 5174; frontend Docker serves on host port 8080. Preview has no API proxy. See [setup](../README.md) and [API contracts](BACKEND_REFERENCE.md).

## UI and errors

Light/dark rendering uses Tailwind 4's explicit class-based dark variant and theme-specific variables in `src/index.css`, following the saved choice rather than OS preference. Auth uses App's shared header; input labels target IDs; Profile exposes a main landmark; the skip link targets focusable `maincontent`; mobile navigation exposes expanded/controls state. See the [Docker Playwright MCP light/dark review](UI_REVIEW.md) for findings, coverage and limits.

ThemeContext persists light/dark mode through an HTML class. Provider components live in `context/ThemeContext.jsx`, `context/ToastContext.jsx` and `contexts/AuthContext.jsx`; shared context objects/hooks live in their adjacent `theme.js`, `toast.js` and `auth.js` modules so Fast Refresh can track component-only exports. Profile changes refresh the shared auth cache and header immediately. Tailwind supplies responsive layouts, and Header provides mobile navigation. Components use a mix of toasts, alerts, loading indicators and inline errors. Semantic HTML, ARIA labels and keyboard handlers appear in the interface; this reference does not certify accessibility compliance.

Keyword music search queries Spotify. Recent-review type filtering queries MongoDB.
