/** Visual variation only. The server result, never this seed, selects the upper face. */
export const DICE_FLOOR_Y = -1.08;
export const DICE_CORNER_RADIUS = .21;

/** The support height of a rounded 2-unit cube above a horizontal floor. */
export function roundedDieSupportHeight(rotation: { x: number; y: number; z: number; w: number }) {
  const { x, y, z, w } = rotation;
  const rowX = 2 * (x * y + w * z);
  const rowY = 1 - 2 * (x * x + z * z);
  const rowZ = 2 * (y * z - w * x);
  return (1 - DICE_CORNER_RADIUS) * (Math.abs(rowX) + Math.abs(rowY) + Math.abs(rowZ)) + DICE_CORNER_RADIUS;
}

export function diceThrowMotion(commandId: string, index: number) {
  let state = 2166136261;
  for (const character of `${commandId}:${index}`) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const side = index % 2 ? 1 : -1;
  return {
    delayMs: index % 2 ? 45 : 0,
    durationMs: 1390 + Math.floor(next() * 170),
    launchX: side * (1.8 + next() * .8),
    launchY: .68 + next() * .38,
    arcHeight: .28 + next() * .22,
    driftX: (next() - .5) * .36,
    bounceHeight: .2 + next() * .17,
    spinX: side * (Math.PI * (4 + next() * 2)),
    spinY: -side * (Math.PI * (5 + next() * 2)),
    spinZ: (next() - .5) * Math.PI * 2.5,
  };
}
