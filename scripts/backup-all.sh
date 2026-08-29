#!/usr/bin/env bash
# Take both halves of a Pool Forge backup, in the order that cannot produce a
# broken reference.
#
#   scripts/backup-all.sh [output-directory]
#
# Database first, blobs second. The blob store is append-only, so:
#
#   * database then blobs: a blob uploaded in between lands in the archive with
#     no row pointing at it. An orphan file. Harmless.
#   * blobs then database: a blob uploaded in between is referenced by the dump
#     with no file behind it. A broken image in a restored project. Not
#     harmless, and invisible until somebody opens that project.
#
# So the order in this file is the whole point of this file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-${BACKUP_DIR:-$SCRIPT_DIR/../.backups}}"

"$SCRIPT_DIR/backup-db.sh" "$OUT_DIR"
"$SCRIPT_DIR/backup-blobs.sh" "$OUT_DIR"
