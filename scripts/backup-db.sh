#!/usr/bin/env bash
# Take a full logical backup of the Pool Forge database.
#
#   scripts/backup-db.sh [output-directory]
#
# Writes <dir>/poolforge-<UTC timestamp>.dump in pg_dump's custom format, plus a
# .sha256 next to it, then prunes anything older than BACKUP_RETENTION_DAYS.
#
# Custom format (-Fc) rather than plain SQL because it is compressed, it can be
# restored selectively, and pg_restore can run it in parallel. `--no-owner` and
# `--no-privileges` because the role that owns the objects on a local Docker
# Postgres is not the role that owns them on the managed one, and a restore that
# stops on a missing role is a restore that did not happen.
#
# Environment:
#   DATABASE_URL             read from the environment, then .env.local, then .env
#   BACKUP_DIR               default: .backups
#   BACKUP_RETENTION_DAYS    default: 14

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pgtools.sh
source "$SCRIPT_DIR/lib/pgtools.sh"

load_database_url
init_pg_runner pg_dump

OUT_DIR="${1:-${BACKUP_DIR:-$SCRIPT_DIR/../.backups}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/poolforge-$STAMP.dump"

echo "Dumping to $TARGET"
# No --file: pg_dump writes the archive to stdout by default, and inside a
# container "--file=/dev/stdout" fails on fsync ("could not fsync file
# /dev/stdout: Invalid argument").
pg_tool pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  "$(pg_url pg_dump)" > "$TARGET"

if [[ ! -s "$TARGET" ]]; then
  echo "Dump is empty. Refusing to keep it." >&2
  rm -f "$TARGET"
  exit 1
fi

# A checksum written at backup time is the only way to tell a corrupted archive
# from a corrupted restore later.
if command -v shasum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$TARGET")" > "$(basename "$TARGET").sha256")
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256")
fi

SIZE="$(wc -c < "$TARGET" | tr -d ' ')"
echo "Wrote $TARGET ($SIZE bytes)"

# Retention. Runs after a successful dump only, so a failing backup job never
# deletes the last good one.
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$OUT_DIR" -maxdepth 1 -name 'poolforge-*.dump' -mtime "+$RETENTION_DAYS" -print -delete
  find "$OUT_DIR" -maxdepth 1 -name 'poolforge-*.dump.sha256' -mtime "+$RETENTION_DAYS" -delete
fi

echo "$TARGET"
