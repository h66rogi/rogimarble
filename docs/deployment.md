# 배포와 운영

배포 구성은 `deploy/compose.production.yaml`, `deploy/Caddyfile.production`, `deploy/systemd` 및 `tools/ops`에 있습니다. 공개 저장소에는 배포 코드와 예시 스키마만 둡니다. 실제 secret, 계정별 Terraform 입력, 상태 파일, 사용자 데이터와 운영 토큰은 별도로 관리합니다.

## 릴리스 흐름

`main`의 `release` workflow는 타입 검사, 테스트, 빌드, 배포 도구 검사를 수행하고 API·웹 이미지를 immutable digest로 게시합니다. 검사된 릴리스 번들에는 source SHA, 파일 checksum과 이미지 참조가 들어갑니다. `private-deploy` workflow는 성공한 main push 릴리스를 대상으로 단기 패키지 토큰과 고정 SSM 명령을 사용합니다. 설정은 `.github/workflows`를 기준으로 합니다.

호스트는 번들 checksum, source SHA, Compose 입력, 이미지 digest와 데이터 볼륨 mount를 검사합니다. 마이그레이션과 readiness가 통과한 뒤 릴리스를 활성화합니다. 이전 릴리스와 배포 영수증은 복구와 확인에 사용됩니다.

## 앱 슬롯 전환

API와 웹은 한 호스트의 blue/green 슬롯으로 실행합니다. 호스트는 데이터베이스·Redis·Caddy와 활성 앱 슬롯을 유지하면서 비활성 슬롯에 후보 이미지를 기동합니다. Caddy는 양쪽 슬롯의 readiness를 확인하고 정상 슬롯에 요청을 보내며, 연결 실패 시 재시도합니다. 첫 전환에서만 Caddy 설정을 이 풀 방식으로 옮기고 이후 앱 릴리스에서는 Caddy를 reload하지 않습니다. 후보의 healthcheck와 외부 HTTPS smoke 검사 뒤 30초 동안 기존 요청을 정리하고 이전 슬롯을 중지합니다. 앱 슬롯의 systemd unit은 `deploy/systemd/rogimarble-slot@.service`에 있습니다.

마이그레이션은 슬롯 전환 전에 한 번 실행합니다. 이전 앱과 새 앱이 같은 스키마를 사용할 수 있도록 expand/contract 방식으로 작성합니다. 전환에 실패하면 이전 슬롯을 유지하거나 다시 시작하고 후보 슬롯을 중지합니다. DB down migration이나 데이터 볼륨 삭제는 자동 복구 절차에 포함하지 않습니다. Caddy·PostgreSQL·Redis 이미지 또는 호스트 런타임 설정을 바꾸는 작업은 별도의 점검 배포로 다룹니다.

슬롯 전환 중 WebSocket 클라이언트는 재연결될 수 있습니다. 운영 콘솔과 OBS는 재연결 뒤 서버 상태를 다시 읽습니다. 이 구성은 단일 호스트의 앱 교체를 위한 것으로, 호스트 장애 대응은 별도의 인프라 복구 절차를 따릅니다.

## 호스트 데이터

| 경로 | 용도 |
| --- | --- |
| `/opt/rogimarble/app` | 릴리스와 활성 배포 링크 |
| `/etc/rogimarble` | root 소유 설정과 secret 참조 |
| `/run/rogimarble` | 런타임 secret, 잠금과 임시 결과 |
| `/srv/rogimarble` | 별도 데이터 볼륨의 PostgreSQL·Redis·Caddy 데이터 |

데이터 볼륨은 ID와 파일시스템 UUID를 확인한 뒤 mount합니다. 기존 파일시스템을 재포맷하지 않습니다. 백업은 `tools/ops/backup-postgres.sh`와 검증 도구를 사용하며, 복구 절차는 실제 dump 검증과 별도로 연습합니다.

## 확인

`tools/ops/production-status.py`와 호스트 readiness, GitHub Actions의 SSM 결과를 함께 확인합니다. 배포 영수증의 source SHA가 manifest와 일치하고, 활성 슬롯 unit은 `active`, 이전 슬롯 unit은 `inactive`인지 확인합니다. Caddy admin 설정에는 API와 웹의 blue·green upstream 네 개가 있어야 합니다. 첫 헬스 풀 전환 이후의 앱 릴리스에서는 Caddy 로그에 새 `/load` 요청이 없어야 하며, 외부 웹·API health 요청을 연속 확인해 전환 구간의 연결 오류를 감지합니다. 같은 source SHA의 배포 재실행은 전환을 건너뛰므로 실제 슬롯 전환 검증에는 새 릴리스가 필요합니다.

EC2 상태 검사만으로 앱, 데이터베이스, collector 연결 또는 백업의 정상 동작을 판단하지 않습니다. 새 릴리스 실패 시 이전 활성 릴리스의 상태와 데이터 호환성을 확인한 뒤 배포 도구의 복구 경로를 사용합니다.

Terraform 구성과 적용 순서는 [인프라 안내](../infrastructure/README.md)에 있습니다.

## 호스트 준비와 릴리스 입력

운영자는 Terraform 출력을 검토하고 데이터 볼륨 ID·파일시스템 UUID를 확인합니다. `tools/ops/install-host.sh`는 `/srv/rogimarble`의 실제 mount와 전달한 UUID가 일치할 때만 helper와 systemd unit을 설치합니다. 빈 볼륨의 데이터 디렉터리 초기화는 `--initialize-data`를 명시한 실행으로 제한합니다. 기존 데이터를 다시 붙일 때 이 옵션을 사용하지 않습니다.

`deploy/runtime-overlay.example.json`은 공개 가능한 호스트 설정의 필드 형식을 보여줍니다. `deploy/secrets-manager.example.json`, `deploy/registry.example.json`, `deploy/backup.example.json`, `deploy/release-source.example.json`은 각 외부 입력의 스키마 예시입니다. 실제 값은 호스트의 root 소유 설정과 AWS Secrets Manager에 둡니다. 번들 자체에는 세션 비밀, DB 비밀번호, collector 인증서 또는 사용자 데이터가 들어가지 않습니다.

GitHub Release의 `production-<sourceSha>` 번들과 SHA-256 파일은 같은 source SHA에 고정됩니다. API·웹 컨테이너는 GHCR 이미지 digest로 참조합니다. 호스트는 지정된 release workflow의 성공 결과, 번들 checksum, 내부 파일 checksum, source SHA 및 이미지 참조를 확인합니다. 배포 작업은 호스트 잠금 아래에서 실행되어 동시에 두 릴리스가 상태를 바꾸지 않습니다.

## 백업과 관측

`rogimarble-backup.timer`는 PostgreSQL custom-format dump를 만들고 `pg_restore --list`로 읽기 가능 여부를 검사한 뒤 S3로 올립니다. 로컬 파일은 제한된 기간 보관합니다. 백업 성공 시각과 복구 가능성은 별개이므로 복구 검증에는 실제 dump를 격리된 데이터베이스에 복원해 확인합니다.

CloudWatch 대시보드와 EC2 상태·CPU 경보 정의는 `infrastructure/environments/prod/monitoring.tf`에 있습니다. 호스트 경보는 앱의 `/ready`, Compose 상태, collector 연결, 데이터베이스 쓰기나 백업 복원 성공을 대신하지 않습니다. 배포 확인은 릴리스 source SHA, SSM 명령 결과, 호스트 배포 영수증과 외부 HTTP readiness를 함께 대조합니다.

운영 중 수정은 원인과 적용 범위를 확인한 뒤 서버 명령이나 설정 게시 경로로 수행합니다. DB 파일을 수동으로 고치거나 OBS 브라우저 상태를 게임 결과로 취급하지 않습니다.
