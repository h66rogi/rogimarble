# 주루마블 · rogimarble

SOOP의 **등록한 개수와 정확히 일치하는 별풍선 후원**으로 주사위·미션·아이템·칸 이동을
실행하는 OBS 주루마블 프로젝트입니다. 방송 전체가 공유하는 말 하나를 사용합니다.

후원·보드 코어에 이어 웹 콘솔, 서버 저장, Lottie 보드와 로컬 Compose를 구현하고 있습니다.
현재 동작·검증 범위와 남은 기능은 [구현 진행 기록](docs/implementation-status.md)을 확인하세요.
실제 SOOP 수집·전체 특수 칸 효과·웹 설정 편집·실시간 OBS 연결은 아직 완성되지 않았습니다.

로컬 Compose는 사용자 요청으로 중지했고 DB volume은 보존했습니다. 수동 주사위·방향/위치·세션 제어,
보상 수량 조정과 수동 미션/실드를 검증한 뒤, 현재는 EC2 두 대의 외부 배포를 준비하고 있습니다.
실제 외부 배포와 공유 쿠키 로그인 검증은 아직 완료되지 않았습니다.

- [최종 설계 v1](docs/final-design.md): Lottie·선택적 Three.js, 웹 관리, 제품별 EC2 1대·Compose·IaC, 구현 순서와 출시 기준
- [스트리머 운영 콘솔](docs/operator-console.md): 후원 내역, 보상 수량 조정, 수동 주사위, 방향·위치 변경, 대기열·운영 이력
- [기준 보드·동작 타입](docs/board-design.md): 전달 이미지의 26칸 프리셋, 크기/칸/내용/동작 편집, 중앙 콘텐츠
- [구현 계획 v1](docs/implementation-plan.md): 단계별 작업 ID·의존성·산출물·검증·출시 기준
- [기존 저장소 조사](docs/repository-review.md): 코드 비교와 선별 이식 근거
- [구현 계획 리뷰](docs/implementation-plan-review.md): 서브 에이전트 검토와 반영 내역
- [초기 구현 리뷰](docs/implementation-review.md): 실행 중 발견한 결함과 보완·검증 상태
- [로컬 피드백 배포](docs/deployment-preview.md): Compose 시작·상태·종료와 운영 배포의 차이
- [EC2 배포 준비 상태](docs/deployment-readiness.md): 확인한 환경, 공유 인증, 실제 배포까지의 순서
- [운영 Compose](docs/deployment-production.md) · [인프라 준비](docs/infrastructure-preparation.md)
- [소스 이식 정책](docs/source-import-policy.md): private 원본과 Git 이력의 분리
- [설정 관리 설계](docs/configuration-management.md): 웹 콘솔의 입력·저장·실드·칸 선택 흐름
- 수집기는 별도 [rogi-collector](https://github.com/h66rogi/rogi-collector)에서 관리합니다.

기본 화면은 편집 가능한 DOM/SVG 보드와 Lottie 연출을 결합하고, 필요한 장면에 Three.js를 사용합니다.
배포는 각 제품의 EC2에 독립 DB·Redis를 포함한 Docker Compose를 두고 내부 gRPC로 연결하는 설계입니다.
피드백용 Compose는 운영 EC2 배포와 구분합니다. Terraform과 운영 Compose를 준비 중이며 실제 EC2 기동·복구 검증은 남아 있습니다.

## 현재 구현한 규칙

스트리머가 제공한 초기 규칙을 [편집 가능한 프리셋](presets/streamer-initial.json)으로 분리했습니다.

| 별풍선 | 동작 |
| --- | --- |
| 33 | 주사위 굴리기 |
| 52 | 안주 먹어 |
| 53 | 안주 안돼 |
| 100 | 무조건 한잔해 |
| 101 | 한잔 실드 |
| 152 | 같이 한잔 |
| 486 | 원하는 칸으로 |

코어는 이 파일을 자동으로 읽지 않고 전달받은 설정으로만 판정합니다.
웹 콘솔에서는 채널별로 개수·이름·동작·메시지·횟수·실드 적용·이동 입력 방식을
추가·수정·삭제·활성화할 수 있도록 구현할 예정입니다. JSON 편집이 최종 관리 방식은 아닙니다.

33개만 주사위를 굴리며 66개·99개를 자동 연차로 계산하지 않습니다.
200개·250개는 미등록이므로 동작하지 않습니다. 여러 후원의 누적도 없습니다.
연차를 활성화하더라도 개수별 규칙을 별도로 등록해야 합니다.

미션별 실드 허용 여부는 수정할 수 있습니다. 초기안은 '무조건 한잔해' 불허,
'같이 한잔' 허용이며 확정된 방송 룰이 아닌 편집 가능한 제안값입니다.
칸 선택은 운영자 선택과 후원자 채팅을 모두 허용하는 초기 설정입니다.
현재 코어는 실행할 동작을 반환하며 실제 실드 차감이나 말 이동을 실행하지 않습니다.

## 기준 보드와 타입

이번 판은 전달 이미지의 **9열 × 6행 외곽 26칸**입니다.
[보드 프리셋](presets/streamer-board.json)에서 문구·모양·배치·논리 경로·도착/통과 효과를 관리합니다.
화면 크기와 칸 수는 별도 설정이고 중앙의 주사위·미션·보상 현황 등도 위젯 타입으로 추가할 수 있습니다.

[TypeScript 타입](packages/game-core/src/board-definition.ts)은 설정에 따라 미션·이동·방향·이동 제한·
다음 주사위 modifier·적립/정산·아이템 지급을 구분합니다. 칸 이름으로 기능을 하드코딩하지 않습니다.
술 적립은 +1잔, 청산은 누적 전량을 한 미션으로 처리하고, 다음 주사위 이동 거리는 1회 ×2로 설정했습니다.
무인도 3회 휴식/더블 탈출, 세계여행 다음 차례 이동도 설정으로 표현합니다. 주사위는 6면 2개를 초기 제안으로
두었으며 변경할 수 있습니다. [보드 설계](docs/board-design.md)에 차례·실드·정산 기준을 정리했습니다.
현재 구현은 타입·검증·순수 미리보기까지이며 웹 편집기·효과 실행기는 다음 범위입니다.

Node.js 22.18 이상에서 의존성 설치 없이 코어 테스트를 실행할 수 있습니다.

```sh
npm test
```

이 명령은 후원 규칙과 보드 설정/좌표/경로의 런타임 테스트 26개를 실행합니다.
Next/Nest 빌드, 개발 서버, 외부 플랫폼 연결, TypeScript 정적 타입 검사는 실행하지 않습니다.
앱 빌드와 실제 PostgreSQL 통합 검증 결과는 진행 기록에서 별도로 관리합니다.

Docker와 workspace 의존성 설치 후 실제 PG/HTTP 회귀 검사는 다음과 같이 실행합니다.
테스트가 별도 PG 컨테이너를 만들고 종료 시 정리하며, 로컬 preview DB는 사용하지 않습니다.

```sh
cd apps/api && npm run test:integration
```

코어 소스의 별도 정적 타입 검증은 다음 명령으로 확인했습니다. 앱 빌드나 테스트 파일의 타입 검사는 아닙니다.

```sh
npm exec --yes --package=typescript@5.9.3 -- tsc --noEmit --strict --target es2022 --module nodenext --allowImportingTsExtensions packages/game-core/src/board-definition.ts packages/game-core/src/donation-trigger.ts
```
