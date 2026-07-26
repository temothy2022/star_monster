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
  # Deployments run over non-interactive SSH. CI mode allows pnpm to recreate
  # node_modules when the lockfile removes or changes dependencies.
  CI=true corepack pnpm install --frozen-lockfile
  printf '%s\n' "$LOCKFILE_HASH" > "$STAMP_FILE"
fi

# The lockfile can stay unchanged while the Prisma schema evolves. Regenerate
# the client on every release so TypeScript and the Linux query engine match the
# schema that is about to be deployed.
corepack pnpm --filter @star-monsters/api db:generate
corepack pnpm --filter @star-monsters/api db:deploy
corepack pnpm --filter @star-monsters/api build

# If Nginx already serves the workspace dist directory, rsync has uploaded the
# files into place. A separate web root is also supported for future migrations.
sync_static() {
  local source_dir="$1"
  local target_dir="$2"
  local source_real
  local target_real
  source_real="$(realpath -m "$source_dir")"
  target_real="$(realpath -m "$target_dir")"
  if [[ "$source_real" == "$target_real" ]]; then
    echo "Nginx serves $source_real directly; no extra copy needed."
    return
  fi
  sudo install -d -m 755 "$target_real"
  sudo rsync -a --delete "$source_real/" "$target_real/"
}

sync_static "apps/design-lab/dist" "$CHILD_WEB_ROOT"
sync_static "apps/parent-admin/dist" "$PARENT_WEB_ROOT"
sync_static "apps/super-admin/dist" "$SUPER_WEB_ROOT"
sudo systemctl restart "$API_SERVICE"
sudo systemctl is-active --quiet "$API_SERVICE"
