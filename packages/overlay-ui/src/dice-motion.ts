/** Visual variation only. The server result, never this seed, selects the upper face. */
export const DICE_FLOOR_Y = -1.08;
export const DICE_CORNER_RADIUS = .21;
const ROLL_RADIUS = 1.08;

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
    durationMs: 1380 + Math.floor(next() * 130),
    launchX: side * (2 + next() * .35),
    launchY: .7 + next() * .24,
    arcHeight: .16 + next() * .15,
    bounceHeight: .1 + next() * .09,
    airTurnRadians: -side * Math.PI * (.62 + next() * .2),
  };
}

/** A short hand throw, one low bounce, then a roll whose angle follows ground travel. */
export function diceThrowPose(motion: ReturnType<typeof diceThrowMotion>, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  if (t < .34) {
    const u = t / .34;
    const eased = u * u * (3 - 2 * u);
    const x = motion.launchX * (1 - .32 * eased);
    return {
      x,
      lift: motion.launchY * (1 - u) + motion.arcHeight * Math.sin(Math.PI * u),
      rollRadians: -motion.launchX * .68 / ROLL_RADIUS + motion.airTurnRadians * (1 - eased),
    };
  }
  if (t < .48) {
    const u = (t - .34) / .14;
    const x = motion.launchX * (.68 - .08 * u);
    return { x, lift: motion.bounceHeight * Math.sin(Math.PI * u), rollRadians: -x / ROLL_RADIUS };
  }
  if (t < .9) {
    const u = (t - .48) / .42;
    const x = motion.launchX * .6 * (1 - u) ** 1.5;
    return { x, lift: 0, rollRadians: -x / ROLL_RADIUS };
  }
  return { x: 0, lift: 0, rollRadians: 0 };
}
