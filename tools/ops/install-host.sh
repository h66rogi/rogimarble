#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
data_uuid=
initialize=false
postgres_uid=
postgres_gid=
redis_uid=
redis_gid=
caddy_uid=
caddy_gid=

usage(){ echo "usage: $0 --data-uuid UUID [--initialize-data --postgres-uid UID --postgres-gid GID --redis-uid UID --redis-gid GID --caddy-uid UID --caddy-gid GID]" >&2;exit 2; }
while [ "$#" -gt 0 ];do
  case "$1" in
    --data-uuid) [ "$#" -ge 2 ]||usage;data_uuid=$2;shift 2;;
    --initialize-data) initialize=true;shift;;
    --postgres-uid) [ "$#" -ge 2 ]||usage;postgres_uid=$2;shift 2;;
    --postgres-gid) [ "$#" -ge 2 ]||usage;postgres_gid=$2;shift 2;;
    --redis-uid) [ "$#" -ge 2 ]||usage;redis_uid=$2;shift 2;;
    --redis-gid) [ "$#" -ge 2 ]||usage;redis_gid=$2;shift 2;;
    --caddy-uid) [ "$#" -ge 2 ]||usage;caddy_uid=$2;shift 2;;
    --caddy-gid) [ "$#" -ge 2 ]||usage;caddy_gid=$2;shift 2;;
    *) usage;;
  esac
done
[ "$(id -u)" -eq 0 ]||{ echo 'must run as root' >&2;exit 1; }
if ! python3 -c 'import boto3' >/dev/null 2>&1;then apt-get update;DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-boto3;fi
[ -n "$data_uuid" ]||usage
mount_identity=$(findmnt -n -o TARGET,UUID --target /srv/rogimarble 2>/dev/null||true)
[ "$mount_identity" = "/srv/rogimarble $data_uuid" ]||{ echo 'refusing install: /srv/rogimarble UUID mismatch or not mounted exactly there' >&2;exit 1; }

install -d -m 0755 /opt/rogimarble /opt/rogimarble/releases /etc/rogimarble /usr/local/lib/rogimarble
install -d -m 0700 /etc/rogimarble/secrets
install -d -m 0750 /run/rogimarble
install -m 0755 "$repo_dir/tools/ops/supervise.sh" /usr/local/lib/rogimarble/supervise.sh
install -m 0755 "$repo_dir/tools/ops/prepare-secrets.sh" /usr/local/lib/rogimarble/prepare-secrets.sh
install -m 0755 "$repo_dir/tools/ops/prepare-collector-client.py" /usr/local/lib/rogimarble/prepare-collector-client.py
install -m 0755 "$repo_dir/tools/ops/release.py" /usr/local/lib/rogimarble/release.py
install -m 0755 "$repo_dir/tools/ops/fetch-release.py" /usr/local/lib/rogimarble/fetch-release.py
install -m 0755 "$repo_dir/tools/ops/production-status.py" /usr/local/lib/rogimarble/production-status.py
install -m 0755 "$repo_dir/tools/ops/backup-postgres.sh" /usr/local/lib/rogimarble/backup-postgres.sh
install -m 0755 "$repo_dir/tools/ops/fetch-runtime-secrets.py" /usr/local/lib/rogimarble/fetch-runtime-secrets.py
install -m 0755 "$repo_dir/tools/ops/upload-backup.py" /usr/local/lib/rogimarble/upload-backup.py
install -m 0755 "$repo_dir/tools/ops/load-registry-auth.py" /usr/local/lib/rogimarble/load-registry-auth.py
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-secrets.service" /etc/systemd/system/rogimarble-secrets.service
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-app.service" /etc/systemd/system/rogimarble-app.service
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-update.service" /etc/systemd/system/rogimarble-update.service
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-update.timer" /etc/systemd/system/rogimarble-update.timer
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-backup.service" /etc/systemd/system/rogimarble-backup.service
install -m 0644 "$repo_dir/deploy/systemd/rogimarble-backup.timer" /etc/systemd/system/rogimarble-backup.timer
systemctl daemon-reload

if [ "$initialize" = true ];then
  for value in "$postgres_uid" "$postgres_gid" "$redis_uid" "$redis_gid" "$caddy_uid" "$caddy_gid";do case "$value" in ''|*[!0-9]*)usage;;esac;done
  [ -z "$(find /srv/rogimarble -mindepth 1 -maxdepth 1 ! -name lost+found -print -quit)" ]||{ echo 'explicit data initialization requires an empty mounted data root' >&2;exit 1; }
  install -d -m 0700 -o "$postgres_uid" -g "$postgres_gid" /srv/rogimarble/postgres
  install -d -m 0750 -o "$redis_uid" -g "$redis_gid" /srv/rogimarble/redis
  install -d -m 0750 -o "$caddy_uid" -g "$caddy_gid" /srv/rogimarble/caddy-data /srv/rogimarble/caddy-config
  install -d -m 0700 /srv/rogimarble/backups
  echo 'Initialized empty Rogimarble data directories on the verified EBS mount.'
fi

echo 'Installed Rogimarble runtime helpers and units. Units were not enabled or started.'
