"use client";

import { useState } from "react";
import type { RunnableBoardVersionDto } from "@rogimarble/contracts";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { HomeControlSection } from "./home-control-section";
import { DestinationTaskControls, needsDestinationChoice } from "./destination-task-controls";

export function CurrentActionsSection({
  state,
  board,
  startBoard,
  locked,
  effectIdle,
  reason,
  start,
  send,
}: {
  state: OperatorSnapshot | null;
  board: BoardDefinition;
  startBoard: RunnableBoardVersionDto | null;
  locked: boolean;
  effectIdle: boolean;
  reason: string;
  start: (board: RunnableBoardVersionDto) => Promise<void>;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  const [remainingInput, setRemainingInput] = useState("");
  const session = state?.session;
  const canOperate = Boolean(state?.capabilities?.manualRoll);
  const tasks = state?.effectTasks?.filter((task) =>
    task.status === "pending" && ["choose_destination", "donation_destination"].includes(task.type),
  ) ?? [];
  const choiceTasks = tasks.filter((task) => needsDestinationChoice(task, canOperate));
  const waitingForDestination = tasks.some((task) => {
    const payload = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
    return Boolean(payload.reservedTurnCommandId) && !payload.selectedCellId;
  });
  const lock = state?.movementLock;
  const canAdjustLock = Boolean(lock && canOperate);
  const hasQuickAction = !session
    ? Boolean(startBoard)
    : canOperate;

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
          {startBoard ? <>
            <p className="text-sm text-muted-foreground">게임판: <span className="font-medium text-foreground">{startBoard.name}</span> · {startBoard.path.length}칸</p>
            <Button className="w-full" disabled={locked || !state.capabilities?.sessionLifecycle}
              onClick={() => void start(startBoard)}>게임 시작</Button>
          </> : <p className="text-sm text-muted-foreground">시작할 수 있는 게임판이 없습니다. 보드 설정에서 게임판을 게시해 주세요.</p>}
        </div>
      )}
      {session && <>
        <div className="flex flex-wrap gap-2">
          {canOperate && <Button disabled={locked || !effectIdle || waitingForDestination}
            onClick={() => void send({ type: "roll", expectedRevision: state.revision, reason })}>
            {session.status === "paused" ? "한 건 진행" : "주사위 굴리기"}
          </Button>}
        </div>
        {choiceTasks.map((task) => <DestinationTaskControls key={task.id} task={task} state={state}
          board={board} disabled={locked} reason={reason} send={send} placement="actions" />)}
        {lock && canAdjustLock && <div className="space-y-2 border-t pt-3">
          <strong className="text-sm">이동 제한 조정</strong>
          {lock.rollsRemaining !== null && <>
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
          <Button size="sm" variant="outline" disabled={locked}
            onClick={() => void send({ type: "clear_movement_lock", expectedRevision: state.revision, reason })}>
            이동 제한 바로 해제
          </Button>
        </div>}
        {!hasQuickAction && !choiceTasks.length && !canAdjustLock &&
          <p className="text-sm text-muted-foreground">현재 계정에서 실행할 수 있는 액션이 없습니다.</p>}
      </>}
    </HomeControlSection>
  );
}
