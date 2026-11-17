# Developer tests

These optional Docker-based tests are grouped by purpose. Run the Windows command runner from PowerShell or Command Prompt with the matching app containers already built and running. It needs no host Node installation or PowerShell execution-policy change.

```powershell
# Install temporary test tools and run everything.
.\scripts\tests\run.cmd --setup

# Subsequent runs, until the backend container is recreated.
.\scripts\tests\run.cmd
.\scripts\tests\run.cmd runtime
.\scripts\tests\run.cmd browser
.\scripts\tests\run.cmd admin
```

`--setup` installs PDF inspection tools, Chromium and Playwright inside the running backend container. Container recreation removes them. It does not add test dependencies to the app package or its production images. The runner stages this directory at `/app/tests`, runs suites sequentially and stops on the first failure. It does not rebuild or restart the app; rebuild changed application code before testing it.

| Location | Purpose |
| --- | --- |
| `runtime.mjs` | API, database, authentication, admin roles, email management, export and deletion regressions |
| `fixtures/providers.mjs` | Google/Spotify responses preloaded only into the isolated runtime test server |
| `browser/smoke.mjs` | Public-route smoke checks and intercepted review/auth/error contracts |
| `browser/admin.mjs` | Guest/user/admin visibility, route guards and mobile navigation |
| `browser/google-link.mjs` | Google sign-in/link callback success and failure paths |
| `browser/google-profile.mjs` | Independent profile choices, email controls and contrast |
| `browser/account-data.mjs` | CSV/PDF downloads, account-deletion confirmation, failures and sign-out |
| `browser/artist-feed.mjs` | Artist-feed pagination, errors, retry and navigation |

Individual browser names also work as the suite argument, such as `google-link`, `google-profile`, `account-data`, `artist-feed` or `smoke`.

Runtime tests apply the actual validators to a unique `hearsay_audit_*` database, start a separate server on port 5184, mock provider calls, and drop the database in `finally`. The database user needs create/drop privileges. Browser feature tests intercept API/provider calls; the smoke suite also reads public pages of the running app. Tests do not delete or edit existing real accounts/reviews. The smoke screenshot is temporary at `/tmp/hearsay-audit-mobile.png` in the container.

Do not preload the provider fixture into the normal app process. Run these suites against a development environment with its normal services available. Passing fixtures does not replace live OAuth/HTTPS checks or user acceptance testing.
