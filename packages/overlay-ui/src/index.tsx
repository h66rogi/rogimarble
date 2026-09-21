'use client';

import { TokenLottie } from '@rogimarble/animation';
import { getCellRect, type BoardDefinition } from '@rogimarble/game-core/board';
import { useId, type CSSProperties } from 'react';

export function Board({ board, tokenCellId, moving = false, dice, interactive = false, selectedCellId, onCellSelect, fit = false }: {
  board: BoardDefinition; tokenCellId: string; moving?: boolean; dice?: readonly number[]; interactive?: boolean; selectedCellId?: string; onCellSelect?: (id: string) => void; fit?: boolean;
}) {
  const shadowId = useId().replaceAll(':', '');
  const tokenCell = board.cells.find(c => c.id === tokenCellId) ?? board.cells[0];
  const tokenRect = getCellRect(board, tokenCell.id);

  return <div className={`board-scroll marble-board ${fit ? 'is-fitted' : ''}`} style={{ '--board-aspect': board.canvas.width / board.canvas.height } as CSSProperties}><span className="board-scroll-hint">좌우로 밀어 전체 {board.path.length}칸 보기</span><div className="board-stage" style={{ aspectRatio: `${board.canvas.width}/${board.canvas.height}`, backgroundColor: board.canvas.backgroundColor }}>
    <svg className="board-svg" viewBox={`0 0 ${board.canvas.width} ${board.canvas.height}`} role="img" aria-label={`${board.path.length}칸 주루마블 보드`}>
      <defs><filter id={shadowId}><feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity=".13" /></filter></defs>
      {board.cells.map(cell => { const r = getCellRect(board, cell.id); const round = cell.appearance.shape === 'circle' ? Math.min(r.width, r.height) / 2 : 15; return <g key={cell.id} className={`board-cell ${selectedCellId === cell.id ? 'selected' : ''}`} onClick={() => interactive && onCellSelect?.(cell.id)} onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCellSelect?.(cell.id); } }} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}>
        <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={round} fill={cell.appearance.fill} stroke={selectedCellId === cell.id ? '#5f3dc4' : cell.appearance.borderColor} strokeWidth={selectedCellId === cell.id ? 4 : 2} filter={`url(#${shadowId})`} />
        <foreignObject x={r.x + 5} y={r.y + 4} width={r.width - 10} height={r.height - 8}><div className="cell-label" style={{ color: cell.appearance.textColor }}>{cell.label}</div></foreignObject>
      </g>; })}
    </svg>
    <div className="center-widget"><span>이번 주사위</span><strong>{dice?.length ? dice.join(' + ') : '대기 중'}</strong></div>
    <div className={`token-wrapper ${moving ? 'is-moving' : ''}`} style={{ left: `${((tokenRect.x + tokenRect.width / 2) / board.canvas.width) * 100}%`, top: `${((tokenRect.y + tokenRect.height / 2) / board.canvas.height) * 100}%` }}><TokenLottie active={moving} /></div>
  </div></div>;
}
