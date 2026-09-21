import type { BoardThemeId } from '@rogimarble/contracts';

export interface BoardThemeMetadata {
  readonly id: BoardThemeId;
  readonly name: string;
  readonly description: string;
}

export const BOARD_THEMES: readonly BoardThemeMetadata[] = [
  { id: 'classic-party', name: '클래식 파티', description: '기존 파티 아트와 중앙 타이틀을 사용하는 기본 테마' },
  { id: 'lime-clover', name: '라임 클로버', description: '밝은 라임 외곽선과 네잎클로버 모서리 테마' },
  { id: 'pink-bunny', name: '핑크 버니', description: '분홍 외곽선과 토끼 귀 모서리, 작은 아이콘 포인트 테마' },
] as const;

export function isDecoratedBoardTheme(themeId: BoardThemeId): themeId is 'lime-clover' | 'pink-bunny' {
  return themeId !== 'classic-party';
}
