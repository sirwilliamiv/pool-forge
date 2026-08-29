#!/usr/bin/env bash
# Prove the backup by restoring it.
#
#   scripts/verify-restore.sh [dump-file]
#
# Takes a fresh dump (or uses the one given), restores it into a scratch
# database, counts every row of every table in both, and fails loudly on any
# difference. Then drops the scratch database unless KEEP=1.
#
# This is the script that turns "we have backups" into a statement somebody has
# checked. A backup nobody has restored is a hope, and the failure modes are all
# silent ones: an empty dump, a truncated file, a schema that restores but with
# zero rows, a role that does not exist on the target.
#
# Environment:
#   KEEP=1   leave the scratch database in place for inspection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pgtools.sh
source "$SCRIPT_DIR/lib/pgtools.sh"

load_database_url
init_pg_runner pg_dump

DUMP="${1:-}"
TMP_DUMP=""
if [[ -z "$DUMP" ]]; then
  TMP_DUMP="$(mktemp -t poolforge-verify-XXXXXX).dump"
  echo "== 1. Taking a fresh dump =="
  BACKUP_DIR="$(dirname "$TMP_DUMP")" "$SCRIPT_DIR/backup-db.sh" "$(dirname "$TMP_DUMP")" > /tmp/poolforge-verify-path.$$
  DUMP="$(tail -n 1 /tmp/poolforge-verify-path.$$)"
  rm -f /tmp/poolforge-verify-path.$$ "$TMP_DUMP"
else
  echo "== 1. Using existing dump $DUMP =="
fi

SCRATCH="poolforge_verify_$(date -u +%Y%m%d%H%M%S)"

cleanup() {
  if [[ "${KEEP:-0}" == "1" ]]; then
    echo "KEEP=1: leaving scratch database '$SCRATCH' in place."
    return
  fi
  local admin
  admin="$(pg_url_for_db postgres psql)"
  pg_tool psql "$admin" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$SCRATCH' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  pg_tool psql "$admin" -c "DROP DATABASE IF EXISTS \"$SCRATCH\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo
echo "== 2. Restoring into scratch database '$SCRATCH' =="
"$SCRIPT_DIR/restore-db.sh" "$DUMP" "$SCRATCH" >/dev/null

# Build one query that counts every table in the public schema, so a table added
# later is checked without anyone remembering to add it here.
COUNT_SQL_BUILDER="SELECT coalesce(string_agg(format('SELECT %L AS t, count(*) AS n FROM public.%I', c.relname, c.relname), ' UNION ALL '), 'SELECT NULL::text AS t, 0::bigint AS n WHERE false') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public'"

SOURCE_URL="$(pg_url psql)"
SCRATCH_URL="$(pg_url_for_db "$SCRATCH" psql)"

COUNT_SQL="$(pg_tool psql "$SOURCE_URL" -tAc "$COUNT_SQL_BUILDER")"
ORDERED="SELECT t, n FROM ($COUNT_SQL) x ORDER BY t"

echo
echo "== 3. Comparing row counts, source against restored =="
SOURCE_COUNTS="$(pg_tool psql "$SOURCE_URL" -tAF'|' -c "$ORDERED")"
SCRATCH_COUNTS="$(pg_tool psql "$SCRATCH_URL" -tAF'|' -c "$ORDERED")"

printf '%-34s %10s %10s  %s\n' 'table' 'source' 'restored' 'result'
FAILED=0
TOTAL=0
while IFS='|' read -r table count; do
  [[ -z "$table" ]] && continue
  restored="$(printf '%s\n' "$SCRATCH_COUNTS" | awk -F'|' -v t="$table" '$1 == t { print $2 }')"
  restored="${restored:-missing}"
  if [[ "$restored" == "$count" ]]; then
    printf '%-34s %10s %10s  ok\n' "$table" "$count" "$restored"
  else
    printf '%-34s %10s %10s  MISMATCH\n' "$table" "$count" "$restored"
    FAILED=1
  fi
  TOTAL=$(( TOTAL + count ))
done <<< "$SOURCE_COUNTS"

echo
if [[ "$FAILED" -ne 0 ]]; then
  echo "RESTORE VERIFICATION FAILED: at least one table did not come back." >&2
  exit 1
fi
echo "Restore verified: every table matched, $TOTAL rows in total."
