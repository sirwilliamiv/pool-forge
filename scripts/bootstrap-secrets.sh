#!/usr/bin/env bash
set -euo pipefail

# Put Pool Forge's secrets into Secret Manager, once.
#
# Reads each value from the terminal rather than an argument, so nothing secret
# lands in shell history. Existing secrets are offered a new version rather than
# being overwritten blindly.
#
#   ./scripts/bootstrap-secrets.sh

PROJECT_ID="${PROJECT_ID:-pool-forge-prod}"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"

# name|required|what it is
SECRETS=(
  "pool-forge-database-url|required|Postgres connection string, the pooled one if your host offers a pool"
  "pool-forge-auth-secret|required|Session signing key. Leave blank to have one generated."
  "pool-forge-identity-api-key|optional|Identity Platform browser API key, for sign-in"
  "pool-forge-resend-api-key|optional|Email provider key. Without it, invites hand back a link to copy."
  "pool-forge-monitoring-webhook|optional|Where error alerts are posted"
  "pool-forge-google-client-id|optional|Google sign-in"
  "pool-forge-google-client-secret|optional|Google sign-in"
)

printf '\nSecrets for %s\n\n' "$PROJECT_ID"

for row in "${SECRETS[@]}"; do
  IFS='|' read -r name kind description <<< "$row"

  if gcloud secrets describe "$name" &>/dev/null; then
    printf '%s already exists. New version? [y/N] ' "$name"
    read -r answer </dev/tty
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "  left alone"; continue; }
  elif [ "$kind" = "optional" ]; then
    printf '%s (%s)\n  create it? [y/N] ' "$name" "$description"
    read -r answer </dev/tty
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "  skipped"; continue; }
  fi

  printf '  %s\n  value (input hidden): ' "$description"
  read -rs value </dev/tty
  echo

  if [ -z "$value" ] && [ "$name" = "pool-forge-auth-secret" ]; then
    value="$(openssl rand -base64 32)"
    echo "  generated one"
  fi

  if [ -z "$value" ]; then echo "  nothing entered, skipped"; continue; fi

  # printf rather than echo: echo appends a newline, and a trailing newline in a
  # connection string or a signing key breaks comparisons and headers in ways
  # that are very hard to see.
  if gcloud secrets describe "$name" &>/dev/null; then
    printf %s "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
    echo "  new version added"
  else
    printf %s "$value" | gcloud secrets create "$name" --data-file= --replication-policy=automatic >/dev/null 2>&1 \
      || printf %s "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
    echo "  created"
  fi
  unset value
done

printf '\nDone. Deploy with ./deploy.sh\n'
