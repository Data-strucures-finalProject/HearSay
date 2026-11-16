# MongoDB operations

The app defaults to database `hearsay` and lowercase collections `users`, `reviews`, `artists`, `albums`, `songs` and `expressSessions`. Substitute configured names when operating on another instance. JSON exports in `db/schemas/HearSay.*.json` use capitalized filenames but target lowercase collections.

## Schema setup

Compose applies `schema-HearSay-*.json` validators through the backend startup command. To reapply them explicitly:

```powershell
docker compose exec backend npm run db:apply-schemas
```

For native development, from `hearsay` with `.env.development` configured:

```powershell
npm run db:apply-schemas
```

These commands create/update validators; they do not seed sample data or create reporting views. `create-*.js` files are separate manual MongoDB shell/GUI scripts and are not the automatic initializer. Their validation types differ from the JSON source, so choose one schema source deliberately.

Validation is moderate: new inserts and updates to already-valid documents are checked; existing invalid documents may remain invalid on update. See [MongoDB validation levels](https://www.mongodb.com/docs/manual/core/schema-validation/specify-validation-level/).

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

`db/backup.sh` and `db/restore.sh` are legacy Bash helpers: they hardcode database `HearSay`, admin/localhost/27017; restore also uses `--drop`. Review/edit their configuration before using them. The explicit commands above use the current default database instead. User deduplication is also a mutating maintenance operation; back up and assess linked reviews before running it.

## Compass and connections

Compass can import/export collection data as JSON/CSV. These operations are separate from downloads in the HearSay web UI. Select the intended database/collection and format explicitly. For remote/Atlas connections use the appropriate authenticated URI and TLS settings; percent-encode special characters in URI credentials.

## References

- [Database Tools installation](https://www.mongodb.com/docs/database-tools/installation/)
- [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/)
- [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [mongoexport](https://www.mongodb.com/docs/database-tools/mongoexport/)
- [mongoimport](https://www.mongodb.com/docs/database-tools/mongoimport/)
