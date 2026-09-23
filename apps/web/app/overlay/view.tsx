'use client';

import type { BoardDefinition } from '@rogimarble/game-core/board';
import type { OverlayStateDto, OverlayWidgetId } from '@rogimarble/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import TotalOverlayWidgetPage, { type AcceptedOverlayState } from '@/integrated-overlay/app/overlay/[token]/widgets/total/page';
import { isNewerOverlayState } from '@/integrated-overlay/snapshot-order';
import { useRogimarbleOverlaySocket } from '@/integrated-overlay/domains/overlay/hooks/use-rogimarble-overlay-socket';
import { ChatMessagesProvider, useChatMessagesActions } from '@/integrated-overlay/domains/overlay/contexts/chat-messages-context';

const POLL_MS = 1_000;
const STALE_MS = 5_000;

export function Overlay({ board, widgetId }: { board: BoardDefinition; widgetId?: OverlayWidgetId }) {
  return <ChatMessagesProvider><OverlayContent board={board} widgetId={widgetId} /></ChatMessagesProvider>;
}

function OverlayContent({ board, widgetId }: { board: BoardDefinition; widgetId?: OverlayWidgetId }) {
  const [accepted, setAccepted] = useState<AcceptedOverlayState | null>(null);
  const [status, setStatus] = useState<'preview' | 'connecting' | 'live' | 'stale' | 'unauthorized' | 'error'>('preview');
  const latestRef = useRef<OverlayStateDto | null>(null);
  const [token,setToken]=useState<string|null>(null);
  const chat = useChatMessagesActions();
  const acceptLayout=useCallback((next:{layout:OverlayStateDto['layout'];layoutVersion:number;layoutUpdatedAt:string|null})=>{const current=latestRef.current;if(!current||(current.layoutVersion??0)>=next.layoutVersion)return;const merged={...current,...next};latestRef.current=merged;setAccepted(value=>value?{...value,state:merged}:null);},[]);
  const socketStatus=useCallback((_connected:boolean)=>{},[]);
  useRogimarbleOverlaySocket(token,acceptLayout,socketStatus,chat.append);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    if (!token) { setStatus('preview'); return; }
    setToken(token);
    chat.clear();
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await api.overlay(token);
        if (!stopped && isNewerOverlayState(next, latestRef.current)) { const current=latestRef.current;const merged=current&&(current.layoutVersion??0)>(next.layoutVersion??0)?{...next,layout:current.layout,layoutVersion:current.layoutVersion,layoutUpdatedAt:current.layoutUpdatedAt}:next;latestRef.current = merged; setAccepted({ state: merged, receivedAt: Date.now() }); }
        if (!stopped) setStatus('live');
      } catch (error) { if (!stopped) { const denied = error instanceof ApiError && [401, 403, 404].includes(error.status); const rejected = error instanceof ApiError && error.status === 409; if (denied || rejected) { latestRef.current = null; setAccepted(null); chat.clear(); } setStatus(denied ? 'unauthorized' : rejected ? 'error' : latestRef.current ? 'stale' : 'error'); } }
      finally { if (!stopped) timer = window.setTimeout(poll, POLL_MS); }
    };
    setStatus('connecting');
    void poll();
    const staleTimer = window.setInterval(() => { setAccepted((value) => { if (value && Date.now() - value.receivedAt > STALE_MS) setStatus('stale'); return value; }); }, POLL_MS);
    return () => { stopped = true; setToken(null); if (timer) window.clearTimeout(timer); window.clearInterval(staleTimer); };
  }, [chat.clear]);

  return <TotalOverlayWidgetPage accepted={accepted} previewBoard={board} status={status} widgetId={widgetId} />;
}
