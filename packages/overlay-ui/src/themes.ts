import type { BoardFontId, BoardThemeId } from '@rogimarble/contracts';

export interface BoardThemeMetadata {
  readonly id: BoardThemeId;
  readonly name: string;
  readonly description: string;
}

export const BOARD_THEMES: readonly BoardThemeMetadata[] = [
  { id: 'lime-clover', name: '라임 클로버', description: '밝은 라임 외곽선과 네잎클로버 모서리 테마' },
  { id: 'pink-bunny', name: '핑크 버니', description: '분홍 외곽선과 토끼 귀 모서리, 작은 아이콘 포인트 테마' },
  { id: 'sky-soda', name: '스카이 소다', description: '탄산처럼 맑은 하늘색과 둥근 버블 포인트 테마' },
  { id: 'lavender-dream', name: '라벤더 드림', description: '부드러운 라벤더와 별빛 꽃 모서리 테마' },
  { id: 'midnight-pop', name: '미드나잇 팝', description: '짙은 네이비에 선명한 핑크 포인트를 더한 테마' },
  { id: 'peach-sorbet', name: '피치 소르베', description: '복숭아와 크림색을 섞은 산뜻한 파스텔 테마' },
] as const;

export interface BoardFontMetadata {
  readonly id: BoardFontId;
  readonly name: string;
  readonly description: string;
}

export const BOARD_FONTS: readonly BoardFontMetadata[] = [
  { id: 'nanum-square-neo', name: '나눔스퀘어 네오', description: '깔끔하고 읽기 편한 기본 고딕' },
  { id: 'jua', name: '주아', description: '둥글고 친근한 방송용 글씨' },
  { id: 'do-hyeon', name: '도현', description: '힘 있고 반듯한 제목용 글씨' },
  { id: 'black-han-sans', name: '검은고딕', description: '굵고 강한 팝 스타일 글씨' },
] as const;

export const BOARD_FONT_FAMILIES: Readonly<Record<BoardFontId, string>> = {
  'nanum-square-neo': 'var(--font-nanum-square-neo)',
  jua: 'var(--font-jua)',
  'do-hyeon': 'var(--font-do-hyeon)',
  'black-han-sans': 'var(--font-black-han-sans)',
};
