"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Board } from "@rogimarble/overlay-ui";
import { validateBoardDefinition } from "@rogimarble/game-core/board";
import boardPreset from "../../../../../../presets/streamer-board.json";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import type {
  RunnableBoardVersionDto,
  SessionCommandDto,
} from "@rogimarble/contracts";
import { api, apiAssetUrl } from "../../../../lib/api";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { shouldAcceptSnapshot } from "../../../../lib/snapshot-order";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { MoveRight } from "lucide-react";
import {
  ConsolePanel,
  ConsoleNotice,
} from "@/shared/components/common/console-ui";
import { PillTabs } from "@/shared/components/ui/pill-tabs";
import { useRollPresentation } from "../../../../lib/use-roll-presentation";
import { CurrentActionsSection } from "./current-actions-section";
import { AccumulationRewardsPanel } from "./accumulation-rewards-panel";
import { GameOperationsPanel } from "./game-operations-panel";
import { GameHistoryPanel } from "./game-history-panel";

const board = boardPreset as unknown as BoardDefinition;

export function MarbleOperationsPanel({
  view = "full",
}: {
  view?: "full" | "board" | "controls";
}) {
  const [state, setState] = useState<OperatorSnapshot | null>(null);
  const [boards, setBoards] = useState<readonly RunnableBoardVersionDto[]>([]);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const boardInteraction = useRef<HTMLDivElement | null>(null);
  const reason = "방송 운영 조작";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const mutationFence = useRef(0);
  const canonical = useRef<OperatorSnapshot | null>(null);
  const pendingPresentation = useRef<SessionCommandDto | null>(null);
  const observedPresentation = useRef<{
    session: string;
    commandId: string | null;
  } | null>(null);
  const [pending, setPending] = useState(() => api.pending());
  const [controlsRoot, setControlsRoot] = useState<HTMLElement | null>(null);
  const tabId = useId();
  const [activeDetailsTab, setActiveDetailsTab] = useState<"rewards" | "operations" | "history">("rewards");

  useEffect(() => {
    const next = document.getElementById("marble-controls-root");
    if (next !== controlsRoot) setControlsRoot(next);
  });

  useEffect(() => {
    if (!selectedCell) return;
    const dismissOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) ||
        !boardInteraction.current?.contains(target) ||
        !target.closest(".board-cell, .board-cell-action"))
        setSelectedCell(null);
    };
    const dismissOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCell(null);
    };
    document.addEventListener("pointerdown", dismissOnPointerDown);
    document.addEventListener("keydown", dismissOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerDown);
      document.removeEventListener("keydown", dismissOnKeyDown);
    };
  }, [selectedCell]);

  const applySnapshot = (
    next: OperatorSnapshot,
    requestSequence: number,
    authoritative = false,
  ) => {
    if (
      !shouldAcceptSnapshot(
        canonical.current,
        next,
        requestSequence,
        appliedSequence.current,
        mutationFence.current,
        authoritative,
      )
    )
      return;
    canonical.current = next;
    appliedSequence.current = requestSequence;
    setState(next);
    window.dispatchEvent(
      new CustomEvent("rogimarble:operator-state", { detail: next }),
    );
  };
  const queuePresentation = (command: SessionCommandDto | null) => {
    pendingPresentation.current = command;
  };

  const refresh = async () => {
    const requestSequence = ++sequence.current;
    const [snapshot, runnable] = await Promise.all([
      api.snapshot(),
      api.runnableBoards(),
    ]);
    applySnapshot(snapshot, requestSequence);
    setBoards(runnable);
  };

  useEffect(() => {
    let alive = true;
    void api
      .bootstrapSession()
      .then(refresh)
      .catch(
        () =>
          alive &&
          setError("로그인이 필요하거나 게임 서버에 연결할 수 없습니다."),
      );
    const timer = window.setInterval(() => {
      if (busy || api.pending()) return;
      const requestSequence = ++sequence.current;
      void api
        .snapshot()
        .then((next) => alive && applySnapshot(next, requestSequence))
        .catch(() => undefined);
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const base = useMemo(
    () => ({ expectedRevision: state?.revision ?? 0, reason }),
    [state?.revision],
  );
  let liveBoard = board;
  let boardError = "";
  if (state?.boardDefinition) {
    try {
      validateBoardDefinition(state.boardDefinition);
      liveBoard = state.boardDefinition;
    } catch {
      boardError =
        "서버 보드가 유효하지 않아 마지막 안전 미리보기를 표시합니다.";
    }
  }
  let historyBoard = liveBoard;
  if (!state?.session && state?.lastEndedSession?.boardDefinition) {
    try {
      validateBoardDefinition(state.lastEndedSession.boardDefinition);
      historyBoard = state.lastEndedSession.boardDefinition;
    } catch {
      // Invalid historical boards fall back to the current safe board.
    }
  }
  const activeBoard = liveBoard;
  const presentation = useRollPresentation({
    sessionKey: state?.session
      ? `${state.session.id}:${state.session.sessionEpoch}`
      : null,
    presentationEpoch: state?.session?.presentationEpoch ?? null,
    authoritativeCellId: state?.token.cellId ?? activeBoard.path[0],
    boardPath: activeBoard.path,
  });
  useEffect(() => {
    if (!state?.session) {
      observedPresentation.current = null;
      return;
    }
    const session = `${state.session.id}:${state.session.sessionEpoch}`,
      command = state.latestCommand;
    if (observedPresentation.current?.session !== session) {
      observedPresentation.current = {
        session,
        commandId: command?.commandId ?? null,
      };
      return;
    }
    if (
      !command ||
      observedPresentation.current.commandId === command.commandId
    )
      return;
    observedPresentation.current.commandId = command.commandId;
    if (
      command.presentationEpoch !== state.session.presentationEpoch ||
      command.afterRevision > state.revision
    )
      return;
    if (
      [
        "roll_dice",
        "choose_destination",
        "cancel_destination",
        "resume",
      ].includes(command.type)
    )
      presentation.play({
        commandId: command.commandId,
        commandType: command.type as
          "roll_dice" | "choose_destination" | "cancel_destination" | "resume",
        sessionKey: session,
        presentationEpoch: command.presentationEpoch,
        finalCellId: state.token.cellId,
        result: command.result,
      });
  }, [
    state?.latestCommand?.commandId,
    state?.session?.id,
    state?.session?.sessionEpoch,
  ]);
  useEffect(() => {
    const command = pendingPresentation.current,
      current = state?.session;
    if (!command || !current) return;
    if ((state?.revision ?? -1) < command.afterRevision) return;
    pendingPresentation.current = null;
    if (
      [
        "roll_dice",
        "choose_destination",
        "cancel_destination",
        "resume",
      ].includes(command.type) &&
      command.result &&
      "dice" in command.result &&
      current.id === command.sessionId &&
      current.sessionEpoch === command.sessionEpoch &&
      current.presentationEpoch === command.presentationEpoch &&
      state.revision === command.afterRevision
    ) {
      presentation.play({
        commandId: command.commandId,
        commandType: command.type as
          "roll_dice" | "choose_destination" | "cancel_destination" | "resume",
        sessionKey: `${current.id}:${current.sessionEpoch}`,
        presentationEpoch: command.presentationEpoch,
        finalCellId: state.token.cellId,
        result: command.result,
      });
    }
  }, [
    state?.revision,
    state?.session?.id,
    state?.session?.sessionEpoch,
    state?.session?.presentationEpoch,
  ]);
  useEffect(() => {
    if (selectedCell && !activeBoard.path.includes(selectedCell))
      setSelectedCell(null);
  }, [activeBoard, selectedCell]);
  const send = async (command: OperatorCommand) => {
    if (!state?.session || locked || api.pending()) return false;
    if (command.type === "correct_position") presentation.cancel();
    const requestSequence = ++sequence.current;
    mutationFence.current = requestSequence;
    setBusy(true);
    setError("");
    try {
      const result = await api.command(
        state.session.id,
        command,
        state.session.sessionEpoch,
      );
      applySnapshot(result.snapshot, requestSequence, true);
      queuePresentation(result.command);
      setPending(null);
      return true;
    } catch (cause) {
      setPending(api.pending());
      setError(
        cause instanceof Error ? cause.message : "명령을 처리하지 못했습니다.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const start = async (candidate: RunnableBoardVersionDto) => {
    if (busy || api.pending()) return;
    const requestSequence = ++sequence.current;
    mutationFence.current = requestSequence;
    setBusy(true);
    setError("");
    try {
      applySnapshot(await api.createSession(candidate), requestSequence, true);
      setPending(null);
    } catch (cause) {
      setPending(api.pending());
      setError(
        cause instanceof Error ? cause.message : "세션을 시작하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || Boolean(pending);
  const controls = (
    <div className="w-full space-y-5 bg-muted/20 pb-5">
      <div className="w-full">
        <CurrentActionsSection
          state={state}
          board={liveBoard}
          boards={boards}
          locked={locked}
          effectIdle={presentation.effectPhase === "idle"}
          reason={reason}
          start={start}
          send={send}
        />
        {(error || pending) && <div className="space-y-3 border-b p-3">
          {error && <ConsoleNotice variant="destructive">{error}</ConsoleNotice>}
          {pending && <ConsoleNotice variant="warning" title="이전 명령 확인 필요">
            <p>같은 명령 ID로 결과를 확인하거나 안전하게 재시도합니다.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => {
                const requestSequence = ++sequence.current;
                mutationFence.current = requestSequence;
                setBusy(true);
                void api.reconcilePending()
                  .then((result) => {
                    applySnapshot(result.snapshot, requestSequence, true);
                    queuePresentation(result.command);
                    setPending(null);
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false));
              }}>결과 확인</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                const requestSequence = ++sequence.current;
                mutationFence.current = requestSequence;
                setBusy(true);
                void api.retryPending()
                  .then((result) => {
                    applySnapshot(result.snapshot, requestSequence, true);
                    queuePresentation(result.command);
                    setPending(null);
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false));
              }}>같은 명령 재시도</Button>
            </div>
          </ConsoleNotice>}
        </div>}
      </div>
      <section aria-label="게임 관리 탭" className="w-full border-y bg-background">
        <div className="space-y-3 px-4 py-4">
          <h2 className="text-sm font-semibold">게임 관리</h2>
          <PillTabs
            idPrefix={tabId}
            ariaLabel="게임 관리 메뉴"
            activeTab={activeDetailsTab}
            onTabChange={setActiveDetailsTab}
            tabs={[
              { id: "rewards", label: "적립/보상" },
              { id: "operations", label: "게임 조작" },
              { id: "history", label: "게임 기록" },
            ]}
          />
        </div>
        <div id={`${tabId}-panel-rewards`} role="tabpanel" aria-labelledby={`${tabId}-tab-rewards`}
          hidden={activeDetailsTab !== "rewards"} className="border-t px-4 pb-5 pt-4">
          <AccumulationRewardsPanel
            state={state} disabled={locked} reason={reason} send={send} />
        </div>
        <div id={`${tabId}-panel-operations`} role="tabpanel" aria-labelledby={`${tabId}-tab-operations`}
          hidden={activeDetailsTab !== "operations"} className="border-t px-4 pb-5 pt-4">
          <GameOperationsPanel state={state} board={liveBoard} disabled={locked} reason={reason} send={send} />
        </div>
        <div id={`${tabId}-panel-history`} role="tabpanel" aria-labelledby={`${tabId}-tab-history`}
          hidden={activeDetailsTab !== "history"} className="border-t px-4 pb-5 pt-4">
          <GameHistoryPanel
            sessionId={state?.session?.id ?? state?.lastEndedSession?.id ?? null}
            revision={state?.revision ?? 0}
            board={historyBoard}
            active={activeDetailsTab === "history"}
          />
        </div>
      </section>
    </div>
  );
  if (view === "controls") return controls;
  const boardView = (
    <ConsolePanel title="게임 보드" description="칸을 누르면 말 위치를 이동할 수 있습니다.">
      {boardError && (
        <ConsoleNotice variant="destructive">{boardError}</ConsoleNotice>
      )}
      <div ref={boardInteraction}>
        <Board
          board={liveBoard}
          themeId={state?.boardThemeId ?? "lime-clover"}
          fontId={state?.fontId}
          tokenCellId={presentation.cellId}
          moving={presentation.moving}
          dice={presentation.dice}
          effectPhase={presentation.effectPhase}
          trailCellIds={presentation.trailCellIds}
          landingPulseKey={presentation.landingPulseKey}
          reducedMotion={presentation.reducedMotion}
          pawnImageUrl={
            state?.pawnAppearance.image
              ? apiAssetUrl(state.pawnAppearance.image.url)
              : null
          }
          pawnStyleId={state?.pawnAppearance.styleId ?? "star-medal"}
          interactive
          selectedCellId={selectedCell ?? undefined}
          selectedCellAction={selectedCell && selectedCell !== state?.token.cellId && (
            <Button
              className="w-full"
              variant="destructive"
              aria-label="이 칸으로 이동"
              title="이 칸으로 이동"
              disabled={!state?.session || locked || !state.capabilities?.setPosition || !state.capabilities?.arrivalEffects}
              onClick={() => void send({
                type: "correct_position",
                cellId: selectedCell,
                pauseAutomaticMovement: true,
                triggerArrivalEffects: true,
                ...base,
              }).then((applied) => { if (applied) setSelectedCell(null); })}
            >
              <MoveRight aria-hidden="true" />
              이 칸으로 이동
            </Button>
          )}
          onCellSelect={(cellId) => setSelectedCell((current) =>
            current === cellId || cellId === state?.token.cellId ? null : cellId)}
        />
      </div>
    </ConsolePanel>
  );
  if (view === "board") return boardView;
  return (
    <>
      {boardView}
      {controlsRoot ? (
        createPortal(
          controls,
          controlsRoot,
        )
      ) : (
        <aside className="mt-4 lg:hidden">{controls}</aside>
      )}
    </>
  );
}
