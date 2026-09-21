# 구현 계획 서브 에이전트 리뷰

검토일: 2026-09-21. 대상: [주루마블·전체 계획](implementation-plan.md)과 rogi-collector의 `docs/implementation-plan.md`.
계획 초안 작성 뒤 사용자 요청에 따라 서브 에이전트 3명에게 독립 읽기 전용 리뷰를 요청했다.
1차 지적 8건(P1 2건, P2 6건)을 반영했으며 각 리뷰어가 수정 후 재검토했다.
모두 계획 수준에서 해결되었고 재검토에서 추가 P1/P2 지적은 없었다.

이 결과는 앱/수집기 구현, 실플랫폼 연결 또는 배포 검증의 완료를 뜻하지 않는다.

## 1. 검토 범위

| 검토자 | 범위 | 재검토 결과 |
| --- | --- | --- |
| 게임·운영 화면 (`review_game_plan`) | 확정 요구, M/I/V 작업, 보드 효과·운영 명령·OBS 의존성 | G-01/G-02 해결, 추가 P1/P2 없음 |
| 수집·전달 계약 (`review_collector_plan`) | P03/C/I, journal·spool·ACK·cursor·제품 경계 | C-01/C-02/C-03 해결, 새 중대한 충돌 없음 |
| 배포·복구 (`review_delivery_plan`) | P/O/R, 공개 경계·두 EC2·Compose·IaC·복구 | O-01/O-02/O-03 해결, 새 P1/P2 없음 |

기준은 최종 설계, 보드/운영 콘솔/설정 명세, collector 배포 설계, 각 소스 이식 정책이다.
리뷰어는 작업 파일을 편집하지 않았다. 주 에이전트가 근거를 확인하고 계획 및 필요한 상위 계약에 반영했다.

## 2. 지적과 반영

| ID | 중요도 | 지적 / 실패 사례 | 반영 위치와 해결 |
| --- | --- | --- | --- |
| G-01 | P2 | M02의 설정 전체 세션 고정 문구가 같은 방송의 33→34 게시 적용과 충돌 | M02 세션 보드/주사위와 요청별 후원 규칙 snapshot 분리. M06 동일 세션 게시 전/후 검증 |
| G-02 | P2 | M07 완료에 OBS가 필요한데 M04 선행 누락 | M04→M07 DAG/완료 선행 추가. API/폼 착수와 OBS 통합 verified 구분 |
| C-01 | P1 | 높은 offset 먼저 commit/ACK하면 실패한 낮은 offset을 재접속 때 누락 | P03/I01/I02, collector C03: consumer/channel/generation 직렬 수락·연속 cursor·stream epoch, 겹친 stream/역순 완료 검증 |
| C-02 | P1 | 재접속 불확실성이 collector 경고에만 남고 다른 eventId로 게임 이중 실행 | P03/C02/I01: identityStatus/qualityReasons/관련 관측 ID를 journal/spool/replay에 보존. 수락/ACK 후 자동 게임은 검토 보류 |
| C-03 | P2 | cursor 만료/세대 변경 오류 이후 정상 수신으로 재개하는 작업 부재 | P03/C03/I02: ResolveConsumerRecovery·기준점/미복구 범위 원장·영속 단계·멱등 재시도·옛 stream 차단. ACK와 기준점 변경 분리 |
| O-01 | P2 | EC2 교체 plan에서 데이터 EBS가 삭제되어도 기존 기동 시험은 통과 가능 | O02: 독립 lifecycle·삭제/교체 보호·명시적 해제 절차·기존 EBS 재연결/데이터 보존 검증 |
| O-02 | P2 | 앱이 host IMDS나 타 역할/migration 자격증명에 접근 가능 | O01/O02: 역할별 secret/DB mount·one-shot 계정 격리·Docker forwarding 차단·앱 내부 부정 검사 |
| O-03 | P2 | restart=no에서 Compose만 살아 있고 worker가 종료된 채 방치 가능 | O02: 역할별 unit의 실제 종료 감지/재시작, 각 장기 프로세스 강제 종료 후 작업 재개 시험 |

C-01~C-03은 새 기능 확장이 아니라 최종 설계의 중복/누락 방지·불확실 후원 검토·복구 요구를 구체화한 것이다.
문서 간 충돌을 피하려고 [최종 설계](final-design.md), collector의 `docs/deployment-design.md`,
[운영 콘솔 §3.3](operator-console.md#33-수집-중복-의심과-재생-범위-복구)에도 같은 계약을 반영했다.

## 3. 최종 문서 검증과 남은 작업

- 두 저장소 Markdown 16개의 로컬 링크 대상·코드 펜스·공백 검사: 오류 0건.
- 의존 그래프 21개 작업/32개 연결: 작업 누락 및 순환 없음.
- 두 대상 디렉터리 Gitleaks 검사: 탐지 0건. private 원본 코드/이력 반입 없음.
- 이번 변경은 문서뿐이므로 앱 빌드/코어 테스트/실플랫폼/인프라 검증을 새로 수행한 것으로 보고하지 않는다.

실제 완료 증거는 구현 작업마다 만들어야 한다. 첫 착수는 P01→P02→P03이며 이후 M01~M04에서
실제 수동 운영 페이지와 Lottie OBS를 연결한다. 기술 버전/출처 허락/지원 OBS 장비/실제 SOOP 의미/
배포 환경·비용은 해당 작업의 입력과 검증으로 확정한다.

## 4. 반영 재확인

사용자의 리뷰 반영 요청에 따라 8건을 실제 문서와 다시 대조했다. 핵심 변경은 앞선 계획 작성에서 이미
반영되어 있었으며, 이번에는 주 에이전트가 상위 명세와 인수 기준의 연결을 보완했다.

- G-01/G-02: 요청별 후원 규칙 snapshot, 같은 세션의 게시 전/후 검증, M04→M07 선행을 재확인했다.
- C-01/C-02/C-03: 연속 수락/ACK·중복 의심 검토·재개 절차를 두 제품의 출시 검증표에도 명시했다.
  운영 콘솔에는 복구 조회/확정 API, 채널/consumer 범위 명령, 활성 세션 없이 복구하는 인수 시나리오를 추가했다.
- O-01/O-02/O-03: collector 배포 설계에도 EBS 삭제/교체 보호, 역할별 자격증명 격리,
  개별 프로세스 종료 감지/재시작 및 실제 검증 조건을 동일하게 반영했다.

관련 문서: [전체 계획](implementation-plan.md), [최종 설계](final-design.md),
[운영 콘솔](operator-console.md), rogi-collector의 `docs/implementation-plan.md`와 `docs/deployment-design.md`.
계획상 리뷰 미반영 항목은 없다. 실제 서비스 구현과 해당 자동/수동 검증은 각 작업의 완료 조건으로 남는다.
