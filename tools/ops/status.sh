#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$repo_dir/deploy/.env"
compose_file="$repo_dir/deploy/compose.yaml"

if [ ! -f "$env_file" ]; then
  echo "Preview is not initialized. Run ./tools/ops/preview.sh init." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" ps

edge_port=$(sed -n 's/^EDGE_PORT=//p' "$env_file")
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${edge_port}/healthz" >/dev/null
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${edge_port}/api/ready" >/dev/null
echo "Preview web and API readiness checks passed."
