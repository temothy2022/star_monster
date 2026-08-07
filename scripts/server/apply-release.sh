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
HANZI_UPLOAD_DIR="${HANZI_UPLOAD_DIR:-/opt/star-monsters/hanzi-assets/v1/uploads}"
POEM_UPLOAD_DIR="${POEM_UPLOAD_DIR:-/opt/star-monsters/poem-assets/v1/uploads}"
NGINX_PERFORMANCE_CONF="${NGINX_PERFORMANCE_CONF:-/etc/nginx/conf.d/star-monsters-performance.conf}"

cd "$PROJECT_ROOT"

# Dependencies are installed only when the lockfile changes. The API's
# platform-neutral JavaScript is compiled on the developer machine because the
# production server has limited memory. Prisma's native engine is still
# generated on Linux below so it always matches the server architecture.
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
if [[ ! -f apps/api/dist/src/server.js ]]; then
  echo "Missing apps/api/dist/src/server.js from the uploaded release."
  echo "Run the local production deploy script so the API is compiled before upload."
  exit 1
fi

API_RUN_USER="$(systemctl show "$API_SERVICE" -p User --value)"
if [[ -z "$API_RUN_USER" ]]; then
  echo "The API service must run as a named user before enabling media uploads."
  exit 1
fi
API_RUN_GROUP="$(id -gn "$API_RUN_USER")"
sudo install -d -m 755 -o "$API_RUN_USER" -g "$API_RUN_GROUP" "$HANZI_UPLOAD_DIR"
sudo install -d -m 755 -o "$API_RUN_USER" -g "$API_RUN_GROUP" "$POEM_UPLOAD_DIR"

# Destination narration is generated once from the system MiniMax account.
# The script only processes missing rows, so interrupted releases resume safely.
sudo -u "$API_RUN_USER" bash -lc "cd '$PROJECT_ROOT/apps/api' && '$PROJECT_ROOT/apps/api/node_modules/.bin/tsx' prisma/generate-pet-destination-audio.ts"

# Pet room dialogue audio is also generated once and then served as a cached
# static file. The script resumes safely by selecting only missing audio URLs.
sudo -u "$API_RUN_USER" bash -lc "cd '$PROJECT_ROOT/apps/api' && '$PROJECT_ROOT/apps/api/node_modules/.bin/tsx' prisma/generate-pet-room-dialogue-audio.ts"

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
    sudo find "$target_real/assets" -type f -mtime +30 -delete
    return
  fi
  sudo install -d -m 755 "$target_real"
  sudo rsync -a --delete --filter 'P /assets/***' "$source_real/" "$target_real/"
  sudo find "$target_real/assets" -type f -mtime +30 -delete
}

sync_static "apps/design-lab/dist" "$CHILD_WEB_ROOT"
sync_static "apps/parent-admin/dist" "$PARENT_WEB_ROOT"
sync_static "apps/super-admin/dist" "$SUPER_WEB_ROOT"

# Keep compression, immutable asset caching, and proxy timeouts aligned with
# the release instead of relying on a one-time manual server change.
if command -v nginx >/dev/null 2>&1 && [[ -f scripts/server/nginx-performance.conf ]]; then
  sudo install -m 644 scripts/server/nginx-performance.conf "$NGINX_PERFORMANCE_CONF"
  sudo nginx -t
  sudo systemctl reload nginx
fi

sudo systemctl restart "$API_SERVICE"
sudo systemctl is-active --quiet "$API_SERVICE"
