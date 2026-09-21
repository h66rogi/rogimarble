# 구현 진행과 배포 확인

시작: 2026-09-21. 사용자 요청에 따라 주 대화는 Operator, 구현은 GPT-5.6 Sol 서브 에이전트가 맡는다.
[구현 계획](implementation-plan.md)의 통과 조건은 유지하며 사용자 피드백용 초기 배포를 먼저 준비한다.

## 첫 작업 묶음

| 작업자 | 소유 범위 | 이번 산출물 | 상태 |
| --- | --- | --- | --- |
| sol_web | apps/web, overlay-ui, animation, asset-manifest | 관리 화면·26칸 보드·격리 체험·Lottie/정적 OBS, 운영 폼 | 안전성 단위 5개와 실제 브라우저 통합 13개 통과 |
| sol_backend | apps/api/gateway, contracts/database/game-core | 제품 API 계약·인증·PG 저장·수동 명령·재고·미션 | 실제 PG/HTTP 회귀 12개와 001 호환성 추가 회귀 통과 |
| sol_deploy | root 설정/lock, deploy, tools/ops, infrastructure, source-imports → collector | 설치/빌드·Compose·초기 배포, collector 독립 실행과 계약 생성 | 로컬 기동 및 Go/TS wire 양방향 검증 통과 |
| Operator | 통합·리뷰·검증·진행 기록·대상 환경 연결 | 사용자 확인 URL과 현재 기능/제한, 배포 결과 | 초기 배포 CI·DNS/TLS·외부 health·backup·두 호스트 재부팅 확인, 사용자 인증 연동 진행 |

공유 package install/lock은 sol_deploy가 소유한다. 앱별 package.json은 각 구현자가 관리하며 계약을 직접 협의한다.
동일 파일을 동시에 수정하지 않는다. 원본 private 전체/이력 반입 금지는 그대로 적용한다.

## 초기 배포의 경계

- 먼저 배포할 것은 피드백용 초기 버전이다. 화면·인증·서버 저장의 실제 검증 범위와 격리 체험을 구분한다.
- 실수집이 없으면 후원 내역은 빈 상태/미연결로 표시한다. 모의 후원을 실제 운영 내역으로 꾸미지 않는다.
- 초기 26칸을 표시할 수 있어도 미지원 효과를 조용히 생략해 운영 세션을 게시하지 않는다.
- 제품 API 계약은 초기 화면/서버 연결에 먼저 확정하고 collector 공통 계약과 실제 후원 연결은 별도 작업으로 이어간다.
- 초기 배포 준비만으로 P01~P03 전체나 M01~M04 전체를 verified로 올리지 않는다.
- 배포 대상·접근 정보는 private 운영 입력으로 두고 Git/문서/대화에 키·토큰을 저장하지 않는다.
- public 운영 쓰기는 인증된 서버 명령만 허용한다. 누구나 쓰는 체험은 실제 세션과 분리한다.

## 확인된 개발 환경

Linux Node 22.23.2, npm 10.9.8, Go 1.27.1, Docker 29.8.0 daemon을 확인했다.
pnpm 12.5.1과 제품 의존성을 lockfile로 고정했다. 앱 이미지 빌드와 로컬 PG/HTTP 확인을 수행했다.
실제 OBS·SOOP 운영 검증은 아직 수행하지 않았다.
신규 `t8i.medium` EC2 두 대와 별도 data EBS를 생성·마운트했고 SSM, cloud-init, Docker 준비를 확인했다.
private GHCR application image 6개를 발행했으며 exact OIDC trust를 통한 실제 private pull도 통과했다.
기존 rogichat production Terraform으로 DNS-only A record 두 개를 적용했고 두 canonical HTTPS health 경로의 외부 HTTP 200을 확인했다. 이는 SSO와 전체 게임 기능 완료 증거가 아니다.

## 검증 기록

아래는 종료 전 로컬 검증 기록이다. `http://127.0.0.1:8080`은 현재 중지 상태다.
사용자 요청으로 두 제품의 Compose를 `down`했고 named DB volume은 보존했다.
다른 프로젝트의 컨테이너는 중단하지 않았다. 현재 작업에서는 Docker 빌드/기동과 컨테이너를 만드는 통합 검사를 재실행하지 않는다.
실제 특수 효과가 없는 별도 검증 보드의 세션만 실행한다. 로그인·세션 생성·주사위·방향·위치 변경은
실제 API/PG를 사용한다. 002 migration을 적용하고 재고·수동 미션·세션 제어와 새 웹 이미지를 배포했다.
후원 수집·전체 특수 효과·웹 설정/보드 편집·실시간 OBS 연결은 미완료다.

- `npm test`: 후원·보드 코어 기존 26개 통과.
- pnpm workspace 설치, 웹 typecheck·production build, API TypeScript 빌드 성공.
- `./tools/ops/preview.sh up`, `./tools/ops/status.sh`: web/API/PG/Redis/Caddy healthy, migration 선행 확인.
- 외부 공개 포트는 loopback `127.0.0.1:8080`만 사용. PG/Redis/API host port는 열지 않았다.
- backend PG/HTTP 검사: 쿠키 인증, CSRF 거부, viewer 쓰기 거부, 잘못된 요청 거부, 동시 동일 명령의
  동일 결과, 범위 불일치 거부, 위치 보정의 저장/일시정지 확인.
- `cd apps/api && npm run test:integration`: 임의 계정/포트의 별도 PG 컨테이너를 생성·정리하는
  HTTP 통합 검사 7개 통과(205.35초). 원본 특수 효과 보드 거부와 API 재시작 후 상태 보존도 포함한다.
- Chromium 145: 로그인→검증 세션 생성→서버 주사위→이동 중 방향 변경→위치 보정→새로고침 통과,
  page error 0. 11칸 연출 중 위치 보정 후 5.5초를 기다려 늦은 callback이 위치를 되돌리지 않는 것을 확인했다.
- API 컨테이너를 실제 재시작한 뒤 동일 인증 쿠키로 상태를 조회해 세션/위치/방향/revision 전부 일치 확인.
- Windows PowerShell에서도 `http://127.0.0.1:8080/healthz` HTTP 200 확인.
- idle Lottie 빈 SVG를 수정한 뒤 실제 SVG path 2개, 이동 중 서로 다른 animation frame, page error 0 확인.
- 모바일 390px에서 document 가로 넘침 0, 보드 전용 scroll로 우측 칸 접근 확인. OBS 1280×720에서
  scrollbar 없이 전체 판이 들어가며 body 배경이 실제 투명색/배경 이미지 없음인지 Chromium에서 확인했다.
  이는 OBS 프로그램 자체의 실방송 품질 검증은 아니다.
- public source audit와 CI에서 committed history를 redacted secret scan했고 private 원본 전체와 원본 Git 이력을
  반입하지 않았다. ignored 환경 값·의존성·빌드 산출물은 공개 source 범위가 아니다.
- 문서 13개의 로컬 링크 누락 0개.

public source 저장소와 private GHCR release를 만들고 클라우드 기반을 적용했다. private 원본 전체와 원본 Git 이력은
반입하지 않았다. 이 로컬 preview 검증 기록 자체를 운영 릴리스 성공으로 간주하지 않는다.

## 운영 명령 확장의 통합 결과

- M01/M02: 002 migration으로 세션 일시정지/재개/종료, 공유 보상 수량 추가/차감/지정,
  수량을 보존하는 수동 미션 완료/면제/실드 사용과 원장을 구현했다. 기존 001 migration은 변경하지 않았다.
  실제 PG 회귀 12개와 코어 26개를 통과했다. 동시 실드 사용·부족 수량·권한 회수·미완료 미션의
  종료 차단·새 세션 무승계·읽기 snapshot 일관성·명령별 presentation epoch를 포함한다.
  001의 불완전한 생성 결과는 기존 상태를 원본 응답처럼 꾸미지 않고 명시적 409를 반환한다.
  이 GET/POST 호환성 추가 회귀 1개도 실제 PG에서 통과했다(120.75초).
- M03: 명령 ID/본문을 sessionStorage에 한 건 보존하고, 조회/동일 키 재시도로 응답 유실을 해결한다.
  확인 전 새 명령은 잠기며 성공한 POST 이후 상태 조회 실패에도 의도를 보존한다. 웹 단위 검사 5개 통과.
  늦은 polling·다른 세션의 응답·위치 보정 이전의 주사위 응답은 최신 상태/연출을 덮지 않는다.
- Operator의 Chromium 실제 브라우저 검사 13개 통과: 로그인과 기존 세션 보존, 수량 지정/증감,
  수량 3의 단일 미션, 미완료 미션 종료 차단, 실드/완료/면제, 일시정지 중 한 건 진행/재개,
  다른 운영자의 주사위 위치 반영, 위치 보정 뒤 늦은 주사위 무효화, 늦은 polling 거부,
  커밋 후 응답 유실·새로고침·조회에서 한 번만 변경, 미커밋 재시도의 동일 ID/본문,
  종료/새 세션 무승계, 모바일 390px 넘침 없음. page error 0.
  검증용 세션에서 수행했으며 마지막에는 재고 0/미션 0인 새 검증 세션을 남겼다.
  비공개 로컬 증거는 `deploy/.preview/operator-browser-evidence.json`과 화면 캡처에 있다.
- 배포된 001/002 migration checksum은 소스와 일치한다. API 컨테이너의 실제 소스 SHA-256도 최종
  검토 파일과 대조했다. 종료 전 두 제품의 독립 Compose 서비스가 모두 healthy였으며 DB volume은 보존했다.
- collector P03: 고정된 protoc/Go/TypeScript 도구로 생성한 protobuf를 양방향으로 검증했다.
  Node wire 검사 4개, Go test/race, fixture 없는 상태의 재생성, provenance와 반복 생성 검증을 통과했다.
  uint64 최댓값·unknown donation kind·optional 필드 부재·추가 wire 필드를 보존한다.
  실행 골격은 수집 채널 0이며 실제 SOOP/RPC/journal은 미구현이다. 제품 소비 연결까지 완료한 상태는 아니다.

## 남은 구현과 외부 배포

이 결과는 첫 출시 전체 완료가 아닌, 피드백 가능한 수동 운영 구현이다. 전체 후원 내역·대기열·운영 이력 UI,
보드 전체 효과, 규칙/아이템/보드 웹 편집, 실시간 OBS gateway, 실제 SOOP connector/journal/gRPC/inbox,
제품 간 실제 수집 통합, SSO 실사용 연동·실방송 검증은 원래 구현 계획의 필수 범위로 남아 있다.
두 호스트의 초기 배포와 재부팅 복구는 실제 확인했다. 관리자 화면의 계정 binding 등록은 공유 쿠키 발급을 대신하지 않는다.
운영 IaC·Compose·공유 인증 연결은 [EC2 배포 준비 상태](deployment-readiness.md)에서 별도로 추적한다.

## EC2 준비 작업의 추가 검증

Mac mini Tailscale SSH 및 AWS 서울 리전 접근을 확인했고 network와 두 제품 root를 적용했다. 두 EC2와 data EBS mount,
cloud-init/SSM/Docker, OIDC role assume와 private GHCR pull을 실제 확인했다. 최신 release에서 Marble container 5개와 Collector container 6개가 healthy이고 두 canonical HTTPS health 경로가 외부 HTTP 200이다. 세 Terraform root의 validate/mock, 두 EBS plan guard fixture suite,
배포 모의 검사 6개, API 인증 5개/API 빌드, 웹 검사 7개/typecheck와 collector 배포 정적·모의 검사를 통과했다.
API file credential 수정과 암호화 S3 logical backup의 `pg_restore --list` 검증도 확인했다. 두 제품의 초기 최종 CI와 EC2/systemd 재부팅 복구를 실제 확인했다.
issuer 공유 쿠키 발급과 실제 사용자 로그인 확인은 별도로 남아 있다. 기존 Atlantis와 management IAM은 확장하지 않았다.


## 멜로밍 콘솔 스타일과 서비스 관리자

사용자 요청에 따라 meloming-front의 현재 관리 shell과 삭제 전 console 이력을 조사하여
사이드바·헤더·보라색 강조색·중립 배경의 시각 구조를 반영했다. 직접 반입 범위는
[소스 반입 기록](source-imports.md)에 명시한다. 기본 폰트는 네이버 공식 나눔스퀘어네오
variable WOFF2이며 웹 이미지에서 직접 제공하고 OFL 고지를 함께 배포한다.

`/admin/login`과 `/admin`은 계정·채널·멤버 권한·외부 계정 연결·변경 이력을 관리한다.
일반 게임 인증과 별도 관리자 세션을 사용하며 shared 모드에서도 독립적으로 동작하도록 구성한다.
Mutation의 관리자 재검증, CSRF/Origin 검증, 권한 변경 직렬화, 비밀번호 변경 시 세션 폐기를
포함한다. 공개 bootstrap endpoint나 기본 비밀번호를 추가하지 않는다.

로기챗 소스 조사에서 현재 쿠키가 host-only임을 확인했다. 기존 공유 쿠키 로그인은
issuer의 추가 발급·실검증이 필요하며 준비 전에는 로그인 화면에 연동 준비 상태를 표시한다.
[인증 조사 기록](authentication.md), [관리자 화면 계약](admin-console.md)을 함께 확인한다.

관리자 API 회귀는 기존 PG/HTTP 통합 검사에 포함한다. 빌드·통합 검사·운영 배포의 실제
성공 여부는 해당 커밋의 release/private-deploy 작업 및 배포 후 브라우저 검증 기록으로 판정한다.


첫 관리자 UI 배포(`7d73a9e`)의 release/private-deploy가 성공했다. 실제 브라우저에서
관리자 로그인·채널 조회·CSRF 거부·일반 세션과의 격리·자기 비활성화 거부·비밀번호 변경과
세션 폐기·새 비밀번호 로그인·모바일 로그아웃을 확인했다. 390px에서 각 관리 탭의 문서
가로 넘침은 없고 JavaScript runtime error는 0건이었다. 공식 폰트의 배포 파일 SHA-256도
원본과 일치했다. 시각 점검에서 발견한 모바일 브랜드 줄바꿈과 장식 아이콘의 접근성 이름,
로컬 preview의 관리자 Origin 설정은 후속 수정에 반영한다. 이는 실제 SOOP/공유 로그인
및 전체 보드 기능의 완료를 뜻하지 않는다.
