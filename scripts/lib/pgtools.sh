#!/usr/bin/env bash
# Shared plumbing for the backup and restore scripts.
#
# The problem this file exists to solve: the Postgres client tools on the
# machine are frequently older than the server. On this laptop, Homebrew has
# pg_dump 14 while docker-compose runs postgres:16, and pg_dump refuses to dump
# a newer server:
#
#   pg_dump: error: server version: 16.13; pg_dump version: 14.17
#   pg_dump: error: aborting because of server version mismatch
#
# A backup script that fails that way at 2am is worse than no backup script,
# so the tool version is checked up front rather than discovered on the day.
# When the local tools are too old (or absent) the same commands run inside a
# throwaway postgres:16 container, which is always the right version because it
# is the same image docker-compose runs.

set -euo pipefail

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

# Load DATABASE_URL from the usual places unless the caller already set one.
load_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  local file
  for file in "$repo_root/.env.local" "$repo_root/.env"; do
    if [[ -f "$file" ]]; then
      local line
      line="$(grep -E '^[[:space:]]*DATABASE_URL=' "$file" | tail -n 1 || true)"
      if [[ -n "$line" ]]; then
        line="${line#*=}"
        line="${line%\"}"
        line="${line#\"}"
        line="${line%\'}"
        line="${line#\'}"
        export DATABASE_URL="$line"
        return 0
      fi
    fi
  done
  echo "DATABASE_URL is not set and no .env.local or .env supplies one." >&2
  return 1
}

# Server major version, read with psql (which, unlike pg_dump, happily talks to
# a newer server) or with the container image when psql is missing.
server_major() {
  local out
  if command -v psql >/dev/null 2>&1; then
    out="$(psql "$DATABASE_URL" -tAc 'SHOW server_version_num' 2>/dev/null || true)"
  fi
  if [[ -z "${out:-}" ]]; then
    out="$(docker run --rm -i --add-host=host.docker.internal:host-gateway "$PG_IMAGE" \
      psql "$(containerise_url "$DATABASE_URL")" -tAc 'SHOW server_version_num' 2>/dev/null || true)"
  fi
  if [[ -z "${out:-}" ]]; then
    echo "Could not reach the database at the configured DATABASE_URL." >&2
    return 1
  fi
  echo $(( out / 10000 ))
}

client_major() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo 0
    return 0
  fi
  "$tool" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/'
}

# `localhost` means something different inside a container. Rewrite it so the
# containerised tools reach the Postgres published on the host.
containerise_url() {
  local url="$1"
  url="${url//@localhost:/@host.docker.internal:}"
  url="${url//@127.0.0.1:/@host.docker.internal:}"
  echo "$url"
}

# Decides once, prints `host` or `docker`, and explains itself.
PG_RUNNER=""
choose_runner() {
  local needed="$1" # pg_dump | pg_restore | psql
  if [[ -n "$PG_RUNNER" ]]; then
    echo "$PG_RUNNER"
    return 0
  fi
  local srv cli
  srv="$(server_major)"
  cli="$(client_major "$needed")"
  if [[ "$cli" -ge "$srv" && "$cli" -gt 0 ]]; then
    PG_RUNNER="host"
  else
    if ! command -v docker >/dev/null 2>&1; then
      echo "Local $needed is version ${cli} but the server is ${srv}, and docker is not available to supply a matching one." >&2
      echo "Install postgresql-client ${srv} (macOS: brew install postgresql@${srv}) and retry." >&2
      return 1
    fi
    PG_RUNNER="docker"
    echo "note: local ${needed} is ${cli:-absent}, server is ${srv}; using ${PG_IMAGE} instead." >&2
  fi
  echo "$PG_RUNNER"
}

# Call once, early, from the parent shell. `choose_runner` caches its answer in
# PG_RUNNER, but every later call happens inside a `$( )` subshell, which
# inherits the variable and cannot write it back; without this the version check
# reruns (and reprints its note) on every invocation.
init_pg_runner() {
  PG_RUNNER="$(choose_runner "${1:-psql}")"
}

# Run a Postgres client tool, wherever it lives. stdin and stdout pass through,
# so callers can pipe dumps around exactly as they would locally.
pg_tool() {
  local tool="$1"
  shift
  local runner
  runner="$(choose_runner "$tool")"
  if [[ "$runner" == "host" ]]; then
    "$tool" "$@"
  else
    docker run --rm -i --add-host=host.docker.internal:host-gateway "$PG_IMAGE" "$tool" "$@"
  fi
}

# The connection string to hand to pg_tool, adjusted for where it will run.
pg_url() {
  local runner
  runner="$(choose_runner "${1:-psql}")"
  if [[ "$runner" == "host" ]]; then
    echo "$DATABASE_URL"
  else
    containerise_url "$DATABASE_URL"
  fi
}

# Same connection string, pointed at a different database on the same server.
pg_url_for_db() {
  local db="$1"
  local base
  base="$(pg_url "${2:-psql}")"
  # Replace only the path segment, leaving any query string (sslmode=…) intact.
  if [[ "$base" =~ ^([^?]*)(\?.*)?$ ]]; then
    local without_query="${BASH_REMATCH[1]}"
    local query="${BASH_REMATCH[2]:-}"
    echo "${without_query%/*}/${db}${query}"
  else
    echo "${base%/*}/${db}"
  fi
}
