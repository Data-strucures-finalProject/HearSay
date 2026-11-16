# HearSay frontend reference

Reviewed November 16, 2026 against `hearsay/src`. React 19, React Router 7, Vite 7 and Tailwind 4 provide an SPA. `main.jsx` mounts StrictMode and AuthProvider; App adds ThemeProvider, ToastProvider, Router and Header. API access mixes direct fetch with config wrappers.

## Routes

| Route | Component | Current behavior |
| --- | --- | --- |
| `/` | LandingPage | Spotify new releases/search, sampled/popularity-sorted cards, locale selector and refresh |
| `/auth` | AuthPage | Local login/register and Google PKCE redirect |
| `/auth/callback` | AuthCallback | Exchange code, read session, cache user and broadcast auth event |
| `/search?q=...` | SearchPage | Spotify artist/album/track search; ten initial cards/category and Show All within fetched results |
| `/artist/:artistId` | ArtistPage | Cached artist metadata with Spotify fallback; live albums/singles; artist review/rating |
| `/album/:albumId` | AlbumRatingPage | Spotify album/track details, written review, direct album rating and track submissions |
| `/song/:songId` | SongRatingPage | Spotify track/player, own review/rating and delete |
| `/my-reviews` | MyReviewsPage | Protected; own reviews, live metadata enrichment, pagination, editing and deletion |
| `/recent-reviews` | RecentReviewsPage | Public song/album columns with pagination and links to details |
| `/review/:reviewId` | ReviewPage | Public review details; author edit controls |
| `/profile` | ProfilePage | Protected; profile, name editing, password setup and logout |
| `/random` | RandomPage | Song/album discovery from Spotify results |

ProtectedRoute checks `/api/me` and redirects guests to `/auth`, initially accepting cached user presence while waiting. Backend session/ownership checks protect writes. Navbar, Layout and TrackList are not mounted by App; TrackList contains a duplicate profile implementation.

## Review behavior and limits

Headphone controls use half-star increments. Most forms enforce 1,000 words; client sanitizeInput additionally caps text at 5,000 characters and strips selected markup patterns. The server uses word count instead. Stored ratings are doubled; API responses use stars. Zero means unrated.

Album track submission requires at least one rated track, not all tracks. It sequentially saves each song review, averages rated tracks, then saves a rounded album rating. Writes can partially succeed. Existing track values load through individual song reviews. My Reviews lists those records as well as albums. The server also accepts optional trackRatings objects from API clients; see the backend contract.

AlbumRatingPage uses Spotify for its album track list. ArtistPage uses cached artist details with live album/single requests. Public ReviewPage displays author/media details from a dedicated backend response, while review editing submits through the upsert endpoint.

## Authentication state

Header reads `/api/me` on mount, browser focus and window auth events. Google callback and profile logout emit window events through `utils/authBus.js`. AuthProvider maintains user state for context consumers. The active Header also keeps its own session state. `hs_user` in localStorage is a UI cache, not authorization. The backend validates sessions for protected operations.

## Frontend configuration

| Variable | Usage |
| --- | --- |
| VITE_GOOGLE_CLIENT_ID | Public Google client ID |
| VITE_GOOGLE_REDIRECT_URI | Redirect; otherwise browser origin + /auth/callback |
| VITE_API_BASE | Only AuthPage/review wrapper; not a universal base |

AuthPage defaults to `http://localhost:5174/api`, review wrappers to `/api`; Spotify wrappers and many components hardcode `/api`. Native development should set `VITE_API_BASE=/api` and use Vite's proxy. Vite values are embedded at build time. Compose runtime variables do not reconfigure static JavaScript; Dockerfile forwards only the Google build arguments. Never prefix secrets with VITE_.

From `hearsay`: npm ci; npm run dev:all; npm run build; npm run lint. Separate watch commands are dev:backend and dev:frontend. Vite runs on 5173 and proxies `/api` to 5174; frontend Docker serves on host port 8080. Preview has no API proxy. See [setup](../README.md) and [API contracts](BACKEND_REFERENCE.md).

## UI and errors

ThemeContext persists light/dark mode through an HTML class. Tailwind supplies responsive layouts, and Header provides mobile navigation. Components use a mix of toasts, alerts, loading indicators and inline errors. Semantic HTML, ARIA labels and keyboard handlers appear in the interface; this reference does not certify accessibility compliance.

Keyword music search queries Spotify. Recent-review type filtering queries MongoDB.
