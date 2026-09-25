import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateBoardDefinition } from '../../../packages/game-core/src/board-definition.ts';
import { boardPathArrows } from '../../../packages/overlay-ui/src/board-path-arrows.ts';

const board: unknown = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));
validateBoardDefinition(board);

test('path arrows follow cell IDs, wrap at the start, and reverse with the session direction', () => {
  const forward = boardPathArrows(board, 'forward');
  const reverse = boardPathArrows(board, 'reverse');
  assert.equal(forward.length, board.path.length);
  assert.equal(reverse.length, board.path.length);
  assert.deepEqual(forward[0] && [forward[0].fromCellId, forward[0].toCellId, forward[0].angle], ['cell-01', 'cell-02', 0]);
  assert.deepEqual(reverse[0] && [reverse[0].fromCellId, reverse[0].toCellId, reverse[0].angle], ['cell-01', 'cell-26', 90]);
  assert.equal(forward.at(-1)?.toCellId, 'cell-01');
  assert.ok(forward.every(arrow => Number.isFinite(arrow.x) && Number.isFinite(arrow.y)));
});
