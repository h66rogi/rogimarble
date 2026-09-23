# 통합 오버레이 원본 이식

사용자는 `meloming-overlay`의 실제 통합 오버레이 코드베이스를 출발점으로 주루마블 OBS 화면을 구현하도록 명시했다. 이 작업은 원본 화면을 보고 새로 그린 구현이 아니다.

## 고정 원본과 범위

- 저장소: `dylabs/meloming-overlay`
- 고정 커밋: `540dd2abae09d177095896c2483ca904e24f8c82`
- 진입점: `app/overlay/[token]/widgets/total/page.tsx`
- 실행 의존성과 Next root layout, provider, global/overlay CSS context를 합친 허용 목록: 175개 파일

원본 175개 파일은 제품 저장소 밖에 byte-exact로 추출하고 Git object의 SHA-256과 대조했다. 제품에서는 console 이식의 `@/` alias와 충돌하지 않도록 `apps/web/src/integrated-overlay/` 아래에 원래 디렉터리 구조를 유지하고 내부 alias만 namespace에 맞게 바꿨다. 원본의 다른 route, 배포 설정, Git 이력은 반입하지 않았다.

## 활성 구현 범위

원본의 통합 canvas, normalized widget layout, 크기 측정과 OBS canvas 안내 구조를 주루마블 board widget의 기반으로 사용한다. 실제 활성 진입점은 원본 total page를 직접 변형한 파일이며, 원본 normalized widget loop에서 서버가 확정한 board, dice, current mission, inventory, direction과 상태를 합성한다. Board/TokenLottie는 `@rogimarble/overlay-ui`를 사용한다. OBS token은 URL fragment에서 읽어 Authorization header로만 API에 전달한다. 1초 polling 응답은 session id, session epoch, revision, presentation epoch가 후퇴하지 않을 때만 적용한다. 서버 roll result의 path를 CSS 이동 시간보다 긴 칸별 간격으로 순서대로 재생하고 새 presentation epoch나 위치 보정에서 이전 재생을 취소한다. 게시된 canvas width/height 비율을 viewport 안에 맞추며 layout background와 normalized widget 좌표를 적용한다. 표시 callback이나 OBS 연결 여부가 게임 결과를 확정하지 않는다.

OBS 파츠 URL은 원본 `meloming-front`의 탭별 URL 카드와 `meloming-overlay`의 개별 위젯 경로를 참고해 `/overlay/:widget#token=...`로 분리했다. 파츠는 통합 배치에서 꺼져 있어도 단독 URL에서 표시하며, 각 파츠의 권장 브라우저 소스 크기를 콘솔에 안내한다. 토큰은 기존과 같이 URL fragment에만 둔다. 원본의 음악 위젯 스타일 설정 API는 이식하지 않고 주루마블의 읽기 전용 OBS 상태와 live layout 계약에 `widgetStyles`(테마·글꼴)를 추가했다. 파츠별 설정은 통합 화면과 단독 URL에 함께 적용되며 게시 작업에서도 현재 live 스타일을 보존한다.

채팅창 파츠는 반입된 `apple/Chatbox.tsx`의 전체 배경과 제목을 쓰지 않고 주루마블 테마별 개별 메시지 카드로 렌더링한다. OBS 캔버스는 투명하게 유지한다. `widgetStyles.chatbox`의 테마·글꼴과 함께 플랫폼 배지(기본 숨김), 닉네임(기본 표시), 글자 크기를 실시간 배치 설정에서 조정한다. 통합 배치에서 채팅창의 최소 크기는 다른 작은 파츠와 같은 캔버스 가로 10%·세로 6%이며, 필요하면 캔버스 경계까지 늘릴 수 있다. 주루마블 수집기가 DB에 수락한 채팅·별풍선 후원을 표시 필드로 축소한 후 기존 OBS 토큰 Socket.IO room의 `chat.message`/`chat.donation` 이벤트로 보낸다. 위젯은 원본의 bounded message context를 사용하며 `/overlay/chatbox` 단독 URL과 통합 배치에서 같은 이벤트를 받는다. 수집기 원본 payload와 인증 정보는 브라우저에 보내지 않는다.

원본 서비스의 Socket.IO/API는 runtime에서 연결하지 않는다. 주루마블 Socket.IO 어댑터가 OBS 토큰으로 주루마블 채팅·후원 이벤트와 배치 갱신만 구독한다. 사용하지 않는 신청곡 theme와 그 font/thumbnail asset 전체를 지원한다고 주장하지 않는다. 방송용 글꼴은 제품에 포함된 NanumSquare Neo·Jua·Do Hyeon·Black Han Sans만 사용한다.

## 공개 경계

원본 서비스 host, token, 자격 증명, analytics 설정은 공개 제품에 반입하지 않는다. 원본 API client, Socket.IO, font catalog와 fallback host만 명시적인 제품 경계에서 바꿨다. 파일별 source/imported SHA-256과 수정 사유는 `total-overlay.json`에 있다.

## 검증 기록

원본 저장소의 build와 dev server는 실행하지 않았다. 고정 snapshot closure는 내부 import 미해결 0개이며 외부 runtime package는 6종이다. 제품 반입은 175/175 파일 존재를 확인했다. 원본 source와 제품 namespace 모두 Gitleaks redacted scan에서 탐지 0건이었고, legacy 운영 host URL과 secret 형태 literal은 발견되지 않았다. Snapshot ordering 및 authoritative roll path 재생 합성 테스트 5개가 통과했다. 제품 build/typecheck와 실제 token polling 브라우저 검증은 별도의 제품 검증 결과로 기록한다.
