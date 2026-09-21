"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MissionDto } from "@rogimarble/contracts";
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
import {
  ConsolePanel,
  ConsoleNotice,
  ConsoleField,
  ConsoleCheck,
  ConsoleSelect,
} from "@/shared/components/common/console-ui";
import { Separator } from "@/shared/components/ui/separator";
import { useRollPresentation } from "../../../../lib/use-roll-presentation";
import { GameEffectsPanel } from "./game-effects-panel";
import { PawnImageControl } from "./pawn-image-control";

const board = boardPreset as unknown as BoardDefinition;

export function MarbleOperationsPanel({
  view = "full",
}: {
  view?: "full" | "board" | "controls";
}) {
  const [state, setState] = useState<OperatorSnapshot | null>(null);
  const [boards, setBoards] = useState<readonly RunnableBoardVersionDto[]>([]);
  const [selectedCell, setSelectedCell] = useState(
    board.startCellId ?? board.path[0],
  );
  const [reason, setReason] = useState("방송 운영 조작");
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
  const [inventorySet, setInventorySet] = useState<Record<string, string>>({});
  const [missionMessage, setMissionMessage] = useState("");
  const [missionQuantity, setMissionQuantity] = useState("1");
  const [missionShield, setMissionShield] = useState("");
  const [triggerArrivalEffects, setTriggerArrivalEffects] = useState(false);

  useEffect(() => {
    const next = document.getElementById("marble-controls-root");
    if (next !== controlsRoot) setControlsRoot(next);
  });

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
    const previous = canonical.current?.session;
    const incoming = next.session;
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
    [reason, state?.revision],
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
    if (!activeBoard.path.includes(selectedCell))
      setSelectedCell(activeBoard.startCellId ?? activeBoard.path[0]);
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
  const updatePawnAppearance = (
    pawnAppearance: OperatorSnapshot["pawnAppearance"],
  ) => {
    if (!canonical.current) return;
    canonical.current = { ...canonical.current, pawnAppearance };
    setState(canonical.current);
  };

  const controls = (
    <div className="space-y-4">
      {error && <ConsoleNotice variant="destructive">{error}</ConsoleNotice>}
      {pending && (
        <ConsoleNotice variant="warning" title="이전 명령 확인 필요">
          <p>같은 명령 ID로 결과를 확인하거나 안전하게 재시도합니다.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const requestSequence = ++sequence.current;
                mutationFence.current = requestSequence;
                setBusy(true);
                void api
                  .reconcilePending()
                  .then((result) => {
                    applySnapshot(result.snapshot, requestSequence, true);
                    queuePresentation(result.command);
                    setPending(null);
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false));
              }}
            >
              결과 확인
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                const requestSequence = ++sequence.current;
                mutationFence.current = requestSequence;
                setBusy(true);
                void api
                  .retryPending()
                  .then((result) => {
                    applySnapshot(result.snapshot, requestSequence, true);
                    queuePresentation(result.command);
                    setPending(null);
                  })
                  .catch((cause) => setError(cause.message))
                  .finally(() => setBusy(false));
              }}
            >
              같은 명령 재시도
            </Button>
          </div>
        </ConsoleNotice>
      )}
      <ConsolePanel
        title="방송 조작"
        description="서버가 결과와 위치를 확정합니다."
      >
        <Badge
          variant={
            state?.session?.status === "running" ? "default" : "secondary"
          }
        >
          {state?.session?.status === "running"
            ? "진행 중"
            : state?.session?.status === "paused"
              ? "일시정지"
              : "세션 없음"}
        </Badge>
        {!state?.session && (
          <div className="space-y-2">
            {boards.length ? (
              boards.map((candidate) => (
                <Button
                  className="w-full"
                  key={candidate.id}
                  disabled={locked || !state?.capabilities?.sessionLifecycle}
                  onClick={() => void start(candidate)}
                >
                  {candidate.previewOnly
                    ? `${candidate.name} · 효과 없는 검증 세션`
                    : `${candidate.name} 시작`}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                실행 가능한 보드가 없습니다.
              </p>
            )}
          </div>
        )}
        <ConsoleField label="작업 사유">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConsoleField>
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={
              !state?.session ||
              locked ||
              presentation.effectPhase !== "idle" ||
              !state.capabilities?.manualRoll
            }
            onClick={() => void send({ type: "roll", ...base })}
          >
            {state?.session?.status === "paused"
              ? "한 건 진행"
              : "주사위 굴리기"}
          </Button>
          {state?.session?.status === "paused" ? (
            <Button
              variant="outline"
              disabled={locked || !state?.capabilities?.sessionLifecycle}
              onClick={() => void send({ type: "resume", ...base })}
            >
              재개
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={
                !state?.session ||
                locked ||
                !state.capabilities?.sessionLifecycle
              }
              onClick={() => void send({ type: "pause", ...base })}
            >
              일시정지
            </Button>
          )}
          <Button
            variant="outline"
            disabled={
              !state?.session || locked || !state.capabilities?.setDirection
            }
            onClick={() =>
              void send({
                type: "set_direction",
                direction: "forward",
                ...base,
              })
            }
          >
            정방향
          </Button>
          <Button
            variant="outline"
            disabled={
              !state?.session || locked || !state.capabilities?.setDirection
            }
            onClick={() =>
              void send({
                type: "set_direction",
                direction: "reverse",
                ...base,
              })
            }
          >
            역방향
          </Button>
          <Button
            className="col-span-2"
            variant="destructive"
            disabled={
              !state?.session || locked || !state.capabilities?.sessionLifecycle
            }
            onClick={() => void send({ type: "end_session", ...base })}
          >
            세션 종료
          </Button>
        </div>
      </ConsolePanel>
      {state && (
        <PawnImageControl
          appearance={state.pawnAppearance}
          disabled={locked}
          onChange={updatePawnAppearance}
        />
      )}
      <ConsolePanel
        title="말 위치 보정"
        description="기본은 위치만 보정합니다. 도착 효과를 선택하면 해당 칸의 실제 효과도 실행됩니다."
      >
        <ConsoleField label="이동할 칸">
          <ConsoleSelect
            value={selectedCell}
            onValueChange={setSelectedCell}
            options={liveBoard.path.map((cellId) => ({
              value: cellId,
              label:
                liveBoard.cells.find((cell) => cell.id === cellId)?.label ??
                cellId,
            }))}
          />
        </ConsoleField>
        <ConsoleCheck
          checked={triggerArrivalEffects}
          onCheckedChange={setTriggerArrivalEffects}
        >
          도착 칸 효과도 실행
        </ConsoleCheck>
        <Button
          className="w-full"
          variant="destructive"
          disabled={
            !state?.session || locked || !state.capabilities?.setPosition
          }
          onClick={() =>
            void send({
              type: "correct_position",
              cellId: selectedCell,
              pauseAutomaticMovement: true,
              triggerArrivalEffects,
              ...base,
            })
          }
        >
          선택 칸으로 보정
        </Button>
      </ConsolePanel>
      {state && (
        <GameEffectsPanel
          state={state}
          board={liveBoard}
          disabled={locked}
          reason={reason}
          send={send}
        />
      )}
      <ConsolePanel title="보상 수량">
        {state?.inventory.length ? (
          state.inventory.map((item) => (
            <div className="space-y-2" key={item.itemId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {item.name} · {item.quantity}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`${item.name} 1개 추가`}
                    disabled={locked || !state.capabilities?.inventory}
                    onClick={() =>
                      void send({
                        type: "adjust_inventory",
                        itemId: item.itemId,
                        mode: "delta",
                        quantity: 1,
                        expectedInventoryRevision: item.revision,
                        ...base,
                      })
                    }
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`${item.name} 1개 차감`}
                    disabled={
                      locked ||
                      item.quantity < 1 ||
                      !state.capabilities?.inventory
                    }
                    onClick={() =>
                      void send({
                        type: "adjust_inventory",
                        itemId: item.itemId,
                        mode: "delta",
                        quantity: -1,
                        expectedInventoryRevision: item.revision,
                        ...base,
                      })
                    }
                  >
                    −1
                  </Button>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <ConsoleField label={`${item.name} 최종 수량`}>
                    <Input
                      inputMode="numeric"
                      value={inventorySet[item.itemId] ?? ""}
                      onChange={(event) =>
                        setInventorySet((current) => ({
                          ...current,
                          [item.itemId]: event.target.value,
                        }))
                      }
                    />
                  </ConsoleField>
                </div>
                <Button
                  size="sm"
                  disabled={
                    locked ||
                    !state?.capabilities?.inventory ||
                    !/^\d+$/.test(inventorySet[item.itemId] ?? "")
                  }
                  onClick={() =>
                    void send({
                      type: "adjust_inventory",
                      itemId: item.itemId,
                      mode: "set",
                      quantity: Number(inventorySet[item.itemId]),
                      expectedInventoryRevision: item.revision,
                      ...base,
                    })
                  }
                >
                  설정
                </Button>
              </div>
              <Separator />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            등록된 보상 아이템이 없습니다.
          </p>
        )}
      </ConsolePanel>
      <ConsolePanel title="수동 미션">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const quantity = Number(missionQuantity);
            if (
              !missionMessage.trim() ||
              !Number.isInteger(quantity) ||
              quantity < 1
            )
              return;
            void send({
              type: "create_mission",
              message: missionMessage.trim(),
              quantity,
              shield: missionShield
                ? { itemId: missionShield, quantity: 1 }
                : null,
              ...base,
            }).then((ok) => {
              if (ok) setMissionMessage("");
            });
          }}
        >
          <ConsoleField label="미션 문구">
            <Input
              value={missionMessage}
              onChange={(event) => setMissionMessage(event.target.value)}
            />
          </ConsoleField>
          <ConsoleField label="수량">
            <Input
              type="number"
              min="1"
              value={missionQuantity}
              onChange={(event) => setMissionQuantity(event.target.value)}
            />
          </ConsoleField>
          <ConsoleField label="실드 정책">
            <ConsoleSelect
              value={missionShield}
              onValueChange={setMissionShield}
              options={[
                { value: "", label: "실드 불허" },
                ...(state?.inventory.map((item) => ({
                  value: item.itemId,
                  label: item.name,
                })) ?? []),
              ]}
            />
          </ConsoleField>
          <Button
            className="w-full"
            disabled={
              !state?.session ||
              locked ||
              Boolean(pending) ||
              !state.capabilities?.missions
            }
          >
            미션 만들기
          </Button>
        </form>
      </ConsolePanel>
      {state?.missions.map((mission) => {
        const shieldItem = mission.shield
          ? state.inventory.find(
              (item) => item.itemId === mission.shield?.itemId,
            )
          : null;
        return (
          <ConsolePanel
            key={mission.id}
            title={`${mission.message} · ${mission.quantity}개`}
          >
            <Badge variant="secondary">
              {mission.status === "pending"
                ? "진행 중"
                : mission.status === "completed"
                  ? "완료"
                  : mission.status === "waived"
                    ? "면제"
                    : "실드 사용"}
            </Badge>
            {mission.status === "pending" && (
              <>
                <MissionRemaining mission={mission} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={locked || !state.capabilities?.missions}
                    onClick={() =>
                      void send({
                        type: "complete_mission",
                        missionId: mission.id,
                        expectedMissionRevision: mission.revision,
                        ...base,
                      })
                    }
                  >
                    완료
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !state.capabilities?.missions}
                    onClick={() =>
                      void send({
                        type: "waive_mission",
                        missionId: mission.id,
                        expectedMissionRevision: mission.revision,
                        ...base,
                      })
                    }
                  >
                    면제
                  </Button>
                  {mission.shield && shieldItem && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        locked ||
                        !state.capabilities?.missions ||
                        shieldItem.quantity < mission.shield.quantity
                      }
                      onClick={() =>
                        void send({
                          type: "use_shield",
                          missionId: mission.id,
                          expectedMissionRevision: mission.revision,
                          expectedInventoryRevision: shieldItem.revision,
                          ...base,
                        })
                      }
                    >
                      실드 사용
                    </Button>
                  )}
                </div>
              </>
            )}
          </ConsolePanel>
        );
      })}
    </div>
  );
  if (view === "controls") return controls;
  const boardView = (
    <ConsolePanel title="게임 보드">
      {boardError && (
        <ConsoleNotice variant="destructive">{boardError}</ConsoleNotice>
      )}
      <Board
        board={liveBoard}
        themeId={state?.boardThemeId ?? "lime-clover"} fontId={state?.fontId}
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
        interactive
        selectedCellId={selectedCell}
        onCellSelect={setSelectedCell}
      />
    </ConsolePanel>
  );
  if (view === "board") return boardView;
  return (
    <>
      {boardView}
      {controlsRoot ? (
        createPortal(
          <div className="space-y-4 p-4">{controls}</div>,
          controlsRoot,
        )
      ) : (
        <aside className="mt-4 space-y-4 lg:hidden">{controls}</aside>
      )}
    </>
  );
}

function MissionRemaining({ mission }: { mission: MissionDto }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!mission.durationSeconds) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mission.durationSeconds]);
  if (!mission.durationSeconds) return null;
  const remaining = Math.max(
    0,
    Math.ceil(
      (Date.parse(mission.createdAt) + mission.durationSeconds * 1000 - now) /
        1000,
    ),
  );
  return (
    <p
      className={`mt-1 text-xs ${remaining === 0 ? "text-destructive" : "text-muted-foreground"}`}
    >
      {remaining === 0
        ? "시간 만료 · 운영자 확인 필요"
        : `남은 시간 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}{" "}
      · 자동 완료되지 않음
    </p>
  );
}
