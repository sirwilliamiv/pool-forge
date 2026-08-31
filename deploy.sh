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
BUILD_SA="pool-forge-build@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="pool-forge"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web"
BUCKET="${BUCKET:-${PROJECT_ID}-blobs}"
CAPTURE_BUCKET="${CAPTURE_BUCKET:-${PROJECT_ID}-captures}"
RELAY_SERVICE="${RELAY_SERVICE:-pool-forge-voice-relay}"
RELAY_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/voice-relay"

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

# Enabling an API returns before it is usable. Without this wait the very next
# command fails with SERVICE_DISABLED for a service that was just switched on,
# which reads like a permissions problem and is not one.
if [ "$DRY" = "0" ]; then
  say "Waiting for the APIs to become usable"
  for api in artifactregistry.googleapis.com run.googleapis.com secretmanager.googleapis.com storage.googleapis.com; do
    for attempt in $(seq 1 30); do
      if gcloud services list --enabled --project "$PROJECT_ID" --filter "config.name=$api" --format 'value(config.name)' 2>/dev/null | grep -q .; then
        break
      fi
      [ "$attempt" = "30" ] && { echo "  $api never became available" >&2; exit 1; }
      sleep 5
    done
    echo "  $api ready"
  done
fi

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

# Cloud Build no longer grants its default identity anything in a new project,
# so a build submitted without an explicit service account fails reading its own
# source tarball with a 403 that names the Compute Engine default account. This
# is a dedicated identity instead: read the source, write the image, write logs.
if ! exists gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT_ID"; then
  say "Creating the build service account"
  run gcloud iam service-accounts create pool-forge-build \
    --display-name "Pool Forge builds" --project "$PROJECT_ID"
fi

say "Granting the builder what it needs"
for role in roles/logging.logWriter roles/artifactregistry.writer roles/storage.objectViewer; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${BUILD_SA}" --role "$role" --condition=None --quiet
done

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

if ! exists gcloud storage buckets describe "gs://${CAPTURE_BUCKET}" --project "$PROJECT_ID"; then
  say "Creating the capture bundle bucket"
  # Backyard capture chunks (docs/backyard-capture-contract.md). Same posture
  # as the blob bucket: uniform access, no public reads. The phone writes via
  # resumable-session URIs the server initiates; nothing reads without auth.
  run gcloud storage buckets create "gs://${CAPTURE_BUCKET}" \
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
  "VOICE_TICKET_SECRET=pool-forge-voice-ticket-secret"
  "IDENTITY_PLATFORM_API_KEY=pool-forge-identity-api-key"
  "RESEND_API_KEY=pool-forge-resend-api-key"
  "MONITORING_ALERT_WEBHOOK_URL=pool-forge-monitoring-webhook"
  "GOOGLE_CLIENT_ID=pool-forge-google-client-id"
  "GOOGLE_CLIENT_SECRET=pool-forge-google-client-secret"
  "MAPS_API_KEY=pool-forge-maps-api-key"
  # Backyard capture ledger (Turso). Absent, the mobile capture routes fall
  # back to a file: ledger on the instance's disk, which does not survive a
  # cold start - fine for a smoke test, wrong for real walks.
  "TURSO_DATABASE_URL=pool-forge-turso-database-url"
  "TURSO_AUTH_TOKEN=pool-forge-turso-auth-token"
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


# ---------------------------------------------------------------- voice relay
# The browser cannot talk to Vertex: ephemeral tokens are a Gemini Developer API
# feature, Vertex has no equivalent, and Vertex is mandatory because these are
# customer job details and the consumer endpoint permits training on prompts.
# Vertex auth is ADC, which must never reach a browser. So the relay is not a
# preference between two designs, it is the only shape this can take.
#
# Its own service because a WebSocket is one long request: the timeout has to
# outlast the longest call, and concurrency is literally the simultaneous-call
# ceiling per instance.
say "Voice relay"
if exists gcloud secrets describe pool-forge-voice-ticket-secret --project "$PROJECT_ID"; then
  if [ "$BUILD" = "1" ]; then
    RELAY_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
    run gcloud builds submit \
      --project "$PROJECT_ID" \
      --config services/voice-relay/cloudbuild.yaml \
      --service-account "projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
      --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET \
      --substitutions "_IMAGE=${RELAY_IMAGE},_TAG=${RELAY_TAG}" \
      .
  fi

  # One instance, deliberately: the resumption handle lives in this process, so
  # a reconnect landing on a second instance would find no session to resume.
  # Concurrency 4, because that is literally the simultaneous-call ceiling and
  # the default of 80 is absurd for sessions holding audio buffers. An hour of
  # timeout, because a WebSocket is one long request and it has to outlast the
  # longest call.
  run gcloud run deploy "$RELAY_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "${RELAY_IMAGE}:latest" \
    --service-account "$RUNTIME_SA" \
    --allow-unauthenticated \
    --port 8080 \
    --cpu 1 --memory 512Mi \
    --min-instances 0 \
    --max-instances 1 \
    --concurrency 4 \
    --timeout 3600 \
    --set-secrets "VOICE_TICKET_SECRET=pool-forge-voice-ticket-secret:latest" \
    --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},VERTEX_LOCATION=us-central1,VOICE_LIVE=1"

  if [ "$DRY" = "0" ]; then
    RELAY_HTTPS="$(gcloud run services describe "$RELAY_SERVICE" --region "$REGION" --project "$PROJECT_ID" \
      --format 'value(status.url)' 2>/dev/null || true)"
    # The browser opens a socket, not a page: https becomes wss, and the app is
    # built with that rather than told it at run time.
    VOICE_RELAY_URL="${RELAY_HTTPS/https:\/\//wss://}"
    # The app has its own switch, and it is not the same one. The relay knowing
    # it is live does nothing for `/api/voice/surfaces`, which refuses with a
    # 503 unless the app is told too. Set on the relay alone, the Talk button
    # appears, opens a socket, and then cannot find out what it is allowed to
    # do: an error a user reads as the whole feature being broken.
    VOICE_ENV=",VOICE_LIVE=1"
    echo "  relay at ${RELAY_HTTPS}"
  fi
else
  echo "  skipped: no pool-forge-voice-ticket-secret, so voice stays off"
fi

# ---------------------------------------------------------------- build
# The public URL is compiled into the client bundle, so it has to be known
# before the first build, when the service does not exist to be asked. Cloud Run
# derives it from the service name and the project number, so it is knowable:
# guessing it wrong once meant a first deploy whose sign-in callbacks pointed at
# a hostname nobody serves, and a second full rebuild to correct it.
if [ "$DRY" = "1" ]; then SERVICE_URL=""; else
SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)' 2>/dev/null || true)"
if [ -z "$SERVICE_URL" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)' 2>/dev/null || true)"
  [ -n "$PROJECT_NUMBER" ] && SERVICE_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
fi
fi
PUBLIC_URL="${APP_URL:-${SERVICE_URL:-https://${SERVICE}-${REGION}.run.app}}"

if [ "$BUILD" = "1" ]; then
  say "Building the image"
  # Anything the browser reads is compiled in here, not mounted later.
  # The tag is the commit, so a deployed revision names the source it came from.
  TAG="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
  # Logs and source go to a bucket this project owns. A build running as its own
  # service account cannot write to Cloud Build's legacy shared bucket.
  run gcloud builds submit \
    --project "$PROJECT_ID" \
    --config cloudbuild.yaml \
    --service-account "projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
    --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET \
    --substitutions "_IMAGE=${IMAGE},_PUBLIC_URL=${PUBLIC_URL},_TAG=${TAG},_VOICE_RELAY_URL=${VOICE_RELAY_URL:-}" \
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
  --set-env-vars "NODE_ENV=production,APP_URL=${PUBLIC_URL},AUTH_URL=${PUBLIC_URL},AUTH_TRUST_HOST=true,GCP_PROJECT_ID=${PROJECT_ID},VERTEX_LOCATION=global,VERTEX_LIVE=1,BLOB_STORE_DRIVER=gcs,BLOB_STORE_BUCKET=${BUCKET},CAPTURE_BUNDLE_BUCKET=${CAPTURE_BUCKET},MONITORING_ENV=production${VOICE_ENV:-}"

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
