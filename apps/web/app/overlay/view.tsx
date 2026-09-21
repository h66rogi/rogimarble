'use client';

import type { BoardDefinition } from '@rogimarble/game-core/board';
import type { OverlayStateDto } from '@rogimarble/contracts';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import TotalOverlayWidgetPage, { type AcceptedOverlayState } from '@/integrated-overlay/app/overlay/[token]/widgets/total/page';
import { isNewerOverlayState } from '@/integrated-overlay/snapshot-order';

const POLL_MS = 1_000;
const STALE_MS = 5_000;

export function Overlay({ board }: { board: BoardDefinition }) {
  const [accepted, setAccepted] = useState<AcceptedOverlayState | null>(null);
  const [status, setStatus] = useState<'preview' | 'connecting' | 'live' | 'stale' | 'unauthorized' | 'error'>('preview');
  const latestRef = useRef<OverlayStateDto | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    if (!token) { setStatus('preview'); return; }
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await api.overlay(token);
        if (!stopped && isNewerOverlayState(next, latestRef.current)) { latestRef.current = next; setAccepted({ state: next, receivedAt: Date.now() }); }
        if (!stopped) setStatus('live');
      } catch (error) { if (!stopped) { const denied = error instanceof ApiError && [401, 403, 404].includes(error.status); const rejected = error instanceof ApiError && error.status === 409; if (denied || rejected) { latestRef.current = null; setAccepted(null); } setStatus(denied ? 'unauthorized' : rejected ? 'error' : latestRef.current ? 'stale' : 'error'); } }
      finally { if (!stopped) timer = window.setTimeout(poll, POLL_MS); }
    };
    setStatus('connecting');
    void poll();
    const staleTimer = window.setInterval(() => { setAccepted((value) => { if (value && Date.now() - value.receivedAt > STALE_MS) setStatus('stale'); return value; }); }, POLL_MS);
    return () => { stopped = true; if (timer) window.clearTimeout(timer); window.clearInterval(staleTimer); };
  }, []);

  return <TotalOverlayWidgetPage accepted={accepted} previewBoard={board} status={status} />;
}
