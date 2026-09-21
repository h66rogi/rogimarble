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
raw=$backup_root/.postgres-$stamp.dump
target=$backup_root/postgres-$stamp.dump.gz
trap 'rm -f "$raw" "$temporary"' EXIT HUP INT TERM
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -eu -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$raw"
test -s "$raw"
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres pg_restore --list < "$raw" > /dev/null
gzip -9 -c "$raw" > "$temporary"
test -s "$temporary"
mv "$temporary" "$target"
python3 /usr/local/lib/rogimarble/upload-backup.py "$target"
rm -f "$raw"
trap - EXIT HUP INT TERM
find "$backup_root" -maxdepth 1 -type f -name 'postgres-*.dump.gz' -mtime +7 -delete
