#!/usr/bin/env bash
# Upload generated hanzi image/audio assets to the server static asset folder.
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-$PROJECT_ROOT/.deploy.env}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
LOCAL_ASSET_DIR="${HANZI_LOCAL_ASSET_DIR:-$PROJECT_ROOT/outputs/hanzi-assets}"
REMOTE_ASSET_DIR="${HANZI_REMOTE_ASSET_DIR:-/opt/star-monsters/hanzi-assets/v1}"

RSYNC_SSH="ssh -p $DEPLOY_PORT -o BatchMode=yes -o IdentitiesOnly=yes"
SSH=(ssh -p "$DEPLOY_PORT" -o BatchMode=yes -o IdentitiesOnly=yes)
if [[ -n "${DEPLOY_IDENTITY_FILE:-}" ]]; then
  RSYNC_SSH+=" -i $(printf '%q' "$DEPLOY_IDENTITY_FILE")"
  SSH+=(-i "$DEPLOY_IDENTITY_FILE")
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

if [[ ! -d "$LOCAL_ASSET_DIR" ]]; then
  echo "Missing local asset dir: $LOCAL_ASSET_DIR"
  exit 1
fi

"${SSH[@]}" "$REMOTE" "sudo install -d -m 755 '$REMOTE_ASSET_DIR' && sudo chown '$DEPLOY_USER' '$REMOTE_ASSET_DIR'"
rsync -az --delete -e "$RSYNC_SSH" "$LOCAL_ASSET_DIR/" "$REMOTE:$REMOTE_ASSET_DIR/"
echo "Uploaded hanzi assets to $REMOTE:$REMOTE_ASSET_DIR"
