import assert from "node:assert/strict";
import test from "node:test";
import type { RunnableBoardVersionDto } from "@rogimarble/contracts";
import { preferredStartBoard } from "../src/domains/marble/components/start-board-options.ts";

const board = (id: string, boardId: string, name: string, previewOnly = false): RunnableBoardVersionDto => ({
  id, boardId, name, previewOnly, path: ["start"], initialCellId: "start",
});

test("starts only the published board when a channel has multiple board versions", () => {
  const selected = preferredStartBoard([
    board("newer-import", "main", "이름이 같은 이전 판"),
    board("other", "party", "파티판"),
    board("published", "main", "방송판"),
    board("preview", "main-safe-preview", "검증용", true),
  ], "published");
  assert.equal(selected?.id, "published");
  assert.equal(selected?.name, "방송판");
  assert.equal(preferredStartBoard([board("older", "main", "과거 판")], "missing"), null);
});

test("falls back to the latest runnable board when nothing is published", () => {
  const selected = preferredStartBoard([
    board("latest", "main", "최근 판"),
    board("older", "main", "과거 판"),
    board("preview", "preview", "검증용", true),
  ], null);
  assert.equal(selected?.id, "latest");
  assert.equal(preferredStartBoard([board("preview", "preview", "검증용", true)], null), null);
});
