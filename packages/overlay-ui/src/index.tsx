'use client';

import { DiceLottie, LandingLottie, TokenLottie } from '@rogimarble/animation';
import { getCellRect, type BoardDefinition } from '@rogimarble/game-core/board';
import { useId, type CSSProperties } from 'react';

export function Board({ board, tokenCellId, moving = false, dice, interactive = false, selectedCellId, onCellSelect, fit = false, effectPhase = 'idle', trailCellIds = [], landingPulseKey, reducedMotion = false }: {
  board: BoardDefinition; tokenCellId: string; moving?: boolean; dice?: readonly number[]; interactive?: boolean; selectedCellId?: string; onCellSelect?: (id: string) => void; fit?: boolean;
  effectPhase?: 'idle' | 'anticipation' | 'reveal' | 'stepping' | 'landing'; trailCellIds?: readonly string[]; landingPulseKey?: string | number; reducedMotion?: boolean;
}) {
  const shadowId = useId().replaceAll(':', '');
  const tokenCell = board.cells.find(c => c.id === tokenCellId) ?? board.cells[0];
  const tokenRect = getCellRect(board, tokenCell.id);

  const presentationPhase = effectPhase === 'anticipation' ? 'rolling' : effectPhase === 'stepping' ? 'moving' : effectPhase;
  return <div className={`board-scroll marble-board ${fit ? 'is-fitted' : ''}`} data-presentation-phase={presentationPhase} style={{ '--board-aspect': board.canvas.width / board.canvas.height } as CSSProperties}><span className="board-scroll-hint">전체 {board.path.length}칸 보드</span><div className="board-stage" style={{ aspectRatio: `${board.canvas.width}/${board.canvas.height}`, backgroundColor: board.canvas.backgroundColor }}>
    <svg className="board-svg" viewBox={`0 0 ${board.canvas.width} ${board.canvas.height}`} role="img" aria-label={`${board.path.length}칸 주루마블 보드`}>
      <defs><filter id={shadowId}><feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity=".13" /></filter></defs>
      {board.cells.map(cell => { const r = getCellRect(board, cell.id); const round = cell.appearance.shape === 'circle' ? Math.min(r.width, r.height) / 2 : 15; const icon = effectIcon(cell.onLand[0]?.type); return <g key={cell.id} className={`board-cell ${selectedCellId === cell.id ? 'selected' : ''} ${trailCellIds.includes(cell.id) ? 'is-trail' : ''}`} onClick={() => interactive && onCellSelect?.(cell.id)} onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCellSelect?.(cell.id); } }} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}>
        <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={round} fill={cell.appearance.fill} stroke={selectedCellId === cell.id ? '#5f3dc4' : cell.appearance.borderColor} strokeWidth={selectedCellId === cell.id ? 4 : 2} filter={`url(#${shadowId})`} />
        <foreignObject x={r.x + 5} y={r.y + 4} width={r.width - 10} height={r.height - 8}><div className="cell-content" style={{ color: cell.appearance.textColor }}>{icon && <span className="cell-icon" aria-hidden="true">{icon}</span>}<span className="cell-label">{cell.label}</span></div></foreignObject>
      </g>; })}
    </svg>
    {board.layout.type === 'perimeter_grid' && <div className="center-widget"><span className="board-kicker">ROGIMARBLE</span><strong className="board-title">주루마블</strong><div className="dice-tray" aria-label={effectPhase === 'anticipation' ? '주사위 굴리는 중' : dice?.length ? `주사위 ${dice.join(', ')}` : '주사위 대기 중'}><DiceLottie active={effectPhase === 'anticipation' || effectPhase === 'reveal'} reducedMotion={reducedMotion} />{effectPhase === 'anticipation' ? <span className="dice-idle dice-rolling-label">주사위 굴리는 중</span> : dice?.length ? dice.map((value, index) => <Die key={`${index}-${value}`} value={value} />) : <span className="dice-idle">주사위 대기 중</span>}</div>{effectPhase !== 'anticipation' && dice?.length ? <span className="dice-total">합계 {dice.reduce((sum, value) => sum + value, 0)}</span> : <span className="board-status">{effectPhase === 'anticipation' ? '결과를 기다리고 있어요' : '방송 조작을 기다리고 있어요'}</span>}{effectPhase === 'landing' && <span className="landing-status">{tokenCell.label} 도착</span>}</div>}
    <div key={landingPulseKey} className={`token-wrapper ${moving ? 'is-moving' : ''} ${effectPhase === 'landing' ? 'is-landing' : ''}`} data-cell-id={tokenCell.id} style={{ left: `${((tokenRect.x + tokenRect.width * .82) / board.canvas.width) * 100}%`, top: `${((tokenRect.y + tokenRect.height * .2) / board.canvas.height) * 100}%` }}><span className="token-base" /><TokenLottie active={moving} /><LandingLottie active={effectPhase === 'landing'} reducedMotion={reducedMotion} /></div>
  </div></div>;
}

function effectIcon(type: string | undefined) {
  return ({ mission: '✓', choice_mission: '?', move_steps: '↗', choose_destination: '⌖', set_direction: '↺', movement_lock: '⏸', modify_roll: '⚄', counter_add: '+', counter_settle: '−', grant_item: '◆' } as Record<string, string>)[type ?? ''] ?? '';
}

function Die({ value }: { value: number }) {
  if (!Number.isInteger(value) || value < 1 || value > 6) return <span className="die die-number" aria-hidden="true">{value}</span>;
  const positions = value === 1 ? [4] : value === 2 ? [0, 8] : value === 3 ? [0, 4, 8] : value === 4 ? [0, 2, 6, 8] : value === 5 ? [0, 2, 4, 6, 8] : [0, 2, 3, 5, 6, 8];
  return <span className="die" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} className={positions.includes(index) ? 'is-pip' : ''} />)}</span>;
}
