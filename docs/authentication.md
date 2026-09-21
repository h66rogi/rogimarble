# 인증 경계와 출시 상태

기준일: 2026-09-21. Production runtime은 `AUTH_MODE=rogichat_shared_cookie`를
유지한다. 다만 일반 shared 로그인 진입은 issuer 선행 변경과 실제 브라우저 검증
전까지 준비 중으로 표시한다. Marble 관리자 인증은 별도 scope로 제공하며 shared
mode에서도 독립 local admin 로그인을 사용한다.

## 확인한 Rogichat 계약

공개 `h66rogi/rogichat`의 QA commit
`f5216ba076b32c4dde0e104f73f2f8cd0cf202ad`에서 hosted 인증은 opaque 세션을
DB에서 검증한다. 관련 구현은 다음 경로에 있다.

- `apps/api/src/infrastructure/config/auth-config.ts`: production audience와 origin,
  hosted secure 설정
- `apps/api/src/modules/auth/auth-context.ts`: hosted cookie 이름을
  `__Host-rogi_session`으로 선택
- `apps/api/src/modules/auth/auth.controller.ts`: HttpOnly, Secure, SameSite=Lax,
  Path=/ 세션 cookie 발급과 삭제
- `apps/api/src/modules/auth/auth.service.ts`와 `session.service.ts`: 현재 세션 검증,
  CSRF와 `accountPartition` 생성
- `apps/api/test/integration/auth.test.mjs`: 발급 cookie에 `Domain`이 없음을 검증

확인한 production 배포 기록의 API source에서도 같은 host-only cookie 계약을
사용한다. `__Host-` cookie에는 Domain을 지정할 수 없으므로 `api.rogi.chat`에서
발급한 현재 세션은 브라우저가 `marble-api.rogi.chat`에 보내지 않는다.
Rogichat 웹 runtime 문서도 same-origin proxy나 cookie-domain rewrite 없이 API
host 전용 cookie를 사용한다고 명시한다.

따라서 현재 issuer가 `.rogi.chat` 범위의 `__Secure-rogi_session`을 발급한다는
근거는 없다. 실제 로그인 응답의 공유 `Set-Cookie`도 아직 검증하지 못했다.

## Marble의 준비된 shared adapter

`apps/api/src/auth-core.ts`는 `__Secure-rogi_session` 하나만 읽고 opaque 형식을
검사한 뒤, 그 값을 server-to-server 요청의 `__Host-rogi_session`으로 바꾸어
`https://api.rogi.chat/v1/auth/session`에 전달한다. Upstream 응답은
`authenticated=true`와 canonical `accountPartition`을 포함해야 한다.

`accountPartition`은 로그인 증명이나 관리자 권한이 아니다. Migration 003의
`external_auth_bindings`에서 issuer와 subject가 기존 local operator에 명시적으로
연결된 경우에만 세션을 만든다. 이후에도 local role과 channel capability를 적용한다.
Upstream 장애, 중복·잘못된 cookie, 미등록 binding은 자동 가입이나 password
fallback 없이 거부한다. Marble은 upstream CSRF를 재사용하지 않고 shared session과
Marble origin에 묶인 자체 CSRF를 발급한다.

이 adapter는 issuer가 공유 cookie를 실제로 발급한 뒤에만 작동한다. Marble은
`api.rogi.chat`의 host-only cookie를 읽거나 만들어낼 수 없다.

## 첫 배포의 독립 관리자 인증

첫 배포의 API auth mode 자체는 shared다. 일반 로그인 설정은
`ROGICHAT_SHARED_LOGIN_READY` 같은 명시적 readiness flag가 실제 issuer 준비 상태를
나타낼 때만 Rogichat 로그인 URL을 노출하고, 그 전에는 준비 중 상태를 반환한다.
Shared 로그인이 준비되지 않았다는 이유로 API 전체를 local mode로 바꾸거나 shared
cookie 검증을 우회하지 않는다.

관리자 로그인은 일반 사용자 shared session과 분리된 local admin endpoint, cookie,
세션 저장소와 CSRF scope를 사용한다. 관리자가 명시적으로 bootstrap한 operator만
로그인할 수 있으며 비밀번호 원문은 저장·출력하지 않는다. Admin 세션은 Marble API
host에 한정하고 HttpOnly, Secure, SameSite와 만료·폐기를 적용한다. 상태 변경은
admin session에 묶인 CSRF와 정확한 Marble origin을 요구한다. 일반 shared session을
admin cookie로 승격하거나 admin session을 일반 사용자 binding으로 해석하지 않는다.

관리 권한은 세션 보유만으로 결정하지 않는다. 각 요청에서 현재 operator 상태,
role, channel capability를 다시 확인한다. 관리자 생성·비활성화·권한 변경에는
권한 원장과 감사 출처가 필요하며, 마지막 활성 admin을 없애는 경쟁 요청은 같은
DB transaction에서 잠금·재검증해야 한다. 로그아웃, 비밀번호 변경, operator
비활성화와 세션 만료는 기존 세션을 재사용할 수 없게 해야 한다.

## Shared mode의 선행 조건

현재 설계를 유지하려면 Rogichat issuer가 기존 `__Host-rogi_session`과 별도로
`__Secure-rogi_session; Domain=.rogi.chat; Path=/; Secure; HttpOnly; SameSite=Lax`를
발급하고, 로그아웃·폐기·만료 시 두 cookie의 수명을 일치시켜야 한다. 중복 cookie,
이름 충돌, session rotation과 account suspension도 회귀 검증해야 한다.

공유 Domain bearer cookie는 모든 HTTPS 하위 도메인 요청에 전달되므로 노출 범위를
넓힌다. 각 하위 도메인의 운영·로그·침해 경계를 함께 신뢰할 수 없다면 일회성
authorization code를 Marble backend가 교환하는 별도 SSO 흐름이 더 적절하다.
어느 방식을 택하든 issuer 변경은 Rogichat 소유 변경으로 별도 검토·배포한다.

Shared mode 활성화에는 다음 실제 증거가 모두 필요하다.

1. 실제 Rogichat 로그인 응답에서 정확한 공유 `Set-Cookie` 속성을 확인한다.
2. 브라우저가 Marble 요청에 공유 cookie를 보내고 다른 비승인 범위로는 누출하지
   않는지 확인한다.
3. Marble backend가 upstream current session을 매번 검증하고, 등록된 binding만
   허용하는지 확인한다.
4. logout, revoke, expiry, password/account 상태 변경 뒤 재사용을 거부하는지 확인한다.
5. duplicate cookie, 잘못된 subject, upstream timeout/5xx, binding 부재와 권한 회수
   상황에서 fail closed하는지 확인한다.
6. CSRF origin, local role/channel capability와 마지막 admin 경쟁 조건을 실제 DB와
   동시 요청으로 검증한다.

현재 단위·합성 테스트는 adapter 형식과 fail-closed 동작만 증명한다. 공유 cookie
발급, 실제 사용자 로그인, browser 전달, logout/revocation 연동은 완료되지 않았다.
반면 별도 local admin 인증은 shared readiness와 독립적으로 실제 동작·권한·폐기를
검증해야 하며, 이 성공을 일반 shared 로그인 성공으로 표현하지 않는다.
