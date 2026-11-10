#!/bin/sh
# Applies database migrations, ensures an admin user exists, then starts the app.
set -e

if [ -z "$SESSION_SECRET" ] || [ ${#SESSION_SECRET} -lt 32 ]; then
  echo "ERROR: SESSION_SECRET must be set to a random string of at least 32 characters." >&2
  exit 1
fi

echo "Applying database migrations…"
node prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

echo "Checking for an administrator account…"
node scripts/seed.js

exec "$@"
