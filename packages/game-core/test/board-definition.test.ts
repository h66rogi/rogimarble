import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertBoardPublishable, getCellRect, previewBoardMove, validateBoardDefinition,
  type BoardDefinition, type BoardEffect,
} from '../src/board-definition.ts';
import { knownAssetIds } from '../../asset-manifest/src/index.ts';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[]
  : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

function preset(): Mutable<BoardDefinition> {
  const value: unknown = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));
  validateBoardDefinition(value);
  return value as Mutable<BoardDefinition>;
}

const resources = { itemIds: ['drink-shield'], assetIds: [...knownAssetIds,'pawn-walk'] };

/** Explicit synthetic fixture, never a replacement for the streamer preset. */
function configuredFixture(): Mutable<BoardDefinition> {
  const board = preset();
  for (const cell of board.cells) cell.onLand = [{ type: 'none' }];
  return board;
}

test('streamer image is represented by 26 independent cells in clockwise logical order', () => {
  const board = preset();
  assert.deepEqual(board.canvas, { width: 1920, height: 1080, backgroundColor: '#fff8ef' });
  assert.equal(board.layout.type, 'perimeter_grid');
  if (board.layout.type !== 'perimeter_grid') return;
  assert.equal(board.layout.columns, 9); assert.equal(board.layout.rows, 6);
  assert.equal(board.cells.length, 26); assert.equal(board.path.length, 26);
  assert.deepEqual([0, 8, 13, 21].map((i) => board.cells[i].label), ['출발 →', '무인도', '세계여행', '방향전환']);
  assert.deepEqual(board.cells[11].onLand, [{ type: 'mission', message: '훈민정음 3분', shield: null, durationSeconds: 180 }]);
  assert.equal(board.widgets.length, 0);
});

test('confirmed streamer rules are configured; arbitrary unresolved drafts still cannot go live', () => {
  const board = preset();
  assertBoardPublishable(board, resources);
  assert.deepEqual(board.dice, { count: 1, sides: 6 });
  assert.deepEqual(board.counters, [{ id: 'drink-bank', label: '술 적립', unit: '잔', initialValue: 0 }]);
  assert.deepEqual(board.cells[12].onLand, [{ type: 'counter_add', counterId: 'drink-bank', quantity: 1 }]);
  assert.deepEqual(board.cells[17].onLand, [{ type: 'modify_roll', uses: 1, modifier: { type: 'movement_multiplier', factor: 2 } }]);
  assert.deepEqual(board.cells[22].onLand, [{ type: 'counter_settle', counterId: 'drink-bank',
    message: '적립한 술 전부 한 번에 마시기', shield: null, settleOn: 'mission_completion' }]);
  board.cells[0].onLand = [{ type: 'unconfigured', question: '새 규칙은 아직 미정' }];
  validateBoardDefinition(board);
  assert.throws(() => assertBoardPublishable(board, resources), /Unconfigured cell/);
});

test('island escape uses its own two-dice check independently of normal dice count', () => {
  const board = preset();
  assert.deepEqual(board.cells[8].onLand, [{ type: 'movement_lock', release: {
    type: 'skip_rolls_or_doubles', count: 3, onDoubles: 'move_sum',
  } }]);
  assert.deepEqual(board.cells[13].onLand, [{ type: 'choose_destination', selection: 'both',
    allowedCellIds: null, onArrival: 'trigger', timing: 'next_turn', excludeCurrentCell: true }]);
  board.dice.count = 1;
  validateBoardDefinition(board);
  assertBoardPublishable(board, resources);
  board.cells[8].onLand = [{ type: 'movement_lock', release: { type: 'skip_rolls', count: 3 } }];
  assertBoardPublishable(board, resources);
  board.cells[13].onLand = [{ type: 'choose_destination', selection: 'both',
    allowedCellIds: ['cell-14'], onArrival: 'trigger', timing: 'next_turn', excludeCurrentCell: true }];
  assert.throws(() => assertBoardPublishable(board, resources), /no eligible cell/);
  board.dice.sides = 1;
  assert.throws(() => validateBoardDefinition(board), /dice.sides/);
});

test('forward and reverse previews wrap over stable IDs and never execute effects', () => {
  const board = preset(); const before = structuredClone(board);
  assert.deepEqual(previewBoardMove(board, 'cell-01', 2, 'forward'), ['cell-02', 'cell-03']);
  assert.deepEqual(previewBoardMove(board, 'cell-01', 2, 'reverse'), ['cell-26', 'cell-25']);
  assert.deepEqual(previewBoardMove(board, 'cell-26', 2, 'forward'), ['cell-01', 'cell-02']);
  assert.deepEqual(previewBoardMove(board, 'cell-01', 0, 'reverse'), []);
  assert.equal(previewBoardMove(board, 'cell-01', 26, 'forward').at(-1), 'cell-01');
  assert.deepEqual(board, before);
  assert.throws(() => previewBoardMove(board, 'missing', 1, 'forward'), /origin/);
});

test('renaming cells and reordering the cells array do not change route or actions', () => {
  const board = preset(); const effect = structuredClone(board.cells[21].onLand);
  board.cells[21].label = '다른 이름'; board.cells.reverse();
  assert.deepEqual(previewBoardMove(board, 'cell-21', 2, 'forward'), ['cell-22', 'cell-23']);
  assert.deepEqual(board.cells.find((cell) => cell.id === 'cell-22')?.onLand, effect);
  assert.equal(board.cells.find((cell) => cell.id === 'cell-01')?.onLand[0].type, 'none');
});

test('canvas resize recalculates geometry without changing IDs, routes or effects', () => {
  const board = preset(); const path = [...board.path]; const effects = board.cells.map((cell) => structuredClone(cell.onLand));
  assert.deepEqual(getCellRect(board, 'cell-01'), { x: 40, y: 40, width: 192, height: 155 });
  assert.deepEqual(getCellRect(board, 'cell-14'), { x: 1688, y: 885, width: 192, height: 155 });
  board.canvas.width = 1400; board.canvas.height = 900;
  const resized = getCellRect(board, 'cell-14');
  assert.ok(resized.width > 72 && resized.height > 72);
  assert.equal(resized.x + resized.width, 1400 - 40);
  assert.equal(resized.y + resized.height, 900 - 40);
  assert.deepEqual(board.path, path); assert.deepEqual(board.cells.map((cell) => cell.onLand), effects);
  board.canvas.width = 10;
  assert.throws(() => validateBoardDefinition(board), /no space/);
});

test('grid resize requires an explicit complete remap and preserves retained cell IDs', () => {
  const board = preset(); const oldIds = [...board.path];
  if (board.layout.type !== 'perimeter_grid') throw new Error('Expected grid');
  board.layout.columns = 10;
  assert.throws(() => validateBoardDefinition(board), /cell count/);
  for (let i = 0; i < 2; i++) {
    board.cells.push({ ...structuredClone(board.cells[0]), id: `new-${i}`, label: '새 칸', onLand: [{ type: 'none' }] });
    board.path.push(`new-${i}`);
  }
  const positions: [number, number][] = [];
  for (let c = 0; c < 10; c++) positions.push([0, c]);
  for (let r = 1; r < 6; r++) positions.push([r, 9]);
  for (let c = 8; c >= 0; c--) positions.push([5, c]);
  for (let r = 4; r > 0; r--) positions.push([r, 0]);
  board.cells.forEach((cell, i) => { cell.position = { type: 'grid', row: positions[i][0], column: positions[i][1] }; });
  validateBoardDefinition(board);
  assert.equal(board.path.length, 28); assert.deepEqual(board.path.slice(0, 26), oldIds);
});

test('invalid identities, overlapping slots, interior cells and dangling destinations are rejected', () => {
  const changes: Array<(board: Mutable<BoardDefinition>) => void> = [
    (b) => { b.cells[1].id = b.cells[0].id; },
    (b) => { b.path[1] = b.path[0]; },
    (b) => { b.startCellId = 'missing'; },
    (b) => { b.path[0] = 'missing'; },
    (b) => { b.cells[1].position = { ...b.cells[0].position }; },
    (b) => { b.cells[1].position = { type: 'grid', row: 1, column: 1 }; },
    (b) => { b.cells[0].onLand = [{ type: 'choose_destination', selection: 'both', allowedCellIds: ['missing'], onArrival: 'skip', timing: 'immediate', excludeCurrentCell: true }]; },
  ];
  for (const change of changes) { const board = preset(); change(board); assert.throws(() => validateBoardDefinition(board)); }
});

test('freeform cells and central widgets share normalized layout without joining the game path', () => {
  const board = configuredFixture();
  board.layout = { type: 'freeform' }; board.cells = board.cells.slice(0, 4); board.path = board.cells.map((cell) => cell.id);
  board.cells.forEach((cell, i) => { cell.position = { type: 'freeform', x: i * 0.2, y: 0, width: 0.1, height: 0.1 }; });
  board.widgets = [{ id: 'dice', type: 'dice', bounds: { x: 0.3, y: 0.4, width: 0.2, height: 0.2 } },
    { id: 'art', type: 'lottie', assetId: 'pawn-walk', bounds: { x: 0.6, y: 0.4, width: 0.2, height: 0.2 } }];
  assertBoardPublishable(board, resources);
  assert.equal(board.path.length, 4); assert.ok(Math.abs(getCellRect(board, 'cell-01').width - 192) < 1e-9);
  board.widgets[0].bounds.x = 0.95;
  assert.throws(() => validateBoardDefinition(board), /outside canvas/);
});

test('behavior families are selected by types and parameters, with channel resource checks', () => {
  const board = configuredFixture();
  board.counters = [{ id: 'debt', label: '적립', unit: '잔', initialValue: 0 }];
  const effects: BoardEffect[] = [
    { type: 'mission', message: '새 미션', shield: { itemId: 'drink-shield', quantity: 2 }, durationSeconds: 90 },
    { type: 'choice_mission', prompt: '선택', selection: 'both', choices: [{ id: 'a', label: 'A', message: '노래' }, { id: 'b', label: 'B', message: '춤' }] },
    { type: 'move_steps', steps: 3, direction: 'against_current', onArrival: 'skip', onPass: 'skip' },
    { type: 'choose_destination', selection: 'operator', allowedCellIds: ['cell-03'], onArrival: 'trigger', timing: 'immediate', excludeCurrentCell: true },
    { type: 'set_direction', direction: 'toggle' },
    { type: 'movement_lock', release: { type: 'skip_rolls', count: 2 } },
    { type: 'movement_lock', release: { type: 'dice_faces', faces: [6] } },
    { type: 'modify_roll', uses: 1, modifier: { type: 'movement_multiplier', factor: 2 } },
    { type: 'modify_roll', uses: 1, modifier: { type: 'dice_count', count: 2 } },
    { type: 'modify_roll', uses: 1, modifier: { type: 'repeat_roll', count: 2 } },
    { type: 'counter_add', counterId: 'debt', quantity: 2 },
    { type: 'counter_settle', counterId: 'debt', message: '정산 미션', shield: null, settleOn: 'mission_completion' },
    { type: 'grant_item', itemId: 'drink-shield', quantity: 1 },
  ];
  for (const effect of effects) {
    board.cells[0].onLand = [structuredClone(effect) as Mutable<BoardEffect>];
    assertBoardPublishable(board, resources);
  }
  assert.throws(() => assertBoardPublishable(board, { ...resources, itemIds: [] }), /Unknown item/);
  board.cells[0].onLand = [{ type: 'movement_lock', release: { type: 'dice_faces', faces: [7] } }];
  assert.throws(() => assertBoardPublishable(board, resources), /exceeds dice/);
  board.cells[0].onLand = [{ type: 'counter_add', counterId: 'missing', quantity: 1 }];
  assert.throws(() => validateBoardDefinition(board), /Unknown counter/);
});

test('asset references are explicit and JSON cannot inject code or unsupported behavior fields', () => {
  const board = configuredFixture();
  board.cells[0].appearance.artwork = { type: 'lottie', assetId: 'missing' };
  validateBoardDefinition(board);
  assert.throws(() => assertBoardPublishable(board, resources), /Unknown asset/);
  const effects: unknown[] = [
    { type: 'eval', code: 'return 1' }, { type: 'none', script: 'anything' },
    { type: 'move_steps', steps: -2, direction: 'against_current', onArrival: 'skip', onPass: 'skip' },
    { type: 'modify_roll', uses: 1, modifier: { type: 'movement_multiplier', factor: 0 } },
    { type: 'movement_lock', release: { type: 'dice_faces', faces: [] } },
    { type: 'movement_lock', release: { type: 'skip_rolls_or_doubles', count: 0, onDoubles: 'move_sum' } },
    { type: 'choose_destination', selection: 'both', allowedCellIds: null, onArrival: 'trigger', timing: 'later', excludeCurrentCell: true },
    { type: 'choose_destination', selection: 'both', allowedCellIds: null, onArrival: 'trigger', timing: 'next_turn', excludeCurrentCell: 'true' },
    { type: 'mission', message: '미션', shield: null, durationSeconds: NaN },
  ];
  for (const effect of effects) {
    const raw = { ...board, cells: board.cells.map((cell, index) => index === 0 ? { ...cell, onLand: [effect] } : cell) };
    assert.throws(() => validateBoardDefinition(raw));
  }
  const interrupt = { ...board, cells: board.cells.map((cell, index) => index === 0
    ? { ...cell, onLand: [], onPass: [{ type: 'set_direction', direction: 'toggle' }] } : cell) };
  assert.throws(() => validateBoardDefinition(interrupt), /cannot interrupt movement/);
});
