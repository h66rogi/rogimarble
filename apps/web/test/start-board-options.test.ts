import assert from "node:assert/strict";
import test from "node:test";
import type { RunnableBoardVersionDto } from "@rogimarble/contracts";
import { startBoardOptions } from "../src/domains/marble/components/start-board-options.ts";

const board = (id: string, boardId: string, name: string, previewOnly = false): RunnableBoardVersionDto => ({
  id, boardId, name, previewOnly, path: ["start"], initialCellId: "start",
});

test("starts with the published board, hides previews, and keeps one version per game board", () => {
  const options = startBoardOptions([
    board("newer-import", "main", "이름이 같은 이전 판"),
    board("other", "party", "파티판"),
    board("published", "main", "방송판"),
    board("preview", "main-safe-preview", "검증용", true),
  ], "published");
  assert.deepEqual(options.map(({ id, name }) => [id, name]), [
    ["published", "방송판"], ["other", "파티판"],
  ]);
});

test("falls back to the latest runnable board when nothing is published", () => {
  const options = startBoardOptions([
    board("latest", "main", "최근 판"),
    board("older", "main", "과거 판"),
    board("preview", "preview", "검증용", true),
  ], null);
  assert.deepEqual(options.map(({ id }) => id), ["latest"]);
});
