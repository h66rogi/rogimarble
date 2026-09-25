/** Visual variation only. The server result, never this seed, selects the upper face. */
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
    launchY: 2.1 + next() * .65,
    arcHeight: .55 + next() * .5,
    driftX: (next() - .5) * .36,
    bounceHeight: .62 + next() * .32,
    spinX: side * (Math.PI * (4 + next() * 2)),
    spinY: -side * (Math.PI * (5 + next() * 2)),
    spinZ: (next() - .5) * Math.PI * 2.5,
  };
}
