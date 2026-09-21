#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$repo_dir/deploy/.env"
compose_file="$repo_dir/deploy/compose.yaml"

if [ "$#" -ne 1 ]; then
  echo "usage: BOOTSTRAP_ADMIN_PASSWORD='<secret>' $0 <username>" >&2
  exit 2
fi
if [ -z "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD must be provided in the process environment." >&2
  exit 2
fi
if [ ! -f "$env_file" ]; then
  echo "Preview is not initialized. Run ./tools/ops/preview.sh up first." >&2
  exit 1
fi

BOOTSTRAP_ADMIN_USERNAME=$1
BOOTSTRAP_CHANNEL_ID=${BOOTSTRAP_CHANNEL_ID:-preview}
BOOTSTRAP_CHANNEL_NAME=${BOOTSTRAP_CHANNEL_NAME:-Local preview}
export BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD BOOTSTRAP_CHANNEL_ID BOOTSTRAP_CHANNEL_NAME
docker compose --env-file "$env_file" -f "$compose_file" run --rm --no-deps \
  -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_PASSWORD -e BOOTSTRAP_CHANNEL_ID -e BOOTSTRAP_CHANNEL_NAME api \
  node --experimental-strip-types packages/database/src/bootstrap-admin.ts
