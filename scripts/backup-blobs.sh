#!/usr/bin/env bash
# Back up the blob store.
#
#   scripts/backup-blobs.sh [output-directory]
#
# A database restored without its blobs is a project full of broken references:
# every survey photo, sketch and site capture in Pool Forge lives on disk (or,
# later, in a bucket) and the database holds only the storage key. Restore one
# without the other and the app comes back looking intact while every image
# 404s.
#
# The local-disk driver is content-addressed: the file name is the sha256 of its
# bytes, so the store is append-only and this archive is safe to take while the
# app is running. Nothing is ever rewritten in place, so there is no torn-file
# case to worry about, only files that arrived after the archive started, which
# the next run picks up.
#
# Environment:
#   BLOB_STORE_LOCAL_DIR     default: .data/blobs
#   BACKUP_DIR               default: .backups
#   BACKUP_RETENTION_DAYS    default: 14

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BLOB_DIR="${BLOB_STORE_LOCAL_DIR:-$REPO_ROOT/.data/blobs}"
if [[ "$BLOB_DIR" != /* ]]; then
  BLOB_DIR="$REPO_ROOT/$BLOB_DIR"
fi
OUT_DIR="${1:-${BACKUP_DIR:-$REPO_ROOT/.backups}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ ! -d "$BLOB_DIR" ]]; then
  echo "No blob directory at $BLOB_DIR. Nothing to back up." >&2
  exit 0
fi

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/poolforge-blobs-$STAMP.tar.gz"

echo "Archiving $BLOB_DIR to $TARGET"
tar -czf "$TARGET" -C "$(dirname "$BLOB_DIR")" "$(basename "$BLOB_DIR")"

if command -v shasum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$TARGET")" > "$(basename "$TARGET").sha256")
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256")
fi

FILES="$(find "$BLOB_DIR" -type f | wc -l | tr -d ' ')"
SIZE="$(wc -c < "$TARGET" | tr -d ' ')"
echo "Wrote $TARGET ($SIZE bytes, $FILES blobs)"

if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$OUT_DIR" -maxdepth 1 -name 'poolforge-blobs-*.tar.gz' -mtime "+$RETENTION_DAYS" -print -delete
  find "$OUT_DIR" -maxdepth 1 -name 'poolforge-blobs-*.tar.gz.sha256' -mtime "+$RETENTION_DAYS" -delete
fi

echo "$TARGET"
