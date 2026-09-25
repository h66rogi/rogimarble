"use client";

import type { BoardDefinition } from "@rogimarble/game-core/board";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { Button } from "@/shared/components/ui/button";
import { GameEffectsPanel } from "./game-effects-panel";

export function GameOperationsPanel({ state, board, disabled, reason, send }: {
  state: OperatorSnapshot | null;
  board: BoardDefinition;
  disabled: boolean;
  reason: string;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  if (!state?.session) return <p className="text-sm text-muted-foreground">게임을 시작하면 조작할 수 있습니다.</p>;
  const session = state.session;

  return <div className="space-y-6">
    <section aria-label="게임 진행" className="space-y-3">
      <h3 className="text-sm font-semibold">게임 진행</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled || !state.capabilities?.sessionLifecycle}
          onClick={() => void send({ type: session.status === "paused" ? "resume" : "pause",
            expectedRevision: state.revision, reason })}>
          {session.status === "paused" ? "게임 재개" : "일시정지"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">진행 방향 · 현재 {state.token.direction === "forward" ? "정방향" : "역방향"}</p>
      <div role="group" aria-label="진행 방향" className="grid grid-cols-2 gap-2">
        <Button variant={state.token.direction === "forward" ? "default" : "outline"}
          disabled={disabled || !state.capabilities?.setDirection || state.token.direction === "forward"}
          onClick={() => void send({ type: "set_direction", direction: "forward", expectedRevision: state.revision, reason })}>
          정방향
        </Button>
        <Button variant={state.token.direction === "reverse" ? "default" : "outline"}
          disabled={disabled || !state.capabilities?.setDirection || state.token.direction === "reverse"}
          onClick={() => void send({ type: "set_direction", direction: "reverse", expectedRevision: state.revision, reason })}>
          역방향
        </Button>
      </div>
    </section>
    <GameEffectsPanel state={state} board={board} disabled={disabled} reason={reason} send={send} />
    <section aria-label="게임 종료" className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">게임 종료</h3>
      <Button className="w-full" variant="destructive"
        disabled={disabled || !state.capabilities?.sessionLifecycle}
        onClick={() => void send({ type: "end_session", expectedRevision: state.revision, reason })}>
        세션 종료
      </Button>
    </section>
  </div>;
}
