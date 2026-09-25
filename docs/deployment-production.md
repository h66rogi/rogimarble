# 주루마블 production feedback 배포

이 문서는 첫 실서비스 피드백 배포의 호스트 계약이다. 현재 배포는 웹 콘솔과 지원된 수동 운영 명령을
검증하기 위한 `feedback` profile이다. 후원 collector 연결, 일반 26칸 특수효과 실행기, realtime gateway와
worker가 완료되었다고 표시하지 않는다.

## 공개 경로와 인증 경계

- `https://marble.rogi.chat`은 웹을 제공하고 `/api/*`를 같은 호스트의 API로 전달한다.
- `https://marble-api.rogi.chat`은 API의 canonical 별도 도메인이다.
- canonical API는 credential CORS를 정확히 `https://marble.rogi.chat`에만 허용하며 CSRF와 overlay bearer
  preflight header를 명시한다. 인증 session 응답에는 `Cache-Control: no-store`가 붙는다.
- 현재 API 쿠키는 요청을 받은 호스트에 한정된다. 기존 `rogi.chat` 인증 쿠키의 값이나 검증 방식을 공유한다고
  가정하지 않는다. production API는 현재 `AUTH_MODE=token`이며 별도 admin session과 명시적으로 발급된
  access token만 검증한다. 일반 rogichat 공유 로그인은 issuer 계약과 발급 검증이 끝날 때까지 준비 중으로 표시한다.
- Caddy만 호스트의 80/443을 연다. PostgreSQL, Redis, API, web 포트는 호스트에 공개하지 않는다.

## 호스트 경로

| 경로 | 용도 |
| --- | --- |
| `/opt/rogimarble/app` | 검증 대상 release checkout. 호스트에서 이미지 build를 하지 않음 |
| `/etc/rogimarble` | root 소유 설정과 `/etc/rogimarble/secrets`의 개별 0400/0600 secret |
| `/run/rogimarble` | tmpfs runtime secret, release env, host lock, 배포 결과 |
| `/srv/rogimarble` | 별도 data EBS의 PostgreSQL, Redis, Caddy data/config |
| `/usr/local/lib/rogimarble` | `supervise.sh`, `prepare-secrets.sh` 같은 설치된 helper |

`/srv/rogimarble`은 manifest의 UUID와 실제 mount UUID가 같아야 한다. `postgres`, `redis`, `caddy-data`,
`caddy-config` bind directory를 운영자가 미리 만들고 올바른 소유권을 설정한다. Compose의
`create_host_path: false`와 deploy preflight가 미마운트 root disk에 새 데이터 디렉터리를 만드는 일을 막는다.
IaC bootstrap은 이 하위 디렉터리를 만들지 않는다. 새 EBS를 처음 연결할 때만 image digest에서 확인한 실제
container UID를 명시해 다음처럼 초기화한다. 이 명령은 UUID가 일치하고 data root가 비어 있지 않으면 거부한다.

```sh
sudo ./tools/ops/install-host.sh --data-uuid 'EXPECTED-UUID' --initialize-data \
  --postgres-uid 'IMAGE-POSTGRES-UID' --postgres-gid 'IMAGE-POSTGRES-GID' \
  --redis-uid 'IMAGE-REDIS-UID' --redis-gid 'IMAGE-REDIS-GID' \
  --caddy-uid 'IMAGE-CADDY-UID' --caddy-gid 'IMAGE-CADDY-GID'
```

기존 EBS를 재연결할 때는 `--initialize-data`를 사용하지 않는다. helper와 unit 설치는 mount UUID를 확인하지만
unit을 자동 enable/start하지 않으며, release checkout·secret·manifest 검증 뒤 운영자가 활성화한다.

첫 bootstrap에서는 example을 복사해 `/etc/rogimarble/release-source.json`,
`/etc/rogimarble/secrets-manager.json`, `/etc/rogimarble/registry.json`, `/etc/rogimarble/backup.json`과
`/etc/rogimarble/runtime-overlay.json`을 root:root 0600으로 만들고 placeholder를 실제 검증된 public repository,
EBS UUID, channel 및 image UID/GID로 바꾼다. secret 파일도 각각 root:root 0600으로 만든 뒤 첫 release를 수동 실행해
검증한다. Secrets Manager runtime container에는 아래 여섯 key의 JSON SecretString을 AWSCURRENT로 먼저 넣는다.
호스트는 instance role과 boto3로 매 boot/start에 이를 `/run` tmpfs로 가져오며 `/etc`에 값을 저장하지 않는다.
성공한 뒤에만 다음 timer를 활성화한다.

```sh
systemctl enable --now rogimarble-update.timer rogimarble-backup.timer
/usr/local/lib/rogimarble/production-status.py
```

## secret 분리

다음 key는 저장소와 release manifest에 넣지 않는다. `rogimarble-secrets.service`가 Secrets Manager의 exact-key
JSON을 `/run/rogimarble/source-secrets.<generation>`에 0400으로 쓰고 symlink를 원자적으로 바꾼 뒤
`/run/rogimarble/secrets`로 각 container role UID/GID 소유의 0400 파일로 복사한다. `/run`이 비워지는
재부팅 뒤에도 secrets unit은 활성 manifest의 source SHA와 EBS exact mount UUID를 검증해 다시 생성한다.

| 파일 | mount 대상 |
| --- | --- |
| `postgres_admin_password` | PostgreSQL 초기화만 |
| `postgres_migration_password` | 새 data directory의 migration role 생성만 |
| `postgres_app_password` | 새 data directory의 app role 생성만 |
| `migration_database_url` | 일회성 migrate container만 |
| `api_database_url` | API만 |
| `session_secret` | API만 |

API는 `DATABASE_URL_FILE`과 `SESSION_SECRET_FILE`을 지원한다. migration은 `DATABASE_URL_FILE`만 받는다.
관리자 DB 비밀번호 파일이나 secret directory 전체를 API/migration container에 mount하지 않는다.

Collector client 발급본은 `/etc/rogimarble/collector-client`에 root:root 0600인 `ca.pem`, `client.pem`,
`client.key`, `check.env`로 둔다. `check.env`에는 private target, TLS server name, collector channel과 선택적인
consumer ID만 두며 셸로 source하지 않는다. release helper가 허용된 exact key와 형식, symlink/권한, CA 검증,
keypair 일치, reader URI SAN, 30일 이상 남은 인증서를 검사한다. 성공하면 원본을 바꾸지 않고 API UID/GID 소유
0400 파일과 `collector.env`를 `/run/rogimarble/collector-client.<generation>`에 만들고 symlink를 원자 교체한다.
기존 세대는 이미 resolve된 directory bind를 사용하는 실행 중 API를 위해 즉시 삭제하지 않으며 tmpfs 재부팅으로 정리한다.
Compose는 이 디렉터리만 `/run/collector-client`에 read-only mount하고 API는 `COLLECTOR_CONFIG_FILE`로 읽는다.
발급본 디렉터리가 없는 개발·CI 환경은 `COLLECTOR_ENABLED=false` config를 생성해 수집 없이 안전하게 기동한다.
파일 일부가 있거나 검증이 실패한 production host는 collector를 조용히 비활성화하지 않고 secret 준비 단계에서 실패한다.

현재 운영 mapping은 game channel `preview`, collector channel `h66rogi`, consumer `rogimarble`이다. 실제 private
주소는 public Compose나 manifest에 넣지 않고 host의 `check.env`에만 둔다. reader 인증서는 status/list/watch/ACK만
허용한다. subscription/recovery 관리 인증서는 API에 mount하지 않는다. 최초 retained cursor부터 Marble inbox와
cursor를 한 DB transaction으로 저장한 뒤에만 ACK하며, generation/recovery 오류는 자동으로 최신 위치로 넘기지 않는다.
client leaf 갱신은 서버 leaf 자동 회전과 별도 운영 절차다. 새 세대를 검증·원자 교체한 뒤 API만 재시작한다.

shared 인증 응답의 `accountPartition`은 자동 권한이 아니다. 003 migration의 issuer+subject binding에
명시적으로 연결된 기존 local operator만 접근하며 채널 permission과 role을 다시 적용한다.
`bind-external-operator` CLI는 운영자가 검증한 subject와 operator username을 명시적으로 전달할 때만 새 binding을
만들고 기존 사용자를 자동 등록하거나 admin으로 승격하지 않는다. upstream 실패, cookie 중복/형식 오류,
미등록 binding은 local password fallback 없이 닫힌다.

## release manifest v1

실제 manifest는 저장소 밖 `/etc/rogimarble/release.json` 등에 둔다. 필수 필드는 다음과 같다.

```json
{
  "schemaVersion": 1,
  "product": "rogimarble",
  "profile": "feedback",
  "sourceSha": "40 lowercase hex",
  "releaseId": "operator-selected-id",
  "contractVersion": "v1",
  "composeSha256": "64 lowercase hex",
  "runtimeFiles": {
    "deploy/Caddyfile.production": "64 lowercase hex",
    "deploy/postgres/init-roles.sh": "64 lowercase hex",
    "deploy/systemd/rogimarble-app.service": "64 lowercase hex",
    "deploy/systemd/rogimarble-slot@.service": "64 lowercase hex",
    "deploy/systemd/rogimarble-secrets.service": "64 lowercase hex",
    "deploy/systemd/rogimarble-update.service": "64 lowercase hex",
    "deploy/systemd/rogimarble-update.timer": "64 lowercase hex",
    "deploy/systemd/rogimarble-backup.service": "64 lowercase hex",
    "deploy/systemd/rogimarble-backup.timer": "64 lowercase hex",
    "tools/ops/release.py": "64 lowercase hex",
    "tools/ops/deploy.sh": "64 lowercase hex",
    "tools/ops/supervise.sh": "64 lowercase hex",
    "tools/ops/supervise-slot.sh": "64 lowercase hex",
    "tools/ops/prepare-secrets.sh": "64 lowercase hex",
    "tools/ops/install-host.sh": "64 lowercase hex",
    "tools/ops/fetch-release.py": "64 lowercase hex",
    "tools/ops/production-status.py": "64 lowercase hex",
    "tools/ops/backup-postgres.sh": "64 lowercase hex",
    "tools/ops/fetch-runtime-secrets.py": "64 lowercase hex",
    "tools/ops/upload-backup.py": "64 lowercase hex",
    "tools/ops/load-registry-auth.py": "64 lowercase hex",
    "tools/ops/prepare-collector-client.py": "64 lowercase hex"
  },
  "images": {
    "api": "registry/repository@sha256:64hex",
    "web": "registry/repository@sha256:64hex",
    "caddy": "registry/repository@sha256:64hex",
    "postgres": "registry/repository@sha256:64hex",
    "redis": "registry/repository@sha256:64hex"
  },
  "migrations": [{"path": "packages/database/migrations/001_name.sql", "sha256": "64 lowercase hex"}],
  "runtimeNonSecret": {
    "webDomain": "marble.rogi.chat",
    "apiDomain": "marble-api.rogi.chat",
    "acmeEmail": "",
    "channelId": "approved channel id",
    "composeProjectName": "rogimarble-prod",
    "dataRoot": "/srv/rogimarble",
    "dataVolumeUuid": "expected filesystem UUID",
    "postgresDb": "rogimarble",
    "postgresAdminUser": "postgres",
    "migrationDbUser": "rogimarble_migrate",
    "appDbUser": "rogimarble_app",
    "apiUid": 1000, "apiGid": 1000,
    "webUid": 1000, "webGid": 1000,
    "postgresUid": 999, "postgresGid": 999,
    "redisUid": 999, "redisGid": 999,
    "caddyUid": 1000, "caddyGid": 1000
  }
}
```

validator는 필드 추가/누락, mutable image tag, compose/migration/runtime helper checksum 불일치, 승인되지 않은 도메인,
data mount UUID 불일치를 거부한다. `runtimeNonSecret`에는 secret 값이나 실제 사용자 데이터를 넣지 않는다.
`acmeEmail`은 빈 문자열일 수 있다. 연락처가 제공된 경우에만 이메일 형식을 검증해 Caddy의 완전한 `email <주소>`
directive로 만들며, 빈 값이면 directive 전체를 생략한다.

## 배포 순서

```sh
/opt/rogimarble/app/tools/ops/deploy.sh --manifest /etc/rogimarble/release.json --check-only
/opt/rogimarble/app/tools/ops/deploy.sh --manifest /etc/rogimarble/release.json
```

helper는 host flock 아래 manifest·checksum·mount·secret mode·Compose config를 확인한 뒤
`/etc/rogimarble/registry.json`이 가리키는 전용 Secrets Manager 값 `{username,token}`을 instance role로 가져온다.
root 0700 `/run/rogimarble/docker-auth`의 0600 Docker config는 digest pull 한 명령에만 `--config`로 전달하고 성공·실패
모두 즉시 삭제한다. 사람의 PAT, 장기 login, 인증 실패 시 anonymous fallback은 허용하지 않는다.
UID/GID는 선택한 immutable image에서 확인한 값이어야 한다. 처음 슬롯 방식으로 전환할 때는
기존 supervisor와 Caddy를 교체하므로 짧은 연결 중단을 예상하고 점검 시간을 잡는다.
이후 앱 릴리스는 기존 data/edge supervisor와 활성 슬롯을 그대로 둔 채 candidate env로 forward migration을
일회성 실행한다. 비활성 blue/green API·web 슬롯을 기동해 각각의 healthcheck가 통과하면
Caddy admin API를 container loopback에서 호출해 새 upstream으로 설정을 reload한다.
두 HTTPS 경로를 smoke test한 뒤에만 이전 슬롯을 중지하고 새 슬롯을 재부팅 자동 시작 대상으로 지정한다.
전환 실패 시 이전 upstream으로 reload하고 candidate를 중지한다. 실패 시 `down -v`, volume prune,
DB 초기화, down migration을 실행하지 않는다. 신규 migration은 이전 API도 계속 사용할 수 있는
expand/contract 형태여야 한다. migration은 2초 lock timeout과 30초 statement timeout으로 실행한다.
Caddy·PostgreSQL·Redis 이미지 또는 호스트 runtime 설정 변경은 일반 앱 무중단 경로에서 거부한다.

배포 시작 전과 성공 판정 직전에는 Rogimarble의 `api`·`web` 저장소 이미지만 점검한다. 실행 중인 모든
컨테이너 이미지와 저장소별 최신 3세대는 항상 보존하고, 그보다 오래된 미사용 앱 이미지만 제거한다. 다른 제품 이미지,
PostgreSQL·Redis·Caddy 이미지, volume, build cache는 이 정리 대상이 아니다. 정리 후 Docker 저장 경로의 여유 공간이
4 GiB 미만이면 registry 인증이나 pull을 시작하지 않고 필요한 용량과 현재 여유 공간을 오류로 남긴다. 이 선행 정리로
이전 배포에서 남은 이미지가 새 pull을 막는 상황을 복구하고, 성공 후 정리로 다음 배포 전까지 누적량을 제한한다.

systemd는 data/edge와 활성 앱 슬롯을 별도 attached `docker compose up --abort-on-container-failure`
프로세스로 감독한다. 앱 슬롯이 종료되어도 Caddy와 DB는 유지되고 해당 슬롯만 복구된다.
`production-status.py`는 활성 슬롯의 unit·컨테이너·release receipt와 공개 API readiness를 함께 확인한다.
기존 Socket.IO 연결은 슬롯 교체 때 재연결할 수 있으며, 방송 중 장기 연결이 중요한 시점에는
클라이언트 재연결과 상태 재조회가 확인된 후 배포한다. 단일 EC2 장애는 이 설계의 보호 범위가 아니다.

되돌리기는 schema 호환성이 확인된 이전 digest manifest로 같은 절차를 실행한다. migration은 자동으로
되돌리지 않는다. migration 실패 또는 호환성 불명확 상태에서는 새 application set을 시작하지 않고 점검한다.
`APP_ROOT`는 단일 checkout 계약이므로 실패 후 이전 manifest로 되돌릴 때는 그 manifest의 `sourceSha` checkout과
checksum이 일치하는 helper/unit도 함께 복원한 다음 rollback preflight를 실행해야 한다.

web의 `NEXT_PUBLIC_*`는 container 시작 환경으로 바뀌지 않는다. release publisher는 `IMAGE_WEB`을 만들 때
`NEXT_PUBLIC_API_BASE_URL=https://marble-api.rogi.chat`과 승인된 channel ID를 build arg로 넣고 compiled artifact를
검증해야 한다. Caddy의 same-origin `/api` proxy는 장애 진단 경로이며 browser 기본 계약은 canonical API domain이다.

## Pull CD와 운영 확인

`rogimarble-update.timer`는 10분 간격에 random delay를 더해 public GitHub Releases API를 조회한다. EC2에는 GitHub
token이나 SSH deploy key를 두지 않는다. downloader는 configured public repository의 최신 non-draft/non-prerelease
release에서 `release-bundle.tar.gz`와 `.sha256`만 받고, tag가 `production-<40자 sourceSha>`와 정확히 일치해야
진행한다. public Actions runs API에서 `.github/workflows/release.yml`이 같은 source SHA의 main push로 성공했는지도
요구한다. archive checksum, 안전한 경로, build manifest exact fields를 확인한 뒤 root-owned
`runtime-overlay.json`을 합친다. private immutable GHCR pull이나 어느 검증이라도 실패하면 기존 앱을 유지한다.

이 주기 실행은 public release metadata 확인과 이미 배포된 receipt의 health/no-op 확인에 GitHub 자격을 사용하지 않는다.
새 release의 private image pull은 성공한 `release` 뒤 실행되는 `private-deploy` workflow가 packages-read job token을
전용 Secrets Manager 값으로 잠시 제공하고 고정 SSM 문서를 호출하는 동안 수행한다. workflow는 SSM 완료까지 기다린 뒤
그 값을 비우며 EC2에는 사람 PAT나 지속 registry login을 남기지 않는다. 자격이 없는 timer가 새 digest를 만나면 현재
release를 유지하고 실패한다. 재시도는 실패한 `private-deploy` run을 다시 실행해 새 job token을 발급받아 수행한다.
public GitHub Release asset은 checksum과 source metadata 전달 경로일 뿐 GHCR image 공개를 뜻하지 않는다.

`/usr/local/lib/rogimarble/production-status.py`는 활성 release/source/image receipt, app unit, Compose container 상태,
canonical readiness, data disk 사용량, 최신 backup 나이를 JSON으로 반환한다. collector/후원 연결 여부를 정상으로
추론하지 않으며 현재 `feedback` profile의 지원 범위만 보여준다.

`rogimarble-backup.timer`는 매일 PostgreSQL custom-format logical dump를 gzip으로 저장하고 7일을 초과한 파일을
정리한다. dump 명령 성공 뒤 `pg_restore --list`로 archive를 검증하고, instance role로 `backup.json`에 지정된 private
S3 bucket/prefix에 SSE-S3 upload가 성공해야 service가 성공한다. 이는 기본 복구용 logical backup이며 restore rehearsal,
WAL archive가 포함된 PITR 구현이 아니다.
첫 실서비스 전에 별도 보관 위치와 실제 restore 검증을 운영 절차로 추가해야 한다.
