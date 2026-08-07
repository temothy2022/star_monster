#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LAN_IP="$(
  ipconfig getifaddr en0 2>/dev/null ||
  ipconfig getifaddr en1 2>/dev/null ||
  ifconfig | awk '/inet / && $2 !~ /^127/ {print $2; exit}'
)"

if [[ -z "${LAN_IP:-}" ]]; then
  echo "Unable to detect a LAN IP address."
  exit 1
fi

echo "Starting local PostgreSQL..."
docker compose up -d postgres

echo "Waiting for PostgreSQL on 127.0.0.1:${POSTGRES_PORT:-5433}..."
for _ in {1..60}; do
  if pnpm --filter @star-monsters/api exec prisma migrate status >/tmp/star-monsters-prisma-status.log 2>&1; then
    break
  fi
  sleep 1
done

if ! pnpm --filter @star-monsters/api exec prisma migrate status >/dev/null 2>&1; then
  cat /tmp/star-monsters-prisma-status.log
  echo "PostgreSQL is not ready. Check Docker Desktop and the local database container."
  exit 1
fi

echo "Applying migrations..."
pnpm db:deploy

echo "Seeding local admin/demo data..."
pnpm db:seed

cat <<EOF

Local iPad test URLs:
  Child app:   http://${LAN_IP}:5175/#pet-growth
  Parent app:  http://${LAN_IP}:5176
  Super admin: http://${LAN_IP}:5177
  API health:  http://${LAN_IP}:8787/api/health

Starting API and web apps. Keep this terminal window open while testing.
EOF

pnpm dev:all
