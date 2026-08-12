#!/usr/bin/env bash
# Commit all local changes, push the current branch to GitHub, then deploy it.
# Usage: bash scripts/publish-production.sh [commit message]
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_NAME="${PUBLISH_REMOTE:-origin}"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
COMMIT_MESSAGE="${1:-${PUBLISH_COMMIT_MESSAGE:-}}"

cd "$PROJECT_ROOT"

if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  echo "Refusing to publish: unresolved merge conflicts are present."
  exit 1
fi

BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$BRANCH" ]]; then
  echo "Refusing to publish from a detached HEAD. Check out a branch first."
  exit 1
fi

if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  echo "Missing Git remote: $REMOTE_NAME"
  exit 1
fi

if [[ -z "$COMMIT_MESSAGE" ]]; then
  COMMIT_MESSAGE="chore: publish $(date '+%Y-%m-%d %H:%M')"
fi

echo "1/3 Staging all repository changes..."
git add -A

if git diff --cached --quiet; then
  echo "No new changes to commit."
else
  echo "2/3 Committing all staged changes..."
  git commit -m "$COMMIT_MESSAGE"
fi

echo "Pushing $BRANCH to $REMOTE_NAME..."
git push "$REMOTE_NAME" "$BRANCH"

echo "3/3 Deploying the pushed commit to production..."
bash "$PROJECT_ROOT/scripts/deploy-production.sh"

echo "Published $BRANCH to GitHub and production successfully."
