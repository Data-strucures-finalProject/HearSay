# Light and dark page review — November 17, 2026

The Docker Desktop **Playwright MCP** server navigated the running app at `http://host.docker.internal:8080`, inspected accessibility snapshots, measured rendered colours/layout, exercised navigation and captured full-page screenshots. This found a real theme failure missed by earlier theme-toggle-only checks.

## Findings and fixes

| Finding | Fix |
| --- | --- |
| Dark mode left backgrounds white while some analytical text became white | Added Tailwind 4's class-based `dark` variant and dark CSS-variable values; saved user choice overrides the opposite OS colour preference |
| Secondary search/review text had about 3.67:1 dark-mode contrast | Changed those dark utilities to lighter grey and supplied readable placeholder/success/error colours |
| Login/register rendered a second fixed header | Removed the duplicate header/extra padding; associated form labels with input IDs |
| Skip link had no target; mobile menu lacked expanded state | Added a focusable `maincontent` target and menu ID/controls/expanded attributes |
| Profile lacked a main landmark and long header emails could overflow | Added main landmarks for loaded/loading/error states and identity text wrapping |
| Follower counts wrapped onto two lines on mobile | Numeric table cells use nonwrapping tabular figures and right alignment; horizontal scroll regions remain keyboard-focusable with scrollbar styling |

## Scope and results

Eighteen public page/category variants were checked in **light and dark** at **390px mobile and 1440px desktop**, for 72 combinations: Home, login entry page, Recent Reviews, Random, Spotify search, all six Discover categories, all three Community categories, and a stored album/song/artist/full-review page. Media IDs came from the app's public endpoints.

Profile, My Reviews and Admin were checked with intercepted read-only sessions in the same four combinations, adding 12 protected cases (84 total). Profile checks opened its editor and Google-detail chooser. Interceptors block non-GET requests and use invented identities; they do not establish real login, backend authorization or live Google OAuth behavior.

The final MCP checks found no page-level horizontal overflow, duplicate headers, JavaScript page errors or failures in sampled rendered-text contrast across those 84 combinations. Theme persistence/opposite OS preference, mobile menu state/navigation, keyboard skip-link focus and unbroken numeric cells were also exercised. Desktop light login and desktop/mobile dark Popular on Spotify screenshots were visually inspected.

The text audit uses computed foreground/background colours, alpha composition, and 4.5:1 normal-text / 3:1 large-text thresholds. It excludes hidden/disabled controls and does not certify every image, icon, pseudo-element, hover/focus state or third-party iframe. This is a focused review, not an accessibility certification. External Spotify availability/changing content can affect results.

## Repeatable checks and limits

`scripts/tests/browser/theme-audit.mjs` exports the function run through Playwright MCP. `theme-fixtures.mjs` supplies the protected fixtures. `theme.mjs` integrates 14 stable public routes/categories and three protected fixture pages into the runner in both themes and widths, plus registration-label and menu/skip-target checks. The four live media examples were additional MCP coverage rather than hardcoded dependencies on private database contents.

Run `.\scripts\tests\run.cmd theme`; add `--setup` if temporary test tools are absent. The default runner now includes nine suites: runtime, insights, smoke, admin, google-link, google-profile, account-data, artist-feed and theme. Build and lint passed after the fixes.

Final validation: `.\scripts\tests\run.cmd` passed all nine suites on November 17, 2026. The new theme suite passed 56 public and 12 protected fixture combinations. The broader interactive MCP review additionally included the four live media detail pages, for 84 total combinations. No real account was logged into or changed for this visual review.

No application dependencies or backend API contracts changed in this review. The pre-existing missing artist top-songs endpoint and duplicate cached artists remain separate functionality/data issues. Docker MongoDB MCP rejected its configured connection URI, so this review made no database changes through that server; Playwright MCP review continued successfully.
