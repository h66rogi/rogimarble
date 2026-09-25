"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionHistoryEntryDto } from "@rogimarble/contracts";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import { api } from "../../../../lib/api";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ConsoleNotice } from "@/shared/components/common/console-ui";

const labels: Record<string, string> = {
  create_session: "게임 시작", roll_dice: "주사위 굴리기", set_direction: "진행 방향 변경",
  set_position: "말 위치 보정", pause: "게임 일시정지", resume: "게임 재개",
  end_session: "게임 종료", adjust_inventory: "보상 수량 변경", create_mission: "미션 생성",
  complete_mission: "미션 완료", waive_mission: "미션 면제", use_shield: "실드 사용",
  choose_destination: "목적지 선택", cancel_destination: "목적지 취소",
  adjust_counter: "적립 수량 변경", clear_movement_lock: "이동 제한 해제",
  set_movement_lock_remaining: "남은 휴식 횟수 변경", clear_roll_modifier: "이동 배수 해제",
  apply_board_version: "게임판 변경",
};

function detail(entry: SessionHistoryEntryDto, board: BoardDefinition) {
  const result = entry.result && typeof entry.result === "object" ? entry.result as Record<string, unknown> : {};
  const cellLabel = (id: unknown) => typeof id === "string" ? board.cells.find((cell) => cell.id === id)?.label ?? id : null;
  if (entry.type === "roll_dice" && Array.isArray(result.dice)) {
    const dice = result.dice.filter((value): value is number => typeof value === "number");
    return `주사위 ${dice.join(" + ")}${cellLabel(result.toCellId) ? ` · ${cellLabel(result.toCellId)} 도착` : ""}`;
  }
  if (entry.type === "set_position") return `${cellLabel(result.fromCellId) ?? "이전 칸"} → ${cellLabel(result.toCellId) ?? "새 칸"}`;
  if (entry.type === "choose_destination") {
    if (result.travelStatus === "moved") return `${cellLabel(result.fromCellId) ?? "이전 칸"} → ${cellLabel(result.toCellId) ?? "목적지"}`;
    if (cellLabel(result.cellId)) return `${cellLabel(result.cellId)} 선택`;
  }
  if (entry.type === "set_movement_lock_remaining" && typeof result.rollsRemaining === "number") return `남은 휴식 ${result.rollsRemaining}회`;
  if (entry.type === "adjust_counter" && typeof result.quantity === "number") return `적립 총량 ${result.quantity}`;
  if (entry.type === "adjust_inventory" && result.inventory && typeof result.inventory === "object") {
    const item = result.inventory as Record<string, unknown>;
    return `${typeof item.name === "string" ? item.name : "보상"} ${item.quantity ?? ""}개`;
  }
  if (result.mission && typeof result.mission === "object") {
    const mission = result.mission as Record<string, unknown>;
    if (typeof mission.message === "string") return mission.message;
  }
  if (entry.type === "set_direction" && typeof result.direction === "string") return result.direction === "reverse" ? "역방향" : "정방향";
  return entry.reason && !["방송 운영 조작", "create session"].includes(entry.reason) ? entry.reason : "";
}

function effectDetails(entry: SessionHistoryEntryDto, board: BoardDefinition): string[] {
  const result = entry.result && typeof entry.result === "object" ? entry.result as Record<string, unknown> : {};
  const lines: string[] = [];
  const visit = (effects: unknown) => {
    if (!Array.isArray(effects)) return;
    for (const item of effects) {
      if (!item || typeof item !== "object") continue;
      const effect = item as Record<string, unknown>;
      const value = effect.result && typeof effect.result === "object" ? effect.result as Record<string, unknown> : {};
      const cell = board.cells.find((candidate) => candidate.id === effect.cellId);
      const prefix = cell ? `${cell.label} · ` : "";
      if (effect.type === "mission" && typeof value.message === "string") lines.push(`${prefix}${value.message}`);
      else if (effect.type === "counter_settle" && typeof value.quantity === "number" && value.quantity > 0) {
        const counter = board.counters.find((candidate) => candidate.id === value.counterId);
        lines.push(`${prefix}${counter?.label ?? "적립"} ${value.quantity}${counter?.unit ?? ""} 청산`);
      } else if (effect.type === "counter_add" && typeof value.value === "number") {
        const counter = board.counters.find((candidate) => candidate.id === value.counterId);
        lines.push(`${prefix}${counter?.label ?? "적립"} 총 ${value.value}${counter?.unit ?? ""}`);
      } else if (effect.type === "movement_lock") lines.push(`${prefix}이동 제한 적용`);
      else if (effect.type === "modify_roll" && typeof value.factor === "number") lines.push(`${prefix}다음 이동 ×${value.factor}`);
      else if (effect.type === "choose_destination") lines.push(`${prefix}목적지 선택 요청`);
      else if (effect.type === "move_steps" && Array.isArray(value.path)) lines.push(`${prefix}추가 이동 ${value.path.length}칸`);
      visit(value.effects);
    }
  };
  visit(result.effects);
  return lines;
}

function mergeLatest(latest: readonly SessionHistoryEntryDto[], previous: readonly SessionHistoryEntryDto[]) {
  const known = new Set(latest.map((item) => item.commandId));
  return [...latest, ...previous.filter((item) => !known.has(item.commandId))];
}

export function GameHistoryPanel({
  sessionId,
  revision,
  board,
  active,
}: {
  sessionId: string | null;
  revision: number;
  board: BoardDefinition;
  active: boolean;
}) {
  const [items, setItems] = useState<readonly SessionHistoryEntryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);

  useEffect(() => {
    if (!active || !sessionId) return;
    const request = ++sequence.current;
    void api.sessionHistory(sessionId)
      .then((page) => {
        if (request !== sequence.current) return;
        setItems((previous) => loadedSession === sessionId ? mergeLatest(page.items, previous) : page.items);
        if (loadedSession !== sessionId) setCursor(page.nextCursor);
        setLoadedSession(sessionId);
        setError("");
      })
      .catch((cause) => {
        if (request === sequence.current) setError(cause instanceof Error ? cause.message : "게임 기록을 불러오지 못했습니다.");
      });
    return () => { sequence.current += 1; };
  }, [active, sessionId, revision]);

  const loadMore = async () => {
    if (!sessionId || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.sessionHistory(sessionId, cursor);
      setItems((previous) => mergeLatest(previous, page.items));
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이전 기록을 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  };

  if (!sessionId) return <p className="text-sm text-muted-foreground">게임을 시작하면 기록이 나타납니다.</p>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">이 게임에서 일어난 일을 최근 순서대로 표시합니다.</p>
    {error && <ConsoleNotice variant="warning">{error}</ConsoleNotice>}
    {loadedSession !== sessionId && !error && <p className="text-sm text-muted-foreground">기록을 불러오는 중입니다.</p>}
    {loadedSession === sessionId && <>
      <ol className="divide-y">
        {items.map((entry) => {
          const summary = detail(entry, board);
          const effects = effectDetails(entry, board);
          return <li key={entry.commandId} className="space-y-1 py-3 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{entry.type === "choose_destination" &&
                entry.result && typeof entry.result === "object" && "travelStatus" in entry.result &&
                entry.result.travelStatus === "moved" ? "세계여행 이동" : labels[entry.type] ?? entry.type}</strong>
              <Badge variant="secondary">{entry.source === "donation" ? "후원 자동 처리" : "운영자 조작"}</Badge>
            </div>
            {summary && <p className="text-sm">{summary}</p>}
            {effects.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {effects.map((line, index) => <li key={`${entry.commandId}-${index}`}>{line}</li>)}
            </ul>}
            <time className="block text-xs text-muted-foreground" dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString("ko-KR")}
            </time>
          </li>;
        })}
      </ol>
      {!items.length && <p className="text-sm text-muted-foreground">표시할 게임 기록이 없습니다.</p>}
      {cursor && <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? "불러오는 중…" : "이전 기록 더 보기"}
      </Button>}
    </>}
  </div>;
}
