#!/usr/bin/env bash
# Publish the current local source and built front-end assets to production.
# Prerequisite: SSH key authentication and a configured .deploy.env file.
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-$PROJECT_ROOT/.deploy.env}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE"
  echo "Copy .deploy.env.example to .deploy.env, then fill in the server host and path."
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_RSYNC_TIMEOUT="${DEPLOY_RSYNC_TIMEOUT:-120}"

if [[ ! "$DEPLOY_RSYNC_TIMEOUT" =~ ^[0-9]+$ ]] || (( DEPLOY_RSYNC_TIMEOUT < 30 )); then
  echo "DEPLOY_RSYNC_TIMEOUT must be an integer of at least 30 seconds."
  exit 1
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
SSH=(ssh -p "$DEPLOY_PORT" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
RSYNC_SSH="ssh -p $DEPLOY_PORT -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4"
if [[ -n "${DEPLOY_IDENTITY_FILE:-}" ]]; then
  SSH+=(-i "$DEPLOY_IDENTITY_FILE")
  RSYNC_SSH+=" -i $(printf '%q' "$DEPLOY_IDENTITY_FILE")"
fi

cd "$PROJECT_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "${DEPLOY_ALLOW_DIRTY:-false}" != "true" ]]; then
    echo "Refusing to publish uncommitted changes. Commit the current version first."
    echo "To intentionally publish the current working tree, set DEPLOY_ALLOW_DIRTY=true."
    exit 1
  fi
  RELEASE_VERSION="$(git rev-parse --short HEAD)-dirty-$(date -u +%Y%m%d%H%M%S)"
  echo "Warning: publishing an explicitly allowed uncommitted working tree as $RELEASE_VERSION"
else
  RELEASE_VERSION="$(git rev-parse HEAD)"
fi

echo "1/3 Building the shared math package, API and three web apps locally..."
pnpm --filter @star-monsters/api pet:generate-destination-images
pnpm --filter @star-monsters/math-practice build
pnpm --filter @star-monsters/api build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/design-lab build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/parent-admin build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/super-admin build
node scripts/write-web-version.mjs \
  "$RELEASE_VERSION" \
  apps/design-lab/dist \
  apps/parent-admin/dist \
  apps/super-admin/dist

echo "2/3 Checking SSH access..."
"${SSH[@]}" "$REMOTE" "test -d '$DEPLOY_PATH'"

echo "3/3 Uploading release and applying it on the server..."
# Hanzi media is deployed separately and may be owned by root on the server.
rsync -az --delete --partial --progress --timeout="$DEPLOY_RSYNC_TIMEOUT" \
  --filter 'P /apps/design-lab/dist/assets/***' \
  --filter 'P /apps/parent-admin/dist/assets/***' \
  --filter 'P /apps/super-admin/dist/assets/***' \
  --exclude '.git/' \
  --exclude '.pnpm-store/' \
  --exclude 'node_modules/' \
  --exclude '**/node_modules/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.deploy-pnpm-lock.sha256' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  --exclude 'work/' \
  --exclude 'packages/assets/generated/' \
  --exclude 'hanzi-assets/' \
  --exclude 'poem-assets/' \
  -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/" "$REMOTE:$DEPLOY_PATH/"

"${SSH[@]}" "$REMOTE" "printf '%s\\n' '$RELEASE_VERSION' > '$DEPLOY_PATH/.release-version' && cd '$DEPLOY_PATH' && bash scripts/server/apply-release.sh"

echo "Published successfully: $RELEASE_VERSION"
