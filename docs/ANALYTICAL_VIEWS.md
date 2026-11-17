# HearSay analytical views

Implemented November 17, 2026 from the submitted Phase II Part C MQL definitions. These are live, read-only MongoDB views against the configured application database, rather than the historical `hearsay_partc` sample database. Changes to source records appear on the next query.

## Pages and purposes

Every category has a captioned HTML table, search, sorting, pagination, and relevant media/review links. Discover and Community are public and linked in desktop/mobile navigation. Home links to favourites, first-review opportunities and Popular on Spotify; Recent Reviews links to album tables. The admin integrity table checks the current database role on every API request.

| View | MongoDB name | Page | Purpose |
| --- | --- | --- | --- |
| 1: multi-collection join | `hs_v01_album_review_details` | `/community?view=1` | Read album opinions alongside reviewer, album and artist details |
| 2: ALL/grouping equivalent | `hs_v02_highest_average_rated_albums` | `/discover?view=2` | Discover the highest average-rated album(s), including ties |
| 3: correlated subquery | `hs_v03_reviews_above_own_album_average` | `/community?view=3` | Find opinions more positive than the average for that same album |
| 4: full outer join equivalent | `hs_v04_all_users_and_reviews_full_join` | `/admin` | Inspect participation and missing user/review relationships |
| 5: union with deduplication | `hs_v05_unified_music_catalogue_union` | `/discover?view=5` | Search the stored song/album catalogue and filter by media type |
| 6: album rating summary | `hs_v06_album_rating_summary` | `/discover?view=6` | Compare stars and rating counts, including unrated albums |
| 7: reviewer engagement | `hs_v07_most_active_reviewers` | `/community?view=7` | Compare review activity and average stars given |
| 8: genre distribution | `hs_v08_genre_distribution` | `/discover?view=8` | Explore genres represented by cached artists |
| 9: album/review anti-join | `hs_v09_albums_awaiting_first_review` | `/discover?view=9` | Find albums awaiting their first review |
| 10: Spotify follower ranking | `hs_v10_artist_popularity_ranking` | `/discover?view=10` | Discover artists under **Popular on Spotify** |

Views 6, 7, 8 and 10 include bar charts of up to ten matching database results, independent of the table's current page. Labels and numeric values are text-accessible. All tables remain available. Charts use HTML/CSS without an extra library.

## Meaning and adaptations

- Stored ratings are doubled half-star integers; displayed ratings are stars. Unrated submissions display an em dash, not zero stars.
- View 2 compares each album average against every other album average, not one overall average. One rating can produce a winner; counts remain visible.
- View 3 excludes unrated reviews; a lone review cannot exceed its own album average. The output adds an album ID for navigation.
- View 4 includes users without reviews and orphaned reviews. It is admin-only, with no automatic repair/delete action.
- View 5 combines stored songs/albums, not Spotify's complete catalogue. Deduplication uses Spotify ID and media type.
- View 6 renames the submitted `reviewCount` to `ratingCount`: text-only reviews contribute neither to the count nor the mean.
- View 7 counts all reviews but averages only positive numeric ratings. Zero-review members remain included. Average stars given is not a reviewer-quality score.
- View 8 permits artists in several genres. Summed Spotify followers are not unique listeners. Artists with no genres are absent.
- View 9 excludes albums with any review, including text-only reviews.
- View 10 sorts by Spotify followers, not Spotify's separate popularity score or HearSay ratings. Cached album/song counts are linked records, not complete discographies. Missing follower values currently fall back to zero.
- Views 1 and 4 retain unmatched records. Public results project no account emails, password hashes or credentials.

## Installation

`server/analyticsViews.js` owns the pipelines; `shared/insights.js` owns display metadata and field allowlists. Backend startup installs/reconciles all ten views after connecting to MongoDB and fails if installation fails. Credentials need create-view and `collMod` permissions. Existing views update in place; a real collection is never dropped or overwritten.

From `hearsay`: `npm run db:apply-views`. From the repository root with Docker: `docker compose exec backend npm run db:apply-views`. Installation does not seed data or change source documents.

## API

Public: `GET /api/insights/:id` for 1–3 and 5–10. Admin: `GET /api/admin/insights/4`, behind persisted-role middleware and the normal session cookie.

| Parameter | Contract |
| --- | --- |
| `q` | Literal case-insensitive text search, at most 100 characters, applied in MongoDB to projected table fields |
| `sort` | Displayed column key; category default when omitted |
| `direction` | `asc` or `desc` |
| `limit` | Integer 1–100; default 20 |
| `offset` | Integer 0–100000; default 0 |
| `mediaType` | View 5 only: `album` or `song` |
| `status` | View 4 only: `matched`, `user_without_review`, `review_without_user` |

Responses contain `ok`, `items`, `total`, `offset`, nullable `nextOffset`, and `chart` (`label`/`value` pairs). Responses disable caching. Unknown/private views return 404; malformed options 400; missing admin session 401; insufficient/revoked role 403; query errors/timeouts 503. Queries have a five-second execution limit. Search escapes regex characters; clients cannot submit pipelines or arbitrary sort fields. Charts/counts cover all matches; tables are paged.

## Validation and limits

`scripts/tests/insights.mjs` creates/drops a unique temporary database. It checks all ten actual MongoDB views: joins, ties, correlated differences, unmatched relationships, union deduplication, half-star conversion, text-only reviews, zero-review members, genre totals and follower ordering. Installation checks cover repeated application and collection-collision refusal.

API checks cover every view, role denial/revocation, private-field exclusion, literal search, invalid queries, media/status filters, empty results, pagination and independent charts. With `--browser`, the test builds the current frontend and serves it against real test queries. Browser coverage includes all ten tables, charts, links, filters, pagination, empty/error/retry states, themes and navigation at 390/768/1024/1440 pixels. Fixture sessions exist only in the test harness.

Build, lint and database/API/browser checks passed November 17, 2026. These small-dataset checks do not establish production load capacity, fresh-machine installation or live OAuth/HTTPS behavior. Sparse data can produce legitimate empty categories. Legacy duplicate media and stale references can distort aggregates. Final-report screenshots and measurements still need the final demonstration dataset.

The existing account/review/API regression suite also passed against the updated source. After rebuilding the local app, both app services were healthy; all nine public analytical endpoints returned 200 and the admin integrity endpoint denied a guest with 401. A single sequential pass on the small current database observed 20–307 ms per public request, including first-request overhead; this is not a load benchmark. View 3 legitimately returned no rows in that dataset, while its nonempty correlated behavior passed controlled fixtures.

Final validation on November 17, 2026: `.\scripts\tests\run.cmd` passed all nine suites against the rebuilt app: runtime, insights, smoke, admin, google-link, google-profile, account-data, artist-feed and theme. Build and `npm run lint` also passed without errors or warnings. Use `run.cmd --setup` first when temporary Docker test tools are absent. No existing real users/reviews were mutated by the suites.

The [Docker Playwright MCP light/dark review](UI_REVIEW.md) found and verified fixes for the shared theme CSS, contrast/navigation issues and mobile number wrapping. Theme checks verify rendered colours and sampled text contrast rather than only the theme state changing.

The Docker image dependency installation reported 27 advisories (1 low, 6 moderate, 18 high, 2 critical). No dependencies were added for analytical views/charts and no dependency versions were changed in this work; dependency remediation remains separate work.
