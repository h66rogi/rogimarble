"use client";

import { useState } from "react";
import type { SessionEffectTaskDto } from "@rogimarble/contracts";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

function taskPayload(task: SessionEffectTaskDto): Record<string, unknown> {
  return task.payload && typeof task.payload === "object"
    ? task.payload as Record<string, unknown>
    : {};
}

export function needsDestinationChoice(task: SessionEffectTaskDto, canOperate: boolean): boolean {
  if (!canOperate || task.status !== "pending" ||
    !["choose_destination", "donation_destination"].includes(task.type)) return false;
  const payload = taskPayload(task);
  return !payload.selectedCellId && !(task.type === "donation_destination" && payload.selection === "donor_chat");
}

export function DestinationTaskControls({
  task,
  state,
  board,
  disabled,
  reason,
  send,
  placement,
}: {
  task: SessionEffectTaskDto;
  state: OperatorSnapshot;
  board: BoardDefinition;
  disabled: boolean;
  reason: string;
  send: (command: OperatorCommand) => Promise<boolean>;
  placement: "actions" | "effects";
}) {
  const [selectedCell, setSelectedCell] = useState("");
  const [editing, setEditing] = useState(false);
  const payload = taskPayload(task);
  const stored = typeof payload.selectedCellId === "string" ? payload.selectedCellId : "";
  const selected = selectedCell || stored;
  const allowed = Array.isArray(payload.allowedCellIds)
    ? payload.allowedCellIds.filter((id): id is string => typeof id === "string")
    : board.path;
  const candidates = board.path.filter((id) => allowed.includes(id) &&
    (!payload.excludeCurrentCell || id !== state.token.cellId));
  const canOperate = Boolean(state.capabilities?.manualRoll);
  const canChoose = canOperate && (task.type === "choose_destination" ||
    task.type === "donation_destination" && payload.selection !== "donor_chat" && !stored);
  const showChoices = canChoose && (placement === "actions" || editing);
  const title = task.type === "donation_destination" ? "후원 목적지" : "세계여행 목적지";
  const storedLabel = board.cells.find((cell) => cell.id === stored)?.label ?? stored;

  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-2">
      <strong className="text-sm">{title}</strong>
      {stored && <Badge variant="secondary">{storedLabel} 선택됨</Badge>}
    </div>
    {!stored && task.type === "donation_destination" && payload.selection === "donor_chat"
      ? <p className="text-sm text-muted-foreground">후원자의 채팅 선택을 기다리고 있습니다.</p>
      : showChoices
        ? <p className="text-sm text-muted-foreground">이동할 칸을 선택한 뒤 목적지를 저장하세요.</p>
        : !stored && <p className="text-sm text-muted-foreground">목적지 선택 대기 중입니다.</p>}
    {showChoices && <div role="group" aria-label="이동할 칸 선택" className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
      {candidates.map((id) => <Button key={id} size="sm" variant={selected === id ? "default" : "outline"}
        aria-pressed={selected === id} disabled={disabled}
        onClick={() => setSelectedCell(id)}>
        {board.path.indexOf(id) + 1}. {board.cells.find((cell) => cell.id === id)?.label ?? id}
      </Button>)}
    </div>}
    <div className="flex flex-wrap gap-2">
      {placement === "effects" && stored && canChoose && !editing &&
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>목적지 변경</Button>}
      {showChoices && <Button size="sm" disabled={disabled || !candidates.includes(selected) || selected === stored}
        onClick={() => void send({ type: "choose_destination", taskId: task.id, cellId: selected,
          expectedTaskRevision: task.revision, expectedRevision: state.revision, reason }).then((ok) => {
            if (ok) setEditing(false);
          })}>
        {stored ? "변경 저장" : "목적지 저장"}
      </Button>}
      {canOperate && <Button size="sm" variant="outline" disabled={disabled}
        onClick={() => void send({ type: "cancel_destination", taskId: task.id,
          expectedTaskRevision: task.revision, expectedRevision: state.revision, reason })}>예약 취소</Button>}
    </div>
  </div>;
}
