import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { BoardDefinition } from "../../../packages/game-core/src/board-definition.ts";
import { validateBoardDefinition } from "../../../packages/game-core/src/board-definition.ts";
import {
  cellRect,
  moveCell,
  resizeBoard,
} from "../src/domains/marble/components/configuration/editor-model.ts";

function fixture(): BoardDefinition {
  return JSON.parse(
    readFileSync(
      new URL("../../../presets/streamer-board.json", import.meta.url),
      "utf8",
    ),
  );
}
test("moving a cell relocates its stable identity and effects together, without depending on cells array order", () => {
  const source = fixture();
  const board = { ...source, cells: [...source.cells].reverse() };
  const cell = board.cells.find((c) => c.id === board.path[1])!;
  const oldSlot = board.cells.find((c) => c.id === board.path[5])!.position;
  const moved = moveCell(board, cell.id, 5);
  validateBoardDefinition(moved);
  assert.equal(moved.path[5], cell.id);
  assert.deepEqual(
    moved.cells.find((c) => c.id === cell.id),
    { ...cell, position: oldSlot },
  );
  assert.equal(moved.startCellId, board.startCellId);
  assert.deepEqual(board, { ...source, cells: [...source.cells].reverse() });
});
test("growing the board atomically retains all identities, actions and references", () => {
  const board = fixture();
  const grown = resizeBoard(board, 6, 10, [], board.startCellId);
  validateBoardDefinition(grown);
  assert.equal(grown.path.length, 28);
  assert.deepEqual(grown.path.slice(0, 26), board.path);
  for (const before of board.cells) {
    const after = grown.cells.find((c) => c.id === before.id)!;
    assert.deepEqual(after.onLand, before.onLand);
    assert.deepEqual(after.appearance, before.appearance);
  }
  assert.equal(new Set(grown.path).size, 28);
});
test("shrinking requires explicit removed cells and repairs start and travel destinations", () => {
  const source = fixture();
  const removed = [source.path[0], source.path[2]],
    replacement = source.path[1];
  const board: BoardDefinition = {
    ...source,
    cells: source.cells.map((c) =>
      c.id === source.path[4]
        ? {
            ...c,
            onLand: [
              {
                type: "choose_destination",
                selection: "both",
                timing: "next_turn",
                allowedCellIds: [removed[0], replacement, removed[1]],
                excludeCurrentCell: true,
                onArrival: "trigger",
              },
            ],
          }
        : c,
    ),
  };
  assert.throws(() => resizeBoard(board, 6, 8, [], replacement), /제외할 칸/);
  assert.throws(
    () => resizeBoard(board, 6, 8, removed, removed[0]),
    /대신할 칸/,
  );
  assert.throws(
    () => resizeBoard(board, 6, 8, [removed[0], removed[0]], replacement),
    /제외할 칸/,
  );
  const reduced = resizeBoard(board, 6, 8, removed, replacement);
  validateBoardDefinition(reduced);
  assert.equal(reduced.startCellId, replacement);
  assert.equal(reduced.path.length, 24);
  const travel = reduced.cells.find((c) => c.id === source.path[4])!.onLand[0];
  assert.equal(travel.type, "choose_destination");
  if (travel.type === "choose_destination")
    assert.deepEqual(travel.allowedCellIds, [replacement]);
});
test("canvas scaling preserves cells and changes only rendered geometry", () => {
  const board = fixture();
  const cell = board.cells[1];
  const before = cellRect(board, cell);
  const scaled = {
    ...board,
    canvas: { ...board.canvas, width: 3840, height: 2160 },
  };
  assert.deepEqual(scaled.cells, board.cells);
  assert.deepEqual(scaled.path, board.path);
  assert.ok(cellRect(scaled, cell).width > before.width);
});
test("draft geometry can render while the user is editing an incomplete mission", () => {
  const board = fixture();
  const cell = {
    ...board.cells[1],
    label: "",
    onLand: [
      {
        type: "mission" as const,
        message: "",
        shield: null,
        durationSeconds: null,
      },
    ],
  };
  assert.ok(
    cellRect(
      {
        ...board,
        cells: board.cells.map((c) => (c.id === cell.id ? cell : c)),
      },
      cell,
    ).width > 0,
  );
});
test("freeform route reordering leaves physical cell positions intact", () => {
  const source = fixture();
  const board: BoardDefinition = {
    ...source,
    layout: { type: "freeform" },
    cells: source.cells.map((c) => {
      const r = cellRect(source, c);
      return {
        ...c,
        position: {
          type: "freeform",
          x: r.x / source.canvas.width,
          y: r.y / source.canvas.height,
          width: r.width / source.canvas.width,
          height: r.height / source.canvas.height,
        },
      };
    }),
  };
  const result = moveCell(board, board.path[1], 5);
  validateBoardDefinition(result);
  for (const cell of board.cells)
    assert.deepEqual(
      result.cells.find((c) => c.id === cell.id)?.position,
      cell.position,
    );
});
