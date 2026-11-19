# MongoDB operations

The app defaults to database `hearsay` and lowercase collections `users`, `reviews`, `artists`, `albums`, `songs` and `expressSessions`. Substitute configured names when operating on another instance. JSON exports in `db/schemas/HearSay.*.json` use capitalized filenames but target lowercase collections.

## Schema setup

Album review `trackRatings` are arrays of `{ trackId, rating }` entries. Track IDs are unique per review; scores are BSON Double values in half-star steps from 0.5 to 5. This snapshot supplements individual song reviews and does not change song analytics.

Compose applies `schema-HearSay-*.json` validators through the backend startup command. To reapply them explicitly:

```powershell
docker compose exec backend npm run db:apply-schemas
```

For native development, from `hearsay` with `.env.development` configured:

```powershell
npm run db:apply-schemas
```

These commands preflight existing records and duplicate Spotify identities, then apply six validators and unique music-identity indexes. Incompatible data stops the preflight before validators change. They do not seed sample data or create reporting views. The `schema-HearSay-*.json` files are the canonical MongoDB validators; `create-*.js` are generated manual collection-creation scripts with the same rules. From native development, run `npm run db:sync-schema-scripts` after editing a validator; `node server/scripts/sync-schema-scripts.mjs --check` detects stale generated scripts. The manual scripts target the default `hearsay` database; automatic initialization honors configured database/session collection names.

Backend startup installs analytical views in the configured database. Run `docker compose exec backend npm run db:apply-views`, or `npm run db:apply-views` from `hearsay`, to reconcile them manually. Credentials need create-view and `collMod` permissions. Existing views update in place; a conflicting collection causes an error. Installation does not change source documents or seed data.

Validation uses `strict` with action `error`, so all inserts and updates must satisfy the current rules, including updates to already-invalid records. See [MongoDB validation levels](https://www.mongodb.com/docs/manual/core/schema-validation/specify-validation-level/).

For an older database, `npm run db:normalize-schema-defaults` makes existing defaults explicit: missing roles become `user`, missing author lists are reconstructed from owned reviews, and missing vote arrays are initialized only when both vote counters are zero. It does not reset data, change credentials, infer vote identities or repair arbitrary invalid records. Run it before applying the stricter schemas, and inspect any remaining preflight failures. Legacy `HearSay.*.json` exports are historical data snapshots and may require migration before import; the demo seed utility produces the current model.

## Upgrade existing track ratings

Use this one-time migration for databases with album reviews that store `trackRatings` as maps. Stop the API and any other database writers before applying it. The first migration command checks the data without writing. The `--apply` command preserves review IDs, timestamps, track IDs, and rating values, and installs the updated strict validator. Invalid data stops the preflight. If interrupted, rerun the migration before restarting writers.

With Docker, run from the repository root:

```sh
docker compose stop backend
docker compose up -d mongodb
docker compose build backend frontend
docker compose run --rm --no-deps backend npm run db:migrate-track-ratings
docker compose run --rm --no-deps backend npm run db:migrate-track-ratings -- --apply
docker compose up -d backend frontend
docker compose exec -T backend npm run db:validate
```

For native development, stop the app and run from `hearsay` with the database configured:

```sh
npm run db:migrate-track-ratings
npm run db:migrate-track-ratings -- --apply
npm run db:apply-schemas
npm run db:validate
npm run dev:all
```

## Prerequisites

Install MongoDB Database Tools (mongodump, mongorestore, mongoexport, mongoimport). The commands below run on the host against Compose's published port 27017. Credentials need appropriate read/write or administrative permissions. Omitting password arguments lets Database Tools prompt rather than recording a password in shell history.

## Windows PowerShell

Use task-specific variable names; `$Host` is a built-in read-only PowerShell variable.

```powershell
$mongoDb = 'hearsay'
$mongoUser = 'admin'
$mongoAuthDb = 'admin'
$mongoServer = 'localhost'
$mongoPort = 27017
$backupDir = Join-Path $env:TEMP ('hearsay-backup-' + (Get-Date -Format yyyyMMddHHmmss))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$archivePath = Join-Path $backupDir 'hearsay.archive.gz'
```

Create a compressed archive:

```powershell
mongodump --host $mongoServer --port $mongoPort --db $mongoDb --username $mongoUser --authenticationDatabase $mongoAuthDb --archive=$archivePath --gzip
```

Restore that archive into its recorded namespaces (without dropping collections):

```powershell
mongorestore --host $mongoServer --port $mongoPort --username $mongoUser --authenticationDatabase $mongoAuthDb --nsInclude="$mongoDb.*" --archive=$archivePath --gzip
```

Existing duplicate IDs can cause conflicts; restoration is not an automatic merge/update operation. `--drop` replaces matching collections and removes their existing data; use it only when intentionally replacing the target and after verifying a backup. Do not restore into the live database just to inspect an archive.

Export reviews to Extended JSON and songs to flat CSV:

```powershell
mongoexport --host $mongoServer --port $mongoPort --db $mongoDb --collection reviews --username $mongoUser --authenticationDatabase $mongoAuthDb --out="$backupDir/reviews.json" --jsonArray
mongoexport --host $mongoServer --port $mongoPort --db $mongoDb --collection songs --username $mongoUser --authenticationDatabase $mongoAuthDb --type=csv --fields='spotifyTrackID,title,artist.name,album.name' --out="$backupDir/songs.csv"
```

Import into scratch collections rather than changing the active app data:

```powershell
mongoimport --host $mongoServer --port $mongoPort --db $mongoDb --collection reviews_import --username $mongoUser --authenticationDatabase $mongoAuthDb --file="$backupDir/reviews.json" --jsonArray
mongoimport --host $mongoServer --port $mongoPort --db $mongoDb --collection songs_import --username $mongoUser --authenticationDatabase $mongoAuthDb --type=csv --headerline --file="$backupDir/songs.csv"
```

CSV is a flat interchange format; it does not preserve nested documents, ObjectIds, validators or indexes. Use a BSON archive for full backups and Extended JSON for document interchange.

## Linux/macOS Bash

```bash
mongo_db='hearsay'
mongo_user='admin'
mongo_auth_db='admin'
mongo_server='localhost'
mongo_port=27017
backup_dir="${TMPDIR:-/tmp}/hearsay-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_dir"
mongodump --host "$mongo_server" --port "$mongo_port" --db "$mongo_db" --username "$mongo_user" --authenticationDatabase "$mongo_auth_db" --archive="$backup_dir/hearsay.archive.gz" --gzip
mongorestore --host "$mongo_server" --port "$mongo_port" --username "$mongo_user" --authenticationDatabase "$mongo_auth_db" --nsInclude="$mongo_db.*" --archive="$backup_dir/hearsay.archive.gz" --gzip
mongoexport --host "$mongo_server" --port "$mongo_port" --db "$mongo_db" --collection reviews --username "$mongo_user" --authenticationDatabase "$mongo_auth_db" --jsonArray --out="$backup_dir/reviews.json"
```

`db/backup.sh` and `db/restore.sh` read `MONGO_DB_NAME`, `MONGO_USERNAME`/`MONGO_USER`, `MONGO_PASSWORD`/`MONGO_PASS`, `MONGO_HOST`, `MONGO_PORT`, and `MONGO_AUTH_SOURCE` from the process or the repository-root `.env`. They default to `hearsay`, `admin`, `admin`, `localhost`, and `27017`. The restore helper imports matching namespaces without `--drop`; it does not remove extra existing records. Back up before restore and review the target database first. User deduplication is also a mutating maintenance operation; back up and assess linked reviews before running it.

## Compass and connections

Compass can import/export collection data as JSON/CSV. These operations are separate from downloads in the HearSay web UI. Select the intended database/collection and format explicitly. For remote/Atlas connections use the appropriate authenticated URI and TLS settings; percent-encode special characters in URI credentials.

## Demo seed

Local demo credentials are stored in `db/local-demo/demo-credentials.json` relative to the repository root. This Git-ignored file contains the five demo account emails and passwords. The same directory retains `catalog.json` (resolved Spotify metadata) and `seed-report.json` (seed provenance). These files are outside the application build context; do not copy credentials into documentation or source files.

Validate the current application database without changing its records:

```powershell
docker compose exec -T backend npm run db:validate
```

The validator reports schema violations, author/media backlinks, thread references, deleted-comment content and vote consistency. It exits nonzero on failure. It does not depend on an old backup or the exact original demo counts.

`server/scripts/seed-demo.mjs` stages the dated Billboard manifest, backs up application records, resets media/reviews, and creates five local demo accounts with 1–5 reviews per item. It retains the admin and the account identified by `SEED_PRESERVE_EMAIL`. Use a private absolute `SEED_WORK_DIR` and run from `hearsay` with the backend environment configured:

```powershell
node server/scripts/seed-demo.mjs --prepare
node server/scripts/seed-demo.mjs --backup
# Copy before-reset.ejson out of the container before applying.
# Set SEED_CONFIRM_RESET=hearsay only for the intended reset.
node server/scripts/seed-demo.mjs --apply
node server/scripts/seed-demo.mjs --verify
```

The apply phase refuses changes made after backup and restores saved records on failure. It uses an isolated API on port 5186 with staged Spotify responses. Store backups in Git-ignored `db/backups/` and retain demo credentials/catalogue under Git-ignored `db/local-demo/`. Replies are created through the discussion API as separate review documents referencing their parent review/comment. Parent `comments` arrays hold `{oid}` child references. The seed utility's `--verify` mode checks exact original seed coverage and account ownership using `catalog.json`; use `db:validate` once users have added normal activity.

For legacy embedded comments, set a private absolute `DISCUSSION_BACKUP_DIR` and run `node server/scripts/migrate-discussions.mjs` with the backend environment configured. The script backs up account/media/review records, then converts embedded comments while preserving identifiers, authors, text and timestamps. Existing converted records are checked before writes; retries repair author links without duplicating entries. Copy the backup outside the container before recreating it.

## References

- [Database Tools installation](https://www.mongodb.com/docs/database-tools/installation/)
- [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/)
- [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [mongoexport](https://www.mongodb.com/docs/database-tools/mongoexport/)
- [mongoimport](https://www.mongodb.com/docs/database-tools/mongoimport/)
