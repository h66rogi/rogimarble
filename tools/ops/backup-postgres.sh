#!/bin/sh
set -eu
umask 077
env_file=/run/rogimarble/release.env
compose_file=/opt/rogimarble/app/deploy/compose.production.yaml
backup_root=/srv/rogimarble/backups
test -r "$env_file"
mkdir -p "$backup_root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$backup_root/.postgres-$stamp.dump.gz
target=$backup_root/postgres-$stamp.dump.gz
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -eu -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' | gzip -9 > "$temporary"
test -s "$temporary"
mv "$temporary" "$target"
find "$backup_root" -maxdepth 1 -type f -name 'postgres-*.dump.gz' -mtime +7 -delete
