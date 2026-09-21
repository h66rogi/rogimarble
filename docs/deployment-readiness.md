# EC2 배포 준비 상태

기준일: 2026-09-21. 로컬 피드백 버전은 사용자 요청으로 종료했으며 두 제품의 DB volume을 보존했다.
이 문서는 외부 배포 준비와 실제 배포 완료를 구분한다. 현재 사용자에게 안내할 외부 접속 URL은 아직 없다.

## 확인한 배포 환경

- 신규 EC2 두 대: rogimarble 한 대, rogi-collector 한 대. 기존 rogichat과 별도 VPC를 사용한다.
- Mac mini에 Tailscale SSH로 접속했고 기존 AWS 자격의 서울 리전 접근을 확인했다. 자격은 Mac에 유지한다.
- Ubuntu Server 24.04 LTS x86_64의 Canonical AMI를 AWS API로 조회했다. 실제 AMI/account 입력은 Mac의 private 배포 디렉터리에만 보관한다.
- 기존 S3 state 저장소의 버전 관리·암호화·public access block을 확인했다. 기존 state를 복사하지 않고 network/marble/collector별 새로운 key를 준비했다.
- Mac의 전역 Terraform을 변경하지 않고 프로젝트 전용 Terraform 1.16.2를 공식 checksum과 대조해 설치했다.
- 웹은 `marble.rogi.chat`, API는 `marble-api.rogi.chat`이다. 기존 rogi.chat DNS는 Cloudflare 패턴을 사용하므로 Route 53 zone을 새로 만들지 않는다.
- AWS 리소스 생성, DNS 변경, 이미지 발행, Git push는 아직 수행하지 않았다.

Mac에서 실제 AWS 자격과 분리된 S3 backend로 network saved plan을 생성했다. VPC·subnet·인터넷 게이트웨이·
route table·route·연결의 **6개 생성, 변경 0, 삭제 0**이다. 조회용 plan은 state lock 쓰기도 비활성화했고
apply하지 않았다. 제품 두 root의 실제 plan은 network 적용 후 실제 ID를 받아 생성해야 한다.
제품 root는 현재 mock provider로 검증했으며 이를 실제 EC2 plan으로 대신하지 않는다.

## 초기 용량과 비용 기준

사용자 확정 사양은 각 호스트 `t8i.medium`(2 vCPU, 4 GiB, x86_64), root gp3 20 GiB와 별도 data gp3 40 GiB다.
서울 리전의 선택한 AZ에서 제공되는 것을 AWS API로 확인했다. 두 제품의 Terraform 기본값과 Mac의 배포 입력에 반영했다.
2026-09-21 AWS Price List API의 서울 Linux On-Demand 값과 월 730시간 기준으로 계산했다.

| 항목 | 계산 | 월 기준 USD |
| --- | --- | ---: |
| EC2 두 대 | $0.0624 × 730 × 2 | 91.10 |
| gp3 기본 용량 합계 | 120 GiB × $0.0912 | 10.94 |
| 공인 IPv4 두 개 | $0.005 × 730 × 2 | 7.30 |
| 위 세 항목 합계 | | 109.35 |

합계는 반올림 전 금액으로 계산했다. 이는 전체 청구액이 아니다. S3 백업/ECR 저장·요청, Secrets Manager, 데이터 전송, T8i 추가 CPU credit,
세금과 추가 IOPS/처리량은 제외했다. 실제 입력과 적용 직전 가격을 다시 대조한다.
([T8i 사양과 크레딧 정책](https://aws.amazon.com/ec2/instance-types/t8i/),
[EC2 과금 안내](https://aws.amazon.com/ec2/pricing/on-demand/),
[공인 IPv4 과금](https://aws.amazon.com/vpc/pricing/))

## rogichat 인증 연결

최신 rogichat 코드의 인증은 JWT가 아닌 DB에서 검증하는 opaque session이다. 기존
`https://api.rogi.chat/v1/auth/session`을 서버에서 호출해 검증하는 adapter를 구현한다.
현재 issuer의 `__Host-rogi_session` 쿠키는 host 전용이며 그대로는 marble API에 전달되지 않는다.

사용자가 요청한 `.rogi.chat` 공유 쿠키 발급에는 issuer에서 Domain을 지정할 수 있는 별도 이름이 필요하다.
통합 이름은 `__Secure-rogi_session`으로 준비하고 API 설정으로 명시한다. 기존 `__Host-*` 쿠키를 유지하면서
별도 공유 쿠키를 추가할 수 있다. 공유 값 하나만 서버에서 추출해
issuer가 기대하는 기존 쿠키 이름으로 전달한다. 다른 브라우저 쿠키는 전달하지 않는다.
`__Host-` 쿠키에는 Domain을 지정할 수 없다.
([MDN 쿠키 접두어 규칙](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie))

검증된 upstream 응답의 `accountPartition`과 로컬 operator를 명시적으로 연결한다. 이 값 자체를 로그인
증명으로 받거나 모든 rogi.chat 사용자를 관리자로 등록하지 않는다. local operator/channel 권한을 유지한다.
issuer의 account partition 생성 키/정책이 바뀌면 기존 binding을 확인해야 한다.

웹은 인증 설정과 현재 세션을 조회해 CSRF를 준비하고, shared 모드에서는 rogi.chat 로그인과 세션 재확인을
제공한다. issuer의 공유 쿠키 발급 변경은 이 레포에서 배포하지 않았다. 따라서 실제 공유 쿠키 로그인은
아직 통합 검증 전이며, mock 검사를 실서비스 로그인 성공으로 표시하지 않는다.

## 준비 중인 실행 경로

1. 세 Terraform root와 EBS 삭제/교체 거부 검사를 검증한다. 실제 plan과 환경 입력은 private 디렉터리에 저장한다.
2. network → marble → collector 순서로 적용할 계획을 검토한다. collector 입력은 실제 생성된 marble SG를 참조한다.
3. SSM으로 호스트를 확인하고 데이터 EBS의 최초 초기화/마운트를 명시적으로 수행한다. 기존 filesystem은 다시 포맷하지 않는다.
4. 검토한 source commit으로 private GHCR 이미지를 발행하고 digest·Compose·migration checksum을 묶은 public metadata release bundle을 만든다.
5. 성공한 main release의 `private-deploy`가 OIDC로 제한된 AWS role을 맡아 packages-read job token을 전용 Secrets Manager에 잠시 쓰고, parameter 없는 제품 고정 SSM document로 배포를 시작한다. 호스트는 임시 root-only Docker config로 digest를 pull한다. workflow 종료 때 secret 값을 비우며 사람 PAT나 지속 registry login은 두지 않는다.
6. marble의 고정 주소를 두 도메인에 연결하고 TLS·공유 인증·운영자 binding·서버 저장을 확인한다.
7. 실제 재부팅·기동 실패·배포 실패·백업/복구를 검증한 뒤 사용자 피드백 URL을 안내한다.

주기 updater는 public Release metadata와 배포 receipt의 health/no-op 상태를 자격 없이 확인한다. 새 private image 배포는
job token이 살아 있는 `private-deploy` 실행이 담당한다. 실패 시 timer가 익명 pull로 우회하지 않으며 현재 release를
유지한다. 실패한 `private-deploy` run을 재실행해 새 단기 token으로 같은 최신 release를 다시 검증·배포한다.

운영 Compose와 helper는 [배포 절차](deployment-production.md), EC2/state/EBS는
[인프라 준비](infrastructure-preparation.md)에 정리한다. 수집기는 별도 레포의 동명 문서를 따른다.
현재 collector 역할은 health 확인용 골격이고 실제 SOOP·journal·gRPC 연결은 구현 전이다.
첫 배포의 범위는 수동 운영 피드백이며, 전체 구현 계획의 출시 조건을 대체하지 않는다.

## 이번 변경의 검증

- 세 Terraform root의 validate와 mock provider 테스트 각 1개 통과. 실제 AWS network plan도 별도로 통과했다.
- 두 제품의 EBS plan guard에서 생성/수정 허용, 삭제·양방향 교체·module 주소·잘못된 plan 거부를 검증했다.
- Marble 배포 모의 테스트 6개: checksum, migration 실패, 실행 순서, 재부팅 환경 복원, 변경 이미지 재생성 검증.
- API 인증 테스트 5개와 API TypeScript 빌드, 웹 명령/인증 테스트 7개와 typecheck 통과.
- Collector의 manifest 변조·누락 SQL·runtime 입력, 배포 순서, 마이그레이션 트랜잭션·실패 전파를 가짜 명령 실행으로 검증했다.
- 공개 후보 파일 114개(marble)·75개(collector)의 gitleaks 검사에서 탐지 0건, 양 레포 문서의 로컬 링크 누락 0건을 확인했다. 첫 commit/push는 아직 수행하지 않았다.
- 로컬 Docker/앱을 재기동하지 않았다. 이 변경 이후 실제 PostgreSQL·systemd·EC2 부팅 및 공유 로그인 검증은 아직 하지 않았다.
