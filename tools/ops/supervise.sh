#!/bin/sh
set -eu

app_root=${ROGIMARBLE_APP_ROOT:-/opt/rogimarble/app}
env_file=${ROGIMARBLE_ENV_FILE:-/run/rogimarble/release.env}
compose_file=$app_root/deploy/compose.production.yaml

test -r "$env_file"
exec docker compose --env-file "$env_file" -f "$compose_file" up \
  --no-build --abort-on-container-failure postgres redis edge
