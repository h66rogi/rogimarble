#!/bin/sh
set -eu

case "${1:-}" in blue|green) slot=$1;; *) echo 'slot must be blue or green' >&2; exit 2;; esac
app_root=${ROGIMARBLE_APP_ROOT:-/opt/rogimarble/app}
env_file=${ROGIMARBLE_ENV_FILE:-/run/rogimarble/release-$slot.env}
test -r "$env_file"
exec docker compose --env-file "$env_file" -f "$app_root/deploy/compose.production.yaml" up \
  --no-build --no-deps --no-recreate --abort-on-container-failure "api-$slot" "web-$slot"
