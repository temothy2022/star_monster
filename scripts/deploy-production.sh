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

# macOS ships an old openrsync implementation (protocol 29) that can deadlock
# while exchanging this repository's file list with the production rsync 3.x
# server. Prefer Homebrew's modern client even when a non-login shell puts
# /usr/bin first in PATH, and fail early instead of leaving stale server jobs.
if [[ -n "${DEPLOY_RSYNC_BIN:-}" ]]; then
  RSYNC_BIN="$DEPLOY_RSYNC_BIN"
elif [[ -x /opt/homebrew/bin/rsync ]]; then
  RSYNC_BIN=/opt/homebrew/bin/rsync
elif [[ -x /usr/local/bin/rsync ]]; then
  RSYNC_BIN=/usr/local/bin/rsync
else
  RSYNC_BIN="$(command -v rsync || true)"
fi

if [[ -z "$RSYNC_BIN" || ! -x "$RSYNC_BIN" ]]; then
  echo "A modern rsync client is required. Install it with: brew install rsync"
  exit 1
fi

RSYNC_PROTOCOL="$($RSYNC_BIN --version | sed -nE 's/.*protocol version ([0-9]+).*/\1/p' | head -n 1)"
if [[ -z "$RSYNC_PROTOCOL" || "$RSYNC_PROTOCOL" -lt 31 ]]; then
  echo "Refusing to deploy with $RSYNC_BIN (rsync protocol ${RSYNC_PROTOCOL:-unknown})."
  echo "Install modern rsync with: brew install rsync"
  exit 1
fi

if [[ ! "$DEPLOY_RSYNC_TIMEOUT" =~ ^[0-9]+$ ]] || (( DEPLOY_RSYNC_TIMEOUT < 30 )); then
  echo "DEPLOY_RSYNC_TIMEOUT must be an integer of at least 30 seconds."
  exit 1
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
DEPLOY_CONTROL_DIR="$(mktemp -d "/tmp/sm-deploy.XXXXXX")"
DEPLOY_CONTROL_SOCKET="$DEPLOY_CONTROL_DIR/s"
cleanup_deploy_connection() {
  ssh -S "$DEPLOY_CONTROL_SOCKET" -O exit "$REMOTE" >/dev/null 2>&1 || true
  rm -f "$DEPLOY_CONTROL_SOCKET"
  rmdir "$DEPLOY_CONTROL_DIR" >/dev/null 2>&1 || true
}
trap cleanup_deploy_connection EXIT

SSH=(ssh -p "$DEPLOY_PORT" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ControlMaster=auto -o ControlPersist=180 -o "ControlPath=$DEPLOY_CONTROL_SOCKET")
RSYNC_SSH="ssh -p $DEPLOY_PORT -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ControlMaster=auto -o ControlPersist=180 -o ControlPath=$(printf '%q' "$DEPLOY_CONTROL_SOCKET")"
if [[ -n "${DEPLOY_IDENTITY_FILE:-}" ]]; then
  SSH+=(-i "$DEPLOY_IDENTITY_FILE")
  RSYNC_SSH+=" -i $(printf '%q' "$DEPLOY_IDENTITY_FILE")"
fi
if [[ -n "${DEPLOY_SSH_PROXY_COMMAND:-}" ]]; then
  SSH+=(-o "ProxyCommand=$DEPLOY_SSH_PROXY_COMMAND")
  RSYNC_SSH+=" -o \"ProxyCommand=$DEPLOY_SSH_PROXY_COMMAND\""
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
  # Include the release batch time so re-publishing the same commit still
  # invalidates the installed web app and appears as a new release.
  RELEASE_VERSION="$(git rev-parse HEAD)-$(date -u +%Y%m%d%H%M%S)"
fi

echo "1/3 Building the shared math package, API and four web apps locally..."
node scripts/check-icon-buttons.mjs
pnpm --filter @star-monsters/api pet:generate-destination-images
pnpm --filter @star-monsters/math-practice build
pnpm --filter @star-monsters/api build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/design-lab build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/parent-admin build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/super-admin build
VITE_APP_VERSION="$RELEASE_VERSION" pnpm --filter @star-monsters/travel-packing build
node scripts/write-web-version.mjs \
  "$RELEASE_VERSION" \
  apps/design-lab/dist \
  apps/parent-admin/dist \
  apps/super-admin/dist \
  apps/travel-packing/dist

echo "2/3 Checking SSH access..."
"${SSH[@]}" "$REMOTE" "test -d '$DEPLOY_PATH'"

echo "3/3 Uploading release and applying it on the server..."
echo "Using $RSYNC_BIN (protocol $RSYNC_PROTOCOL)."
# Hanzi media is deployed separately and may be owned by root on the server.
"$RSYNC_BIN" -az --delete --partial --progress --timeout="$DEPLOY_RSYNC_TIMEOUT" \
  --filter 'P /apps/design-lab/dist/assets/***' \
  --filter 'P /apps/parent-admin/dist/assets/***' \
  --filter 'P /apps/super-admin/dist/assets/***' \
  --filter 'P /apps/travel-packing/dist/assets/***' \
  --exclude '.git/' \
  --exclude '.pnpm-store/' \
  --exclude 'node_modules/' \
  --exclude '**/node_modules/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.deploy-pnpm-lock.sha256' \
  --exclude '.deploy-api-release.sha256' \
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
