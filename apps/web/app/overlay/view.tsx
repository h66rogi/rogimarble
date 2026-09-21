'use client';

import { Board } from '@rogimarble/overlay-ui';
import type { BoardDefinition } from '../../lib/types';

export function Overlay({ board }: { board: BoardDefinition }) {
  return <main className="overlay-shell"><div className="overlay-status">정적 OBS 화면 미리보기 · 실시간 읽기 API 미연결</div><Board board={board} tokenCellId={board.path[0]} /></main>;
}
