import type { ShieldCost } from './donation-trigger.ts';

export type Direction = 'forward' | 'reverse';
export type SelectionInput = 'operator' | 'donor_chat' | 'both';
export type LandingPolicy = 'trigger' | 'skip';

/** Unconfirmed streamer rules can be saved as drafts, but cannot be published. */
export type BoardEffect =
  | { readonly type: 'none' }
  | { readonly type: 'mission'; readonly message: string; readonly shield: ShieldCost | null;
      readonly durationSeconds: number | null }
  | { readonly type: 'choice_mission'; readonly prompt: string; readonly selection: SelectionInput;
      readonly choices: readonly { readonly id: string; readonly label: string; readonly message: string }[] }
  | { readonly type: 'move_steps'; readonly steps: number;
      readonly direction: Direction | 'with_current' | 'against_current';
      readonly onArrival: LandingPolicy; readonly onPass: LandingPolicy }
  | { readonly type: 'choose_destination'; readonly selection: SelectionInput;
      readonly allowedCellIds: readonly string[] | null; readonly onArrival: LandingPolicy;
      readonly timing: 'immediate' | 'next_turn'; readonly excludeCurrentCell: boolean }
  | { readonly type: 'set_direction'; readonly direction: Direction | 'toggle' }
  | { readonly type: 'movement_lock'; readonly release:
      | { readonly type: 'operator' }
      | { readonly type: 'skip_rolls'; readonly count: number }
      | { readonly type: 'skip_rolls_or_doubles'; readonly count: number;
          readonly onDoubles: 'move_sum' | 'release_only' }
      | { readonly type: 'dice_faces'; readonly faces: readonly number[] } }
  | { readonly type: 'modify_roll'; readonly uses: number; readonly modifier:
      | { readonly type: 'movement_multiplier'; readonly factor: number }
      | { readonly type: 'dice_count'; readonly count: number }
      | { readonly type: 'repeat_roll'; readonly count: number } }
  | { readonly type: 'counter_add'; readonly counterId: string; readonly quantity: number }
  | { readonly type: 'counter_settle'; readonly counterId: string; readonly message: string;
      readonly shield: ShieldCost | null; readonly settleOn: 'creation' | 'mission_completion' }
  | { readonly type: 'grant_item'; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'unconfigured'; readonly question: string };

/** Passing a cell cannot interrupt/rewrite the already planned movement path. */
export type BoardPassEffect = Extract<BoardEffect, {
  readonly type: 'none' | 'mission' | 'counter_add' | 'grant_item' | 'unconfigured';
}>;

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type CellPosition =
  | { readonly type: 'grid'; readonly row: number; readonly column: number }
  | ({ readonly type: 'freeform' } & NormalizedRect);

export interface CellAppearance {
  readonly shape: 'circle' | 'rounded_rectangle';
  readonly fill: string;
  readonly textColor: string;
  readonly borderColor: string;
  readonly artwork: { readonly type: 'image' | 'lottie'; readonly assetId: string } | null;
}

export interface BoardCell {
  readonly id: string;
  readonly label: string;
  readonly position: CellPosition;
  readonly appearance: CellAppearance;
  readonly onLand: readonly BoardEffect[];
  readonly onPass: readonly BoardPassEffect[];
}

export type BoardLayout =
  | { readonly type: 'perimeter_grid'; readonly columns: number; readonly rows: number;
      readonly gap: number; readonly padding: {
        readonly top: number; readonly right: number; readonly bottom: number; readonly left: number;
      } }
  | { readonly type: 'freeform' };

/** Widgets are decoration/status, never cells or automatic game actions. */
export type BoardWidget = { readonly id: string; readonly bounds: NormalizedRect } & (
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image' | 'lottie'; readonly assetId: string }
  | { readonly type: 'dice' | 'current_mission' | 'inventory' | 'donation_alert' | 'direction' }
);

export interface BoardDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly canvas: { readonly width: number; readonly height: number; readonly backgroundColor: string };
  readonly layout: BoardLayout;
  readonly dice: { readonly count: number; readonly sides: number };
  readonly defaultDirection: Direction;
  readonly startCellId: string;
  /** Stable IDs define logical order; cells array order and labels do not. */
  readonly path: readonly string[];
  readonly cells: readonly BoardCell[];
  readonly widgets: readonly BoardWidget[];
  readonly counters: readonly {
    readonly id: string; readonly label: string; readonly unit: string; readonly initialValue: number;
  }[];
}

export interface BoardResources {
  readonly itemIds: readonly string[];
  readonly assetIds: readonly string[];
}

function record(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}: expected object`);
}

function object(value: unknown, keys: readonly string[], name: string): asserts value is Record<string, unknown> {
  record(value, name);
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${name}: missing or unsupported field`);
  }
}

function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name}: expected non-empty text`);
}

function number(value: unknown, min: number, max: number, name: string, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
      || (integer && !Number.isSafeInteger(value))) throw new RangeError(`${name}: invalid number`);
}

function count(value: unknown, name: string): asserts value is number {
  number(value, 1, 1000, name, true);
}

function member(value: unknown, values: readonly string[], name: string): void {
  if (typeof value !== 'string' || !values.includes(value)) throw new TypeError(`${name}: unsupported value`);
}

function array(value: unknown, name: string, min = 0, max = 256): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new TypeError(`${name}: invalid array`);
}

function distinctIds(values: readonly string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${name}: duplicate id`);
}

function color(value: unknown): void {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
    throw new TypeError('Color: expected hex RGB or RGBA');
  }
}

function rect(value: unknown, keys: readonly string[] = ['x', 'y', 'width', 'height']): void {
  object(value, keys, 'Rectangle');
  number(value.x, 0, 1, 'x'); number(value.y, 0, 1, 'y');
  number(value.width, Number.EPSILON, 1, 'width'); number(value.height, Number.EPSILON, 1, 'height');
  if (value.x + value.width > 1 || value.y + value.height > 1) throw new RangeError('Rectangle outside canvas');
}

function shield(value: unknown): void {
  if (value === null) return;
  object(value, ['itemId', 'quantity'], 'Shield'); text(value.itemId, 'itemId'); count(value.quantity, 'quantity');
}

function validateEffect(value: unknown): asserts value is BoardEffect {
  record(value, 'Effect');
  switch (value.type) {
    case 'none': object(value, ['type'], 'Effect'); break;
    case 'mission':
      object(value, ['type', 'message', 'shield', 'durationSeconds'], 'Mission');
      text(value.message, 'message'); shield(value.shield);
      if (value.durationSeconds !== null) number(value.durationSeconds, 1, 86400, 'durationSeconds', true);
      break;
    case 'choice_mission':
      object(value, ['type', 'prompt', 'selection', 'choices'], 'Choice');
      text(value.prompt, 'prompt'); member(value.selection, ['operator', 'donor_chat', 'both'], 'selection');
      array(value.choices, 'choices', 2, 20);
      for (const choice of value.choices) {
        object(choice, ['id', 'label', 'message'], 'Choice option');
        text(choice.id, 'id'); text(choice.label, 'label'); text(choice.message, 'message');
      }
      distinctIds(value.choices.map((choice) => (choice as { id: string }).id), 'choices');
      break;
    case 'move_steps':
      object(value, ['type', 'steps', 'direction', 'onArrival', 'onPass'], 'Move'); count(value.steps, 'steps');
      member(value.direction, ['forward', 'reverse', 'with_current', 'against_current'], 'direction');
      member(value.onPass, ['trigger', 'skip'], 'onPass');
      member(value.onArrival, ['trigger', 'skip'], 'onArrival'); break;
    case 'choose_destination':
      object(value, ['type', 'selection', 'allowedCellIds', 'onArrival', 'timing', 'excludeCurrentCell'], 'Destination');
      member(value.selection, ['operator', 'donor_chat', 'both'], 'selection');
      member(value.onArrival, ['trigger', 'skip'], 'onArrival');
      member(value.timing, ['immediate', 'next_turn'], 'timing');
      if (typeof value.excludeCurrentCell !== 'boolean') throw new TypeError('excludeCurrentCell: expected boolean');
      if (value.allowedCellIds !== null) {
        array(value.allowedCellIds, 'allowedCellIds', 1);
        for (const id of value.allowedCellIds) text(id, 'cellId');
        distinctIds(value.allowedCellIds as string[], 'allowedCellIds');
      }
      break;
    case 'set_direction':
      object(value, ['type', 'direction'], 'Direction');
      member(value.direction, ['forward', 'reverse', 'toggle'], 'direction'); break;
    case 'movement_lock':
      object(value, ['type', 'release'], 'Movement lock');
      record(value.release, 'Movement release');
      switch (value.release.type) {
        case 'operator': object(value.release, ['type'], 'Release'); break;
        case 'skip_rolls':
          object(value.release, ['type', 'count'], 'Release'); count(value.release.count, 'count'); break;
        case 'skip_rolls_or_doubles':
          object(value.release, ['type', 'count', 'onDoubles'], 'Release'); count(value.release.count, 'count');
          member(value.release.onDoubles, ['move_sum', 'release_only'], 'onDoubles'); break;
        case 'dice_faces':
          object(value.release, ['type', 'faces'], 'Release'); array(value.release.faces, 'faces', 1, 100);
          for (const face of value.release.faces) number(face, 1, 100, 'face', true);
          if (new Set(value.release.faces).size !== value.release.faces.length) throw new Error('Duplicate dice face');
          break;
        default: throw new TypeError('Unsupported release type');
      }
      break;
    case 'modify_roll':
      object(value, ['type', 'uses', 'modifier'], 'Roll modifier'); count(value.uses, 'uses');
      record(value.modifier, 'Roll modifier');
      switch (value.modifier.type) {
        case 'movement_multiplier':
          object(value.modifier, ['type', 'factor'], 'Multiplier'); count(value.modifier.factor, 'factor'); break;
        case 'dice_count':
          object(value.modifier, ['type', 'count'], 'Dice count'); number(value.modifier.count, 1, 10, 'count', true); break;
        case 'repeat_roll':
          object(value.modifier, ['type', 'count'], 'Roll count'); count(value.modifier.count, 'count'); break;
        default: throw new TypeError('Unsupported modifier type');
      }
      break;
    case 'counter_add':
      object(value, ['type', 'counterId', 'quantity'], 'Counter add');
      text(value.counterId, 'counterId'); count(value.quantity, 'quantity'); break;
    case 'counter_settle':
      object(value, ['type', 'counterId', 'message', 'shield', 'settleOn'], 'Counter settle');
      text(value.counterId, 'counterId'); text(value.message, 'message'); shield(value.shield);
      member(value.settleOn, ['creation', 'mission_completion'], 'settleOn'); break;
    case 'grant_item':
      object(value, ['type', 'itemId', 'quantity'], 'Item grant');
      text(value.itemId, 'itemId'); count(value.quantity, 'quantity'); break;
    case 'unconfigured':
      object(value, ['type', 'question'], 'Unconfigured effect'); text(value.question, 'question'); break;
    default: throw new TypeError('Unsupported effect type');
  }
}

/** Structural validation for editable drafts. Does not execute or authorize a board. */
export function validateBoardDefinition(value: unknown): asserts value is BoardDefinition {
  object(value, ['schemaVersion', 'id', 'name', 'canvas', 'layout', 'dice', 'defaultDirection', 'startCellId',
    'path', 'cells', 'widgets', 'counters'], 'Board');
  if (value.schemaVersion !== 1) throw new TypeError('Unsupported board schema version');
  text(value.id, 'id'); text(value.name, 'name'); text(value.startCellId, 'startCellId');
  member(value.defaultDirection, ['forward', 'reverse'], 'defaultDirection');
  object(value.dice, ['count', 'sides'], 'Dice');
  number(value.dice.count, 1, 10, 'dice.count', true); number(value.dice.sides, 2, 100, 'dice.sides', true);
  object(value.canvas, ['width', 'height', 'backgroundColor'], 'Canvas');
  number(value.canvas.width, 1, 16384, 'canvas.width', true);
  number(value.canvas.height, 1, 16384, 'canvas.height', true); color(value.canvas.backgroundColor);
  record(value.layout, 'Layout');
  switch (value.layout.type) {
    case 'perimeter_grid':
      object(value.layout, ['type', 'columns', 'rows', 'gap', 'padding'], 'Grid');
      number(value.layout.columns, 3, 64, 'columns', true); number(value.layout.rows, 3, 64, 'rows', true);
      number(value.layout.gap, 0, 1000, 'gap');
      object(value.layout.padding, ['top', 'right', 'bottom', 'left'], 'Padding');
      for (const side of ['top', 'right', 'bottom', 'left']) number(value.layout.padding[side], 0, 16384, side);
      break;
    case 'freeform': object(value.layout, ['type'], 'Freeform layout'); break;
    default: throw new TypeError('Unsupported layout type');
  }
  array(value.cells, 'cells', 4); array(value.path, 'path', 4);
  for (const cell of value.cells) {
    object(cell, ['id', 'label', 'position', 'appearance', 'onLand', 'onPass'], 'Cell');
    text(cell.id, 'cell.id'); text(cell.label, 'cell.label');
    if (value.layout.type === 'perimeter_grid') {
      object(cell.position, ['type', 'row', 'column'], 'Grid position');
      if (cell.position.type !== 'grid') throw new TypeError('Layout/position mismatch');
      number(cell.position.row, 0, (value.layout as unknown as Extract<BoardLayout, { type: 'perimeter_grid' }>).rows - 1, 'row', true);
      number(cell.position.column, 0, (value.layout as unknown as Extract<BoardLayout, { type: 'perimeter_grid' }>).columns - 1, 'column', true);
    } else {
      rect(cell.position, ['type', 'x', 'y', 'width', 'height']);
      if ((cell.position as { type: unknown }).type !== 'freeform') throw new TypeError('Layout/position mismatch');
    }
    object(cell.appearance, ['shape', 'fill', 'textColor', 'borderColor', 'artwork'], 'Appearance');
    member(cell.appearance.shape, ['circle', 'rounded_rectangle'], 'shape');
    color(cell.appearance.fill); color(cell.appearance.textColor); color(cell.appearance.borderColor);
    if (cell.appearance.artwork !== null) {
      object(cell.appearance.artwork, ['type', 'assetId'], 'Artwork');
      member(cell.appearance.artwork.type, ['image', 'lottie'], 'artwork type'); text(cell.appearance.artwork.assetId, 'assetId');
    }
    for (const trigger of ['onLand', 'onPass']) {
      array(cell[trigger], trigger, 0, 16);
      for (const effect of cell[trigger]) {
        validateEffect(effect);
        if (trigger === 'onPass' && !['none', 'mission', 'counter_add', 'grant_item', 'unconfigured'].includes(effect.type)) {
          throw new TypeError('Pass effects cannot interrupt movement');
        }
      }
    }
  }
  for (const id of value.path) text(id, 'path cellId');
  array(value.widgets, 'widgets', 0, 32);
  for (const widget of value.widgets) {
    record(widget, 'Widget');
    switch (widget.type) {
      case 'text': object(widget, ['id', 'bounds', 'type', 'text'], 'Text widget'); text(widget.text, 'text'); break;
      case 'image': case 'lottie':
        object(widget, ['id', 'bounds', 'type', 'assetId'], 'Asset widget'); text(widget.assetId, 'assetId'); break;
      case 'dice': case 'current_mission': case 'inventory': case 'donation_alert': case 'direction':
        object(widget, ['id', 'bounds', 'type'], 'Status widget'); break;
      default: throw new TypeError('Unsupported widget type');
    }
    text(widget.id, 'widget.id'); rect(widget.bounds);
  }
  array(value.counters, 'counters', 0, 32);
  for (const counter of value.counters) {
    object(counter, ['id', 'label', 'unit', 'initialValue'], 'Counter');
    text(counter.id, 'counter.id'); text(counter.label, 'counter.label'); text(counter.unit, 'counter.unit');
    number(counter.initialValue, 0, Number.MAX_SAFE_INTEGER, 'initialValue', true);
  }

  const board = value as unknown as BoardDefinition;
  distinctIds(board.cells.map((cell) => cell.id), 'cells'); distinctIds(board.path, 'path');
  distinctIds(board.widgets.map((widget) => widget.id), 'widgets');
  distinctIds(board.counters.map((counter) => counter.id), 'counters');
  const ids = new Set(board.cells.map((cell) => cell.id));
  if (ids.size !== board.path.length || board.path.some((id) => !ids.has(id)) || !ids.has(board.startCellId)) {
    throw new Error('Path and start must reference exactly the board cells');
  }
  if (board.layout.type === 'perimeter_grid') {
    const { rows, columns } = board.layout;
    if (board.cells.length !== 2 * (rows + columns) - 4) throw new Error('Grid perimeter cell count mismatch');
    const occupied = new Set<string>();
    for (const cell of board.cells) {
      const { row, column } = cell.position as Extract<CellPosition, { type: 'grid' }>;
      if (row !== 0 && row !== rows - 1 && column !== 0 && column !== columns - 1) throw new Error('Cell is not on perimeter');
      const slot = `${row}:${column}`;
      if (occupied.has(slot)) throw new Error('Duplicate grid slot');
      occupied.add(slot);
    }
    gridCellSize(board);
  }
  const counterIds = new Set(board.counters.map((counter) => counter.id));
  for (const cell of board.cells) {
    for (const effect of [...cell.onLand, ...cell.onPass]) {
      if (effect.type === 'choose_destination' && effect.allowedCellIds?.some((id) => !ids.has(id))) {
        throw new Error('Unknown destination cell');
      }
      if ((effect.type === 'counter_add' || effect.type === 'counter_settle') && !counterIds.has(effect.counterId)) {
        throw new Error('Unknown counter');
      }
    }
  }
}

function gridCellSize(board: BoardDefinition): { width: number; height: number } {
  if (board.layout.type !== 'perimeter_grid') throw new TypeError('Expected grid');
  const { columns, rows, gap, padding } = board.layout;
  const width = (board.canvas.width - padding.left - padding.right - gap * (columns - 1)) / columns;
  const height = (board.canvas.height - padding.top - padding.bottom - gap * (rows - 1)) / rows;
  if (width <= 0 || height <= 0) throw new RangeError('Canvas has no space for cells');
  return { width, height };
}

/** Extra publish gate: unresolved semantics and missing channel assets/items cannot go live. */
export function assertBoardPublishable(board: unknown, resources: BoardResources): asserts board is BoardDefinition {
  validateBoardDefinition(board);
  const itemIds = new Set(resources.itemIds); const assetIds = new Set(resources.assetIds);
  function asset(id: string): void { if (!assetIds.has(id)) throw new Error(`Unknown asset: ${id}`); }
  function item(id: string): void { if (!itemIds.has(id)) throw new Error(`Unknown item: ${id}`); }
  for (const cell of board.cells) {
    if (cell.appearance.artwork !== null) asset(cell.appearance.artwork.assetId);
    for (const effect of [...cell.onLand, ...cell.onPass]) {
      if (effect.type === 'unconfigured') throw new Error(`Unconfigured cell ${cell.id}: ${effect.question}`);
      if (effect.type === 'grant_item') item(effect.itemId);
      if ((effect.type === 'mission' || effect.type === 'counter_settle') && effect.shield !== null) item(effect.shield.itemId);
      if (effect.type === 'movement_lock' && effect.release.type === 'dice_faces'
          && effect.release.faces.some((face) => face > board.dice.sides)) throw new Error('Release face exceeds dice sides');
      if (effect.type === 'movement_lock' && effect.release.type === 'skip_rolls_or_doubles'
          && board.dice.count !== 2) throw new Error('Doubles release requires two dice');
      if (effect.type === 'choose_destination' && effect.excludeCurrentCell
          && (effect.allowedCellIds ?? board.path).every((id) => id === cell.id)) {
        throw new Error('Destination selection has no eligible cell');
      }
    }
  }
  for (const widget of board.widgets) if (widget.type === 'image' || widget.type === 'lottie') asset(widget.assetId);
}

/** Logical canvas coordinates only. A renderer applies the OBS viewport scale. */
export function getCellRect(board: BoardDefinition, cellId: string): CanvasRect {
  validateBoardDefinition(board);
  const cell = board.cells.find((candidate) => candidate.id === cellId);
  if (!cell) throw new Error('Unknown cell');
  if (cell.position.type === 'freeform') {
    return { x: cell.position.x * board.canvas.width, y: cell.position.y * board.canvas.height,
      width: cell.position.width * board.canvas.width, height: cell.position.height * board.canvas.height };
  }
  if (board.layout.type !== 'perimeter_grid') throw new TypeError('Layout/position mismatch');
  const { width, height } = gridCellSize(board);
  return { x: board.layout.padding.left + cell.position.column * (width + board.layout.gap),
    y: board.layout.padding.top + cell.position.row * (height + board.layout.gap), width, height };
}

/** Preview only: returns a path, and never evaluates cell effects or changes game state. */
export function previewBoardMove(board: BoardDefinition, fromCellId: string, steps: number, direction: Direction): readonly string[] {
  validateBoardDefinition(board); number(steps, 0, 1000, 'steps', true); member(direction, ['forward', 'reverse'], 'direction');
  const start = board.path.indexOf(fromCellId);
  if (start < 0) throw new Error('Unknown origin cell');
  const sign = direction === 'forward' ? 1 : -1;
  return Array.from({ length: steps }, (_, index) => {
    const next = (start + sign * (index + 1)) % board.path.length;
    return board.path[(next + board.path.length) % board.path.length];
  });
}
