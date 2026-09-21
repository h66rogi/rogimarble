#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$repo_dir/deploy/.env"
compose_file="$repo_dir/deploy/compose.yaml"

usage() {
  echo "usage: $0 init|config|up|status|logs|down" >&2
  exit 2
}

init_env() {
  if [ -e "$env_file" ]; then
    echo "Local preview environment already exists: $env_file"
    return
  fi
  umask 077
  postgres_password=$(openssl rand -hex 24)
  session_secret=$(openssl rand -hex 32)
  sed \
    -e "s/replace-with-generated-local-value/$postgres_password/" \
    -e "s/replace-with-at-least-32-random-bytes/$session_secret/" \
    "$repo_dir/deploy/.env.example" > "$env_file"
  echo "Created local-only preview credentials: $env_file"
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

command=${1:-}
case "$command" in
  init)
    init_env
    ;;
  config)
    [ -f "$env_file" ] || init_env
    compose config --quiet
    echo "Preview Compose configuration is valid."
    ;;
  up)
    [ -f "$env_file" ] || init_env
    compose config --quiet
    compose up --build --wait
    echo "Preview is ready at http://127.0.0.1:$(sed -n 's/^EDGE_PORT=//p' "$env_file")"
    echo "This is a local preview, not a production release."
    ;;
  status)
    [ -f "$env_file" ] || { echo "Preview is not initialized. Run: $0 init" >&2; exit 1; }
    compose ps
    ;;
  logs)
    [ -f "$env_file" ] || { echo "Preview is not initialized. Run: $0 init" >&2; exit 1; }
    compose logs --tail 200
    ;;
  down)
    [ -f "$env_file" ] || { echo "Preview is not initialized."; exit 0; }
    compose down --remove-orphans
    echo "Preview containers stopped. Persistent volumes were preserved."
    ;;
  *) usage ;;
esac
