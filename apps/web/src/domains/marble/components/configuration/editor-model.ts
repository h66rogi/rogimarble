import type {
  BoardCell,
  BoardDefinition,
  BoardEffect,
  BoardPassEffect,
  CanvasRect,
} from "@rogimarble/game-core/board";
import type { DonationAction } from "@rogimarble/game-core";

export type NamedItem = {
  readonly id: string;
  readonly label: string;
  readonly maxQuantity?: number;
};
export const effectNames: Record<BoardEffect["type"], string> = {
  none: "쉬어가는 칸",
  mission: "미션 하기",
  choice_mission: "미션 중 하나 선택",
  move_steps: "앞으로 / 뒤로 이동",
  choose_destination: "원하는 칸으로 여행",
  set_direction: "진행 방향 바꾸기",
  movement_lock: "무인도 · 잠시 쉬기",
  modify_roll: "다음 주사위 바꾸기",
  counter_add: "수량 적립하기",
  counter_settle: "적립한 수량 청산",
  grant_item: "아이템 받기",
  unconfigured: "아직 정하지 않음",
};
export const actionNames: Record<DonationAction["type"], string> = {
  roll_dice: "주사위 굴리기",
  mission: "미션 하기",
  grant_item: "아이템 지급",
  choose_destination: "원하는 칸 선택",
};
export const passTypes: readonly BoardPassEffect["type"][] = [
  "none",
  "mission",
  "counter_add",
  "grant_item",
  "unconfigured",
];
export const artworkNames: Record<string, string> = {
  "party-toast-v1": "건배",
  "party-island-v1": "무인도",
  "party-travel-v1": "세계여행",
  "party-heart-v1": "하트",
  "party-music-v1": "노래",
  "party-shield-v1": "실드",
  "party-snack-v1": "안주",
  "party-kiss-v1": "뽀뽀",
  "party-punch-v1": "권투 글러브 (기존)",
  "party-instant-camera-v1": "즉방 · 즉석카메라",
  "party-start-flag-v1": "출발 깃발",
  "party-empty-gift-v1": "꽝 · 빈 선물상자",
  "party-talk-v1": "대화",
  "party-turn-v1": "방향 전환",
  "party-bank-v1": "적립",
};
export function newEffect(
  type: BoardEffect["type"],
  items: readonly NamedItem[],
  board: BoardDefinition,
): BoardEffect {
  switch (type) {
    case "mission":
      return { type, message: "새 미션", shield: null, durationSeconds: null };
    case "choice_mission":
      return {
        type,
        prompt: "어떤 미션을 할까요?",
        selection: "operator",
        choices: [
          { id: crypto.randomUUID(), label: "선택 1", message: "새 미션" },
        ],
      };
    case "move_steps":
      return {
        type,
        steps: 2,
        direction: "against_current",
        onArrival: "trigger",
        onPass: "skip",
      };
    case "choose_destination":
      return {
        type,
        selection: "both",
        timing: "next_turn",
        allowedCellIds: null,
        excludeCurrentCell: true,
        onArrival: "trigger",
      };
    case "set_direction":
      return { type, direction: "toggle" };
    case "movement_lock":
      return {
        type,
        release: {
          type: "skip_rolls_or_doubles",
          count: 3,
          onDoubles: "move_sum",
        },
      };
    case "modify_roll":
      return {
        type,
        uses: 1,
        modifier: { type: "movement_multiplier", factor: 2 },
      };
    case "counter_add":
      return { type, counterId: board.counters[0]?.id ?? "", quantity: 1 };
    case "counter_settle":
      return {
        type,
        counterId: board.counters[0]?.id ?? "",
        message: "적립한 수량을 모두 수행하세요",
        shield: null,
        settleOn: "creation",
      };
    case "grant_item":
      return { type, itemId: items[0]?.id ?? "", quantity: 1 };
    case "unconfigured":
      return { type, question: "이 칸에서 어떤 일을 할까요?" };
    default:
      return { type: "none" };
  }
}
export function newAction(
  type: DonationAction["type"],
  items: readonly NamedItem[],
): DonationAction {
  switch (type) {
    case "mission":
      return { type, message: "새 미션", shield: null };
    case "grant_item":
      return { type, itemId: items[0]?.id ?? "", quantity: 1 };
    case "choose_destination":
      return { type, selection: "both", chatCommand: "!이동" };
    default:
      return { type: "roll_dice", rollCount: 1 };
  }
}
export function describeEffect(
  effect: BoardEffect,
  board: BoardDefinition,
  items: readonly NamedItem[] = [],
): string {
  const counter =
    "counterId" in effect
      ? board.counters.find((c) => c.id === effect.counterId)
      : undefined;
  switch (effect.type) {
    case "none":
      return "추가 동작 없이 머물러요";
    case "mission":
      return effect.message || "미션 문구를 입력하세요";
    case "choice_mission":
      return `${effect.choices.length}개 미션 중 하나를 선택해요`;
    case "move_steps":
      return `${{ forward: "정방향으로", reverse: "역방향으로", with_current: "현재 방향으로", against_current: "반대 방향으로" }[effect.direction]} ${effect.steps}칸 이동해요`;
    case "choose_destination":
      return `${effect.timing === "next_turn" ? "다음 차례에" : "선택하면 바로"} 원하는 칸으로 이동해요`;
    case "set_direction":
      return effect.direction === "toggle"
        ? "다음 이동부터 방향이 반대로 바뀌어요"
        : `다음 이동부터 ${effect.direction === "forward" ? "정방향" : "역방향"}으로 가요`;
    case "movement_lock":
      return effect.release.type === "operator"
        ? "운영자가 풀어줄 때까지 쉬어요"
        : effect.release.type === "dice_faces"
          ? `주사위 ${effect.release.faces.join(", ")}이 나오면 풀려요`
          : `${effect.release.count}회 쉬어요${effect.release.type === "skip_rolls_or_doubles" ? " · 더블이면 탈출" : ""}`;
    case "modify_roll":
      return `다음 ${effect.uses}회 · ${effect.modifier.type === "movement_multiplier" ? `이동 거리 ×${effect.modifier.factor}` : effect.modifier.type === "dice_count" ? `주사위 ${effect.modifier.count}개` : `${effect.modifier.count}번 굴리기`}`;
    case "counter_add":
      return `${counter?.label ?? "적립 수량"} +${effect.quantity}${counter?.unit ?? ""}`;
    case "counter_settle":
      return `${counter?.label ?? "적립 수량"} 전부를 즉시 차감하고 미션을 보여줘요`;
    case "grant_item":
      return `${items.find((i) => i.id === effect.itemId)?.label ?? "아이템"} ${effect.quantity}개를 받아요`;
    case "unconfigured":
      return effect.question || "게시 전에 동작을 정해주세요";
  }
}
export function describeAction(
  action: DonationAction,
  items: readonly NamedItem[],
): string {
  switch (action.type) {
    case "roll_dice":
      return `주사위 ${action.rollCount}회 굴리기`;
    case "mission":
      return action.message || "미션 문구를 입력하세요";
    case "grant_item":
      return `${items.find((i) => i.id === action.itemId)?.label ?? "아이템 선택 필요"} ${action.quantity}개 지급`;
    case "choose_destination":
      return `${action.selection === "operator" ? "운영자가" : action.selection === "donor_chat" ? "후원자가 채팅으로" : "운영자 또는 후원자가"} 목적지 선택`;
  }
}
/** Draft geometry intentionally remains usable while a text/effect field is incomplete. */
export function cellRect(board: BoardDefinition, cell: BoardCell): CanvasRect {
  if (cell.position.type === "freeform")
    return {
      x: cell.position.x * board.canvas.width,
      y: cell.position.y * board.canvas.height,
      width: cell.position.width * board.canvas.width,
      height: cell.position.height * board.canvas.height,
    };
  if (board.layout.type !== "perimeter_grid")
    return { x: 0, y: 0, width: 1, height: 1 };
  const { columns, rows, padding, gap } = board.layout;
  const width = Math.max(
    1,
    (board.canvas.width - padding.left - padding.right - (columns - 1) * gap) /
      columns,
  );
  const height = Math.max(
    1,
    (board.canvas.height - padding.top - padding.bottom - (rows - 1) * gap) /
      rows,
  );
  return {
    x: padding.left + cell.position.column * (width + gap),
    y: padding.top + cell.position.row * (height + gap),
    width,
    height,
  };
}
export function perimeter(rows: number, columns: number): [number, number][] {
  const positions: [number, number][] = [];
  for (let c = 0; c < columns; c++) positions.push([0, c]);
  for (let r = 1; r < rows; r++) positions.push([r, columns - 1]);
  for (let c = columns - 2; c >= 0; c--) positions.push([rows - 1, c]);
  for (let r = rows - 2; r > 0; r--) positions.push([r, 0]);
  return positions;
}
/** Resizing is atomic. Removed references require an explicit replacement. */
export function resizeBoard(
  board: BoardDefinition,
  rows: number,
  columns: number,
  removeIds: readonly string[],
  replacementId: string,
): BoardDefinition {
  if (
    ![rows, columns].every((n) => Number.isSafeInteger(n) && n >= 3 && n <= 64)
  )
    throw new Error("가로·세로는 3~64칸으로 입력하세요.");
  const count = 2 * (rows + columns) - 4;
  if (
    new Set(removeIds).size !== Math.max(0, board.path.length - count) ||
    removeIds.some((id) => !board.path.includes(id))
  )
    throw new Error("줄어드는 수만큼 제외할 칸을 선택하세요.");
  const retained = board.path.filter((id) => !removeIds.includes(id));
  if (removeIds.length && !retained.includes(replacementId))
    throw new Error("사라지는 칸을 대신할 칸을 선택하세요.");
  const repair = (effect: BoardEffect): BoardEffect =>
    effect.type === "choose_destination" && effect.allowedCellIds !== null
      ? {
          ...effect,
          allowedCellIds: [
            ...new Set(
              effect.allowedCellIds.map((id) =>
                removeIds.includes(id) ? replacementId : id,
              ),
            ),
          ],
        }
      : effect;
  const cells: BoardCell[] = retained.map((id) => {
    const cell = board.cells.find((c) => c.id === id)!;
    return { ...cell, onLand: cell.onLand.map(repair) };
  });
  while (cells.length < count)
    cells.push({
      id: `cell-${crypto.randomUUID()}`,
      label: "새 칸",
      position: { type: "grid", row: 0, column: 0 },
      appearance: {
        shape: "rounded_rectangle",
        fill: "#fff0f6",
        textColor: "#54213c",
        borderColor: "#edbdd1",
        artwork: null,
      },
      onLand: [{ type: "none" }],
      onPass: [],
    });
  const positions = perimeter(rows, columns);
  return {
    ...board,
    layout: {
      type: "perimeter_grid",
      rows,
      columns,
      gap: board.layout.type === "perimeter_grid" ? board.layout.gap : 14,
      padding:
        board.layout.type === "perimeter_grid"
          ? board.layout.padding
          : { top: 40, right: 40, bottom: 40, left: 40 },
    },
    cells: cells.map((cell, i) => ({
      ...cell,
      position: { type: "grid", row: positions[i][0], column: positions[i][1] },
    })),
    path: cells.map((c) => c.id),
    startCellId: removeIds.includes(board.startCellId)
      ? replacementId
      : board.startCellId,
  };
}
/** Move a stable cell to another route slot; contents and IDs travel together. */
export function moveCell(
  board: BoardDefinition,
  id: string,
  target: number,
): BoardDefinition {
  const path = [...board.path];
  const from = path.indexOf(id);
  if (from < 0 || target < 0 || target >= path.length || from === target)
    return board;
  path.splice(from, 1);
  path.splice(target, 0, id);
  const positions = board.path.map(
    (cellId) => board.cells.find((c) => c.id === cellId)!.position,
  );
  return {
    ...board,
    path,
    cells: board.cells.map((cell) => ({
      ...cell,
      position:
        board.layout.type === "perimeter_grid"
          ? positions[path.indexOf(cell.id)]
          : cell.position,
    })),
  };
}
