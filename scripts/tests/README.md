# Developer tests

Run these optional suites from PowerShell or Command Prompt with the app containers built and running. Host Node.js is not required.

```powershell
# Install temporary test tools and run everything.
.\scripts\tests\run.cmd --setup

# Subsequent runs, until the backend container is recreated.
.\scripts\tests\run.cmd
.\scripts\tests\run.cmd runtime
.\scripts\tests\run.cmd browser
.\scripts\tests\run.cmd admin
.\scripts\tests\run.cmd insights
.\scripts\tests\run.cmd theme
```

`--setup` installs temporary PDF tools, Chromium and Playwright in the backend container. Recreating the container removes them. The runner copies tests to `/app/tests` and stops at the first failure. Rebuild changed application images before testing; the runner does not restart services.

| Location | Purpose |
| --- | --- |
| `runtime.mjs` | API, database, authentication, admin roles, email management, export and deletion regressions |
| `insights.mjs` | All ten real MongoDB views/API contracts plus current-source browser tests for Discover, Community and admin integrity |
| `fixtures/providers.mjs` | Google/Spotify responses preloaded only into the isolated runtime test server |
| `browser/smoke.mjs` | Public-route smoke checks and intercepted review/auth/error contracts |
| `browser/admin.mjs` | Guest/user/admin visibility, route guards and mobile navigation |
| `browser/google-link.mjs` | Google sign-in/link callback success and failure paths |
| `browser/google-profile.mjs` | Independent profile choices, email controls and contrast |
| `browser/account-data.mjs` | CSV/PDF downloads, account-deletion confirmation, failures and sign-out |
| `browser/artist-feed.mjs` | Artist-feed pagination, errors, retry and navigation |
| `browser/theme.mjs` | Rendered light/dark colours, contrast samples, responsive layouts, header/main landmarks, read-only protected fixtures and navigation |

The default runs all nine suites; `browser` selects the seven browser suites. Individual suite names are accepted.

Runtime tests apply validators to a temporary `hearsay_audit_*` database and start an isolated API on port 5184. Insights tests create a temporary `hearsay_insights_*` database, build `/app/dist`, and serve a fixture app on a random loopback port. Both drop their databases on completion and require create/drop privileges. For insights database/API checks without a browser, run `node tests/insights.mjs` in the staged backend directory.

Browser tests intercept account mutations; smoke tests also read the running app. Keep provider mocks confined to test processes. Run against a development environment; fixture coverage does not replace live OAuth/HTTPS acceptance checks.
