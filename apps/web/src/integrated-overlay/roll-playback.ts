import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';

export type RollPlayback = { readonly dice: readonly number[]; readonly cells: readonly string[] };

/** Builds display-only playback from the server result. It never derives a roll locally. */
export function rollPlayback(command: OverlayPresentationCommandDto | null | undefined, boardPath: readonly string[], finalCellId: string): RollPlayback | null {
  if (command?.type !== 'roll_dice' || !command.result || !('dice' in command.result) || !('path' in command.result)) return null;
  const { dice, path, fromCellId, toCellId } = command.result;
  if (!Array.isArray(dice) || !dice.every((value) => Number.isSafeInteger(value) && value > 0)) return null;
  if (!Array.isArray(path) || !path.every((cell) => typeof cell === 'string' && boardPath.includes(cell))) return null;
  if (typeof fromCellId !== 'string' || !boardPath.includes(fromCellId) || toCellId !== finalCellId || path.at(-1) !== finalCellId) return null;
  return { dice, cells: [fromCellId, ...path] };
}
