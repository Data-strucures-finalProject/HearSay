# HearSay frontend reference

React 19, React Router 7, Vite 7 and Tailwind 4 provide the SPA. `main.jsx` mounts StrictMode and AuthProvider; App adds ThemeProvider, ToastProvider, Router and Header.

## Routes

| Route | Component | Current behavior |
| --- | --- | --- |
| `/` | LandingPage | Spotify search, sampled/popularity-sorted cards, locale selector and refresh |
| `/auth` | AuthPage | Local login/register and Google PKCE redirect |
| `/auth/callback` | AuthCallback | Validate tab-scoped OAuth state, exchange code once, then return to home or Profile according to intent |
| `/search?q=...` | SearchPage | Spotify artist/album/track search; ten initial cards/category and Show All within fetched results |
| `/artist/:artistId` | ArtistPage | Cached artist metadata with Spotify fallback; live albums/singles; review/rating and discussions |
| `/album/:albumId` | AlbumRatingPage | Spotify album/track details, review/rating, track submissions and discussions |
| `/song/:songId` | SongRatingPage | Spotify track/player, review/rating, deletion and discussions |
| `/my-reviews` | MyReviewsPage | Protected; own reviews, live metadata enrichment, pagination, editing and deletion |
| `/recent-reviews` | RecentReviewsPage | Public song/album/artist sections with independent pagination and links to details |
| `/review/:reviewId` | ReviewPage | Review/comment permalink with linked media context, author edit controls, votes and reply threads |
| `/profile` | ProfilePage | Protected; profile, name editing, password setup, Google linking, Google detail choices, email management, CSV/PDF downloads, account deletion and logout |
| `/admin` | AdminPage | Admin-only overview counts and user/review integrity table; server session role verified before rendering |
| `/discover?view=2` | InsightsPage | Community favourites; other categories are stored catalogue (5), album ratings (6), genres (8), first-review opportunities (9), Popular on Spotify (10) |
| `/community?view=1` | InsightsPage | Album review table; other categories are above-average opinions (3) and reviewer activity (7) |
| `/random` | RandomPage | Song/album discovery from Spotify results |

ProtectedRoute checks `/api/me` and redirects guests to `/auth`. Ordinary protected pages may initially accept cached user presence while waiting; `/admin` always waits for the server role and redirects non-admins home. Backend session/role/ownership checks protect API operations. Navbar, Layout and TrackList are not mounted by App; TrackList contains a duplicate profile implementation.

## Review behavior and limits

Album, song and artist pages share `DiscussionSection`: paginated reviews, newest/most-liked sorting, per-entry likes/dislikes, author editing/deletion, and collapsible reply trees. Replies load on expansion and support replies to comments; indentation stops increasing after three levels for mobile layouts. Guests can read discussions and are directed to sign in to participate. Deleting a comment leaves a placeholder for its descendants; deleting a media review removes its thread after confirmation. Review forms above the discussion stay synchronized through the scoped `hearsay-review-change` event. Individual review/comment permalinks expose the same discussion controls and link comments to their parent.

Discover and Community use `InsightsPanel` for searchable, sortable, paginated tables and charts. The catalogue filters by media type; admin integrity filters by relationship status. Category metadata is defined in `shared/insights.js`; query parameters are documented in the [backend reference](BACKEND_REFERENCE.md#analytical-queries).

Headphone controls use half-star increments. Most forms enforce 1,000 words; client sanitizeInput additionally caps text at 5,000 characters and strips selected markup patterns. The server uses word count instead. Stored ratings are doubled; API responses use stars. Zero means unrated.

Song and album pages use `MediaDetailLayout.css`: a stacked layout below 1024px and three desktop columns with an 18rem minimum side panel. `HeadphoneRating.css` gives each icon a 44px target and wraps the numeric preview within the available container width. Track titles/durations occupy a separate row above their rating controls. The album track list has a keyboard-focusable vertical scroll region and a separate submit area; no horizontal scrolling is required.

Album track submission requires at least one rated track, not all tracks. It sequentially saves each song review, averages rated tracks, then saves a rounded album rating. Writes can partially succeed. Existing track values load through individual song reviews. My Reviews lists those records as well as albums. Album submission includes a trackRatings array of `{ trackId, rating }` entries. The API requires this array format; see the backend contract.

AlbumRatingPage uses Spotify for its album track list. ArtistPage uses cached artist details with live album/single requests. Public ReviewPage links the reviewed title to its media page. Song reviews also display linked album/artist names; album reviews display linked artist names. Comment permalinks retain this media context. The backend resolves cached internal references to Spotify page IDs, with provider metadata used for uncached items; unresolved relationships display their available names without a guessed destination. Review editing submits through the upsert endpoint.

The homepage starts with one Spotify search per category and tries a second search only when fewer than five eligible, unique items are available. It keeps partial results if a fallback fails. Random Song continues past empty results and stops on a `429` response.

## Authentication state

Header reads `/api/me` on mount, browser focus and window auth events. Local login/signup, Google callback and profile logout emit window events through `utils/authBus.js`. AuthProvider and Header subscribe to the same event stream. `hs_user` in localStorage is a UI cache, not authorization. The backend validates sessions for protected operations.

`utils/googleAuth.js` starts both Google flows with explicit signin/link intent,
server-issued state and a PKCE challenge. Pending flow data is kept in the same
tab's sessionStorage and cleared after the callback. Linking succeeds or displays
a conflict/cancellation error on Profile; it does not switch to an existing
Google account. AuthCallback avoids exchanging a one-time code twice under
StrictMode. Google authorization requires localhost or HTTPS for Web Crypto.
If Google sign-in matches an existing email without a linked provider identity,
the callback explains how to sign in first and link Google from Profile.
Profile logout clears the local auth state only after the server confirms
success; a failed request leaves a visible retry message and retains the session UI.

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

Light/dark mode uses Tailwind's class-based dark variant and CSS variables in `src/index.css`. ThemeContext persists the user's choice in localStorage. The skip link targets `maincontent`; Header manages desktop/mobile navigation and menu expanded state.

At widths of 768px and above, primary tabs appear below the logo/search/account row. Smaller screens use the collapsible menu. Discovery categories live under Discover; Home contains music content without a separate navigation strip.

Provider components live in `context/ThemeContext.jsx`, `context/ToastContext.jsx` and `contexts/AuthContext.jsx`; their context objects and hooks live in adjacent `theme.js`, `toast.js` and `auth.js` modules for Fast Refresh. Components display loading indicators, inline errors, alerts and toasts.

Keyword music search queries Spotify. Catalogue search and analytical filters query MongoDB.
