#!/usr/bin/env bash
set -euo pipefail

# Simple restore script for HearSay MongoDB on Linux/macOS
# Usage: ./restore.sh <archive-path>
# Database settings may be supplied by the environment or a root .env file.

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <archive-path>"
  exit 2
fi

ARCHIVE_PATH="$1"

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Archive not found: $ARCHIVE_PATH"
  exit 3
fi

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

if [ -z "${MONGO_PASS:-}" ]; then
  read -s -p "MongoDB password: " MONGO_PASS; echo
fi

echo "Restoring archive $ARCHIVE_PATH into DB '$DB' namespaces without dropping collections"
mongorestore --archive="$ARCHIVE_PATH" --gzip --username "$USER" --password "$MONGO_PASS" --authenticationDatabase "$AUTHDB" --host "$HOST" --port $PORT --nsInclude="$DB.*"

echo "Restore complete"
