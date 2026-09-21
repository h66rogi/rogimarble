# 로컬 첫 피드백 배포

현재는 사용자 요청으로 중지했다. 아래 시작 명령은 재기동할 때의 참고이며, EC2 배포 준비 중에는 실행하지 않는다.
DB named volume은 보존했고 다른 프로젝트의 컨테이너는 중단하지 않았다.

이 구성은 웹·API·PostgreSQL·Redis·Caddy를 한 장비에서 확인하는 **로컬 preview**다.
immutable image digest, 운영 비밀 주입, EBS mount gate, host lock, 백업/복구 증거를 아직 갖추지
않았으므로 production release 또는 EC2 배포 완료로 취급하지 않는다.

## 시작과 확인

Linux Node 22.18 이상, Docker Engine과 Compose plugin, OpenSSL이 필요하다. 루트 의존성은
`packageManager`에 고정한 pnpm 버전으로 설치한다.

```sh
npm exec --yes pnpm@12.5.1 -- install --frozen-lockfile
./tools/ops/preview.sh up
./tools/ops/status.sh
```

기본 로컬 주소는 `http://127.0.0.1:8080`이다. edge만 loopback host port를 사용한다.
PostgreSQL, Redis, web, API는 Docker network 안에서만 접근할 수 있다. 첫 실행은
`deploy/.env`에 로컬 전용 임의 비밀을 생성하며 이 파일은 Git에서 제외된다.

로그 확인과 종료는 다음 명령을 사용한다.

```sh
./tools/ops/preview.sh logs
./tools/ops/preview.sh down
```

`down`은 named volume을 보존한다. 이 helper는 `down -v`, volume prune, DB 재초기화를 실행하지 않는다.

로컬 preview 관리자는 API와 migration이 준비된 뒤 명시적으로 한 번 생성한다. 비밀번호는 파일이나
명령 인수에 저장하지 않고 현재 프로세스 환경으로만 전달하며 helper는 값을 출력하지 않는다.

```sh
BOOTSTRAP_ADMIN_PASSWORD='local-long-password' ./tools/ops/bootstrap-admin.sh operator
```

위 비밀번호는 예시이며 실제 사용할 값으로 바꾼다. 첫 화면에서 서버 주사위를 확인하려면 아래 명령으로
**특수 효과가 없는 검증용 판**을 명시적으로 등록한다. 채널·사용자 이름은 생성한 값과 맞춘다.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps \
  -e BOARD_CHANNEL_ID=preview -e BOARD_OPERATOR_USERNAME=operator api \
  node --experimental-strip-types packages/database/src/register-preview-board.ts
```

`/login`에서 로그인한 뒤 `효과 없는 검증 세션 시작`을 선택한다. 주사위·정/역 방향·칸 선택 후 위치 보정을
확인할 수 있다. 이 검증 판은 원본 26칸의 문구/배치를 보여 주지만 도착 특수 효과는 실행하지 않는다.
`/overlay`는 현재 투명 배경의 정적 화면 미리보기이며 실시간 OBS 연결은 후속 구현이다.

002 migration 이후 보상 아이템 정의를 명시적으로 등록한다. 기존 항목을 덮어쓰지 않으며 서버 재시작 시
자동 실행하지 않는다. 현재 이 명령은 아이템 정의만 등록하며 후원 규칙을 활성화하지 않는다.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps \
  -e ITEM_CHANNEL_ID=preview api \
  node --experimental-strip-types packages/database/src/import-items.ts presets/streamer-initial.json
```

관리 화면에서 보상 수량 추가·차감·지정, 수량과 실드 허용 정책을 가진 수동 미션 생성·완료·면제·실드 사용,
세션 일시정지·한 건 진행·재개·종료를 지원한다. 미완료 미션이 있으면 종료가 거부된다.
새 세션은 이전 세션의 재고를 승계하지 않는다.

이번 로컬 확인 환경에는 일회성 계정 `operator-preview`와 채널 `preview`를 준비했다. 로그인 정보는 Git에서
제외된 `deploy/.preview/operator-credentials.json`에 있으며 비밀번호를 공개 문서에 복사하지 않는다.
Windows 드라이브의 파일 권한은 Windows ACL을 따르므로 이 파일을 운영 비밀 배포 방식으로 사용하지 않는다.

## 경계

- `migrate`가 성공한 뒤 API가 시작되고, API와 web readiness가 통과한 뒤 edge가 준비된다.
- API의 preview 쿠키는 loopback HTTP 확인을 위해 `COOKIE_SECURE=false`다. 운영에서는 HTTPS와 secure cookie가 필수다.
- 기본 채널 값 `preview`는 화면 빌드 입력일 뿐 승인된 실방송 채널이나 공개 관리 권한을 만들지 않는다.
- 관리자 계정을 자동 생성하지 않는다. 인증·권한 구현과 운영 계정 bootstrap이 준비되기 전에는 공개 관리 쓰기를 열지 않는다.
- Compose의 tag 이미지는 로컬 preview 입력이다. production은 검토한 release manifest의 digest 이미지로 별도 구성한다.

## 다음 production gate

production release에는 서비스별 digest와 source SHA, Compose hash, migration checksum, 계약 버전을 담은
release manifest, data EBS mount 확인, tmpfs secret 전달, host deploy lock, migration 실패 차단,
readiness/smoke, 호환 이전 이미지 rollback, 백업 및 복구 시험이 필요하다. 실제 AWS 계정·도메인·리전·
인스턴스 크기와 접근 경로가 확정된 뒤 Terraform plan을 검토하고, 승인된 자격으로 별도 실행한다.
