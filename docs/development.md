# 개발 환경과 검증

Node.js 22.18 이상과 pnpm 12.5.1을 사용합니다. 이 workspace의 `rogimarble`에서는 Node 명령 전에 `source ../.tools/use-node22.sh`를 실행합니다. Docker Engine, Compose plugin과 OpenSSL은 로컬 통합 실행에 필요합니다.

```sh
source ../.tools/use-node22.sh
pnpm install --frozen-lockfile
./tools/ops/preview.sh up
./tools/ops/status.sh
```

`preview.sh`는 `deploy/.env`를 생성하고 웹, API, PostgreSQL, Redis, Caddy를 시작합니다. 로컬 기본 주소는 `http://127.0.0.1:8080`입니다. 종료할 때 `./tools/ops/preview.sh down`을 사용하면 데이터 볼륨이 보존됩니다. 개발용 파일은 Git에 올리지 않습니다.

관리자 계정은 컨테이너 준비 후 명시적으로 생성합니다. 비밀번호는 실행 환경으로 전달하고 셸 기록과 공유 로그에 남기지 마세요. 로그인 화면에는 발급한 접근 토큰을 입력합니다.

```sh
read -rs BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
./tools/ops/bootstrap-admin.sh operator
unset BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps api \
  node --experimental-strip-types apps/api/src/access-token-cli.ts issue operator local 30
```

마지막 명령이 토큰을 한 번 출력합니다. 이 토큰으로 `/login`에서 로그인합니다. 예시 게임판과 아이템은 다음과 같이 별도로 등록할 수 있습니다.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps \
  -e BOARD_CHANNEL_ID=preview -e BOARD_OPERATOR_USERNAME=operator api \
  node --experimental-strip-types packages/database/src/register-preview-board.ts
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps \
  -e ITEM_CHANNEL_ID=preview api \
  node --experimental-strip-types packages/database/src/import-items.ts presets/streamer-initial.json
```

예시 보드를 사용한 세션과 실제 채널 설정은 구분합니다.

## 검사 명령

```sh
pnpm typecheck
pnpm test
pnpm --filter @rogimarble/web lint:design
pnpm --filter @rogimarble/web test
pnpm --filter @rogimarble/api test:auth
pnpm --filter @rogimarble/api test:effects
pnpm --filter @rogimarble/api test:collector
pnpm --filter @rogimarble/api test:feed
pnpm --filter @rogimarble/api test:pawn
pnpm --filter @rogimarble/api test:integration
pnpm build
```

브라우저 검사는 `pnpm --filter @rogimarble/web test:browser`로 실행합니다. PostgreSQL이 필요한 API 통합 검사는 별도의 테스트 컨테이너를 사용합니다. `npm test`는 루트의 코어·자산 테스트만 실행합니다. CI의 전체 검사는 `.github/workflows/ci.yml`에 정의되어 있습니다.

웹 콘솔 디자인 검사와 보존 기준은 `apps/web/scripts/check-design-system.ts` 및 `apps/web/scripts/console-legacy-baseline.json`에 있습니다. 기존 콘솔 틀과 신규 UI의 공통 컴포넌트를 함께 검증합니다.
