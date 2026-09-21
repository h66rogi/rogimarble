'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@rogimarble/overlay-ui';
import type { BoardDefinition } from '@rogimarble/game-core/board';
import { validateOverlayLayout, type OverlayLayoutDto, type OverlayStateDto } from '@rogimarble/contracts';
import { CanvasSizeNotice } from '@/integrated-overlay/domains/overlay/components/shared/CanvasSizeNotice';
import { rollPlayback } from '@/integrated-overlay/roll-playback';
import { useRollPresentation } from '@/lib/use-roll-presentation';
import { apiAssetUrl } from '@/lib/api';

type WidgetId = 'board' | 'dice' | 'current_mission' | 'inventory' | 'direction';
type LayoutWidget = { id: WidgetId; enabled: boolean; x: number; y: number; w: number; h: number; z: number };
type TotalLayout = { version: number; aspect: string; width: number; height: number; background: string; widgets: readonly LayoutWidget[] };

const DEFAULT_TOTAL_OVERLAY_LAYOUT: TotalLayout = {
  version: 1,
  aspect: '16:9',
  width: 1920,
  height: 1080,
  background: 'transparent',
  widgets: [
    { id: 'board', enabled: true, x: 0, y: 0, w: 1, h: 1, z: 1 },
    // The board already owns the authoritative dice/Lottie presentation.
    { id: 'dice', enabled: false, x: 0.41, y: 0.39, w: 0.18, h: 0.12, z: 3 },
    { id: 'current_mission', enabled: true, x: 0.39, y: 0.69, w: 0.22, h: 0.095, z: 3 },
    { id: 'inventory', enabled: true, x: 0.51, y: 0.255, w: 0.16, h: 0.075, z: 3 },
    { id: 'direction', enabled: true, x: 0.33, y: 0.255, w: 0.16, h: 0.075, z: 3 },
  ],
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Original total-overlay merge contract, narrowed to Rogimarble widgets. */
function mergeLayout(layout?: Record<string, unknown> | null): TotalLayout {
  if (!layout) return DEFAULT_TOTAL_OVERLAY_LAYOUT;
  try { validateOverlayLayout(layout); } catch { return DEFAULT_TOTAL_OVERLAY_LAYOUT; }
  const parsed: OverlayLayoutDto = layout;
  const declaredRatio = parsed.aspectRatio === '16:9' ? 16 / 9 : parsed.aspectRatio === '9:16' ? 9 / 16 : parsed.aspectRatio === '4:3' ? 4 / 3 : parsed.width / parsed.height;
  if (Math.abs(parsed.width / parsed.height - declaredRatio) > 0.01) return DEFAULT_TOTAL_OVERLAY_LAYOUT;
  const widgetMap = new Map(parsed.widgets.map((widget) => [widget.id, widget]));
  return {
    ...DEFAULT_TOTAL_OVERLAY_LAYOUT,
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
export default function TotalOverlayWidgetPage({ accepted, previewBoard, status }: {
  accepted: AcceptedOverlayState | null;
  previewBoard: BoardDefinition;
  status: 'preview' | 'connecting' | 'live' | 'stale' | 'unauthorized' | 'error';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const observedCommandIdRef = useRef<string | null>(null);
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
    if (!session) { observedSessionRef.current=null;observedCommandIdRef.current=null;return; }
    const command = state?.latestCommand ?? null;
    const sessionKey=`${session.id}:${session.sessionEpoch}`;
    if(observedSessionRef.current!==sessionKey){observedSessionRef.current=sessionKey;observedCommandIdRef.current=command?.commandId??null;return;}
    if(command?.commandId===observedCommandIdRef.current)return;
    observedCommandIdRef.current = command?.commandId ?? null;
    if(playback&&command) presentation.play({commandId:command.commandId,commandType:command.type as 'roll_dice'|'choose_destination'|'cancel_destination'|'resume',sessionKey,presentationEpoch:command.presentationEpoch,finalCellId:session.currentCellId,result:command.result});
  },[session?.id,session?.sessionEpoch,state?.latestCommand?.commandId]);

  const missingLiveBoard = status !== 'preview' && !!state && !state.boardDefinition;
  const waitingForSession = status !== 'preview' && !!state && !state.session;
  const displayStatus = missingLiveBoard && !waitingForSession ? 'error' : status;
  const label = waitingForSession ? '게임 시작 대기' : displayStatus === 'preview' ? 'PREVIEW · 정적 프리셋' : displayStatus === 'live' ? 'LIVE · polling' : displayStatus === 'stale' ? '연결 지연 · 마지막 상태' : displayStatus === 'connecting' ? '연결 중' : displayStatus === 'unauthorized' ? 'OBS 토큰 거부됨' : '오버레이 상태를 불러오지 못함';
  const tokenCellId = missingLiveBoard ? previewBoard.path[0] : presentation.cellId;
  const correctionKey = commandType === 'set_position' ? presentationKey : 'continuous-board';
  const shouldRenderWidgets = status === 'preview' || (!!state && !missingLiveBoard);

  return (
    <div ref={containerRef} className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent" data-total-overlay-source="meloming-overlay">
      <div className="relative overflow-hidden" style={{ width: Math.min(canvasSize.width, canvasSize.height * (totalLayout.width / totalLayout.height)), height: Math.min(canvasSize.height, canvasSize.width / (totalLayout.width / totalLayout.height)), background: totalLayout.background, containerType: 'inline-size' }}>
      {shouldRenderWidgets && totalLayout.widgets.filter((widget) => widget.enabled).map((widget) => {
        const fittedWidth = Math.min(canvasSize.width, canvasSize.height * (totalLayout.width / totalLayout.height));
        const fittedHeight = Math.min(canvasSize.height, canvasSize.width / (totalLayout.width / totalLayout.height));
        const width = fittedWidth * clamp01(widget.w);
        const height = fittedHeight * clamp01(widget.h);
        const left = fittedWidth * clamp01(widget.x);
        const top = fittedHeight * clamp01(widget.y);
        return <div key={widget.id} data-overlay-widget={widget.id} data-overlay-version="1" className="absolute" style={{ left, top, width, height, zIndex: widget.z ?? 1 }}>
          {widget.id === 'board' && <div className="h-full w-full"><Board key={correctionKey} board={board} tokenCellId={tokenCellId} moving={presentation.moving} dice={presentation.dice.length?presentation.dice:playback?.dice} fit effectPhase={presentation.effectPhase} trailCellIds={presentation.trailCellIds} landingPulseKey={presentation.landingPulseKey} reducedMotion={presentation.reducedMotion} pawnImageUrl={state?.pawnAppearance?.image ? apiAssetUrl(state.pawnAppearance.image.url) : null} /></div>}
          {widget.id === 'dice' && <OverlayCard eyebrow="이번 주사위" value={presentation.effectPhase==='anticipation'?'굴리는 중…':(presentation.dice.length?presentation.dice:playback?.dice)?.join(' + ')||'대기 중'} />}
          {widget.id === 'current_mission' && <OverlayCard eyebrow="현재 미션" value={currentMission ? `${currentMission.message} × ${currentMission.quantity}` : '진행 중인 미션 없음'} />}
          {widget.id === 'inventory' && <OverlayCard eyebrow="보유 아이템" value={state?.inventory.length ? state.inventory.map((item) => `${item.name} ${item.quantity}`).join(' · ') : '없음'} align="left" />}
          {widget.id === 'direction' && <OverlayCard eyebrow="이동 방향" value={session?.direction === 'reverse' ? '역방향' : '정방향'} />}
        </div>;
      })}
      {shouldRenderWidgets && displayStatus !== 'live' && <div className="pointer-events-none absolute left-1/2 top-3 z-[101] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs font-semibold text-white backdrop-blur">{label}</div>}
      {!shouldRenderWidgets && <div className="absolute inset-0 grid place-items-center"><div className="rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white">{label}</div></div>}
      </div>
      <CanvasSizeNotice width={canvasSize.width} height={canvasSize.height} />
    </div>
  );
}

function OverlayCard({ eyebrow, value, align = 'center' }: { eyebrow: string; value: string; align?: 'left' | 'center' }) {
  return <div className={`broadcast-hud-card ${align === 'left' ? 'is-left' : ''}`}>
    <div className="broadcast-hud-eyebrow">{eyebrow}</div>
    <div className="broadcast-hud-value">{value}</div>
  </div>;
}
