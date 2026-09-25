import boardPreset from '../../../presets/streamer-board.json' with { type: 'json' };
import type { BoardDefinition } from '../../../packages/game-core/src/board-definition.ts';

/** A virtual option until a channel starts its first game. */
export const DEFAULT_BOARD_VERSION_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_BOARD = boardPreset as BoardDefinition;
