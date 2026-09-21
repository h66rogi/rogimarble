'use client';

import { DiceLottie, LandingLottie, TokenLottie } from '@rogimarble/animation';
import { getCellRect, type BoardDefinition, type BoardEffect } from '@rogimarble/game-core/board';
import { useId, type CSSProperties, type ReactNode } from 'react';

export function Board({ board, tokenCellId, moving = false, dice, interactive = false, selectedCellId, onCellSelect, fit = false, effectPhase = 'idle', trailCellIds = [], landingPulseKey, reducedMotion = false, pawnImageUrl }: {
  board: BoardDefinition; tokenCellId: string; moving?: boolean; dice?: readonly number[]; interactive?: boolean; selectedCellId?: string; onCellSelect?: (id: string) => void; fit?: boolean;
  effectPhase?: 'idle' | 'anticipation' | 'reveal' | 'stepping' | 'landing'; trailCellIds?: readonly string[]; landingPulseKey?: string | number; reducedMotion?: boolean; pawnImageUrl?: string | null;
}) {
  const displayBoard = board;
  const shadowId = useId().replaceAll(':', '');
  const tokenCell = displayBoard.cells.find(c => c.id === tokenCellId) ?? displayBoard.cells[0];
  const tokenRect = getCellRect(displayBoard, tokenCell.id);
  const presentationPhase = effectPhase === 'anticipation' ? 'rolling' : effectPhase === 'stepping' ? 'moving' : effectPhase;
  const rollingDiceCount = Math.max(1, dice?.length || displayBoard.dice.count);

  return <div className={`board-scroll marble-board ${fit ? 'is-fitted' : ''}`} data-presentation-phase={presentationPhase} style={{ '--board-aspect': displayBoard.canvas.width / displayBoard.canvas.height } as CSSProperties}>
    <span className="board-scroll-hint">전체 {displayBoard.path.length}칸 보드</span>
    <div className="board-stage" style={{ aspectRatio: `${displayBoard.canvas.width}/${displayBoard.canvas.height}`, backgroundColor: displayBoard.canvas.backgroundColor }}>
      <div className="board-party-accent board-party-accent-left" aria-hidden="true" />
      <div className="board-party-accent board-party-accent-right" aria-hidden="true" />
      <svg className="board-svg" viewBox={`0 0 ${displayBoard.canvas.width} ${displayBoard.canvas.height}`} role="img" aria-label={`${displayBoard.path.length}칸 주루마블 보드`}>
        <defs><filter id={shadowId} x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#7a284f" floodOpacity=".18" /></filter></defs>
        {displayBoard.cells.map((cell) => {
          const r = getCellRect(displayBoard, cell.id);
          const corner = cell.appearance.shape === 'circle';
          const round = corner ? Math.min(r.width, r.height) / 2 : Math.min(r.width, r.height) * .13;
          return <g key={cell.id} className={`board-cell ${corner ? 'is-corner' : ''} ${selectedCellId === cell.id ? 'selected' : ''} ${trailCellIds.includes(cell.id) ? 'is-trail' : ''}`} onClick={() => interactive && onCellSelect?.(cell.id)} onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCellSelect?.(cell.id); } }} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}>
            <rect className="cell-shadow" x={r.x} y={r.y + 8} width={r.width} height={r.height - 3} rx={round} fill="#d96a97" opacity=".32" />
            <rect className="cell-face" x={r.x} y={r.y} width={r.width} height={r.height - 7} rx={round} fill={cell.appearance.fill} stroke={selectedCellId === cell.id ? '#6b2450' : cell.appearance.borderColor} strokeWidth={selectedCellId === cell.id ? 6 : 3} filter={`url(#${shadowId})`} />
            <foreignObject x={r.x + 10} y={r.y + 8} width={r.width - 20} height={r.height - 22}><div className="cell-content" style={{ color: cell.appearance.textColor }}><span className="cell-number">{displayBoard.path.indexOf(cell.id) + 1}</span><span className="cell-icon" aria-hidden="true"><ArtworkIcon assetId={cell.appearance.artwork?.type === 'image' ? cell.appearance.artwork.assetId : null} fallback={cell.onLand[0]} isStart={cell.id === displayBoard.startCellId} /></span><span className="cell-label">{cell.label}</span></div></foreignObject>
          </g>;
        })}
      </svg>
      {displayBoard.layout.type === 'perimeter_grid' && <div className="center-widget">
        <span className="center-art center-art-toast" aria-hidden="true" />
        <span className="center-art center-art-heart" aria-hidden="true" />
        <span className="board-kicker">ROGI&apos;S PARTY BOARD</span>
        <strong className="board-title"><span>주루</span><span>마블</span></strong>
        <div className="dice-tray" aria-label={effectPhase === 'anticipation' ? `주사위 ${rollingDiceCount}개 굴리는 중` : dice?.length ? `주사위 ${dice.join(', ')}` : '주사위 대기 중'}>
          <DiceLottie active={effectPhase === 'anticipation'} reducedMotion={reducedMotion} count={rollingDiceCount} />
          {effectPhase === 'anticipation' ? <span className="dice-idle dice-rolling-label">주사위 굴리는 중</span> : dice?.length ? dice.map((value, index) => <Die key={`${index}-${value}`} value={value} />) : <><span className="die die-number idle-die" aria-hidden="true">?</span><span className="dice-idle">주사위를 굴려 주세요</span></>}
        </div>
        {effectPhase !== 'anticipation' && dice?.length ? <span className="dice-total">합계 {dice.reduce((sum, value) => sum + value, 0)}</span> : <span className="board-status">{effectPhase === 'anticipation' ? '결과를 기다리고 있어요' : '오늘도 즐겁게 출발!'}</span>}
        {effectPhase === 'landing' && <span className="landing-status">{tokenCell.label} 도착</span>}
      </div>}
      <div key={landingPulseKey} className={`token-wrapper ${moving ? 'is-moving' : ''} ${effectPhase === 'landing' ? 'is-landing' : ''}`} data-cell-id={tokenCell.id} style={{ left: `${((tokenRect.x + tokenRect.width * .82) / displayBoard.canvas.width) * 100}%`, top: `${((tokenRect.y + tokenRect.height * .55) / displayBoard.canvas.height) * 100}%` }}>
        <span className="token-base" />
        {pawnImageUrl ? <span className="photo-pawn"><img src={pawnImageUrl} alt="" /></span> : <TokenLottie active={moving} />}
        <LandingLottie active={effectPhase === 'landing'} reducedMotion={reducedMotion} />
      </div>
    </div>
  </div>;
}

const artworkClasses: Record<string, string> = {
  'party-toast-v1': 'party-toast',
  'party-toast': 'party-toast',
  'party-island-v1': 'party-island',
  'party-island': 'party-island',
  'party-travel-v1': 'party-travel',
  'party-travel': 'party-travel',
  'party-heart-v1': 'party-heart',
  'party-heart': 'party-heart',
  'party-music-v1': 'party-music',
  'party-music': 'party-music',
  'party-shield-v1': 'party-shield',
  'party-shield': 'party-shield',
  'party-snack-v1': 'mission-snack',
  'party-kiss-v1': 'mission-kiss',
  'party-punch-v1': 'mission-punch',
  'party-talk-v1': 'mission-talk',
  'party-turn-v1': 'mission-turn',
  'party-bank-v1': 'mission-bank',
};

function ArtworkIcon({ assetId, fallback, isStart }: { assetId: string | null; fallback: BoardEffect | undefined; isStart: boolean }) {
  const className = assetId ? artworkClasses[assetId] : null;
  return className ? <span className={`party-art ${className}`} /> : <EffectIcon effect={fallback} isStart={isStart} />;
}

function EffectIcon({ effect, isStart = false }: { effect: BoardEffect | undefined; isStart?: boolean }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  if (isStart) body = <><path d="M7 21V4"/><path d="M7 5h10l-2 3 2 3H7"/><path d="M4 21h7"/></>;
  else switch (effect?.type) {
    case 'mission': case 'choice_mission': body = <><path d="M8 5h8M8 9h8M8 13h5"/><path d="M6 3h12a2 2 0 0 1 2 2v14H4V5a2 2 0 0 1 2-2Z"/></>; break;
    case 'movement_lock': body = <><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>; break;
    case 'choose_destination': body = <><circle cx="12" cy="10" r="3"/><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z"/></>; break;
    case 'set_direction': body = <><path d="M4 8h12l-3-3M20 16H8l3 3"/></>; break;
    case 'modify_roll': body = <><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/></>; break;
    case 'counter_add': case 'counter_settle': body = <><path d="M7 8c1-3 9-3 10 0 1 4-2 9-5 12-3-3-6-8-5-12Z"/><path d="M9 5c1-2 5-2 6 0"/></>; break;
    case 'grant_item': body = <><path d="M4 9h16v11H4zM3 9h18V6H3zM12 6v14M8 3c2 0 4 3 4 3s2-3 4-3"/></>; break;
    case 'move_steps': body = <><path d="m5 17 12-12M10 5h7v7"/><path d="M5 7v10h10"/></>; break;
    default: body = <><path d="M7 12h10"/><path d="m12 5 .7 2.1L15 8l-2.3.9L12 11l-.7-2.1L9 8l2.3-.9Z"/></>;
  }
  return <svg {...common}>{body}</svg>;
}

function Die({ value }: { value: number }) {
  if (!Number.isInteger(value) || value < 1 || value > 6) return <span className="die die-number" aria-hidden="true">{value}</span>;
  const positions = value === 1 ? [4] : value === 2 ? [0, 8] : value === 3 ? [0, 4, 8] : value === 4 ? [0, 2, 6, 8] : value === 5 ? [0, 2, 4, 6, 8] : [0, 2, 3, 5, 6, 8];
  return <span className="die" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} className={positions.includes(index) ? 'is-pip' : ''} />)}</span>;
}
