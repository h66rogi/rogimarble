'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Board, BroadcastPanel, BOARD_FONT_FAMILIES } from '@rogimarble/overlay-ui';
import type { BoardDefinition } from '@rogimarble/game-core/board';
import { DEFAULT_MARBLE_OVERLAY_LAYOUT, upgradeLegacyOverlayLayout, validateOverlayLayout, resolveBoardFontId, type BoardFontId, type BoardThemeId, type OverlayLayoutDto, type OverlayStateDto, type OverlayWidgetId } from '@rogimarble/contracts';
import { CanvasSizeNotice } from '@/integrated-overlay/domains/overlay/components/shared/CanvasSizeNotice';
import { rollPlayback } from '@/integrated-overlay/roll-playback';
import { useRollPresentation } from '@/lib/use-roll-presentation';
import { apiAssetUrl } from '@/lib/api';
import { OVERLAY_PARTS } from '@/domains/marble/overlay-parts';
import { RogimarbleChatbox } from '@/integrated-overlay/domains/overlay/components/RogimarbleChatbox';
import { DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT } from '@/domains/overlay/constants/total-layout';

type WidgetId = OverlayWidgetId;
type LayoutWidget = { id: WidgetId; enabled: boolean; x: number; y: number; w: number; h: number; z: number };
type TotalLayout = Pick<OverlayLayoutDto, 'fontId' | 'showPathArrows' | 'widgetStyles' | 'menu' | 'dicePrice'> & { boardThemeId: BoardThemeId; version: number; aspect: string; width: number; height: number; background: string; widgets: readonly LayoutWidget[] };

const DEFAULT_TOTAL_OVERLAY_LAYOUT: TotalLayout = {
  boardThemeId: DEFAULT_MARBLE_OVERLAY_LAYOUT.boardThemeId,
  fontId: DEFAULT_MARBLE_OVERLAY_LAYOUT.fontId,
  showPathArrows: DEFAULT_MARBLE_OVERLAY_LAYOUT.showPathArrows,
  widgetStyles: DEFAULT_MARBLE_OVERLAY_LAYOUT.widgetStyles,
  version: DEFAULT_MARBLE_OVERLAY_LAYOUT.schemaVersion,
  aspect: DEFAULT_MARBLE_OVERLAY_LAYOUT.aspectRatio,
  width: DEFAULT_MARBLE_OVERLAY_LAYOUT.width,
  height: DEFAULT_MARBLE_OVERLAY_LAYOUT.height,
  background: DEFAULT_MARBLE_OVERLAY_LAYOUT.background,
  widgets: DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT.widgets,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Original total-overlay merge contract, narrowed to Rogimarble widgets. */
function mergeLayout(layout?: Record<string, unknown> | null): TotalLayout {
  if (!layout) return DEFAULT_TOTAL_OVERLAY_LAYOUT;
  const compatible = upgradeLegacyOverlayLayout(layout);
  try { validateOverlayLayout(compatible); } catch { return DEFAULT_TOTAL_OVERLAY_LAYOUT; }
  const parsed: OverlayLayoutDto = compatible;
  const declaredRatio = parsed.aspectRatio === '16:9' ? 16 / 9 : parsed.aspectRatio === '9:16' ? 9 / 16 : parsed.aspectRatio === '4:3' ? 4 / 3 : parsed.width / parsed.height;
  if (Math.abs(parsed.width / parsed.height - declaredRatio) > 0.01) return DEFAULT_TOTAL_OVERLAY_LAYOUT;
  const widgetMap = new Map(parsed.widgets.map((widget) => [widget.id, widget]));
  return {
    ...DEFAULT_TOTAL_OVERLAY_LAYOUT,
    boardThemeId: parsed.boardThemeId ?? 'lime-clover',
    fontId: parsed.fontId, showPathArrows: parsed.showPathArrows, widgetStyles: parsed.widgetStyles, menu: parsed.menu, dicePrice: parsed.dicePrice,
    version: parsed.schemaVersion,
    aspect: parsed.aspectRatio,
    width: parsed.width,
    height: parsed.height,
    background: parsed.background,
    widgets: DEFAULT_TOTAL_OVERLAY_LAYOUT.widgets.map((widget) => {
      const update = widgetMap.get(widget.id);
      if (!update) return { ...widget, enabled: false };
      return {
        ...widget,
        enabled: true,
        x: update.bounds.x,
        y: update.bounds.y,
        w: update.bounds.width,
        h: update.bounds.height,
        z: update.z,
      };
    }),
  };
}

export type AcceptedOverlayState = { state: OverlayStateDto; receivedAt: number };

/**
 * Adapted directly from meloming-overlay's total widget page. The original
 * normalized canvas, measured pixel geometry, z-order and widget loop remain
 * authoritative; song-request widgets are replaced by board/status widgets.
 */
export default function TotalOverlayWidgetPage({ accepted, previewBoard, status, widgetId }: {
  accepted: AcceptedOverlayState | null;
  previewBoard: BoardDefinition;
  status: 'preview' | 'connecting' | 'live' | 'stale' | 'unauthorized' | 'error';
  widgetId?: OverlayWidgetId;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const observedRevisionRef = useRef<number | null>(null);
  const observedCellIdRef = useRef<string | null>(null);
  const observedSessionRef = useRef<string | null>(null);
  const state = accepted?.state ?? null;
  const session = state?.session ?? null;
  const board = (state?.boardDefinition ?? previewBoard) as BoardDefinition;
  const totalLayout = useMemo(() => mergeLayout(state?.layout as Record<string, unknown> | null), [state?.layout]);
  const presentationKey = session ? `${session.id}:${session.sessionEpoch}:${session.presentationEpoch}` : 'none';
  const commandType = state?.latestCommand?.type ?? null;
  const presentationCommand = session && state?.latestCommand?.sessionEpoch === session.sessionEpoch
    && state.latestCommand.presentationEpoch === session.presentationEpoch ? state.latestCommand : null;
  const playback = session ? rollPlayback(presentationCommand, board.path, session.currentCellId) : null;
  const presentation = useRollPresentation({sessionKey:session?`${session.id}:${session.sessionEpoch}`:null,presentationEpoch:session?.presentationEpoch??null,authoritativeCellId:session?.currentCellId??board.path[0],boardPath:board.path});
  const visibleDice = presentation.effectPhase==='idle' ? (presentation.dice.length?presentation.dice:playback?.dice) : presentation.dice;
  const currentMission = state?.missions.find((mission) => mission.status === 'pending') ?? null;

  useEffect(() => {
    if (!containerRef.current) return;
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      setCanvasSize({ width, height });
    };
    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!session) { observedSessionRef.current=null;observedRevisionRef.current=null;observedCellIdRef.current=null;return; }
    const sessionKey=`${session.id}:${session.sessionEpoch}`;
    const presentationKey=`${sessionKey}:${session.presentationEpoch}`;
    const commands=(state?.presentationCommands??(state?.latestCommand?[state.latestCommand]:[]))
      .filter(command=>command.sessionEpoch===session.sessionEpoch&&command.presentationEpoch===session.presentationEpoch);
    if(observedSessionRef.current!==presentationKey){observedSessionRef.current=presentationKey;observedRevisionRef.current=commands.at(-1)?.afterRevision??session.revision;observedCellIdRef.current=session.currentCellId;return;}
    const unseen=commands.filter(command=>command.afterRevision>(observedRevisionRef.current??-1));
    for(const command of unseen){
      const fromCellId=command.result&&'fromCellId' in command.result?command.result.fromCellId:null;
      const finalCellId=command.result&&'toCellId' in command.result?command.result.toCellId:null;
      if(typeof fromCellId!=='string'||fromCellId!==observedCellIdRef.current||typeof finalCellId!=='string'||!rollPlayback(command,board.path,finalCellId)){
        observedRevisionRef.current=commands.at(-1)?.afterRevision??session.revision;
        observedCellIdRef.current=session.currentCellId;
        presentation.cancel();
        return;
      }
      observedRevisionRef.current=command.afterRevision;
      observedCellIdRef.current=finalCellId;
      presentation.play({commandId:command.commandId,commandType:command.type as 'roll_dice'|'choose_destination'|'cancel_destination'|'resume',sessionKey,presentationEpoch:command.presentationEpoch,finalCellId,result:command.result});
    }
  },[session?.id,session?.sessionEpoch,session?.presentationEpoch,session?.revision,state?.presentationCommands,state?.latestCommand,board.path,presentation.play,presentation.cancel]);

  const missingLiveBoard = status !== 'preview' && !!state && !state.boardDefinition;
  const waitingForSession = status !== 'preview' && !!state && !state.session;
  const displayStatus = missingLiveBoard && !waitingForSession ? 'error' : status;
  const label = waitingForSession ? '게임 시작 대기' : displayStatus === 'preview' ? 'PREVIEW · 정적 프리셋' : displayStatus === 'live' ? 'LIVE' : displayStatus === 'stale' ? '연결 지연 · 마지막 상태' : displayStatus === 'connecting' ? '연결 중' : displayStatus === 'unauthorized' ? 'OBS 토큰 거부됨' : '오버레이 상태를 불러오지 못함';
  const tokenCellId = missingLiveBoard ? previewBoard.path[0] : presentation.cellId;
  const correctionKey = commandType === 'set_position' ? presentationKey : 'continuous-board';
  const shouldRenderWidgets = status === 'preview' || (!!state && !missingLiveBoard);
  const part = widgetId ? OVERLAY_PARTS.find((item) => item.id === widgetId) : null;
  const canvasWidth = part?.width ?? totalLayout.width;
  const canvasHeight = part?.height ?? totalLayout.height;
  const fittedWidth = Math.min(canvasSize.width, canvasSize.height * canvasWidth / canvasHeight);
  const fittedHeight = Math.min(canvasSize.height, canvasSize.width * canvasHeight / canvasWidth);
  const widgets = widgetId
    ? [{ id: widgetId, enabled: true, x: 0, y: 0, w: 1, h: 1, z: 1 }]
    : totalLayout.widgets.filter((widget) => widget.enabled);

  return (
    <div ref={containerRef} className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent" data-total-overlay-source="meloming-overlay">
      <div className="relative overflow-hidden" style={{ width: fittedWidth, height: fittedHeight, background: widgetId ? 'transparent' : totalLayout.background, containerType: 'inline-size' }}>
      {shouldRenderWidgets && widgets.map((widget) => {
        const width = fittedWidth * clamp01(widget.w);
        const height = fittedHeight * clamp01(widget.h);
        const left = fittedWidth * clamp01(widget.x);
        const top = fittedHeight * clamp01(widget.y);
        const style = totalLayout.widgetStyles?.[widget.id];
        const themeId = style?.themeId ?? totalLayout.boardThemeId;
        const fontId = style?.fontId ?? totalLayout.fontId;
        return <div key={widget.id} data-overlay-widget={widget.id} data-overlay-version="1" className="absolute" style={{ left, top, width, height, zIndex: widget.z ?? 1 }}>
          {widget.id === 'board' && <div className="h-full w-full"><Board key={correctionKey} board={board} themeId={themeId} fontId={fontId} showPathArrows={totalLayout.showPathArrows} direction={session?.direction} tokenCellId={tokenCellId} moving={presentation.moving} dice={visibleDice} rollKey={presentation.rollKey} fit effectPhase={presentation.effectPhase} trailCellIds={presentation.trailCellIds} landingPulseKey={presentation.landingPulseKey} reducedMotion={presentation.reducedMotion} pawnImageUrl={state?.pawnAppearance?.image ? apiAssetUrl(state.pawnAppearance.image.url) : null} pawnStyleId={state?.pawnAppearance?.styleId ?? 'star-medal'} /></div>}
          {(widget.id === 'menu' || widget.id === 'dice_price') && <BroadcastPanel kind={widget.id} layout={{ ...totalLayout, boardThemeId: themeId, fontId }} rules={state?.donationMenu ?? []} />}
          {widget.id === 'dice' && <OverlayCard fontId={fontId} themeId={themeId} eyebrow="이번 주사위" value={presentation.effectPhase==='anticipation'?'굴리는 중…':visibleDice?.join(' + ')||'대기 중'} />}
          {widget.id === 'current_mission' && <OverlayCard fontId={fontId} themeId={themeId} eyebrow="현재 미션" value={currentMission ? `${currentMission.message} × ${currentMission.quantity}` : '진행 중인 미션 없음'} />}
          {widget.id === 'inventory' && <OverlayCard fontId={fontId} themeId={themeId} eyebrow="보유 아이템" value={state?.inventory.length ? state.inventory.map((item) => `${item.name} ${item.quantity}`).join(' · ') : '없음'} align="left" />}
          {widget.id === 'direction' && <OverlayCard fontId={fontId} themeId={themeId} eyebrow="이동 방향" value={session?.direction === 'reverse' ? '역방향' : '정방향'} />}
          {widget.id === 'chatbox' && <RogimarbleChatbox themeId={themeId} fontId={resolveBoardFontId(fontId)} options={style} />}
        </div>;
      })}
      {widgetId !== 'chatbox' && shouldRenderWidgets && displayStatus !== 'live' && <div className="pointer-events-none absolute left-1/2 top-3 z-[101] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs font-semibold text-white backdrop-blur">{label}</div>}
      {widgetId !== 'chatbox' && !shouldRenderWidgets && <div className="absolute inset-0 grid place-items-center"><div className="rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white">{label}</div></div>}
      </div>
      {!widgetId && <CanvasSizeNotice width={canvasSize.width} height={canvasSize.height} />}
    </div>
  );
}

function OverlayCard({ eyebrow, value, themeId, fontId, align = 'center' }: { themeId: BoardThemeId; fontId?: BoardFontId; eyebrow: string; value: string; align?: 'left' | 'center' }) {
  return <div className={`broadcast-hud-card theme-${themeId} ${align === 'left' ? 'is-left' : ''}`} data-board-font={resolveBoardFontId(fontId)} style={{ fontFamily: BOARD_FONT_FAMILIES[resolveBoardFontId(fontId)] }}>
    <div className="broadcast-hud-eyebrow">{eyebrow}</div>
    <div className="broadcast-hud-value">{value}</div>
  </div>;
}
