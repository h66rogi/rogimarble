"use client";

import { Board, BroadcastPanel } from "@rogimarble/overlay-ui";
import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Dice5,
  Flag,
  MapPin,
  MessageCircle,
  RotateCcw,
  Route,
  Shield,
  Sparkles,
} from "lucide-react";
import type { BoardCell, BoardDefinition } from "@rogimarble/game-core/board";
import type { BroadcastDonationRule, OverlayLayoutDto } from "@rogimarble/contracts";
import { assetManifestById } from "@rogimarble/asset-manifest";
import { BoardCellButton } from "@/shared/components/ui/board-cell-button";
import { Button } from "@/shared/components/ui/button";
import { cellRect, describeEffect, effectNames } from "./editor-model";

// Dynamic geometry, artwork and user-selected colours are board data, not console chrome.
export function CellArt({ assetId }: { assetId: string }) {
  const asset = assetManifestById.get(assetId);
  if (asset?.kind !== "atlas-image") return <Sparkles size={20} />;
  return (
    <span
      aria-hidden="true"
      className="block aspect-square h-full max-h-full w-full max-w-full bg-no-repeat"
      style={{
        backgroundImage: `url(${asset.path})`,
        backgroundSize: `${asset.atlas.columns * 100}% ${asset.atlas.rows * 100}%`,
        backgroundPosition: `${(asset.atlas.x / (asset.atlas.columns - 1)) * 100}% ${(asset.atlas.y / (asset.atlas.rows - 1)) * 100}%`,
      }}
    />
  );
}
function CellIcon({ cell, start }: { cell: BoardCell; start: boolean }) {
  if (start) return <Flag />;
  const type = cell.onLand[0]?.type;
  return type === "mission" || type === "choice_mission" ? (
    <MessageCircle />
  ) : type === "modify_roll" ? (
    <Dice5 />
  ) : type === "grant_item" ? (
    <Shield />
  ) : type === "choose_destination" ? (
    <MapPin />
  ) : type === "set_direction" ? (
    <RotateCcw />
  ) : type === "none" ? (
    <span>·</span>
  ) : (
    <Sparkles />
  );
}
export function BoardCanvas({
  board,
  selectedId,
  highlightedIds,
  previewId,
  showPath,
  arrange,
  select,
  move,
}: {
  board: BoardDefinition;
  selectedId?: string;
  highlightedIds?: string[] | null;
  previewId?: string | null;
  showPath?: boolean;
  arrange?: boolean;
  select?: (id: string) => void;
  move?: (id: string, slot: number) => void;
}) {
  const rects = board.path.map((id) => {
    const cell = board.cells.find((c) => c.id === id)!;
    return { cell, rect: cellRect(board, cell) };
  });
  const centers = rects.map(
    ({ rect }) => `${rect.x + rect.width / 2},${rect.y + rect.height / 2}`,
  );
  const previewHeight =
    (1000 * Math.max(1, board.canvas.height)) / Math.max(1, board.canvas.width);
  return (
    <svg
      className="block max-h-[640px] w-full"
      viewBox={`0 0 1000 ${previewHeight}`}
      aria-label="편집 중인 게임판"
    >
      <foreignObject width={1000} height={previewHeight}>
        <div
          className={`h-full relative isolate w-full overflow-hidden rounded-2xl border border-border ${arrange ? "cursor-grab" : ""}`}
          style={{
            aspectRatio: `${Math.max(1, board.canvas.width)} / ${Math.max(1, board.canvas.height)}`,
            backgroundColor: board.canvas.backgroundColor,
          }}
        >
          <div
            style={{ color: canvasInk(board.canvas.backgroundColor) }}
            className="absolute left-[23%] top-[30%] flex h-[40%] w-[54%] flex-col items-center justify-center gap-2 text-center"
          >
            <span className="text-xs font-semibold tracking-[0.18em] opacity-70">
              나의 방송 게임판
            </span>
            <h3 className="text-lg font-semibold">{board.name}</h3>
            <p className="text-sm leading-relaxed opacity-70">
              {board.path.length}개의 칸, 나만의 방송 규칙
            </p>
            <div className="mt-2 flex gap-4">
              <span className="flex items-center gap-1 text-xs">
                <Dice5 size={16} />
                주사위 {board.dice.count}개
              </span>
              <span className="flex items-center gap-1 text-xs">
                <Route size={16} />
                {board.defaultDirection === "forward" ? "정방향" : "역방향"}
              </span>
            </div>
            <small className="text-xs opacity-70">
              {arrange
                ? "끌어서 순서를 바꿔보세요"
                : "칸을 선택해서 나만의 판을 만드세요"}
            </small>
          </div>
          {!!board.widgets.length && (
            <div className="pointer-events-none absolute inset-0 z-10">
              {board.widgets.map((w) => (
                <div
                  key={w.id}
                  className="absolute flex items-center justify-center overflow-hidden bg-background/90 text-xs"
                  style={{
                    left: `${w.bounds.x * 100}%`,
                    top: `${w.bounds.y * 100}%`,
                    width: `${w.bounds.width * 100}%`,
                    height: `${w.bounds.height * 100}%`,
                  }}
                >
                  {w.type === "text" ? (
                    w.text
                  ) : w.type === "image" ? (
                    <CellArt assetId={w.assetId} />
                  ) : (
                    {
                      dice: "⚄ 주사위",
                      current_mission: "현재 미션",
                      inventory: "보유 아이템",
                      donation_alert: "후원 알림",
                      direction: "진행 방향",
                      lottie: "애니메이션",
                    }[w.type]
                  )}
                </div>
              ))}
            </div>
          )}
          {showPath && (
            <svg
              className="pointer-events-none absolute inset-0 size-full text-primary/30"
              viewBox={`0 0 ${board.canvas.width} ${board.canvas.height}`}
              aria-hidden="true"
            >
              <polyline
                points={[...centers, centers[0]].join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth={4}
                strokeDasharray="10 10"
              />
            </svg>
          )}
          {rects.map(({ cell, rect }, i) => {
            const effect = cell.onLand[0];
            const next =
              rects[
                (i +
                  (board.defaultDirection === "forward"
                    ? 1
                    : rects.length - 1)) %
                  rects.length
              ].rect;
            const dx = next.x - rect.x,
              dy = next.y - rect.y;
            const DirectionIcon =
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? ArrowRight
                  : ArrowLeft
                : dy > 0
                  ? ArrowDown
                  : ArrowUp;
            const style: CSSProperties = {
              left: `${(rect.x / Math.max(1, board.canvas.width)) * 100}%`,
              top: `${(rect.y / Math.max(1, board.canvas.height)) * 100}%`,
              width: `${(rect.width / Math.max(1, board.canvas.width)) * 100}%`,
              height: `${(rect.height / Math.max(1, board.canvas.height)) * 100}%`,
              color: cell.appearance.textColor,
              "--cell-fill": cell.appearance.fill,
              "--cell-border": cell.appearance.borderColor,
            } as CSSProperties;
            return (
              <BoardCellButton
                selected={selectedId === cell.id}
                previewing={previewId === cell.id}
                dimmed={!!highlightedIds && !highlightedIds.includes(cell.id)}
                style={style}
                key={cell.id}
                data-cell-id={cell.id}
                aria-label={`${i + 1}번 ${cell.label}`}
                aria-pressed={selectedId === cell.id}
                onClick={() => select?.(cell.id)}
                draggable={arrange}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-marble-cell", cell.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (arrange) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData(
                    "application/x-marble-cell",
                  );
                  if (arrange && board.path.includes(id)) move?.(id, i);
                }}
                title={cell.onLand
                  .map((e) => describeEffect(e, board))
                  .join(" · ")}
              >
                <span
                  style={{
                    backgroundColor: cell.appearance.fill,
                    borderColor: cell.appearance.borderColor,
                  }}
                  className={
                    cell.appearance.shape === "circle"
                      ? "absolute inset-y-0 left-1/2 aspect-square max-w-full -translate-x-1/2 rounded-full border-2 "
                      : "absolute inset-0 rounded-xl border-2 "
                  }
                />
                <span className="absolute left-1.5 top-1 z-10 text-xs font-medium opacity-65">
                  {i + 1}
                </span>
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center">
                  {cell.appearance.artwork ? (
                    <CellArt assetId={cell.appearance.artwork.assetId} />
                  ) : (
                    <CellIcon
                      cell={cell}
                      start={cell.id === board.startCellId}
                    />
                  )}
                </span>
                <strong className="relative z-10 max-w-full break-keep text-xs font-semibold leading-tight">
                  {cell.label || "새 칸"}
                </strong>
                {(showPath || cell.id === board.startCellId) && (
                  <DirectionIcon className="absolute bottom-1 right-1 z-10 size-3 opacity-60" />
                )}
                {previewId === cell.id && (
                  <span
                    className="absolute -top-4 left-1/2 z-30 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                    aria-label="미리보기 말"
                  >
                    <MapPin className="size-5" />
                  </span>
                )}
              </BoardCellButton>
            );
          })}
        </div>
      </foreignObject>
    </svg>
  );
}
export function PaletteSwatches({
  value,
  change,
}: {
  value: string;
  change: (fill: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {["#fff0f6", "#e9f4ff", "#fff5ce", "#e8f6ef", "#eee9ff", "#ffffff"].map(
        (fill) => (
          <Button
            type="button"
            variant="outline"
            size="icon"
            key={fill}
            aria-label={`바탕색 ${fill}`}
            style={{ backgroundColor: fill, color: "#29252e" }}
            onClick={() => change(fill)}
          >
            {value === fill && <Check size={16} />}
          </Button>
        ),
      )}
    </div>
  );
}
export function ResizePreview({
  board,
  existingIds,
}: {
  board: BoardDefinition;
  existingIds: readonly string[];
}) {
  if (board.layout.type !== "perimeter_grid") return null;
  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: `repeat(${board.layout.columns}, minmax(0, 1fr))`,
      }}
    >
      {board.path.map((id, i) => {
        const c = board.cells.find((c) => c.id === id)!;
        return (
          c.position.type === "grid" && (
            <span
              key={id}
              title={`${i + 1}. ${c.label}`}
              style={{
                gridRow: c.position.row + 1,
                gridColumn: c.position.column + 1,
              }}
              className={`flex aspect-square items-center justify-center rounded text-xs ${existingIds.includes(id) ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}
            >
              {i + 1}
            </span>
          )
        );
      })}
    </div>
  );
}

const overlayWidgetLabels = {
  board: "게임판",
  dice: "주사위",
  current_mission: "현재 미션",
  inventory: "보유 아이템",
  direction: "진행 방향",
  menu: "후원 메뉴",
  dice_price: "주사위 가격",
  chatbox: "채팅창",
};

export function OverlayWidgetPreview({ id, value, board, rules = [] }: {
  id: OverlayLayoutDto["widgets"][number]["id"];
  value: OverlayLayoutDto;
  board?: BoardDefinition;
  rules?: readonly BroadcastDonationRule[];
}) {
  const themeId = value.widgetStyles?.[id]?.themeId ?? value.boardThemeId ?? 'lime-clover';
  const fontId = value.widgetStyles?.[id]?.fontId ?? value.fontId;
  if (id === "board" && board) {
    return <div className="h-full w-full">
      <Board board={board} tokenCellId={board.startCellId} themeId={themeId} fontId={fontId} fit reducedMotion />
    </div>;
  }
  if (id === "menu" || id === "dice_price") {
    return <BroadcastPanel kind={id} layout={{ ...value, boardThemeId: themeId, fontId }} rules={rules} />;
  }
  return <div className="flex h-full w-full items-center justify-center rounded border border-primary/30 bg-primary/10 text-sm text-foreground">
    {overlayWidgetLabels[id]}
  </div>;
}

export function OverlayLayoutPreview({ value, board, rules = [] }: { value: OverlayLayoutDto; board?: BoardDefinition; rules?: readonly BroadcastDonationRule[] }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-muted"
      style={{ aspectRatio: `${value.width || 1}/${value.height || 1}`, backgroundColor: value.background }}
    >
      {value.widgets.map((w) => (
        <div
          key={w.id}
          className="absolute"
          style={{
            left: `${w.bounds.x * 100}%`,
            top: `${w.bounds.y * 100}%`,
            width: `${w.bounds.width * 100}%`,
            height: `${w.bounds.height * 100}%`,
            zIndex: w.z,
          }}
        >
          <OverlayWidgetPreview id={w.id} value={value} board={board} rules={rules} />
        </div>
      ))}
    </div>
  );
}

function canvasInk(color: string) {
  const rgb = color.slice(1, 7);
  const channels = [0, 2, 4]
    .map((i) => parseInt(rgb.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#171717" : "#ffffff";
}
