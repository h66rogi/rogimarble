# Rogimarble · 주루마블

Rogimarble은 방송 중 후원과 운영자 명령으로 진행하는 공유 보드 게임입니다. 서버가 주사위 결과와 게임 상태를 확정하고, 웹 콘솔은 게임 운영과 설정을, OBS 오버레이는 방송 화면을 담당합니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `apps/web` | 운영 콘솔, 설정 편집기, OBS 화면 |
| `apps/api` | 인증, 게임 명령, 후원 처리, 설정 및 오버레이 API |
| `packages/game-core` | 후원 규칙과 보드 정의의 검증·판정 |
| `packages/database` | PostgreSQL 스키마, 마이그레이션, 영속 저장 |
| `packages/contracts` | 앱 간 데이터 계약 |
| `packages/overlay-ui`, `packages/animation`, `packages/asset-manifest` | 방송 화면과 자산 |
| `deploy`, `infrastructure`, `tools` | 로컬 실행, 릴리스, 호스트 운영 |

후원과 채팅 수집은 별도 [rogi-collector](https://github.com/h66rogi/rogi-collector) 서비스와 인증된 gRPC로 연결합니다. 방송에는 채널별 공유 말 하나를 사용합니다.

## 로컬 실행

Node.js 22.18 이상, pnpm 12.5.1, Docker Engine과 Compose plugin, OpenSSL이 필요합니다. 이 workspace에서는 Node 명령 전에 `source ../.tools/use-node22.sh`를 실행합니다.

```sh
source ../.tools/use-node22.sh
pnpm install --frozen-lockfile
./tools/ops/preview.sh up
./tools/ops/status.sh
```

로컬 주소는 기본적으로 `http://127.0.0.1:8080`입니다. `preview.sh`는 `deploy/.env`에 로컬 전용 값을 생성합니다. 로그와 종료 명령은 `./tools/ops/preview.sh logs`, `./tools/ops/preview.sh down`입니다. 종료 명령은 데이터 볼륨을 보존합니다. 계정 생성과 구성 방법은 [개발 환경](docs/development.md)을 참고하세요.

## 검증

```sh
pnpm typecheck
pnpm test
pnpm --filter @rogimarble/web test
pnpm --filter @rogimarble/api test:integration
pnpm build
```

CI의 전체 검사와 브라우저 테스트는 [개발 환경](docs/development.md)에 정리했습니다.

## 문서

- [구조와 데이터 흐름](docs/architecture.md)
- [게임 규칙과 보드](docs/game-rules.md)
- [운영 콘솔](docs/operator-guide.md)
- [설정과 게시](docs/configuration.md)
- [OBS 오버레이](docs/overlays.md)
- [수집기 연결과 진단](docs/collector.md)
- [HTTP API](docs/api.md)
- [개발 환경과 검증](docs/development.md)
- [배포와 운영](docs/deployment.md)
- [인프라](infrastructure/README.md)
- [소스와 자산 출처](docs/attribution.md)

## 기여

변경 전에 관련 계약 문서와 저장소의 `AGENTS.md`를 확인하세요. 게임 결과는 서버 명령을 통해서만 바꾸고, 게시된 설정 버전과 기존 세션의 기록을 보존합니다. 버그 제보에는 재현 절차, 기대한 결과, 실제 결과, 관련 로그에서 비밀값을 제거한 내용이 도움이 됩니다.
