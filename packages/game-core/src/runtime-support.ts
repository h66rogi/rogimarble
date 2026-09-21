import type { BoardDefinition, BoardEffect } from './board-definition.ts';

/** Effects with complete authoritative server semantics. Draft-only variants fail closed. */
export function supportsBoardEffect(effect: BoardEffect): boolean {
  if (effect.type === 'choose_destination') return effect.timing === 'next_turn' && effect.selection !== 'donor_chat';
  if (['none', 'mission', 'move_steps', 'set_direction', 'movement_lock', 'counter_add', 'counter_settle', 'grant_item'].includes(effect.type)) return true;
  return effect.type === 'modify_roll' && effect.modifier.type === 'movement_multiplier';
}

export function unsupportedBoardEffects(board: BoardDefinition): string[] {
  return [...new Set(board.cells.flatMap((cell) => [...cell.onPass, ...cell.onLand])
    .filter((effect) => !supportsBoardEffect(effect)).map((effect) => effect.type))];
}

export function isBoardSupportedForLive(board: BoardDefinition): boolean {
  return unsupportedBoardEffects(board).length === 0;
}
