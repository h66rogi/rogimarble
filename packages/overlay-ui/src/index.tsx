'use client';

import { DefaultPawn, DiceLottie, LandingLottie } from '@rogimarble/animation';
import type { BoardFontId, BoardThemeId, PawnStyleId } from '@rogimarble/contracts';
import { getCellRect, type BoardDefinition, type BoardEffect } from '@rogimarble/game-core/board';
import { type CSSProperties, type ReactNode } from 'react';
export { BOARD_FONT_FAMILIES, BOARD_FONTS, BOARD_THEMES, type BoardFontMetadata, type BoardThemeMetadata } from './themes';
export { BroadcastPanel, resolveBroadcastPanel } from './broadcast-panel';

export function Board({ board, tokenCellId, moving = false, dice, interactive = false, selectedCellId, selectedCellAction, onCellSelect, fit = false, effectPhase = 'idle', trailCellIds = [], landingPulseKey, reducedMotion = false, pawnImageUrl, pawnStyleId = 'star-medal', themeId = 'lime-clover', fontId = 'nanum-square-neo' }: {
  board: BoardDefinition; tokenCellId: string; moving?: boolean; dice?: readonly number[]; interactive?: boolean; selectedCellId?: string; selectedCellAction?: ReactNode; onCellSelect?: (id: string) => void; fit?: boolean;
  effectPhase?: 'idle' | 'anticipation' | 'reveal' | 'stepping' | 'landing'; trailCellIds?: readonly string[]; landingPulseKey?: string | number; reducedMotion?: boolean; pawnImageUrl?: string | null; pawnStyleId?: PawnStyleId;
  themeId?: BoardThemeId;
  fontId?: BoardFontId;
}) {
  const displayBoard = board;
  const tokenCell = displayBoard.cells.find(c => c.id === tokenCellId) ?? displayBoard.cells[0];
  const tokenRect = getCellRect(displayBoard, tokenCell.id);
  const selectedCell = displayBoard.cells.find(c => c.id === selectedCellId);
  const selectedRect = selectedCell ? getCellRect(displayBoard, selectedCell.id) : null;
  const actionSide = selectedRect
    ? Math.abs((selectedRect.y + selectedRect.height / 2) / displayBoard.canvas.height - .5) >= Math.abs((selectedRect.x + selectedRect.width / 2) / displayBoard.canvas.width - .5)
      ? selectedRect.y + selectedRect.height / 2 < displayBoard.canvas.height / 2 ? 'below' : 'above'
      : selectedRect.x + selectedRect.width / 2 < displayBoard.canvas.width / 2 ? 'right' : 'left'
    : null;
  const actionX = selectedRect && (actionSide === 'right' ? selectedRect.x + selectedRect.width : actionSide === 'left' ? selectedRect.x : selectedRect.x + selectedRect.width / 2);
  const actionY = selectedRect && (actionSide === 'below' ? selectedRect.y + selectedRect.height : actionSide === 'above' ? selectedRect.y : selectedRect.y + selectedRect.height / 2);
  const actionSafeArea = interactive && selectedRect && selectedCellAction ? getActionSafeArea(displayBoard) : null;
  const actionLeft = actionSafeArea && (actionSide === 'below' || actionSide === 'above')
    ? `clamp(calc(${actionSafeArea.left / displayBoard.canvas.width * 100}% + var(--board-action-half-width) + var(--board-action-gap)), ${((actionX ?? 0) / displayBoard.canvas.width) * 100}%, calc(${actionSafeArea.right / displayBoard.canvas.width * 100}% - var(--board-action-half-width) - var(--board-action-gap)))`
    : `${((actionX ?? 0) / displayBoard.canvas.width) * 100}%`;
  const actionTop = actionSafeArea && (actionSide === 'right' || actionSide === 'left')
    ? `clamp(calc(${actionSafeArea.top / displayBoard.canvas.height * 100}% + var(--board-action-half-height) + var(--board-action-gap)), ${((actionY ?? 0) / displayBoard.canvas.height) * 100}%, calc(${actionSafeArea.bottom / displayBoard.canvas.height * 100}% - var(--board-action-half-height) - var(--board-action-gap)))`
    : `${((actionY ?? 0) / displayBoard.canvas.height) * 100}%`;
  const presentationPhase = effectPhase === 'anticipation' ? 'rolling' : effectPhase === 'stepping' ? 'moving' : effectPhase;
  const rollingDiceCount = Math.max(1, dice?.length || displayBoard.dice.count);

  const showThemeDecorations = displayBoard.layout.type === 'perimeter_grid';

  const pastelTheme = themeId === 'sky-soda' || themeId === 'lavender-dream' || themeId === 'midnight-pop' || themeId === 'peach-sorbet';

  return <div className={`board-scroll marble-board ${fit ? 'is-fitted' : ''} ${pastelTheme ? 'is-pastel-theme' : ''}`} data-board-theme={themeId} data-board-font={fontId} data-presentation-phase={presentationPhase} style={{ '--board-aspect': displayBoard.canvas.width / displayBoard.canvas.height } as CSSProperties}>
    <span className="board-scroll-hint">전체 {displayBoard.path.length}칸 보드</span>
    <div className="board-stage" style={{ aspectRatio: `${displayBoard.canvas.width}/${displayBoard.canvas.height}`, backgroundColor: 'transparent' }}>
      <svg className="board-svg" viewBox={`0 0 ${displayBoard.canvas.width} ${displayBoard.canvas.height}`} role="img" aria-label={`${displayBoard.path.length}칸 주루마블 보드`}>
        {showThemeDecorations && <ThemeCorners board={displayBoard} themeId={themeId} />}
        {displayBoard.cells.map((cell) => {
          const r = getCellRect(displayBoard, cell.id);
          const corner = cell.appearance.shape === 'circle';
          const spatialCorner = displayBoard.layout.type === 'perimeter_grid' && cell.position.type === 'grid' &&
            (cell.position.row === 0 || cell.position.row === displayBoard.layout.rows - 1) &&
            (cell.position.column === 0 || cell.position.column === displayBoard.layout.columns - 1);
          const round = corner ? Math.min(r.width, r.height) / 2 : Math.min(r.width, r.height) * .13;
          return <g key={cell.id} className={`board-cell ${corner ? 'is-corner' : ''} ${spatialCorner ? 'is-spatial-corner' : ''} ${selectedCellId === cell.id ? 'selected' : ''} ${trailCellIds.includes(cell.id) ? 'is-trail' : ''}`} onClick={() => interactive && onCellSelect?.(cell.id)} onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCellSelect?.(cell.id); } }} role={interactive ? 'button' : undefined} aria-label={interactive ? `${displayBoard.path.indexOf(cell.id) + 1}번 ${cell.label}` : undefined} tabIndex={interactive ? 0 : undefined}>
            <rect className="cell-shadow" x={r.x} y={r.y + 8} width={r.width} height={r.height - 3} rx={round} fill="#d96a97" opacity=".32" />
            <rect className="cell-face" x={r.x} y={r.y} width={r.width} height={r.height - 7} rx={round} fill={cell.appearance.fill} stroke={selectedCellId === cell.id ? '#6b2450' : cell.appearance.borderColor} strokeWidth={selectedCellId === cell.id ? 6 : 3} />
            <foreignObject x={r.x + 10} y={r.y + 8} width={r.width - 20} height={r.height - 22}><div className="cell-content" style={{ color: cell.appearance.textColor }}><span className="cell-number">{displayBoard.path.indexOf(cell.id) + 1}</span><span className="cell-icon" aria-hidden="true"><ArtworkIcon assetId={cell.appearance.artwork?.type === 'image' ? cell.appearance.artwork.assetId : null} fallback={cell.onLand[0]} isStart={cell.id === displayBoard.startCellId} /></span><span className="cell-label" data-long={cell.label.length > 8 || undefined}>{cell.label}</span></div></foreignObject>
          </g>;
        })}
      </svg>
      {interactive && selectedRect && actionSide && selectedCellAction && <div className="board-cell-action" data-side={actionSide} style={{ left: actionLeft, top: actionTop }}>{selectedCellAction}</div>}
      {displayBoard.layout.type === 'perimeter_grid' && effectPhase !== 'idle' && <div className="center-widget">
        <div className="dice-tray" aria-label={effectPhase === 'anticipation' ? `주사위 ${rollingDiceCount}개 굴리는 중` : dice?.length ? `주사위 ${dice.join(', ')}` : '주사위 대기 중'}>
          <DiceLottie active={effectPhase === 'anticipation'} reducedMotion={reducedMotion} count={rollingDiceCount} />
          {effectPhase === 'anticipation' ? <span className="dice-idle dice-rolling-label">주사위 굴리는 중</span> : dice?.length ? dice.map((value, index) => <Die key={`${index}-${value}`} value={value} />) : <><span className="die die-number idle-die" aria-hidden="true">?</span><span className="dice-idle">주사위를 굴려 주세요</span></>}
        </div>
        {effectPhase !== 'anticipation' && dice?.length ? <span className="dice-total">합계 {dice.reduce((sum, value) => sum + value, 0)}</span> : <span className="board-status">{effectPhase === 'anticipation' ? '결과를 기다리고 있어요' : '오늘도 즐겁게 출발!'}</span>}
        {effectPhase === 'landing' && <span className="landing-status">{tokenCell.label} 도착</span>}
      </div>}
      <div key={landingPulseKey} className={`token-wrapper ${pawnImageUrl ? 'has-photo-pawn' : ''} ${moving ? 'is-moving' : ''} ${effectPhase === 'landing' ? 'is-landing' : ''}`} data-cell-id={tokenCell.id} data-pawn-style={pawnImageUrl ? 'photo' : pawnStyleId} style={{ left: `${((tokenRect.x + tokenRect.width * (pawnImageUrl ? .82 : .93)) / displayBoard.canvas.width) * 100}%`, top: `${((tokenRect.y + tokenRect.height * .55) / displayBoard.canvas.height) * 100}%` }}>
        {pawnImageUrl ? <><span className="token-base" /><span className="photo-pawn"><img src={pawnImageUrl} alt="" /></span></> : <DefaultPawn active={moving} styleId={pawnStyleId} />}
        <LandingLottie active={effectPhase === 'landing'} reducedMotion={reducedMotion} />
      </div>
    </div>
  </div>;
}

function getActionSafeArea(board: BoardDefinition) {
  const { width, height } = board.canvas;
  if (board.layout.type !== 'perimeter_grid') return { left: 0, right: width, top: 0, bottom: height };
  const { columns, rows } = board.layout;
  const cells = board.cells.filter(cell => cell.position.type === 'grid');
  const rectsAt = (predicate: (row: number, column: number) => boolean) =>
    cells.filter(cell => cell.position.type === 'grid' && predicate(cell.position.row, cell.position.column)).map(cell => getCellRect(board, cell.id));
  const left = Math.max(0, ...rectsAt((_, column) => column === 0).map(rect => rect.x + rect.width));
  const right = Math.min(width, ...rectsAt((_, column) => column === columns - 1).map(rect => rect.x));
  const top = Math.max(0, ...rectsAt((row) => row === 0).map(rect => rect.y + rect.height));
  const bottom = Math.min(height, ...rectsAt((row) => row === rows - 1).map(rect => rect.y));
  return { left, right, top, bottom };
}

function ThemeCorners({ board, themeId }: { board: BoardDefinition; themeId: BoardThemeId }) {
  if (board.layout.type !== 'perimeter_grid') return null;
  const layout = board.layout;
  const cornerCells = board.cells.filter(cell => cell.position.type === 'grid' &&
    (cell.position.row === 0 || cell.position.row === layout.rows - 1) &&
    (cell.position.column === 0 || cell.position.column === layout.columns - 1));
  return <g className="theme-corners" aria-hidden="true">{cornerCells.map(cell => {
    const rect = getCellRect(board, cell.id);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const size = Math.min(rect.width, rect.height) * .82;
    if (themeId === 'lime-clover') return <g key={cell.id} className="theme-corner theme-clover" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><path d="M0-34C-32-70-70-32-34 0C-70 32-32 70 0 34C32 70 70 32 34 0C70-32 32-70 0-34Z"/></g>;
    if (themeId === 'pink-bunny') return <g key={cell.id} className="theme-corner theme-bunny" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><path d="M-35-10C-43-35-39-57-27-59C-16-61-10-39-8-23C-3-25 3-25 8-23C10-39 16-61 27-59C39-57 43-35 35-10C62 21 38 54 0 54C-38 54-62 21-35-10Z"/><path className="bunny-ear" d="M-28-49c-3 10-2 21 1 30M28-49c3 10 2 21-1 30"/><circle className="bunny-eye" cx="-15" cy="13" r="3"/><circle className="bunny-eye" cx="15" cy="13" r="3"/><path className="bunny-face" d="M-5 24Q0 29 5 24"/></g>;
    if (themeId === 'sky-soda') return <g key={cell.id} className="theme-corner theme-bubbles" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><circle cx="-24" cy="9" r="31"/><circle cx="17" cy="-17" r="35"/><circle cx="30" cy="25" r="22"/><circle className="bubble-shine" cx="27" cy="-27" r="8"/></g>;
    if (themeId === 'lavender-dream') return <g key={cell.id} className="theme-corner theme-dream" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><path d="M0-55C9-23 23-9 55 0C23 9 9 23 0 55C-9 23-23 9-55 0C-23-9-9-23 0-55Z"/><circle cx="33" cy="-32" r="9"/><circle cx="-34" cy="31" r="7"/></g>;
    if (themeId === 'midnight-pop') return <g key={cell.id} className="theme-corner theme-pop" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><path d="M0-58L15-34L43-43L34-15L58 0L34 15L43 43L15 34L0 58L-15 34L-43 43L-34 15L-58 0L-34-15L-43-43L-15-34Z"/><circle r="25"/></g>;
    return <g key={cell.id} className="theme-corner theme-peach" transform={`translate(${cx} ${cy}) scale(${size / 100})`}><path d="M0-51C18-58 35-43 32-24C53-22 62-1 49 15C62 34 43 53 23 45C12 65-14 64-24 44C-45 53-63 33-49 14C-63-4-50-25-29-24C-32-43-17-57 0-51Z"/><path className="peach-leaf" d="M0-47C12-62 28-63 38-57C31-43 18-38 3-41Z"/></g>;
  })}</g>;
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
  'party-instant-camera-v1': 'mission-camera',
  'party-start-flag-v1': 'party-start-flag',
  'party-empty-gift-v1': 'party-empty-gift',
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
