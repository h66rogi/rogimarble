'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@rogimarble/overlay-ui';
import { api, ApiError, PendingCommandError, type PendingIntent } from '../lib/api';
import { demoSnapshot } from '../lib/demo';
import type { BoardDefinition, Direction, OperatorCommand, OperatorSnapshot } from '../lib/types';
import type { RunnableBoardVersionDto } from '@rogimarble/contracts';
import { shouldAcceptSnapshot } from '../lib/snapshot-order';

export function Console({ board }: { board: BoardDefinition }) {
  const [demo, setDemo] = useState(false);
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [runnableBoards, setRunnableBoards] = useState<readonly RunnableBoardVersionDto[]>([]);
  const [selectedCell, setSelectedCell] = useState(board.startCellId ?? board.path[0]);
  const [reason, setReason] = useState('방송 운영 보정');
  const [inventorySet, setInventorySet] = useState<Record<string, string>>({});
  const [missionMessage, setMissionMessage] = useState('');
  const [missionQuantity, setMissionQuantity] = useState('1');
  const [missionShieldItem, setMissionShieldItem] = useState('');
  const [missionShieldQuantity, setMissionShieldQuantity] = useState('1');
  const cueTimers = useRef<number[]>([]);
  const cueGeneration = useRef(0);
  const modeGeneration = useRef(0);
  const presentationEpoch = useRef<number | null>(null);
  const canonical = useRef<OperatorSnapshot | null>(null);
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);
  const mutationFence = useRef(0);
  const activeCue = useRef(false);
  const [display, setDisplay] = useState<{ cellId: string; moving: boolean; dice: number[] | null }>({ cellId: board.path[0], moving: false, dice: null });
  const stopCue = () => { activeCue.current = false; cueGeneration.current += 1; cueTimers.current.forEach(clearTimeout); cueTimers.current = []; };
  const applyCanonicalDisplay = (next: OperatorSnapshot) => setDisplay({ cellId: next.token.cellId, moving: false, dice: next.dice?.values ?? null });
  const acceptSnapshot = (next: OperatorSnapshot, sequence: number, options: { authoritative?: boolean; suppressDisplay?: boolean } = {}) => {
    const current = canonical.current;
    const currentIdentity = current?.session ? `${current.session.id}:${current.session.sessionEpoch}` : 'none';
    const nextIdentity = next.session ? `${next.session.id}:${next.session.sessionEpoch}` : 'none';
    if (!shouldAcceptSnapshot(current, next, sequence, appliedSequence.current, mutationFence.current, options.authoritative)) return false;
    const barrierChanged = currentIdentity !== nextIdentity || (current?.session?.presentationEpoch ?? null) !== (next.session?.presentationEpoch ?? null);
    canonical.current = next; appliedSequence.current = Math.max(appliedSequence.current, sequence); presentationEpoch.current = next.session?.presentationEpoch ?? null; setSnapshot(next);
    if (barrierChanged) stopCue();
    if (!options.suppressDisplay) {
      if (activeCue.current && !barrierChanged) return true;
      applyCanonicalDisplay(next);
    }
    return true;
  };

  useEffect(() => {
    const generation = ++modeGeneration.current;
    let alive = true;
    stopCue();
    setPendingIntent(api.pending());
    if (demo) { const sequence = ++requestSequence.current; acceptSnapshot(demoSnapshot, sequence, { authoritative: true }); setError(''); return; }
    const initialSequence = ++requestSequence.current;
    api.bootstrapSession().then(() => Promise.all([api.snapshot(), api.runnableBoards()])).then(([next, boards]) => { if (!alive || generation !== modeGeneration.current) return; acceptSnapshot(next, initialSequence); setRunnableBoards(boards); }).catch(error => { if (!alive || generation !== modeGeneration.current) return; canonical.current = null; setSnapshot(null); setError(error instanceof ApiError && error.status === 401 ? '로그인이 필요합니다.' : '게임 서버에 연결되지 않았습니다. 잠시 후 동기화를 다시 시도하세요.'); });
    const timer = window.setInterval(() => { if (busy || api.pending()) return; const sequence = ++requestSequence.current; void api.snapshot().then(next => { if (!alive || generation !== modeGeneration.current) return; acceptSnapshot(next, sequence); }).catch(() => {}); }, 2000);
    return () => { alive = false; clearInterval(timer); stopCue(); };
  }, [demo]);

  const state = snapshot;
  const send = async (command: OperatorCommand) => {
    if (!state?.session) return false;
    if (demo) { setError('체험 모드는 실제 세션·후원 기록을 변경하지 않습니다.'); return false; }
    if (pendingIntent || api.pending()) { setPendingIntent(api.pending()); setError('이전 명령의 처리 결과를 먼저 확인하세요.'); return false; }
    const modeAtRequest = modeGeneration.current;
    const sequence = ++requestSequence.current; mutationFence.current = sequence;
    setBusy(true); setError('');
    try {
      if (command.type === 'correct_position') stopCue();
      const outcome = await api.command(state.session.id, command, state.session.sessionEpoch);
      if (modeAtRequest !== modeGeneration.current) return false;
      const result = outcome.command.result;
      const accepted = acceptSnapshot(outcome.snapshot, sequence, { authoritative: true, suppressDisplay: outcome.command.type === 'roll_dice' });
      const latest = canonical.current;
      const ackMatches = accepted && latest?.session?.id === outcome.command.sessionId && latest.session.sessionEpoch === outcome.command.sessionEpoch && latest.session.presentationEpoch === outcome.command.presentationEpoch;
      if (ackMatches && outcome.command.type === 'roll_dice' && result && 'dice' in result) {
        stopCue();
        activeCue.current = true;
        const generation = cueGeneration.current;
        setDisplay({ cellId: result.fromCellId, moving: true, dice: [...result.dice] });
        result.path.forEach((cellId, index) => cueTimers.current.push(window.setTimeout(() => { if (generation === cueGeneration.current) { const moving = index < result.path.length - 1; activeCue.current = moving; setDisplay(current => ({ ...current, cellId, moving })); } }, (index + 1) * 420)));
      } else {
        if (accepted && !ackMatches && outcome.command.type === 'roll_dice' && latest) applyCanonicalDisplay(latest);
      }
      setPendingIntent(null);
      return true;
    }
    catch (e) { setPendingIntent(api.pending()); setError(e instanceof PendingCommandError ? e.message : e instanceof Error ? e.message : '명령을 처리하지 못했습니다.'); return false; }
    finally { setBusy(false); }
  };
  const commandBase = useMemo(() => ({ expectedRevision: state?.revision ?? 0, reason }), [state?.revision, reason]);
  const createSession = async (candidate: RunnableBoardVersionDto) => { if (pendingIntent || !state?.capabilities?.sessionLifecycle) return; const generation = modeGeneration.current; const sequence = ++requestSequence.current; mutationFence.current = sequence; setBusy(true); setError(''); try { const next = await api.createSession(candidate); if (generation !== modeGeneration.current) return; acceptSnapshot(next, sequence, { authoritative: true }); } catch (e) { if (generation === modeGeneration.current) { setPendingIntent(api.pending()); setError(e instanceof Error ? e.message : '세션을 시작하지 못했습니다.'); } } finally { if (generation === modeGeneration.current) setBusy(false); } };
  const refresh = () => { if (!demo && !busy && !pendingIntent) { const generation = modeGeneration.current; const sequence = ++requestSequence.current; mutationFence.current = sequence; stopCue(); api.snapshot().then(next => { if (generation !== modeGeneration.current) return; acceptSnapshot(next, sequence, { authoritative: true }); }).catch(e => { if (generation === modeGeneration.current) setError(e instanceof Error ? e.message : '동기화 실패'); }); } };
  const resolvePending = async (retry: boolean) => { const sequence = ++requestSequence.current; mutationFence.current = sequence; setBusy(true); setError(''); try { const outcome = await (retry ? api.retryPending() : api.reconcilePending()); acceptSnapshot(outcome.snapshot, sequence, { authoritative: true }); setPendingIntent(null); } catch (error) { setPendingIntent(api.pending()); setError(error instanceof Error ? error.message : '명령 상태를 확인하지 못했습니다.'); } finally { setBusy(false); } };
  const runningBoard = state?.session ? runnableBoards.find(candidate => candidate.id === state.session?.boardVersionId) : null;
  const locked = busy || Boolean(pendingIntent);

  return <main className="manage-shell">
    <aside className="manage-sidebar" aria-label="운영 메뉴">
      <div className="manage-brand"><span className="manage-brand-mark">R</span><div><strong>주루마블</strong><small>방송 운영 센터</small></div></div>
      <nav className="manage-nav">
        <a className="active" href="#game-board"><span aria-hidden="true">◆</span>게임 운영</a>
        <a href="#donations"><span aria-hidden="true">♡</span>후원 내역</a>
        <a href="#missions"><span aria-hidden="true">✓</span>미션 관리</a>
        <Link href="/overlay"><span aria-hidden="true">□</span>OBS 화면</Link>
        <Link href="/admin"><span aria-hidden="true">⚙</span>서비스 관리</Link>
      </nav>
      <div className="manage-sidebar-note"><strong>수집기 상태</strong><span>후원 수집 연결 전</span></div>
    </aside>
    <div className="manage-frame">
    <header className="topbar">
      <div><span className="eyebrow">CHANNEL CONSOLE</span><h1>주루마블 운영 콘솔</h1><p className="page-description">방송 중 게임판과 미션을 한곳에서 관리합니다.</p></div>
      <div className="status-row"><span className={`status-dot ${state?.session?.status === 'running' ? 'live' : ''}`} />
        <span>{state?.session ? `${state.session.channelName} · ${state.session.status}` : state ? '세션 시작 대기' : '서버 연결 대기'}</span>
        <button onClick={refresh} disabled={demo || locked}>동기화</button><Link className="login-link" href="/login">로그인</Link>
        <button className={demo ? 'active' : ''} disabled={locked} onClick={() => setDemo(v => !v)}>{demo ? '체험 모드 종료' : '체험 모드'}</button>
      </div>
    </header>
    {demo && <div className="demo-banner"><strong>체험 모드</strong> — 아래 데이터와 조작은 운영 기록이 아니며 서버에 저장되지 않습니다. 실제 후원 수집은 연결되지 않았습니다.</div>}
    {!demo && <div className="collector-banner">후원 수집 미연결 · 현재는 검증용 수동 조작을 사용할 수 있습니다.</div>}
    {pendingIntent && <div className="pending-banner"><div><strong>이전 명령 확인 필요</strong><span>같은 명령 ID로 결과를 확인하거나 안전하게 재시도합니다.</span></div><button disabled={busy} onClick={() => resolvePending(false)}>결과 확인</button><button disabled={busy} onClick={() => resolvePending(true)}>같은 명령 재시도</button></div>}
    {error && <div className="error-banner">{error}</div>}
    <section className="main-grid" id="game-board">
      <div className="board-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">{demo ? 'PREVIEW BOARD' : 'SESSION BOARD'}</span><h2>{runningBoard?.name ?? (demo ? board.name : '서버 세션 보드')}</h2></div><span>{runningBoard?.previewOnly ? '미리보기 전용 · ' : ''}rev. {state?.revision ?? '—'}</span></div>
        <Board board={board} tokenCellId={display.cellId} moving={display.moving} dice={display.dice ?? undefined} interactive onCellSelect={setSelectedCell} selectedCellId={selectedCell} />
      </div>
      <aside className="controls panel">
        <span className="eyebrow">SERVER COMMANDS</span><h2>방송 조작</h2>
        {!state?.session && !demo && <div className="control-group"><h3>새 세션</h3>{runnableBoards.length ? runnableBoards.map(candidate => <button key={candidate.id} disabled={locked || !state?.capabilities?.sessionLifecycle} onClick={() => createSession(candidate)}>{candidate.previewOnly ? `${candidate.name} · 효과 없는 검증 세션 시작` : `${candidate.name} 시작`}</button>) : <p>서버에 등록된 실행 가능 보드가 없습니다.</p>}</div>}
        <label>작업 사유<input value={reason} onChange={e => setReason(e.target.value)} /></label>
        {state?.session && state.capabilities?.sessionLifecycle && <div className="control-group"><h3>세션 운영</h3><div className="split">{state.session.status === 'running' ? <button disabled={locked} onClick={() => send({ type: 'pause', ...commandBase })}>일시정지</button> : state.session.status === 'paused' ? <button disabled={locked} onClick={() => send({ type: 'resume', ...commandBase })}>재개</button> : null}<button className="danger" disabled={locked} onClick={() => send({ type: 'end_session', ...commandBase })}>세션 종료</button></div></div>}
        <div className="control-group"><h3>수동 주사위</h3><p>저장된 서버 결과를 그대로 표시합니다.</p><button disabled={!state?.session || !['running', 'paused'].includes(state.session.status) || locked || !state.capabilities?.manualRoll} onClick={() => send({ type: 'roll', ...commandBase })}>{state?.session?.status === 'paused' ? '한 건 진행' : '주사위 굴리기'}</button></div>
        <div className="control-group"><h3>다음 이동 방향</h3><div className="split"><button disabled={!state?.session || locked || !state.capabilities?.setDirection} onClick={() => send({ type: 'set_direction', direction: 'forward', ...commandBase })}>정방향</button><button disabled={!state?.session || locked || !state.capabilities?.setDirection} onClick={() => send({ type: 'set_direction', direction: 'reverse', ...commandBase })}>역방향</button></div></div>
        <div className="control-group"><h3>위치 보정</h3><p>{selectedCell} · 즉시 보정 시 자동 이동을 일시정지합니다.</p><button className="danger" disabled={!state?.session || state.session.status === 'ready' || locked || !state.capabilities?.setPosition} onClick={() => send({ type: 'correct_position', cellId: selectedCell, pauseAutomaticMovement: true, ...commandBase })}>선택 칸으로 보정</button></div>
        <div className="inventory"><h3>보상 수량</h3>{!demo && state?.capabilities?.inventory === false && <p className="unsupported">이 계정은 보상 수량을 조정할 수 없습니다.</p>}{state?.inventory.length ? state.inventory.map(item => <div className="inventory-row inventory-editor" key={item.itemId}><span>{item.name}</span><strong>{item.quantity}</strong><button disabled={demo || locked || !state.capabilities?.inventory} onClick={() => send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'delta', quantity: 1, expectedInventoryRevision: item.revision, ...commandBase })}>+1</button><button disabled={demo || locked || !state.capabilities?.inventory || item.quantity < 1} onClick={() => send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'delta', quantity: -1, expectedInventoryRevision: item.revision, ...commandBase })}>−1</button><input aria-label={`${item.name} 최종 수량`} inputMode="numeric" value={inventorySet[item.itemId] ?? ''} onChange={event => setInventorySet(current => ({ ...current, [item.itemId]: event.target.value }))} placeholder="수량" /><button disabled={demo || locked || !state.capabilities?.inventory || !/^\d+$/.test(inventorySet[item.itemId] ?? '')} onClick={() => send({ type: 'adjust_inventory', itemId: item.itemId, mode: 'set', quantity: Number(inventorySet[item.itemId]), expectedInventoryRevision: item.revision, ...commandBase })}>설정</button></div>) : <p>등록된 보상 아이템이 없습니다.</p>}</div>
      </aside>
    </section>
    <section className="bottom-grid" id="donations">
      <div className="panel table-panel"><div className="panel-heading"><h2>최근 후원</h2><span>정확한 개수 일치</span></div><table><thead><tr><th>후원자</th><th>개수</th><th>처리 결과</th><th>시각</th></tr></thead><tbody>{state?.donations.length ? state.donations.map(d => <tr key={d.id}><td>{d.donor}</td><td>{d.quantity}</td><td>{d.result}</td><td>{d.createdAt}</td></tr>) : <tr><td colSpan={4}>실제 후원 수집은 아직 연결되지 않았습니다.</td></tr>}</tbody></table></div>
      <div className="panel queue"><div className="panel-heading"><h2>대기 작업</h2><span>{state?.queue.length ?? 0}건</span></div>{state?.queue.length ? state.queue.map(q => <div className="queue-item" key={q.id}><span>{q.label}</span><strong>{q.status}</strong></div>) : <p>현재 표시할 대기 작업이 없습니다.</p>}</div>
    </section>
    <section className="panel mission-panel" id="missions">
      <div className="panel-heading"><div><span className="eyebrow">MISSIONS</span><h2>수동 미션</h2></div><span>{state?.missions.filter(mission => mission.status === 'pending').length ?? 0}건 진행 중</span></div>
      {state?.capabilities?.missions && state.session ? <form className="mission-form" onSubmit={event => { event.preventDefault(); const message = missionMessage.trim(); const quantity = Number(missionQuantity); if (!message || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) return; const shield = missionShieldItem ? { itemId: missionShieldItem, quantity: Math.max(1, Number(missionShieldQuantity) || 1) } : null; void send({ type: 'create_mission', message, quantity, shield, ...commandBase }).then(ok => { if (ok) setMissionMessage(''); }); }}><label>미션 문구<input value={missionMessage} onChange={event => setMissionMessage(event.target.value)} placeholder="수행할 미션을 입력하세요" required /></label><label>미션 수량<input type="number" min="1" max="100000" value={missionQuantity} onChange={event => setMissionQuantity(event.target.value)} required /></label><label>실드 정책<select value={missionShieldItem} onChange={event => setMissionShieldItem(event.target.value)}><option value="">실드 불허</option>{state.inventory.map(item => <option value={item.itemId} key={item.itemId}>{item.name}</option>)}</select></label>{missionShieldItem && <label>실드 소모 수량<input type="number" min="1" max="100000" value={missionShieldQuantity} onChange={event => setMissionShieldQuantity(event.target.value)} /></label>}<button disabled={locked || demo}>미션 만들기</button></form> : <p className="unsupported">이 계정은 미션을 관리할 수 없습니다.</p>}
      <div className="mission-list">{state?.missions.length ? state.missions.map(mission => { const shieldItem = mission.shield ? state.inventory.find(item => item.itemId === mission.shield?.itemId) : null; return <article className="mission-card" key={mission.id}><div><strong>{mission.message}</strong><span>{mission.quantity}개 · {mission.status === 'pending' ? '진행 중' : mission.status}</span>{mission.shield && <small>{shieldItem?.name ?? mission.shield.itemId} {mission.shield.quantity}개 허용</small>}</div>{mission.status === 'pending' && <div className="mission-actions"><button disabled={locked || demo || !state.capabilities?.missions} onClick={() => send({ type: 'complete_mission', missionId: mission.id, expectedMissionRevision: mission.revision, ...commandBase })}>완료</button><button disabled={locked || demo || !state.capabilities?.missions} onClick={() => send({ type: 'waive_mission', missionId: mission.id, expectedMissionRevision: mission.revision, ...commandBase })}>면제</button>{mission.shield && shieldItem && <button disabled={locked || demo || !state.capabilities?.missions || shieldItem.quantity < mission.shield.quantity} onClick={() => send({ type: 'use_shield', missionId: mission.id, expectedMissionRevision: mission.revision, expectedInventoryRevision: shieldItem.revision, ...commandBase })}>실드 사용</button>}</div>}</article>; }) : <p>등록된 미션이 없습니다.</p>}</div>
    </section></div>
  </main>;
}
