# Developer tests

Run these optional suites from PowerShell or Command Prompt with the app containers built and running. Host Node.js is not required.

```powershell
# Install temporary browser test tools and run everything.
.\scripts\tests\run.cmd --setup

# Subsequent runs use built-in pdftotext and browser tools installed by --setup.
.\scripts\tests\run.cmd
.\scripts\tests\run.cmd runtime
.\scripts\tests\run.cmd browser
.\scripts\tests\run.cmd admin
.\scripts\tests\run.cmd insights
.\scripts\tests\run.cmd theme
.\scripts\tests\run.cmd discussions
```

The backend image includes `pdftotext` for account-PDF export tests. Browser suites install temporary Chromium and Playwright dependencies with `run.cmd --setup`; recreating the backend container removes those temporary browser dependencies. The runner copies tests to `/app/tests` and stops at the first failure. Rebuild changed application images before testing; the runner does not restart services.

| Location | Purpose |
| --- | --- |
| `runtime.mjs` | API, database, authentication, admin roles, email management, export/deletion, Google email collisions, password reauthentication/session revocation, rotation, cache/log privacy and production CSRF regressions |
| `discussions.mjs` | Runtime discussion checks: migration, threaded references, paging, permissions, retry idempotency, votes, deletion and analytical counts |
| `schemas.mjs` | Runtime schema contracts: valid/invalid documents, BSON types, identity indexes, session envelopes, strict legacy updates, unchanged validators after failed preflight and drift detection |
| `track-ratings.mjs` | Runtime migration checks: dry-run, unchanged data/validators after failed preflight, preserved review values, uniform BSON Double scores, idempotence and legacy-map rejection after migration |
| `insights.mjs` | All ten real MongoDB views/API contracts plus current-source browser tests for Discover, Community and admin integrity |
| `fixtures/providers.mjs` | Google/Spotify responses preloaded only into the isolated runtime test server |
| `hearsay/server/scripts/validate-database.mjs` (repository root) | Read-only validation of the configured database; run `docker compose exec -T backend npm run db:validate` |
| `browser/smoke.mjs` | Public-route smoke checks and intercepted review/auth/error contracts, including Spotify homepage fallback and Random Song request counts |
| `browser/rating-layout.mjs` | Run by smoke: rating/track-list geometry, long titles, touch targets, half-stars, keyboard input and final-track access in both themes at six widths |
| `browser/admin.mjs` | Guest/user/admin visibility, route guards and mobile navigation |
| `browser/google-link.mjs` | Google sign-in/link callback success and failure paths |
| `browser/google-profile.mjs` | Independent profile choices, email controls and contrast |
| `browser/account-data.mjs` | CSV/PDF downloads, account-deletion confirmation, failures and sign-out |
| `browser/artist-feed.mjs` | Artist-feed pagination, errors, retry and navigation |
| `browser/theme.mjs` | Rendered light/dark colours, contrast samples, responsive layouts, header/main landmarks, read-only protected fixtures and navigation |
| `browser/discussions.mjs` | Album/song/artist discussion controls, nested replies, collapse, votes, edit/delete and failure recovery in both themes at 390/1440px |

The default runs all ten suites; `browser` selects the eight browser suites. Individual suite names are accepted. The runtime suite also runs the API/database discussion checks.

Runtime tests apply validators to a temporary `hearsay_audit_*` database and start an isolated API on port 5184. Insights tests create a temporary `hearsay_insights_*` database, build `/app/dist`, and serve a fixture app on a random loopback port. Both drop their databases on completion and require create/drop privileges. For insights database/API checks without a browser, run `node tests/insights.mjs` in the staged backend directory.

Browser tests intercept account mutations; smoke tests also read the running app. Keep provider mocks confined to test processes. Run against a development environment; fixture coverage does not replace live OAuth/HTTPS acceptance checks.
