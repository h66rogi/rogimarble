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

export function diceThrowMotion(commandId: string, index: number, diceCount = 2) {
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
  const side = diceCount === 1 ? next() < .5 ? -1 : 1 : index % 2 ? 1 : -1;
  const impactAt = .43 + next() * .07;
  const bounceEndAt = impactAt + .10 + next() * .04;
  return {
    delayMs: diceCount > 1 && index % 2 ? 35 + Math.floor(next() * 25) : 0,
    durationMs: 1440 + Math.floor(next() * 120),
    launchX: side * (4.9 + next() * .6),
    launchZ: (next() < .5 ? -1 : 1) * (.38 + next() * .38),
    curveZ: (next() - .5) * .5,
    restZ: (next() - .5) * .32,
    finalYaw: (next() - .5) * .44,
    launchY: 1 + next() * .24,
    arcHeight: .72 + next() * .22,
    bounceHeight: .14 + next() * .08,
    airTurnRadians: Math.PI * (.4 + next() * .18),
    impactAt,
    bounceEndAt,
    rollEndAt: .9 + next() * .05,
    impactTravel: .52 + next() * .05,
    bounceTravel: .055 + next() * .035,
    rollEasePower: 1.2 + next() * .35,
  };
}

/** A short hand throw, one low bounce, then a roll whose angle follows ground travel. */
export function diceThrowPose(motion: ReturnType<typeof diceThrowMotion>, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const groundAngle = (x: number, z: number) => Math.hypot(x, z) / ROLL_RADIUS;
  if (t < motion.impactAt) {
    const u = t / motion.impactAt;
    const remaining = 1 - motion.impactTravel * u;
    const impactX = motion.launchX * (1 - motion.impactTravel);
    const impactZ = motion.launchZ * (1 - motion.impactTravel);
    return {
      x: motion.launchX * remaining,
      z: motion.launchZ * remaining + motion.curveZ * Math.sin(Math.PI * u),
      lift: motion.launchY * (1 - u) + motion.arcHeight * Math.sin(Math.PI * u),
      rollRadians: groundAngle(impactX, impactZ) + motion.airTurnRadians * (1 - u),
    };
  }
  if (t < motion.bounceEndAt) {
    const u = (t - motion.impactAt) / (motion.bounceEndAt - motion.impactAt);
    const remaining = 1 - motion.impactTravel - motion.bounceTravel * u;
    const x = motion.launchX * remaining;
    const z = motion.launchZ * remaining;
    return { x, z, lift: motion.bounceHeight * Math.sin(Math.PI * u), rollRadians: groundAngle(x, z) };
  }
  if (t < motion.rollEndAt) {
    const u = (t - motion.bounceEndAt) / (motion.rollEndAt - motion.bounceEndAt);
    const remaining = (1 - motion.impactTravel - motion.bounceTravel) * (1 - u) ** motion.rollEasePower;
    const x = motion.launchX * remaining;
    const z = motion.launchZ * remaining;
    return { x, z, lift: 0, rollRadians: groundAngle(x, z) };
  }
  return { x: 0, z: 0, lift: 0, rollRadians: 0 };
}
