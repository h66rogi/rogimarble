import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  resolveDonationTrigger,
  validateDonationTriggerConfig,
  type DonationAction,
  type DonationRule,
  type DonationTriggerConfig,
} from '../src/donation-trigger.ts';

const single: DonationRule = {
  id: 'single', label: '주사위', amount: 33, enabled: true,
  action: { type: 'roll_dice', rollCount: 1 },
};
const base: DonationTriggerConfig = {
  schemaVersion: 1, multiRollEnabled: false, items: [], rules: [single],
};

function loadPreset(): DonationTriggerConfig {
  const value: unknown = JSON.parse(readFileSync(
    new URL('../../../presets/streamer-initial.json', import.meta.url), 'utf8',
  ));
  validateDonationTriggerConfig(value);
  return value;
}

const mission = (message: string): DonationAction => ({ type: 'mission', message, shield: null });

test('only an exact configured amount triggers a single roll', () => {
  assert.deepEqual(resolveDonationTrigger(33, base), {
    matched: true, ruleId: 'single', label: '주사위', amount: 33,
    action: { type: 'roll_dice', rollCount: 1 },
  });
  for (const amount of [1, 32, 34, 66, 99, 100, 200, 250, 330]) {
    assert.deepEqual(resolveDonationTrigger(amount, base), {
      matched: false, reason: 'no-exact-match',
    });
  }
});

test('separate donations never accumulate into a trigger', () => {
  for (const amount of [11, 22, 11, 11, 11]) {
    assert.equal(resolveDonationTrigger(amount, base).matched, false);
  }
});

test('multi-roll opt-in requires an explicit exact rule and never infers multiples', () => {
  assert.equal(resolveDonationTrigger(330, { ...base, multiRollEnabled: true }).matched, false);
  const packs: DonationTriggerConfig = {
    ...base, multiRollEnabled: true,
    rules: [single, {
      id: 'ten', label: '10연차', amount: 330, enabled: true,
      action: { type: 'roll_dice', rollCount: 10 },
    }],
  };
  assert.deepEqual(resolveDonationTrigger(330, packs), {
    matched: true, ruleId: 'ten', label: '10연차', amount: 330,
    action: { type: 'roll_dice', rollCount: 10 },
  });
  for (const amount of [66, 250, 660]) {
    assert.equal(resolveDonationTrigger(amount, packs).matched, false);
  }
  assert.deepEqual(resolveDonationTrigger(330, { ...packs, multiRollEnabled: false }), {
    matched: false, reason: 'multi-roll-disabled',
  });
  assert.equal(resolveDonationTrigger(33, packs).matched, true);
});

test('configured roll count does not depend on division by the single-roll amount', () => {
  const config: DonationTriggerConfig = {
    ...base, multiRollEnabled: true,
    rules: [{ ...single, amount: 300, action: { type: 'roll_dice', rollCount: 10 } }],
  };
  const result = resolveDonationTrigger(300, config);
  assert.deepEqual(result.matched && result.action, { type: 'roll_dice', rollCount: 10 });
});

test('disabled rules and empty configuration do not trigger', () => {
  assert.deepEqual(resolveDonationTrigger(33, {
    ...base, rules: [{ ...single, enabled: false }],
  }), { matched: false, reason: 'rule-disabled' });
  assert.equal(resolveDonationTrigger(33, { ...base, rules: [] }).matched, false);
});

test('invalid native balloon counts are rejected', () => {
  for (const amount of [0, -1, 32.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(resolveDonationTrigger(amount, base), {
      matched: false, reason: 'invalid-amount',
    });
  }
});

test('ambiguous rule amounts and ids are rejected across different action types', () => {
  assert.throws(() => validateDonationTriggerConfig({
    ...base, rules: [single, { ...single, id: 'mission', action: mission('다른 동작') }],
  }), /unique/);
  assert.throws(() => validateDonationTriggerConfig({
    ...base, rules: [single, { ...single, amount: 200 }],
  }), /unique/);
});

test('invalid amounts and action counts cannot become accepted configuration', () => {
  for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateDonationTriggerConfig({
      ...base, rules: [{ ...single, amount: value }],
    }), /positive safe integer/);
    assert.throws(() => validateDonationTriggerConfig({
      ...base, rules: [{ ...single, action: { type: 'roll_dice', rollCount: value } }],
    }), /positive safe integer/);
  }
});

test('all seven streamer rules load from editable JSON and dispatch independent actions', () => {
  const config = loadPreset();
  const expected: Array<[number, string, DonationAction]> = [
    [33, '주사위 굴리기', { type: 'roll_dice', rollCount: 1 }],
    [52, '안주 먹어', mission('안주 먹어')],
    [53, '안주 안돼', mission('안주 안돼')],
    [100, '무조건 한잔해', mission('무조건 한잔해')],
    [101, '한잔 실드', { type: 'grant_item', itemId: 'drink-shield', quantity: 1 }],
    [152, '같이 한잔', {
      type: 'mission', message: '같이 한잔', shield: { itemId: 'drink-shield', quantity: 1 },
    }],
    [486, '원하는 칸으로', { type: 'choose_destination', selection: 'both', chatCommand: '!이동' }],
  ];
  assert.equal(config.rules.length, expected.length);
  for (const [amount, label, action] of expected) {
    const result = resolveDonationTrigger(amount, config);
    assert.ok(result.matched);
    assert.equal(result.label, label);
    assert.deepEqual(result.action, action);
  }
  for (const amount of [66, 99, 200, 250, 330, 972]) {
    assert.equal(resolveDonationTrigger(amount, config).matched, false);
  }
});

test('editing amount, text, action and enabled state works entirely through supplied data', () => {
  const config: DonationTriggerConfig = {
    ...base, rules: [{ ...single, amount: 77, label: '새 미션', action: mission('박수 치기') }],
  };
  assert.equal(resolveDonationTrigger(33, config).matched, false);
  assert.deepEqual(resolveDonationTrigger(77, config), {
    matched: true, ruleId: 'single', label: '새 미션', amount: 77, action: mission('박수 치기'),
  });
  assert.equal(resolveDonationTrigger(77, {
    ...config, rules: [{ ...config.rules[0], enabled: false }],
  }).matched, false);
});

test('new item definitions and grant quantities do not require a shield special case', () => {
  const config: DonationTriggerConfig = {
    ...base, items: [{ id: 'custom-item', label: '새 아이템' }],
    rules: [{ ...single, amount: 88, action: { type: 'grant_item', itemId: 'custom-item', quantity: 3 } }],
  };
  const result = resolveDonationTrigger(88, config);
  assert.deepEqual(result.matched && result.action, { type: 'grant_item', itemId: 'custom-item', quantity: 3 });
  assert.throws(() => validateDonationTriggerConfig({ ...config, items: [] }), /unknown item/);
});

test('shield eligibility is configured per mission, independent of amount or label', () => {
  const preset = loadPreset();
  const shield = { itemId: 'drink-shield', quantity: 2 };
  const config: DonationTriggerConfig = {
    ...preset,
    rules: [{ id: 'must-drink', label: '무조건 한잔해', amount: 100, enabled: true,
      action: { type: 'mission', message: '무조건 한잔해', shield } }],
  };
  const allowed = resolveDonationTrigger(100, config);
  assert.deepEqual(allowed.matched && allowed.action, {
    type: 'mission', message: '무조건 한잔해', shield,
  });
  const denied = resolveDonationTrigger(100, {
    ...config, rules: [{ ...config.rules[0], action: mission('무조건 한잔해') }],
  });
  assert.deepEqual(denied.matched && denied.action, mission('무조건 한잔해'));
});

test('destination selection supports either input and both, with an editable chat command', () => {
  for (const selection of ['operator', 'donor_chat', 'both'] as const) {
    const action: DonationAction = { type: 'choose_destination', selection, chatCommand: '!칸선택' };
    const result = resolveDonationTrigger(77, { ...base, rules: [{ ...single, amount: 77, action }] });
    assert.deepEqual(result.matched && result.action, action);
  }
});

test('accepted requests retain nested action data when editable configuration changes', () => {
  const shield = { itemId: 'shield', quantity: 1 };
  const action = { type: 'mission' as const, message: '처음 내용', shield };
  const result = resolveDonationTrigger(33, {
    ...base, items: [{ id: 'shield', label: '실드' }], rules: [{ ...single, action }],
  });
  action.message = '나중 내용';
  shield.quantity = 5;
  assert.deepEqual(result.matched && result.action, {
    type: 'mission', message: '처음 내용', shield: { itemId: 'shield', quantity: 1 },
  });
});

test('malformed JSON, unsupported parameters and invalid item references are rejected', () => {
  const invalid: unknown[] = [
    null, [], {},
    { ...base, schemaVersion: 2 },
    { ...base, multiRollEnabled: 'false' },
    { ...base, rules: {} },
    { ...base, items: null },
    { ...base, rules: [null] },
    { ...base, rules: [{ ...single, label: ' ' }] },
    { ...base, rules: [{ ...single, enabled: 'true' }] },
    { ...base, rules: [{ ...single, action: { type: 'custom-code', script: 'run()' } }] },
    { ...base, rules: [{ ...single, action: { type: 'roll_dice', rollCount: 1, multiplier: 2 } }] },
    { ...base, rules: [{ ...single, action: mission('') }] },
    { ...base, rules: [{ ...single, action: { type: 'mission', message: '미션', shield: { itemId: 'missing', quantity: 1 } } }] },
    { ...base, rules: [{ ...single, action: { type: 'choose_destination', selection: 'random', chatCommand: '!이동' } }] },
    { ...base, rules: [{ ...single, action: { type: 'choose_destination', selection: 'both', chatCommand: '!이동 선택' } }] },
    { ...base, items: [{ id: 'item', label: '아이템' }, { id: 'item', label: '중복' }] },
    { ...base, items: [{ id: 'item', label: '아이템' }], rules: [
      { ...single, action: { type: 'grant_item', itemId: 'item', quantity: 0 } },
    ] },
  ];
  for (const config of invalid) assert.throws(() => validateDonationTriggerConfig(config));
});
