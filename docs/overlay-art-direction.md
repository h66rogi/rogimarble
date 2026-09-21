# 주루마블 방송 화면과 제작 이미지

2026-09-21 사용자 요청: OBS 1920×1080, 일반 주사위 1개 / 무인도 탈출 2개,
직접 올린 프로필 사진 말, 실제 주루마블 사례를 검토한 방송용 디자인.

## 직접 확인한 시각 자료

웹 페이지/상품 이미지의 브라우저 화면을 직접 열어 비교했다. 타사 그림은 앱에 복사하지 않는다.

| 자료 | 확인한 특징 | 적용 판단 |
| --- | --- | --- |
| [모두의 술판](https://www.coupang.com/vp/products/5381107180) | 큰 중앙 타이틀, 칸별 캐릭터, 강조된 모서리 | 제목과 주사위에 시선 집중. 방송에서는 모든 칸을 정방향으로 읽도록 유지 |
| [모두의 여름](https://www.ebay.com/itm/273891096108) | 야자수·해변 그림, 색으로 구분한 칸, 넓은 중앙 | 무인도·여행 등에 구별되는 일러스트, 읽기 쉬운 간격 |
| [주막마블](https://web.joongna.com/product/113156957) | 전통 주막 주제, 반복 아이콘, 코너별 강조 | 하나의 일관된 그림 스타일을 사용하고 특별 동작은 명확히 구분 |
| [블라썸 방송 게임](https://errorledger.com/games/drinking-marble/) | 중앙의 큰 단일 주사위와 독립된 운영 제어 영역 | OBS에는 판과 게임 결과를 표시하고 편집 조작은 관리 화면에 유지 |
| [Warudo 주루마블](https://booth.pm/ja/items/7813023) | 큰 입체 타이틀, 중앙 주사위와 말판의 존재감 | 작은 일반 대시보드 카드가 아닌 방송 무대 크기로 제목·주사위 배치 |

아트머그 검색 이미지도 조사했으나 상세 이미지가 404여서 직접 확인한 사례에 포함하지 않았다.
위 페이지의 기능·정책을 복제하거나 해당 상품의 그림을 사용한 것이 아니다.

## 구현 기준

- 기준 캔버스 1920×1080, 사용자 제공 9×6 외곽 26칸과 stable ID/이동 경로 보존.
- 핑크·크림·민트와 버건디 윤곽선, 큰 한글 칸 이름, 그림과 글자의 분리.
- 칸 일러스트는 `appearance.artwork.assetId` 데이터로 선택한다. 문구로 동작을 판단하지 않는다.
- 주사위 숫자는 서버 결과만 사용. 일반 굴림과 무인도 판정의 주사위 수를 연출에도 동일하게 반영한다.
- 사진 말과 좌표 이동/도착 Lottie는 분리한다. 사진 미등록 시 기본 말로 표시한다.
- 사진은 채널 설정에서 업로드·교체·제거하며 운영 이미지와 개인정보를 Git에 저장하지 않는다.

## 생성 자산과 원문 프롬프트

내장 `image_gen`으로 신규 제작했다(CLI/API 키 사용 없음). 첫 atlas는 신규 생성,
두 번째는 첫 생성물을 스타일 참조로 사용했다. 외부 상품/작가 이미지를 입력하거나 복사하지 않았다.
PNG 원본 alpha를 그대로 보존하며 파일을 잘라내지 않고 atlas 좌표로 표시한다.

- `apps/web/public/artwork/jurumarble-party-atlas.png`: 1536×1024, 3×2. 건배/무인도/여행/하트/마이크/실드.
- `apps/web/public/artwork/jurumarble-mission-atlas.png`: 1536×1024, 3×2. 안주/키스/글러브/대화/방향/적립.

### 첫 atlas

```text
Create one original premium illustrated asset sheet for a Korean livestream party board game called Jurumarble. NO text, NO letters, NO numbers, NO logo, NO dice. Transparent alpha background. A precisely aligned 3 columns by 2 rows sprite atlas with six fully isolated sticker illustrations, each centered in its equal square cell, generous 12% transparent padding, no item crossing cell boundaries. Top left: mint green soju bottle with blank cream label and two small clinking clear pink shot glasses with white highlight sparkles. Top middle: tiny sandy deserted tropical island with a curving mint palm, pink beach umbrella, turquoise shallow water. Top right: cream and blush pink toy airplane flying around a tiny mint globe with a pink swoosh. Bottom left: glossy strawberry pink heart with cream ribbon, tiny sparkles. Bottom middle: blush pink retro microphone with mint music notes and tiny star. Bottom right: mint and cream protective shield with a raised pink heart emblem and small sparkles. Unified art direction: very polished cute 2.5D editorial game illustration, soft sculpted enamel/clay depth, clean burgundy fine outlines, creamy off-white highlights, peach pink and sage mint palette, subtle soft contact shadows contained within each sticker, crisp distinct silhouettes recognizable at 64px, sophisticated Korean stationery / playful board game aesthetic, not childish clipart. Front three-quarter view for each icon, softly lit, exquisite coherent craftsmanship. Transparent space must really be alpha, no checkerboard painted in the image. 1536x1024 landscape.
```

### 두 번째 atlas

```text
Create a second matching icon atlas for an original Korean livestream party board game. Use attached first atlas as art-direction reference only: burgundy fine outlines, cream highlights, soft sculpted glossy enamel / 2.5D stationery illustration, pink and sage mint palette. New content, not same icons. Transparent alpha background, no text or letters or numbers. Exactly 3 columns and 2 rows of isolated sticker illustrations centered within equal 512x512 cells in a 1536x1024 canvas, keep 12 percent empty transparent safe padding within each cell. Top left: cute bowl of golden crispy snacks and a tiny pair of mint chopsticks. Top middle: pink glossy cartoon lips blowing one small heart kiss. Top right: one peach pink boxing glove with small cream impact sparkles, friendly playful gesture. Bottom left: two overlapping cream and mint speech bubbles containing only a pink heart and a pink question mark pictogram. Bottom middle: cream retro arrow curving back left, mint border with one small pink sparkle; no dice or other objects. Bottom right: a tiny pink piggy bank with a cream coin floating above, mint accents. Coherent polished broadcast game artwork, not flat emoji, each silhouette distinctive, gentle local contact shadows only, background completely transparent real alpha, no painted background or checkerboard. Match reference craftsmanship without additional decorations outside six cells.
```
