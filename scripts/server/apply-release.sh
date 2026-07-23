#!/usr/bin/env bash
# Runs on the Linux server after deploy-production.sh has uploaded a release.
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_CONFIG="${SERVER_DEPLOY_CONFIG:-/etc/star-monsters/deploy.env}"

if [[ ! -f "$SERVER_CONFIG" ]]; then
  echo "Missing $SERVER_CONFIG"
  echo "Create it from scripts/server/deploy.env.example before publishing."
  exit 1
fi

# shellcheck disable=SC1090
source "$SERVER_CONFIG"
: "${CHILD_WEB_ROOT:?CHILD_WEB_ROOT is required}"
: "${PARENT_WEB_ROOT:?PARENT_WEB_ROOT is required}"
: "${SUPER_WEB_ROOT:?SUPER_WEB_ROOT is required}"
API_SERVICE="${API_SERVICE:-star-monsters-api.service}"

cd "$PROJECT_ROOT"

# Dependencies are installed only when the lockfile changes. The API is built on
# Linux so Prisma's native engine always matches the server architecture.
LOCKFILE_HASH="$(sha256sum pnpm-lock.yaml | awk '{print $1}')"
STAMP_FILE=".deploy-pnpm-lock.sha256"
if [[ ! -f "$STAMP_FILE" ]] || [[ "$(cat "$STAMP_FILE")" != "$LOCKFILE_HASH" ]]; then
  corepack pnpm install --frozen-lockfile
  printf '%s\n' "$LOCKFILE_HASH" > "$STAMP_FILE"
fi

corepack pnpm --filter @star-monsters/api db:deploy
corepack pnpm --filter @star-monsters/api build

# Static files are deployed atomically enough for a single-host site; the API
# service is restarted only after migrations and its Linux build have succeeded.
sudo install -d -m 755 "$CHILD_WEB_ROOT" "$PARENT_WEB_ROOT" "$SUPER_WEB_ROOT"
sudo rsync -a --delete apps/design-lab/dist/ "$CHILD_WEB_ROOT/"
sudo rsync -a --delete apps/parent-admin/dist/ "$PARENT_WEB_ROOT/"
sudo rsync -a --delete apps/super-admin/dist/ "$SUPER_WEB_ROOT/"
sudo systemctl restart "$API_SERVICE"
sudo systemctl is-active --quiet "$API_SERVICE"
