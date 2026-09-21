'use client';

import { useState } from 'react';
import type { BoardDefinition } from '@rogimarble/game-core/board';
import type { OperatorCommand, OperatorSnapshot } from '../../../../lib/types';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Input } from '@/shared/components/ui/input';

export function GameEffectsPanel({ state, board, disabled, reason, send }: {
  state: OperatorSnapshot; board: BoardDefinition; disabled: boolean; reason: string;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [counterValues, setCounterValues] = useState<Record<string, string>>({});
  const tasks = state.effectTasks?.filter(task => ['choose_destination','donation_destination'].includes(task.type) && task.status === 'pending') ?? [];
  const canOperate = Boolean(state.capabilities?.manualRoll);
  if (!state.session || (!state.counters?.length && !state.movementLock && !state.rollModifiers?.length && !tasks.length)) return null;
  return <section className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/20" aria-label="판 효과 상태">
    <h3 className="text-sm font-bold">판 효과</h3>
    {state.counters?.map(counter => <div key={counter.counterId} className="space-y-2 rounded-lg border bg-background p-3 text-sm">
      <div className="flex items-center justify-between gap-3"><span>{counter.label}</span><div className="text-right"><strong>총 {counter.value} {counter.unit}</strong><p className="text-xs text-muted-foreground">청산 예약 {counter.reserved} · 사용 가능 {counter.available}</p></div></div>
      <div className="flex gap-2"><Input aria-label={`${counter.label} 최종 총량`} inputMode="numeric" min={counter.reserved} value={counterValues[counter.counterId]??''} onChange={event=>setCounterValues(current=>({...current,[counter.counterId]:event.target.value}))} placeholder={`최소 ${counter.reserved}`} /><Button size="sm" disabled={disabled||!canOperate||!/^\d+$/.test(counterValues[counter.counterId]??'')||Number(counterValues[counter.counterId])<counter.reserved} onClick={()=>void send({type:'adjust_counter',counterId:counter.counterId,quantity:Number(counterValues[counter.counterId]),expectedCounterRevision:counter.revision,expectedRevision:state.revision,reason})}>총량 설정</Button></div>
    </div>)}
    {state.rollModifiers?.map(modifier => <div key={modifier.id} className="rounded-lg border bg-background p-3 text-sm"><strong>이동 거리 ×{modifier.factor}</strong><p className="mt-1 text-xs text-muted-foreground">앞으로 {modifier.usesRemaining}회 이동에 적용</p><Button className="mt-2" size="sm" variant="outline" disabled={disabled||!canOperate} onClick={()=>void send({type:'clear_roll_modifier',modifierId:modifier.id,expectedRevision:state.revision,reason})}>배수 해제</Button></div>)}
    {state.movementLock && <div className="rounded-lg border bg-background p-3 text-sm"><strong>이동 제한 중</strong><p className="mt-1 text-xs text-muted-foreground">{state.movementLock.releaseType === 'skip_rolls_or_doubles' ? `남은 휴식 ${state.movementLock.rollsRemaining}회 · 더블이 나오면 탈출` : state.movementLock.releaseType === 'skip_rolls' ? `남은 휴식 ${state.movementLock.rollsRemaining}회` : state.movementLock.releaseType === 'dice_faces' ? '주사위로 해제 판정' : '운영자 해제 대기'}</p><Button className="mt-2" size="sm" variant="outline" disabled={disabled||!canOperate} onClick={()=>void send({type:'clear_movement_lock',expectedRevision:state.revision,reason})}>이동 제한 즉시 해제</Button></div>}
    {tasks.map(task => {
      const payload = task.payload && typeof task.payload === 'object' ? task.payload as Record<string, unknown> : {};
      const allowed = Array.isArray(payload.allowedCellIds) ? payload.allowedCellIds : board.path;
      const candidates = board.path.filter(id => allowed.includes(id) && (!payload.excludeCurrentCell || id !== state.token.cellId));
      const stored=typeof payload.selectedCellId==='string'?payload.selectedCellId:'';
      const selected = destinations[task.id] ?? stored;
      const donation=task.type==='donation_destination';
      const reserved=typeof payload.reservedTurnCommandId==='string';
      const description=donation?(stored?(state.session?.status==='paused'?'목적지가 확정됐습니다. 게임을 재개하면 이동합니다.':'목적지가 확정되어 이동을 기다립니다.'):`후원자가 원하는 칸을 선택합니다.${payload.selection!=='operator'?` 채팅: ${payload.chatCommand} 칸번호`:''}`):!reserved?'목적지를 저장하면 다음 정상 주사위 차례가 이 예약을 소비합니다.':!selected?'차례가 예약되어 목적지 선택을 기다립니다.':state.session?.status==='paused'?'차례와 목적지가 저장됐습니다. 재개하면 이동합니다.':'차례와 목적지가 저장되어 서버 실행을 기다립니다.';
      return <div key={task.id} className="space-y-2 rounded-lg border bg-background p-3">
        <strong className="text-sm">{donation?'후원 목적지 선택':'여행 목적지'}</strong><p className="text-xs text-muted-foreground">{description}</p>
        <Select value={selected} onValueChange={value => setDestinations(current => ({ ...current, [task.id]: value }))}><SelectTrigger aria-label={donation?'후원 목적지':'여행 목적지'}><SelectValue placeholder="이동할 칸 선택" /></SelectTrigger><SelectContent>{candidates.map(id => <SelectItem key={id} value={id}>{board.cells.find(cell => cell.id === id)?.label ?? id}</SelectItem>)}</SelectContent></Select>
        <div className="grid grid-cols-2 gap-2"><Button size="sm" disabled={disabled || !canOperate || !candidates.includes(selected)||selected===stored||(donation&&(!!stored||payload.selection==='donor_chat'))} onClick={() => void send({ type: 'choose_destination', taskId: task.id, cellId: selected, expectedTaskRevision: task.revision, expectedRevision: state.revision, reason })}>{stored?'목적지 변경':'목적지 저장'}</Button><Button size="sm" variant="outline" disabled={disabled||!canOperate} onClick={()=>void send({type:'cancel_destination',taskId:task.id,expectedTaskRevision:task.revision,expectedRevision:state.revision,reason})}>예약 취소</Button></div>
      </div>;
    })}
  </section>;
}
