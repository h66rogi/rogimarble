# 이번 구현의 소스 반입 기록

작성일: 2026-09-21

## 직접 반입

이번 workspace·preview 배포 wave에서 참고 저장소의 코드, Dockerfile, Terraform, 운영 manifest,
주소, 공개키, 비밀, Git 이력을 직접 반입한 파일은 없다. 이 저장소의 루트 구성, Dockerfile,
Compose, Caddy 설정, helper와 문서는 최종 설계에 맞춰 새로 작성했다.

## 패턴 참고

| 참고 원본 | 확인한 경로 | 참고한 패턴 | 적용 방식 |
| --- | --- | --- | --- |
| `h66rogi/rogichat` | `infrastructure/runtime/compose.app.yaml` | 앱 non-root, read-only root, capability 제거, health, 로그 제한, host port 미공개 | 로컬 preview 요구에 맞춰 신규 Compose로 작성 |
| `h66rogi/rogichat` | `infrastructure/runtime/Caddyfile.app` | edge 단일 진입점과 내부 서비스 reverse proxy | 로컬 loopback Caddy 설정으로 신규 작성 |
| `h66rogi/rogichat` | `infrastructure/runtime/rogichat-app@.service` | systemd가 운영 재시작 순서와 장기 프로세스를 감독 | production 후속 gate 문서에만 반영; unit 직접 반입 없음 |
| `h66rogi/rogichat` | `tools/operations/backend_release.py`, `fetch_runtime_secret.py` | host lock, manifest/digest 검증, tmpfs secret, readiness 후 완료 판정 | production helper 후속 요구로 기록; 코드 직접 반입 없음 |
| `h66rogi/rogichat-ops` | `AGENTS.md` 및 release/restore 도구 구조 | private 운영 입력 분리, push와 실제 배포 증거 구분 | 공개 preview와 production release 경계를 문서화 |
| `meloming-back` @ `9bc4db7a53d77532b162a5ee225e32e18b9b6d16` | `src/main.ts`, `src/app.controller.ts` | Nest bootstrap/controller 경계 | backend 담당이 패턴만 참고해 신규 작성; 직접 반입 없음 |
| `meloming-gateway-service` @ `22ae747cc0c3bb038981d06e46d277690f3ba1f7` | `src/main.ts` | gateway bootstrap 경계 | backend 담당이 패턴만 참고해 신규 작성; 직접 반입 없음 |

웹 구현은 외부 참고 저장소 파일을 직접 반입하지 않았다. 이 저장소 안의 `presets`, game core와 contracts를
재사용했고, `token-bounce-v1` Lottie JSON은 이번 제품을 위해 작성한 first-party 자산이다.

참고 저장소의 build/dev server는 실행하지 않았다. 참고 시점의 고정 SHA는 작업 저장소 밖의
`_references/rogimarble/inventory.json`에 보관하며, private inventory와 운영 식별자는 이 공개 대상에 복사하지 않는다.


## 운영 콘솔 스타일과 나눔스퀘어네오

- `dylabs/meloming-front`를 작업 저장소 밖에서 조사했다. 조사 HEAD는
  `0ec12a25a9ff5c56fd24770d16f91e8d26b138b6`이며, console 제거 커밋
  `162385383ab5fab5f93f94b0feda9045c78400fa`의 부모에서도 화면 구성을 확인했다.
- 참고 경로: `src/features/home-new/layout/ManageShell.tsx`,
  `src/shared/components/layout/management-sidebar-wrapper.tsx`, `src/app/globals.css`,
  `src/app/(auth)/auth/login/login-page-content.tsx`, 과거
  `src/app/(default)/channel/[user]/(manage)/manage/console/page.tsx`.
- 사이드바·얇은 헤더·보라색 강조·중립 배경·흰 카드의 시각적 패턴을 이 제품의 기존
  운영 로직에 맞춰 구현했다. 원본 소스 파일·브랜드 이미지·운영 데이터·Git 이력은
  반입하지 않았다. private 코드의 직접 반입 허용 목록은 여전히 비어 있다.
- 폰트는 private 원본이 아닌 [네이버 공식 배포](https://campaign.naver.com/nanumsquare_neo/)의
  `NaverNanumSquareNeo.zip`에서 `NanumSquareNeo-Variable.woff2` 한 파일만 변경 없이
  선별했다. 대상은 `apps/web/public/fonts/NanumSquareNeo-Variable.woff2`이며,
  SHA-256은 `141ac2f0717274f96e4f7e0109952bcb29251eb0d23eabeb11834e23214948d9`다.
  SIL OFL 1.1 원문 고지는 같은 디렉터리의 `OFL.txt`에 포함한다.
  정적 자산으로 직접 제공하므로 방문자의 브라우저가 외부 폰트 CDN에 접속하지 않는다.
