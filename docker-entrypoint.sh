#!/bin/sh
set -e

# Apply any pending Prisma migrations against the app's metadata database
# before the server starts. Safe to run on every boot (no-op when up to date).
echo "→ Running database migrations…"
node_modules/.bin/prisma migrate deploy

echo "→ Starting Aspyre Labs Infrastructure Manager (ALIM)…"
exec "$@"
