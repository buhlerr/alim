#!/bin/sh
set -e

# Remova esta linha:
# echo "→ Running database migrations…"
# npx prisma migrate deploy

echo "→ Starting application…"
exec "$@"
