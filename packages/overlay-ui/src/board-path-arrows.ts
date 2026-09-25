import { getCellRect, type BoardDefinition, type Direction } from '@rogimarble/game-core/board';

export type BoardPathArrow = { readonly fromCellId: string; readonly toCellId: string; readonly x: number; readonly y: number; readonly angle: number };

/** Place one arrow in the gap between each pair of consecutive path cells. */
export function boardPathArrows(board: BoardDefinition, direction: Direction): BoardPathArrow[] {
  const rects = new Map(board.path.map(id => [id, getCellRect(board, id)]));
  const step = direction === 'reverse' ? -1 : 1;
  return board.path.flatMap((fromCellId, index) => {
    const toCellId = board.path[(index + step + board.path.length) % board.path.length];
    const from = rects.get(fromCellId)!;
    const to = rects.get(toCellId)!;
    const dx = to.x + to.width / 2 - from.x - from.width / 2;
    const dy = to.y + to.height / 2 - from.y - from.height / 2;
    if (dx === 0 && dy === 0) return [];
    const edgeDistance = (width: number, height: number) => Math.min(
      dx === 0 ? Infinity : width / (2 * Math.abs(dx)),
      dy === 0 ? Infinity : height / (2 * Math.abs(dy)),
    );
    const fromEdge = edgeDistance(from.width, from.height);
    const toEdge = edgeDistance(to.width, to.height);
    return [{
      fromCellId,
      toCellId,
      x: from.x + from.width / 2 + dx * (1 + fromEdge - toEdge) / 2,
      y: from.y + from.height / 2 + dy * (1 + fromEdge - toEdge) / 2,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    }];
  });
}
