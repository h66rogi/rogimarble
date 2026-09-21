'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Board } from '@rogimarble/overlay-ui';
import { validateBoardDefinition } from '@rogimarble/game-core/board';
import boardPreset from '../../../../../../presets/streamer-board.json';
import type { BoardDefinition } from '@rogimarble/game-core/board';
import type { RunnableBoardVersionDto } from '@rogimarble/contracts';
import { api } from '../../../../lib/api';
import type { OperatorCommand, OperatorSnapshot } from '../../../../lib/types';
import { shouldAcceptSnapshot } from '../../../../lib/snapshot-order';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';

const board = boardPreset as unknown as BoardDefinition;

export function MarbleOperationsPanel({ view = 'full' }: { view?: 'full' | 'board' | 'controls' }) {
  const [state, setState] = useState<OperatorSnapshot | null>(null);
  const [boards, setBoards] = useState<readonly RunnableBoardVersionDto[]>([]);
  const [selectedCell, setSelectedCell] = useState(board.startCellId ?? board.path[0]);
  const [reason, setReason] = useState('방송 운영 조작');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const mutationFence = useRef(0);
  const canonical = useRef<OperatorSnapshot | null>(null);
  const [pending, setPending] = useState(() => api.pending());
  const [controlsRoot, setControlsRoot] = useState<HTMLElement | null>(null);
  const [inventorySet, setInventorySet] = useState<Record<string, string>>({});
  const [missionMessage, setMissionMessage] = useState('');
  const [missionQuantity, setMissionQuantity] = useState('1');
  const [missionShield, setMissionShield] = useState('');

  useEffect(() => {
    const next = document.getElementById('marble-controls-root');
    if (next !== controlsRoot) setControlsRoot(next);
  });

  const applySnapshot = (next: OperatorSnapshot, requestSequence: number, authoritative = false) => {
    if (!shouldAcceptSnapshot(canonical.current, next, requestSequence, appliedSequence.current, mutationFence.current, authoritative)) return;
    canonical.current = next;
    appliedSequence.current = requestSequence;
    setState(next);
    window.dispatchEvent(new CustomEvent('rogimarble:operator-state', { detail: next }));
  };

  const refresh = async () => {
    const requestSequence = ++sequence.current;
    const [snapshot, runnable] = await Promise.all([api.snapshot(), api.runnableBoards()]);
    applySnapshot(snapshot, requestSequence);
    setBoards(runnable);
  };

  useEffect(() => {
    let alive = true;
    void api.bootstrapSession().then(refresh).catch(() => alive && setError('로그인이 필요하거나 게임 서버에 연결할 수 없습니다.'));
    const timer = window.setInterval(() => {
      if (busy || api.pending()) return;
      const requestSequence = ++sequence.current;
      void api.snapshot().then((next) => alive && applySnapshot(next, requestSequence)).catch(() => undefined);
    }, 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const base = useMemo(() => ({ expectedRevision: state?.revision ?? 0, reason }), [reason, state?.revision]);
  let liveBoard = board;
  let boardError = '';
  if (state?.boardDefinition) {
    try { validateBoardDefinition(state.boardDefinition); liveBoard = state.boardDefinition; } catch { boardError = '서버 보드가 유효하지 않아 마지막 안전 미리보기를 표시합니다.'; }
  }
  const activeBoard = liveBoard;
  useEffect(() => {
    if (!activeBoard.path.includes(selectedCell)) setSelectedCell(activeBoard.startCellId ?? activeBoard.path[0]);
  }, [activeBoard, selectedCell]);
  const send = async (command: OperatorCommand) => {
    if (!state?.session || locked || api.pending()) return false;
    const requestSequence = ++sequence.current;
    mutationFence.current = requestSequence;
    setBusy(true); setError('');
    try { const result = await api.command(state.session.id, command, state.session.sessionEpoch); applySnapshot(result.snapshot, requestSequence, true); setPending(null); return true; }
    catch (cause) { setPending(api.pending()); setError(cause instanceof Error ? cause.message : '명령을 처리하지 못했습니다.'); return false; }
    finally { setBusy(false); }
  };
  const start = async (candidate: RunnableBoardVersionDto) => {
    if (busy || api.pending()) return;
    const requestSequence = ++sequence.current;
    mutationFence.current = requestSequence;
    setBusy(true); setError('');
    try { applySnapshot(await api.createSession(candidate), requestSequence, true); setPending(null); }
    catch (cause) { setPending(api.pending()); setError(cause instanceof Error ? cause.message : '세션을 시작하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const locked = busy || Boolean(pending);

  const controls = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">방송 조작</p><p className="text-xs text-muted-foreground">서버가 결과와 위치를 확정합니다.</p></div>
        <Badge variant={state?.session?.status === 'running' ? 'default' : 'secondary'}>{state?.session?.status === 'running' ? '진행 중' : state?.session?.status === 'paused' ? '일시정지' : '세션 없음'}</Badge>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
      {pending && <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"><strong>이전 명령 확인 필요</strong><p>같은 명령 ID로 결과를 확인하거나 안전하게 재시도합니다.</p><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { const requestSequence = ++sequence.current; mutationFence.current = requestSequence; setBusy(true); void api.reconcilePending().then((result) => { applySnapshot(result.snapshot, requestSequence, true); setPending(null); }).catch((cause) => setError(cause.message)).finally(() => setBusy(false)); }}>결과 확인</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { const requestSequence = ++sequence.current; mutationFence.current = requestSequence; setBusy(true); void api.retryPending().then((result) => { applySnapshot(result.snapshot, requestSequence, true); setPending(null); }).catch((cause) => setError(cause.message)).finally(() => setBusy(false)); }}>같은 명령 재시도</Button></div></div>}
      {!state?.session && <div className="space-y-2"><p className="text-xs font-medium">새 세션</p>{boards.length ? boards.map((candidate) => <Button className="w-full" key={candidate.id} disabled={locked || !state?.capabilities?.sessionLifecycle} onClick={() => void start(candidate)}>{candidate.previewOnly ? `${candidate.name} · 효과 없는 검증 세션` : `${candidate.name} 시작`}</Button>) : <p className="text-xs text-muted-foreground">실행 가능한 보드가 없습니다.</p>}</div>}
      <label className="grid gap-1 text-xs font-medium">작업 사유<Input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={!state?.session || locked || !state.capabilities?.manualRoll} onClick={() => void send({ type: 'roll', ...base })}>{state?.session?.status === 'paused' ? '한 건 진행' : '주사위 굴리기'}</Button>
        {state?.session?.status === 'paused' ? <Button variant="outline" disabled={locked || !state?.capabilities?.sessionLifecycle} onClick={() => void send({ type: 'resume', ...base })}>재개</Button> : <Button variant="outline" disabled={!state?.session || locked || !state.capabilities?.sessionLifecycle} onClick={() => void send({ type: 'pause', ...base })}>일시정지</Button>}
        <Button variant="outline" disabled={!state?.session || locked || !state.capabilities?.setDirection} onClick={() => void send({ type: 'set_direction', direction: 'forward', ...base })}>정방향</Button>
        <Button variant="outline" disabled={!state?.session || locked || !state.capabilities?.setDirection} onClick={() => void send({ type: 'set_direction', direction: 'reverse', ...base })}>역방향</Button>
        <Button className="col-span-2" variant="destructive" disabled={!state?.session || locked || !state.capabilities?.sessionLifecycle} onClick={() => void send({ type: 'end_session', ...base })}>세션 종료</Button>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium">말 위치 보정</p>
        <Select value={selectedCell} onValueChange={setSelectedCell}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{liveBoard.path.map((cellId) => <SelectItem key={cellId} value={cellId}>{liveBoard.cells.find((cell) => cell.id === cellId)?.label ?? cellId}</SelectItem>)}</SelectContent></Select>
        <Button className="w-full" variant="destructive" disabled={!state?.session || locked || !state.capabilities?.setPosition} onClick={() => void send({ type: 'correct_position', cellId: selectedCell, pauseAutomaticMovement: true, ...base })}>선택 칸으로 보정</Button>
      </div>
      <div className="space-y-2"><p className="text-xs font-medium">보상 수량</p>{state?.inventory.length ? state.inventory.map((item) => <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md border p-2" key={item.itemId}><span className="truncate text-sm">{item.name} · {item.quantity}</span><Button size="sm" variant="outline" disabled={locked || !state.capabilities?.inventory} onClick={() => void send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'delta', quantity: 1, expectedInventoryRevision: item.revision, ...base })}>+1</Button><Button size="sm" variant="outline" disabled={locked || item.quantity < 1 || !state.capabilities?.inventory} onClick={() => void send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'delta', quantity: -1, expectedInventoryRevision: item.revision, ...base })}>−1</Button><div className="flex gap-1"><Input className="w-16" inputMode="numeric" value={inventorySet[item.itemId] ?? ''} onChange={(event) => setInventorySet((current) => ({ ...current, [item.itemId]: event.target.value }))} /><Button size="sm" disabled={locked || !state?.capabilities?.inventory || !/^\d+$/.test(inventorySet[item.itemId] ?? '')} onClick={() => void send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'set', quantity: Number(inventorySet[item.itemId]), expectedInventoryRevision: item.revision, ...base })}>설정</Button></div></div>) : <p className="text-xs text-muted-foreground">등록된 보상 아이템이 없습니다.</p>}</div>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const quantity = Number(missionQuantity); if (!missionMessage.trim() || !Number.isInteger(quantity) || quantity < 1) return; void send({ type: 'create_mission', message: missionMessage.trim(), quantity, shield: missionShield ? { itemId: missionShield, quantity: 1 } : null, ...base }).then((ok) => { if (ok) setMissionMessage(''); }); }}><p className="text-xs font-medium">수동 미션</p><Input placeholder="미션 문구" value={missionMessage} onChange={(event) => setMissionMessage(event.target.value)} /><div className="grid grid-cols-2 gap-2"><Input type="number" min="1" value={missionQuantity} onChange={(event) => setMissionQuantity(event.target.value)} /><Select value={missionShield || 'none'} onValueChange={(value) => setMissionShield(value === 'none' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">실드 불허</SelectItem>{state?.inventory.map((item) => <SelectItem key={item.itemId} value={item.itemId}>{item.name}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" disabled={!state?.session || locked || Boolean(pending) || !state.capabilities?.missions}>미션 만들기</Button></form>
      <div className="space-y-2">{state?.missions.map((mission) => { const shieldItem = mission.shield ? state.inventory.find((item) => item.itemId === mission.shield?.itemId) : null; return <div className="rounded-md border p-3 text-sm" key={mission.id}><div className="flex justify-between gap-2"><strong>{mission.message} · {mission.quantity}개</strong><span>{mission.status === 'pending' ? '진행 중' : mission.status === 'completed' ? '완료' : mission.status === 'waived' ? '면제' : '실드 사용'}</span></div>{mission.status === 'pending' && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={locked || !state.capabilities?.missions} onClick={() => void send({ type: 'complete_mission', missionId: mission.id, expectedMissionRevision: mission.revision, ...base })}>완료</Button><Button size="sm" variant="outline" disabled={locked || !state.capabilities?.missions} onClick={() => void send({ type: 'waive_mission', missionId: mission.id, expectedMissionRevision: mission.revision, ...base })}>면제</Button>{mission.shield && shieldItem && <Button size="sm" variant="outline" disabled={locked || !state.capabilities?.missions || shieldItem.quantity < mission.shield.quantity} onClick={() => void send({ type: 'use_shield', missionId: mission.id, expectedMissionRevision: mission.revision, expectedInventoryRevision: shieldItem.revision, ...base })}>실드 사용</Button>}</div>}</div>; })}</div>
    </div>
  );

  if (view === 'controls') return controls;
  const boardView = <section className="min-w-0 rounded-lg border bg-card p-3">{boardError && <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{boardError}</p>}<Board board={liveBoard} tokenCellId={state?.token.cellId ?? liveBoard.path[0]} interactive selectedCellId={selectedCell} onCellSelect={setSelectedCell} /></section>;
  if (view === 'board') return boardView;
  return <>{boardView}{controlsRoot ? createPortal(<div className="space-y-4 p-4">{controls}</div>, controlsRoot) : <aside className="mt-4 rounded-lg border bg-card p-4 lg:hidden">{controls}</aside>}</>;
}
