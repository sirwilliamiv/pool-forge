#!/usr/bin/env bash
# Restore a Pool Forge dump into a database.
#
#   scripts/restore-db.sh <dump-file> [target-database]
#
# With no target it restores into `poolforge_restore_<timestamp>`, which is the
# safe default on purpose: the overwhelmingly common reason to run a restore is
# to check that the backup works, and that must never be one typo away from
# flattening the live database.
#
# Restoring over an existing database requires FORCE=1 and drops it first.
#
# Environment:
#   DATABASE_URL   the server to restore into; the database in the URL is only
#                  used to connect, the target database is the argument
#   FORCE=1        allow dropping and recreating an existing target database

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pgtools.sh
source "$SCRIPT_DIR/lib/pgtools.sh"

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: scripts/restore-db.sh <dump-file> [target-database]" >&2
  exit 2
fi

load_database_url
init_pg_runner pg_restore

TARGET_DB="${2:-poolforge_restore_$(date -u +%Y%m%d%H%M%S)}"
if [[ ! "$TARGET_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "Refusing target database name '$TARGET_DB'." >&2
  exit 2
fi

# Verify the checksum first when one was written. Restoring a corrupted archive
# produces a half-populated database, which is worse than an obvious failure.
if [[ -f "$DUMP.sha256" ]]; then
  if command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$DUMP")" && shasum -a 256 -c "$(basename "$DUMP").sha256")
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
  fi
fi

ADMIN_URL="$(pg_url_for_db postgres psql)"
TARGET_URL="$(pg_url_for_db "$TARGET_DB" pg_restore)"

EXISTS="$(pg_tool psql "$ADMIN_URL" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" || true)"

if [[ "$EXISTS" == "1" ]]; then
  if [[ "${FORCE:-0}" != "1" ]]; then
    echo "Database '$TARGET_DB' already exists. Re-run with FORCE=1 to drop and recreate it." >&2
    exit 1
  fi
  echo "Dropping existing '$TARGET_DB' (FORCE=1)"
  pg_tool psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid()" >/dev/null
  pg_tool psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$TARGET_DB\"" >/dev/null
fi

echo "Creating '$TARGET_DB'"
pg_tool psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\"" >/dev/null

echo "Restoring $DUMP into '$TARGET_DB'"
# --no-owner / --no-privileges match the dump flags. --exit-on-error so a
# partial restore reports as a failure rather than as a success with holes.
pg_tool pg_restore \
  --dbname="$TARGET_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  < "$DUMP"

echo "Restored into '$TARGET_DB'"
echo "$TARGET_DB"
