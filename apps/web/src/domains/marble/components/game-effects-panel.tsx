"use client";

import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import { Button } from "@/shared/components/ui/button";
import { HomeControlSection } from "./home-control-section";
import { DestinationTaskControls, needsDestinationChoice } from "./destination-task-controls";

export function GameEffectsPanel({
  state,
  board,
  disabled,
  reason,
  send,
}: {
  state: OperatorSnapshot;
  board: BoardDefinition;
  disabled: boolean;
  reason: string;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  if (!state.session) return null;
  const modifiers = state.rollModifiers ?? [];
  const lock = state.movementLock;
  const waitingTasks = state.effectTasks?.filter((task) =>
    task.status === "pending" && ["choose_destination", "donation_destination"].includes(task.type) &&
    !needsDestinationChoice(task, Boolean(state.capabilities?.manualRoll))) ?? [];
  return (
    <HomeControlSection title="판 효과">
      {!modifiers.length && !lock && !waitingTasks.length && (
        <p className="text-sm text-muted-foreground">적용 중인 판 효과가 없습니다.</p>
      )}
      {modifiers.map((modifier) => (
        <div key={modifier.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
          <div>
            <strong className="text-sm">이동 거리 ×{modifier.factor}</strong>
            <p className="text-xs text-muted-foreground">앞으로 {modifier.usesRemaining}회 이동에 적용</p>
          </div>
          <Button size="sm" variant="outline" disabled={disabled || !state.capabilities?.manualRoll}
            onClick={() => void send({ type: "clear_roll_modifier", modifierId: modifier.id,
              expectedRevision: state.revision, reason })}>배수 해제</Button>
        </div>
      ))}
      {lock && (
        <div className="text-sm">
          <strong>이동 제한 중</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            {lock.releaseType === "skip_rolls_or_doubles"
              ? `남은 휴식 ${lock.rollsRemaining}회 · 더블이 나오면 탈출`
              : lock.releaseType === "skip_rolls"
                ? `남은 휴식 ${lock.rollsRemaining}회`
                : lock.releaseType === "dice_faces"
                  ? "주사위로 해제 판정"
                  : "운영자 해제 대기"}
          </p>
        </div>
      )}
      {waitingTasks.map((task) => <DestinationTaskControls key={task.id} task={task} state={state}
        board={board} disabled={disabled} reason={reason} send={send} placement="effects" />)}
    </HomeControlSection>
  );
}
