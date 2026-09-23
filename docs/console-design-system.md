# 콘솔 원본 틀과 신규 UI 디자인 시스템

**meloming-front에서 가져온 기존 콘솔 틀은 보존하고, 새로 만드는 제품 UI에 Shadcn을 사용한다.**
Shadcn 도입은 기존 상단 탭·헤더·푸터·분할 레이아웃을 다른 디자인으로 교체하라는 의미가 아니다.
일관성의 기준은 원본 콘솔 안에서 새 기능이 기존 공유 컴포넌트와 같은 문법을 사용하는 것이다.
루트 페이지에서도 원본 헤더 위에 별도 제품 제목/상태 카드를 붙이지 않는다.
수집 관리 진입은 상단 `계정 관리` 왼쪽의 `개발자도구` 링크에 두어 모든 탭에서 접근할 수 있게 한다. 수집기 연결을 실제 방송 진행으로 표시하지 않는다.
홈 왼쪽은 원본 가사 영역과 같은 세로 크기 조절 분할을 사용한다. 하단의 고정 헤더·독립 스크롤 패널에서 채팅 내역과 후원 내역을 전환한다. 상단 콘솔 메뉴에는 별도 내역 탭을 두지 않는다.
운영 기록은 `/collector` 개발자도구에서 조회한다. 상단 운영 기록 탭은 두지 않는다.

## 보존 영역과 신규 영역

| 영역 | 적용 기준 |
| --- | --- |
| 기존 상단 메뉴 | 원본 native button, 간격, 아이콘, 가로 스크롤, Framer Motion 이동 밑줄 유지. Shadcn Tabs로 교체하지 않음 |
| 기존 헤더·푸터 | sticky 위치, 배경, 밀도, 작은 계정 버튼, 연결 점/세션 상태 표시 유지 |
| 기존 본문·우측 패널 | 원본 ResizablePanel, 비율 저장 키, 홈 유지, 모바일 조작부 배치, 콘텐츠 전환 연출 유지 |
| 기존 전역 스타일·공유 UI | 이미 반입된 CSS 및 Button/Badge/Alert variant 보존. 신규 상태 토큰/variant만 공통 계층에 추가 |
| 새 게임 운영·설정 UI | `src/domains/marble/`의 조작·후원·규칙·보드·OBS 설정·기록은 Shadcn 공유 UI와 조합 사용 |
| 새 계정·로그인·수집 관리 | 같은 Button/Input/Card/Alert/Label과 의미 기반 테마 사용 |
| 보드 그림·OBS 방송 아트 | 데이터 렌더링 영역. 일반 폼 디자인과 분리 |

기존 화면에 native 탭이나 사용자 정의 CSS가 있다는 이유만으로 디자인 위반이라고 판정하지 않는다.
기존 UI를 신규 코드에서 무제한 복제하는 것도 허용하지 않는다. 신규 기능의 컨트롤과 표면은
Shadcn으로 구성하고, 원본 틀 안에 콘텐츠로 넣는다.

`live-console-content.tsx`는 작업 전 제품에 반입되어 있던 실제 원본 코드를 복원했다.
상단 메뉴의 외형을 유지하면서 role/aria 연결과 키보드 이동을 추가했고, 규칙·보드 초안은
탭 전환으로 소멸하지 않게 유지한다. 스크롤 안의 숨김 폼 요소가 문서 밖으로 넘치지 않도록
위치 기준도 지정했다. 기존 신청곡 기능의 비활성 네트워크 경계는 유지하며 새로 활성화하지 않았다.
사용하지 않는 이전 제품 `app/console.tsx` 및 중복 legacy CSS는 원본 리모컨 틀이 아니므로 정리했다.
별도 폰트 작업의 `next/font/local` 등록도 보존한다. 원래 공식 NanumSquareNeo 파일을 그대로 쓰며,
root layout의 생성 variable class와 `--font-sans`로 연결한다. 이 생성 클래스의 검사 예외는
`app/layout.tsx`의 html에서 `./fonts`에 등록된 `nanumSquareNeo.variable`을 사용하는 경우뿐이다.

## 원본 조사와 Context7 확인

원본은 제품 밖 `dylabs/meloming-front`의 고정 커밋
`3346d2e14c7823ae9d748cdd9f704e886e06ee19`를 `git show`로 읽었다.
실제 반입/변경 경계는 [리모컨 이식 기록](source-imports/song-request-console.md)을 따른다.
원본 빌드/서버를 실행하지 않았고 새 원본 코드·운영 정보·Git 이력을 가져오지 않았다.

2026-09-21 Context7 `resolve_library_id`로 `/shadcn-ui/ui`를 확인한 뒤
테마/설정, controlled Tabs·Select, Card·Alert·Checkbox 조합 문서를 조회했다.
기존 Radix 기반 new-york와 Tailwind v4를 유지하고 Base UI/React Aria API를 혼합하지 않았다.
문서에 Shadcn Tabs가 있다는 사실은 원본 상단 메뉴를 교체해야 할 이유가 아니다.
Shadcn Tabs는 새로 만드는 설정 내부 탭 등에 사용한다.

- [테마](https://ui.shadcn.com/docs/theming): CSS 변수와 `@theme inline`, `.dark`.
- [설정](https://ui.shadcn.com/docs/components-json): 실제 CSS/alias 경로.
- [Tabs](https://ui.shadcn.com/docs/components/tabs): 신규 탭의 controlled 상태와 키보드 접근성.
- [Select](https://ui.shadcn.com/docs/components/select), [Checkbox](https://ui.shadcn.com/docs/components/checkbox): 공유 primitive와 명시적 Label 연결.
- [Card](https://ui.shadcn.com/docs/components/card), [Alert](https://ui.shadcn.com/docs/components/alert): 신규 화면의 표면·안내 조합.

## 신규 UI 강제 규칙

1. 새로운 컨트롤은 `shared/components/ui`의 Button/Input/Select/Checkbox/Switch/Tabs/Dialog를 사용한다.
   native control, 클릭 div, 기능 파일에서 primitive 라이브러리 직접 import를 금지한다.
2. 신규 UI 색상은 primary/foreground/muted/destructive/warning/success 등 의미 토큰으로 지정한다.
   고정 palette/hex, 화면 CSS import, inline chrome style, 테마 재정의를 금지한다.
3. 공유 UI의 크기·타이포·색상은 variant/size로 고른다. 전달하는 className은 배치용으로 제한한다.
   자손 selector나 important로 공유 컴포넌트를 덮어쓰지 않는다.
4. 표면·안내는 Card/Alert/Badge 또는 `common/console-ui`의 ConsolePanel/ConsoleNotice를 사용한다.
5. ConsoleField/ConsoleCheck는 Label을 연결한다. ConsoleSelect는 빈 값을 `value:` 접두사로
   내부 인코딩하여 Radix의 빈 Item 제한을 처리하며 실제 도메인 ID는 바꾸지 않는다.
6. 신규 렌더러 예외는 `configuration/board-preview.tsx`의 승인된 좌표·크기·자산·사용자 색상뿐이다.
   일반 편집 폼이나 테마 변경까지 예외를 확대하지 않는다.

## 기존 코드 보존 검사

`apps/web/scripts/console-legacy-baseline.json`은 이미 반입된 기존 UI/CSS의 경로와 SHA-256을 기록한다.
이 경로는 기존 원본 반입 manifest에 있어야 하며 신규 `marble` 컴포넌트는 추가할 수 없다.
기존 파일은 해시로 보존 여부를 확인하고, 변경되면 원래 외형을 유지했는지와 기준선 diff를 검토한다.
기존 디자인을 Shadcn으로 강제 변환해서 검사를 통과시키지 않는다.

검사는 일반 app route, marble TSX 및 재귀 의존성을 순회한다. **기존 보존 기준선 밖의 코드는
신규 UI 규칙을 적용**하므로 파일을 다른 폴더에 둔다고 검사를 피할 수 없다.
원본 디렉터리 전체를 면제하지 않으며 새 파일이 자동으로 기존 코드의 예외가 되지 않는다.
원본 CSS는 보존하고, 별도 보드 CSS는 일반 콘솔의 테마를 덮어쓰지 않는지 검사한다.

`pnpm --filter @rogimarble/web lint:design`을 웹 test/build에 연결했다.
기준선 불일치나 신규 UI 위반은 CI와 릴리스 빌드를 실패시킨다. 기준선/공유 UI 변경 자체는
코드 검토 대상이며, 이 검사는 모든 동적 코드 패턴에 대한 보안 보증을 의미하지 않는다.

## 검증 범위

웹 단위 테스트는 기존 기준선 보존과 변경 감지, 신규 native control 금지, alias/조건부 className,
색상/크기 override, CSS import, 렌더러 예외를 검증한다.
브라우저는 원본 상단 메뉴가 native tab+이동 밑줄을 유지하는지, 키보드 이동, 신규 컨트롤,
빈 선택값, 홈/초안 상태 유지, 모바일 넘침과 설정 저장/검증/게시·오류 복구를 검사한다.

브라우저 명령은 `CONSOLE_BROWSER_PRODUCTION=1 pnpm --filter @rogimarble/web test:browser`다.
프로덕션 CSP를 유지하고 API는 가상 응답으로 인터셉트한다. 개발 모드만 테스트 브라우저에서
CSP 우회를 사용한다. 실제 DB·후원 수집·실방송·OBS 검증이나 운영 배포를 대신하지 않는다.

2026-09-21 최종 재검증: 원본 틀 복원과 별도 공식 폰트 변경을 합친 상태에서
디자인 검사 192개 소스/기존 46개 파일 기준선 위반 0건, 웹 테스트 35개,
프로덕션 빌드(TypeScript 포함), CSP를 유지한 데스크톱·모바일 브라우저 20개가 통과했다.
상단 native 탭과 이동 밑줄의 외형도 캡처로 확인했다.
이번 콘솔 복원 작업에서는 커밋·푸시·배포하지 않았다.
