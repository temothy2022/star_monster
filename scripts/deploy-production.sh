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

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
SSH=(ssh -p "$DEPLOY_PORT" -o BatchMode=yes)
RSYNC_SSH="ssh -p $DEPLOY_PORT -o BatchMode=yes"

cd "$PROJECT_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to publish uncommitted changes. Commit the current version first."
  exit 1
fi
RELEASE_VERSION="$(git rev-parse HEAD)"

echo "1/3 Building the three web apps locally..."
pnpm --filter @star-monsters/design-lab build
pnpm --filter @star-monsters/parent-admin build
pnpm --filter @star-monsters/super-admin build

echo "2/3 Checking SSH access..."
"${SSH[@]}" "$REMOTE" "test -d '$DEPLOY_PATH'"

echo "3/3 Uploading release and applying it on the server..."
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.pnpm-store/' \
  --exclude 'node_modules/' \
  --exclude '**/node_modules/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  --exclude 'work/' \
  --exclude 'outputs/' \
  -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/" "$REMOTE:$DEPLOY_PATH/"

"${SSH[@]}" "$REMOTE" "printf '%s\\n' '$RELEASE_VERSION' > '$DEPLOY_PATH/.release-version' && cd '$DEPLOY_PATH' && bash scripts/server/apply-release.sh"

echo "Published successfully: $RELEASE_VERSION"
