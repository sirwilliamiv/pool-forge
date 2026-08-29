#!/usr/bin/env bash
set -euo pipefail

# Deploy Pool Forge to Cloud Run.
#
# Secrets live in Secret Manager and are mounted as environment variables at
# deploy time. Nothing secret is in this repository, in the image, or in a build
# argument, because a build argument is readable in the image's history forever.
#
# Modelled on inbox-admin's deploy, including the two habits worth copying: every
# secret name is prefixed with the app so one project can hold several apps
# without collisions, and an optional secret is mounted only when it exists, so
# a deploy does not fail because a feature has not been switched on yet.
#
#   ./deploy.sh              build and deploy
#   ./deploy.sh --no-build   redeploy the current image with new settings
#   ./deploy.sh --dry-run    print what it would do

PROJECT_ID="${PROJECT_ID:-pool-forge-prod}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pool-forge}"
RUNTIME_SA="pool-forge-run@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="pool-forge"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web"
BUCKET="${BUCKET:-${PROJECT_ID}-blobs}"

BUILD=1
DRY=0
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --dry-run)  DRY=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

run() {
  if [ "$DRY" = "1" ]; then printf '  would run: %s\n' "$*"; else "$@"; fi
}

# Existence checks hit the network. In a dry run they are the difference between
# "prints what it would do in a second" and "sits there talking to Google", so
# they answer "it exists" and let the caller print the rest.
exists() {
  if [ "$DRY" = "1" ]; then return 0; fi
  "$@" &>/dev/null
}

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# gcloud reads the project from the operator's active config and ignores a shell
# variable, so an unset one here pushes the image to whatever they last worked
# on and then fails the deploy with a 403 that looks like a permissions problem.
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"

say "Project $PROJECT_ID, region $REGION, service $SERVICE"

# ---------------------------------------------------------------- prerequisites
say "Enabling the APIs this needs"
run gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$PROJECT_ID"

if ! exists gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID"; then
  say "Creating the image repository"
  run gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location "$REGION" --project "$PROJECT_ID"
fi

# A dedicated identity rather than the default compute account, which is an
# editor on the whole project. This one gets exactly what the app needs, so a
# mistake in the app is bounded by that list.
if ! exists gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID"; then
  say "Creating the runtime service account"
  run gcloud iam service-accounts create pool-forge-run \
    --display-name "Pool Forge runtime" --project "$PROJECT_ID"
fi

say "Granting the runtime what it needs, and nothing else"
for role in roles/secretmanager.secretAccessor roles/aiplatform.user roles/storage.objectAdmin roles/cloudsql.client; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA}" --role "$role" --condition=None --quiet
done

if ! exists gcloud storage buckets describe "gs://${BUCKET}" --project "$PROJECT_ID"; then
  say "Creating the blob bucket"
  # Uniform access, no public reads: every document is served through the app,
  # which is what checks who is asking.
  run gcloud storage buckets create "gs://${BUCKET}" \
    --project "$PROJECT_ID" --location "$REGION" --uniform-bucket-level-access
fi

# ---------------------------------------------------------------- secrets
# Required. The deploy stops rather than starting a service that cannot work.
REQUIRED_SECRETS=(
  "DATABASE_URL=pool-forge-database-url"
  "AUTH_SECRET=pool-forge-auth-secret"
)

# Optional. Each turns a feature on. Absent, the app runs without that feature
# rather than failing to boot, which is the property the code already has.
OPTIONAL_SECRETS=(
  "IDENTITY_PLATFORM_API_KEY=pool-forge-identity-api-key"
  "RESEND_API_KEY=pool-forge-resend-api-key"
  "MONITORING_ALERT_WEBHOOK_URL=pool-forge-monitoring-webhook"
  "GOOGLE_CLIENT_ID=pool-forge-google-client-id"
  "GOOGLE_CLIENT_SECRET=pool-forge-google-client-secret"
)

say "Checking secrets"
SECRETS=""
MISSING=""
for pair in "${REQUIRED_SECRETS[@]}"; do
  env_name="${pair%%=*}"; secret_name="${pair##*=}"
  if exists gcloud secrets describe "$secret_name" --project "$PROJECT_ID"; then
    SECRETS="${SECRETS:+$SECRETS,}${env_name}=${secret_name}:latest"
    echo "  required  $env_name"
  else
    MISSING="${MISSING} ${secret_name}"
  fi
done

if [ -n "$MISSING" ]; then
  cat >&2 <<EOF

Refusing to deploy. These secrets do not exist:${MISSING}

Create them with scripts/bootstrap-secrets.sh, or by hand:

  printf %s 'the value' | gcloud secrets create <name> --data-file=- --project $PROJECT_ID

Deploying without them would start a service that cannot read its database or
sign a session, and the first request would be the thing that told you.
EOF
  exit 1
fi

for pair in "${OPTIONAL_SECRETS[@]}"; do
  env_name="${pair%%=*}"; secret_name="${pair##*=}"
  if exists gcloud secrets describe "$secret_name" --project "$PROJECT_ID"; then
    SECRETS="${SECRETS},${env_name}=${secret_name}:latest"
    echo "  optional  $env_name"
  else
    echo "  skipped   $env_name (no secret named $secret_name)"
  fi
done

# ---------------------------------------------------------------- build
if [ "$DRY" = "1" ]; then SERVICE_URL=""; else
SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)' 2>/dev/null || true)"
fi
PUBLIC_URL="${APP_URL:-${SERVICE_URL:-https://${SERVICE}-${REGION}.run.app}}"

if [ "$BUILD" = "1" ]; then
  say "Building the image"
  # Anything the browser reads is compiled in here, not mounted later.
  run gcloud builds submit \
    --project "$PROJECT_ID" \
    --config cloudbuild.yaml \
    --substitutions "_IMAGE=${IMAGE},_PUBLIC_URL=${PUBLIC_URL}" \
    .
else
  say "Skipping the build, redeploying the current image"
fi

# ---------------------------------------------------------------- deploy
say "Deploying"
run gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "${IMAGE}:latest" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 1Gi \
  --min-instances 0 --max-instances 4 \
  --set-secrets "$SECRETS" \
  --set-env-vars "NODE_ENV=production,APP_URL=${PUBLIC_URL},AUTH_URL=${PUBLIC_URL},AUTH_TRUST_HOST=true,GCP_PROJECT_ID=${PROJECT_ID},VERTEX_LOCATION=global,VERTEX_LIVE=1,BLOB_STORE_DRIVER=gcs,BLOB_STORE_BUCKET=${BUCKET},MONITORING_ENV=production"

say "Applying database migrations"
# Run as a job rather than at container start: every instance starting would
# race the others, and a failed migration should fail visibly here rather than
# crash-looping a service that was serving fine a minute ago.
if [ "$DRY" = "0" ]; then
  gcloud run jobs describe "${SERVICE}-migrate" --region "$REGION" --project "$PROJECT_ID" &>/dev/null \
    && ACTION=update || ACTION=create
  gcloud run jobs "$ACTION" "${SERVICE}-migrate" \
    --project "$PROJECT_ID" --region "$REGION" \
    --image "${IMAGE}-migrate:latest" \
    --service-account "$RUNTIME_SA" \
    --set-secrets "DATABASE_URL=pool-forge-database-url:latest" \
    --max-retries 1 --quiet
  gcloud run jobs execute "${SERVICE}-migrate" --region "$REGION" --project "$PROJECT_ID" --wait
fi

# ---------------------------------------------------------------- smoke
if [ "$DRY" = "1" ]; then FINAL_URL="$PUBLIC_URL"; else
FINAL_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)' 2>/dev/null || echo "$PUBLIC_URL")"
fi

say "Smoke test"
if [ "$DRY" = "0" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "${FINAL_URL}/readyz" || echo 000)"
  echo "  ${FINAL_URL}/readyz -> ${code}"
  if [ "$code" != "200" ]; then
    echo "  Deployed, but not serving. Logs:" >&2
    echo "  gcloud run services logs read $SERVICE --region $REGION --project $PROJECT_ID --limit 50" >&2
    exit 1
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' "${FINAL_URL}/login" || echo 000)"
  echo "  ${FINAL_URL}/login  -> ${code}"
fi

say "Live at ${FINAL_URL}"
