#!/usr/bin/env bash
set -euo pipefail

# Simple backup script for HearSay MongoDB on Linux/macOS
# Usage: ./backup.sh [OUTDIR]
# Database settings may be supplied by the environment or a root .env file.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    key="${key//[[:space:]]/}"
    value="${value%$'\r'}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    case "$key" in
      MONGO_DB_NAME|MONGO_USERNAME|MONGO_USER|MONGO_PASSWORD|MONGO_PASS|MONGO_HOST|MONGO_PORT|MONGO_AUTH_SOURCE)
        export "$key=$value"
        ;;
    esac
  done < "$ROOT_DIR/.env"
fi

DB="${MONGO_DB_NAME:-hearsay}"
USER="${MONGO_USERNAME:-${MONGO_USER:-admin}}"
AUTHDB="${MONGO_AUTH_SOURCE:-admin}"
HOST="${MONGO_HOST:-localhost}"
PORT="${MONGO_PORT:-27017}"
MONGO_PASS="${MONGO_PASSWORD:-${MONGO_PASS:-}}"

OUTDIR="${1:-/tmp/hearsay-backup-$(date +%Y%m%d%H%M%S)}"
mkdir -p "$OUTDIR"

if [ -z "${MONGO_PASS:-}" ]; then
  read -s -p "MongoDB password: " MONGO_PASS; echo
fi

echo "Backing up DB '$DB' to $OUTDIR"
mongodump --db "$DB" --username "$USER" --password "$MONGO_PASS" --authenticationDatabase "$AUTHDB" --host "$HOST" --port $PORT --archive="$OUTDIR/hearsay.archive.gz" --gzip

echo "Backup complete: $OUTDIR/hearsay.archive.gz"
chmod 600 "$OUTDIR/hearsay.archive.gz"
