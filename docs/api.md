# HTTP API

API 경로의 기준은 `apps/api/src/app.controller.ts`, `apps/api/src/collector.controller.ts`와 `apps/api/src/access-token.controller.ts`입니다. 아래 표는 콘솔·OBS에서 사용하는 경로를 기능별로 안내합니다. 요청과 응답의 필드 타입은 `packages/contracts/src`를 기준으로 합니다.

| 영역 | 경로 | 용도 |
| --- | --- | --- |
| 상태 | `GET /health`, `GET /ready` | 프로세스와 데이터베이스·마이그레이션 준비 확인 |
| 인증 | `POST /v1/auth/token`, `GET /v1/auth/session`, `POST /v1/auth/logout` | 접근 토큰 교환, 세션 조회·종료 |
| 접근 토큰 | `GET /v1/auth/tokens`, `POST /v1/auth/tokens`, `DELETE /v1/auth/tokens/:id` | 토큰 목록·발급·회수 |
| 운영 | `GET /v1/channels/:channelId/operator-state` | 채널과 게임 상태 snapshot |
| 게임 | `GET /v1/channels/:channelId/board-versions/runnable`, `POST /v1/channels/:channelId/sessions`, `POST /v1/channels/:channelId/sessions/:sessionId/commands` | 보드 선택, 세션 시작, 운영 명령 |
| 기록 | `GET /v1/channels/:channelId/sessions/:sessionId/history`, `GET /v1/channels/:channelId/sessions/:sessionId/missions`, `GET /v1/channels/:channelId/sessions/:sessionId/inventory-ledger` | 게임·미션·재고 기록 |
| 설정 | `GET|POST /v1/channels/:channelId/config/:kind`, `PUT /v1/channels/:channelId/config/:kind/:versionId`, `POST .../validate`, `POST .../publish` | 초안, 검증, 게시 |
| 후원·채팅 | `GET /v1/channels/:channelId/donations`, `GET /v1/channels/:channelId/chats`, `GET /v1/channels/:channelId/operations` | 수집·처리·운영 기록 |
| 실시간 피드 | `GET /v1/channels/:channelId/feed/events` | 채널 이벤트 SSE |
| 오버레이 | `GET|PUT /v1/channels/:channelId/overlay-layout/live`, `GET /v1/channels/:channelId/overlay-token`, `PATCH .../rotate`, `GET /v1/overlay/state` | 실시간 배치, OBS 주소, 읽기 전용 상태 |
| 수집기 | `GET /v1/channels/:channelId/collector`, `POST .../broadcast-check`, `GET|POST .../chat-test`, `POST .../chat-test/:sessionId/stop` | 연결 상태와 진단 |

관리 경로는 세션 쿠키와 채널 권한을 검사합니다. 상태를 바꾸는 요청에는 CSRF 토큰이 필요합니다. OBS 상태 요청은 별도의 읽기 전용 bearer를 사용합니다. 조회 권한만 가진 계정에는 운영 명령과 진단 쓰기 권한을 부여하지 않습니다.

게임 명령은 `commandId`와 기대 revision으로 중복 실행과 동시 수정 충돌을 관리합니다. 응답을 받지 못했을 때 새 ID로 같은 명령을 생성하지 말고 `GET /v1/channels/:channelId/commands/:commandId`로 기존 결과를 조회합니다. 설정 저장도 `expectedRevision` 충돌을 덮어쓰지 않습니다.
