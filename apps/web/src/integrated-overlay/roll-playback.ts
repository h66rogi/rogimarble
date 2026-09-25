import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';

export const presentationMovementCommands = ['roll_dice','choose_destination','cancel_destination','resume'] as const;
export type PresentationMovementCommand = typeof presentationMovementCommands[number];
export type RollPlayback = { readonly dice: readonly number[]; readonly cells: readonly string[]; readonly kind:'roll'|'travel' };
export type RollTimelineEvent = { readonly at:number; readonly phase:'reveal'|'stepping'|'cell'|'landing'|'idle'; readonly cellId?:string };
// The CSS throw runs for 1550ms, with at most 60ms stagger; reveal follows its last frame.
export const DICE_THROW_DURATION_MS = 1650;
const DICE_REVEAL_HOLD_MS = 520;

export function buildRollTimeline(cells:readonly string[], reducedMotion=false):readonly RollTimelineEvent[]{
  if(reducedMotion)return[];
  const steppingAt=DICE_THROW_DURATION_MS+DICE_REVEAL_HOLD_MS;
  if(cells.length-1>24)return[{at:DICE_THROW_DURATION_MS,phase:'reveal'},{at:steppingAt+560,phase:'landing'},{at:steppingAt+1120,phase:'idle'}];
  const events:RollTimelineEvent[]=[{at:DICE_THROW_DURATION_MS,phase:'reveal'},{at:steppingAt,phase:'stepping'}];
  cells.slice(1).forEach((cellId,index)=>events.push({at:steppingAt+(index+1)*600,phase:'cell',cellId}));
  const landingAt=steppingAt+Math.max(1,cells.length-1)*600+600;
  events.push({at:landingAt,phase:'landing'},{at:landingAt+560,phase:'idle'});
  return events;
}

export function buildTravelTimeline(cells:readonly string[], reducedMotion=false):readonly RollTimelineEvent[]{
  if(reducedMotion||cells.length<2)return[];
  return[{at:0,phase:'stepping'},{at:180,phase:'cell',cellId:cells.at(-1)!},{at:400,phase:'landing'},{at:960,phase:'idle'}];
}

/** Builds display-only playback from the server result. It never derives a roll locally. */
export function rollPlayback(command: OverlayPresentationCommandDto | null | undefined, boardPath: readonly string[], finalCellId: string): RollPlayback | null {
  if (!command || !presentationMovementCommands.includes(command.type as PresentationMovementCommand) || !command.result || !('dice' in command.result) || !('path' in command.result)) return null;
  const { dice, path, fromCellId, toCellId, effects } = command.result;
  if (!Array.isArray(dice) || !dice.every((value) => Number.isSafeInteger(value) && value > 0)) return null;
  if(!Array.isArray(path))return null;
  const effectPath=collectEffectPath(effects);
  const fullPath=[...path,...effectPath];
  if (!fullPath.every((cell) => typeof cell === 'string' && boardPath.includes(cell))) return null;
  if (typeof fromCellId !== 'string' || !boardPath.includes(fromCellId) || toCellId !== finalCellId) return null;
  if(fullPath.length?fullPath.at(-1)!==finalCellId:fromCellId!==finalCellId)return null;
  return { dice, cells: [fromCellId, ...fullPath], kind:dice.length?'roll':'travel' };
}

function collectEffectPath(effects:unknown):string[]{
  if(!Array.isArray(effects))return[];
  const cells:string[]=[];
  for(const effect of effects){if(!effect||typeof effect!=='object')continue;const result=(effect as {result?:unknown}).result;if(!result||typeof result!=='object')continue;const value=result as {path?:unknown;effects?:unknown};if(Array.isArray(value.path))cells.push(...value.path.filter((cell):cell is string=>typeof cell==='string'));cells.push(...collectEffectPath(value.effects));}
  return cells;
}
