"use client";

import { useState } from "react";
import type { RunnableBoardVersionDto } from "@rogimarble/contracts";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { HomeControlSection } from "./home-control-section";

export function CurrentActionsSection({
  state,
  board,
  boards,
  locked,
  effectIdle,
  reason,
  start,
  send,
}: {
  state: OperatorSnapshot | null;
  board: BoardDefinition;
  boards: readonly RunnableBoardVersionDto[];
  locked: boolean;
  effectIdle: boolean;
  reason: string;
  start: (board: RunnableBoardVersionDto) => Promise<void>;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [remainingInput, setRemainingInput] = useState("");
  const session = state?.session;
  const canOperate = Boolean(state?.capabilities?.manualRoll);
  const tasks = state?.effectTasks?.filter((task) =>
    task.status === "pending" && ["choose_destination", "donation_destination"].includes(task.type),
  ) ?? [];
  const waitingForDestination = tasks.some((task) => {
    const payload = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
    return Boolean(payload.reservedTurnCommandId) && !payload.selectedCellId;
  });
  const lock = state?.movementLock;
  const hasQuickAction = !session
    ? boards.length > 0
    : canOperate || Boolean(state?.capabilities?.sessionLifecycle);

  return (
    <HomeControlSection
      title="현재 할 수 있는 액션"
      action={session && <Badge variant={session.status === "running" ? "default" : "secondary"}>
        {session.status === "running" ? "진행 중" : "일시정지"}
      </Badge>}
    >
      {!state && <p className="text-sm text-muted-foreground">게임 상태를 불러오는 중입니다.</p>}
      {state && !session && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">게임을 시작할 보드를 선택하세요.</p>
          {boards.map((candidate) => <Button key={candidate.id} className="w-full"
            disabled={locked || !state.capabilities?.sessionLifecycle} onClick={() => void start(candidate)}>
            {candidate.previewOnly ? `${candidate.name} · 효과 없는 검증 세션` : `${candidate.name} 시작`}
          </Button>)}
          {!boards.length && <p className="text-sm text-muted-foreground">실행 가능한 보드가 없습니다.</p>}
        </div>
      )}
      {session && <>
        <div className="flex flex-wrap gap-2">
          {canOperate && <Button disabled={locked || !effectIdle || waitingForDestination}
            onClick={() => void send({ type: "roll", expectedRevision: state.revision, reason })}>
            {session.status === "paused" ? "한 건 진행" : "주사위 굴리기"}
          </Button>}
          {state.capabilities?.sessionLifecycle && <Button variant="outline" disabled={locked}
            onClick={() => void send({ type: session.status === "paused" ? "resume" : "pause", expectedRevision: state.revision, reason })}>
            {session.status === "paused" ? "게임 재개" : "일시정지"}
          </Button>}
        </div>
        {tasks.map((task) => {
          const payload = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
          const allowed = Array.isArray(payload.allowedCellIds) ? payload.allowedCellIds.filter((id): id is string => typeof id === "string") : board.path;
          const candidates = board.path.filter((id) => allowed.includes(id) && (!payload.excludeCurrentCell || id !== state.token.cellId));
          const stored = typeof payload.selectedCellId === "string" ? payload.selectedCellId : "";
          const selected = destinations[task.id] ?? stored;
          const donorOnly = task.type === "donation_destination" && payload.selection === "donor_chat";
          const canChoose = canOperate && !donorOnly && !(task.type === "donation_destination" && Boolean(stored));
          return <div key={task.id} className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{task.type === "donation_destination" ? "후원 목적지" : "세계여행 목적지"}</strong>
              {stored && <Badge variant="secondary">{board.cells.find((cell) => cell.id === stored)?.label ?? stored}</Badge>}
            </div>
            {donorOnly ? <p className="text-sm text-muted-foreground">후원자의 채팅 선택을 기다리고 있습니다.</p>
              : <p className="text-sm text-muted-foreground">이동할 칸을 선택한 뒤 목적지를 저장하세요.</p>}
            {canChoose && <div role="group" aria-label="이동할 칸 선택" className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
              {candidates.map((id) => <Button key={id} size="sm" variant={selected === id ? "default" : "outline"}
                aria-pressed={selected === id} disabled={locked}
                onClick={() => setDestinations((current) => ({ ...current, [task.id]: id }))}>
                {board.path.indexOf(id) + 1}. {board.cells.find((cell) => cell.id === id)?.label ?? id}
              </Button>)}
            </div>}
            <div className="flex flex-wrap gap-2">
              {canChoose && <Button size="sm" disabled={locked || !candidates.includes(selected) || selected === stored}
                onClick={() => void send({ type: "choose_destination", taskId: task.id, cellId: selected,
                  expectedTaskRevision: task.revision, expectedRevision: state.revision, reason })}>
                {stored ? "목적지 변경" : "목적지 저장"}
              </Button>}
              {canOperate && <Button size="sm" variant="outline" disabled={locked}
                onClick={() => void send({ type: "cancel_destination", taskId: task.id,
                  expectedTaskRevision: task.revision, expectedRevision: state.revision, reason })}>예약 취소</Button>}
            </div>
          </div>;
        })}
        {lock && <div className="space-y-2 border-t pt-3">
          <strong className="text-sm">이동 제한</strong>
          <p className="text-sm text-muted-foreground">
            {lock.rollsRemaining === null ? "운영자 해제 또는 주사위 판정을 기다립니다."
              : `현재 남은 휴식 ${lock.rollsRemaining}회${lock.releaseType === "skip_rolls_or_doubles" ? " · 더블이면 탈출" : ""}`}
          </p>
          {canOperate && lock.rollsRemaining !== null && <>
            <div role="group" aria-label="남은 휴식 횟수 선택" className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((count) => <Button key={count} size="sm" variant="outline"
                disabled={locked || lock.rollsRemaining === count}
                onClick={() => void send({ type: "set_movement_lock_remaining", rollsRemaining: count,
                  expectedRevision: state.revision, reason })}>{count}회 남김</Button>)}
            </div>
            <div className="flex gap-2">
              <Input aria-label="남은 휴식 횟수 직접 입력" placeholder="직접 횟수 입력" type="number" min="1" max="1000"
                value={remainingInput} onChange={(event) => setRemainingInput(event.target.value)} />
              <Button size="sm" variant="outline" disabled={locked || !/^\d+$/.test(remainingInput) ||
                Number(remainingInput) < 1 || Number(remainingInput) > 1000 || Number(remainingInput) === lock.rollsRemaining}
                onClick={() => void send({ type: "set_movement_lock_remaining", rollsRemaining: Number(remainingInput),
                  expectedRevision: state.revision, reason }).then((ok) => { if (ok) setRemainingInput(""); })}>횟수 저장</Button>
            </div>
          </>}
          {canOperate && <Button size="sm" variant="outline" disabled={locked}
            onClick={() => void send({ type: "clear_movement_lock", expectedRevision: state.revision, reason })}>
            이동 제한 바로 해제
          </Button>}
        </div>}
        {!hasQuickAction && !tasks.length && !lock &&
          <p className="text-sm text-muted-foreground">현재 계정에서 실행할 수 있는 액션이 없습니다.</p>}
      </>}
    </HomeControlSection>
  );
}
