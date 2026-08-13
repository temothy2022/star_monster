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
PACKING_WEB_ROOT="${PACKING_WEB_ROOT:-/opt/star-monsters/apps/travel-packing/dist}"
API_SERVICE="${API_SERVICE:-star-monsters-api.service}"
HANZI_UPLOAD_DIR="${HANZI_UPLOAD_DIR:-/opt/star-monsters/hanzi-assets/v1/uploads}"
POEM_UPLOAD_DIR="${POEM_UPLOAD_DIR:-/opt/star-monsters/poem-assets/v1/uploads}"
PET_STATIC_DIR="${PET_STATIC_DIR:-/opt/star-monsters/pet-assets}"
NGINX_PERFORMANCE_CONF="${NGINX_PERFORMANCE_CONF:-/etc/nginx/conf.d/star-monsters-performance.conf}"
NGINX_SITE_CONFIG="${NGINX_SITE_CONFIG:-/etc/nginx/sites-enabled/star-monsters}"
MAX_UPLOAD_SIZE="${MAX_UPLOAD_SIZE:-32m}"

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

# Built-in pet growth backgrounds, room themes, and travel postcards are served
# from a stable public path. They are part of the release, unlike parent uploads,
# so keep the server copy in sync whenever the code release changes them.
sudo install -d -m 755 "$PET_STATIC_DIR"
sudo rsync -a --delete packages/assets/static/pet-assets/ "$PET_STATIC_DIR/"

# Keep the built-in travel catalog in sync before generating narration. The
# sync script clears audio URLs only when narration content changed, so the
# following generator remains resumable and does not spend credits twice.
sudo -u "$API_RUN_USER" bash -lc "cd '$PROJECT_ROOT/apps/api' && '$PROJECT_ROOT/apps/api/node_modules/.bin/tsx' prisma/sync-pet-destinations.ts"

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
sync_static "apps/travel-packing/dist" "$PACKING_WEB_ROOT"

# Keep compression, immutable asset caching, and proxy timeouts aligned with
# the release instead of relying on a one-time manual server change.
if command -v nginx >/dev/null 2>&1 && [[ -f scripts/server/nginx-performance.conf ]]; then
  sudo install -m 644 scripts/server/nginx-performance.conf "$NGINX_PERFORMANCE_CONF"
  if [[ -f "$NGINX_SITE_CONFIG" ]] && sudo grep -qE '^[[:space:]]*client_max_body_size[[:space:]]+' "$NGINX_SITE_CONFIG"; then
    sudo sed -i -E "s/^([[:space:]]*)client_max_body_size[[:space:]]+[^;]+;/\\1client_max_body_size $MAX_UPLOAD_SIZE;/" "$NGINX_SITE_CONFIG"
  fi
  # The packing list used to live inside the parent admin hash route. Remove
  # those legacy redirects before installing the standalone /packing app so a
  # release cannot leave duplicate exact-match locations in Nginx.
  if [[ -f "$NGINX_SITE_CONFIG" ]]; then
    sudo sed -i -E '\|^[[:space:]]*location = /packing/? \{ return 301 /parent/#packing; \}[[:space:]]*$|d' "$NGINX_SITE_CONFIG"
  fi
  if [[ -f "$NGINX_SITE_CONFIG" ]] && ! sudo grep -q 'location \^~ /packing/' "$NGINX_SITE_CONFIG"; then
    tmp_nginx_site="$(mktemp)"
    sudo awk -v packing_web_root="$PACKING_WEB_ROOT" '
      /^[[:space:]]*location[[:space:]]+\/api\/[[:space:]]*\{/ && !packing_inserted {
        print "    location = /packing { return 301 /packing/; }"
        print "    location ^~ /packing/ {"
        print "        alias " packing_web_root "/;"
        print "        try_files $uri $uri/ /packing/index.html;"
        print "    }"
        print ""
        packing_inserted = 1
      }
      { print }
    ' "$NGINX_SITE_CONFIG" > "$tmp_nginx_site"
    sudo install -m 644 "$tmp_nginx_site" "$NGINX_SITE_CONFIG"
    rm -f "$tmp_nginx_site"
  fi
  if [[ -f "$NGINX_SITE_CONFIG" ]] && ! sudo grep -q 'location \^~ /pet-assets/' "$NGINX_SITE_CONFIG"; then
    tmp_nginx_site="$(mktemp)"
    sudo awk -v pet_static_dir="$PET_STATIC_DIR" '
      /^[[:space:]]*location[[:space:]]+\/api\/[[:space:]]*\{/ && !inserted {
        print "    location ^~ /pet-assets/ {"
        print "        alias " pet_static_dir "/;"
        print "        try_files $uri =404;"
        print "        expires 30d;"
        print "        add_header Cache-Control \"public, max-age=2592000\";"
        print "    }"
        print ""
        inserted = 1
      }
      { print }
    ' "$NGINX_SITE_CONFIG" > "$tmp_nginx_site"
    sudo install -m 644 "$tmp_nginx_site" "$NGINX_SITE_CONFIG"
    rm -f "$tmp_nginx_site"
  fi
  sudo nginx -t
  sudo systemctl reload nginx
fi

API_RELEASE_HASH="$(
  find \
    apps/api/dist \
    apps/api/prisma \
    packages/math-practice/dist \
    -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum
  sha256sum apps/api/package.json packages/math-practice/package.json pnpm-lock.yaml
)"
API_RELEASE_HASH="$(printf '%s' "$API_RELEASE_HASH" | sha256sum | awk '{print $1}')"
API_RELEASE_STAMP=".deploy-api-release.sha256"

if [[ -f "$API_RELEASE_STAMP" ]] \
  && [[ "$(cat "$API_RELEASE_STAMP")" == "$API_RELEASE_HASH" ]] \
  && sudo systemctl is-active --quiet "$API_SERVICE"; then
  echo "API release is unchanged; keeping the running process to avoid a brief 502 window."
else
  sudo systemctl restart "$API_SERVICE"
  api_ready=false
  for _ in {1..20}; do
    if curl --fail --silent --show-error http://127.0.0.1:8787/api/health >/dev/null; then
      api_ready=true
      break
    fi
    sleep 0.5
  done
  if [[ "$api_ready" != "true" ]]; then
    echo "API did not become healthy after restart."
    sudo systemctl status "$API_SERVICE" --no-pager || true
    exit 1
  fi
  printf '%s\n' "$API_RELEASE_HASH" > "$API_RELEASE_STAMP"
fi

sudo systemctl is-active --quiet "$API_SERVICE"
