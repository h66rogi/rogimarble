/** Executable primitives; amounts, labels, messages and item identities are data. */
export interface ShieldCost {
  readonly itemId: string;
  readonly quantity: number;
}

export type DonationAction =
  | { readonly type: 'roll_dice'; readonly rollCount: number }
  | { readonly type: 'mission'; readonly message: string; readonly shield: ShieldCost | null }
  | { readonly type: 'grant_item'; readonly itemId: string; readonly quantity: number }
  | {
      readonly type: 'choose_destination';
      readonly selection: 'operator' | 'donor_chat' | 'both';
      readonly chatCommand: string;
    };

export interface ItemDefinition {
  readonly id: string;
  readonly label: string;
}

/** Amounts are native SOOP balloon counts, never KRW or accumulated balances. */
export interface DonationRule {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly enabled: boolean;
  readonly action: DonationAction;
}

export interface DonationTriggerConfig {
  readonly schemaVersion: 1;
  readonly multiRollEnabled: boolean;
  readonly items: readonly ItemDefinition[];
  readonly rules: readonly DonationRule[];
}

export type DonationTriggerResult =
  | {
      readonly matched: true;
      readonly ruleId: string;
      readonly label: string;
      readonly amount: number;
      readonly action: DonationAction;
    }
  | {
      readonly matched: false;
      readonly reason:
        | 'invalid-amount'
        | 'no-exact-match'
        | 'rule-disabled'
        | 'multi-roll-disabled';
    };

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function requireRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty text`);
  }
}

function requirePositiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !isPositiveInteger(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requireKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new TypeError(`${name} contains an unsupported field`);
  }
}

function validateItemCost(value: Record<string, unknown>, itemIds: ReadonlySet<string>): void {
  requireText(value.itemId, 'Item id');
  requirePositiveInteger(value.quantity, 'Item quantity');
  if (!itemIds.has(value.itemId)) throw new Error('Action references an unknown item');
}

function validateAction(value: unknown, itemIds: ReadonlySet<string>): void {
  requireRecord(value, 'Action');
  switch (value.type) {
    case 'roll_dice':
      requireKeys(value, ['type', 'rollCount'], 'Roll action');
      requirePositiveInteger(value.rollCount, 'rollCount');
      break;
    case 'mission':
      requireKeys(value, ['type', 'message', 'shield'], 'Mission action');
      requireText(value.message, 'Mission message');
      if (value.shield !== null) {
        requireRecord(value.shield, 'Mission shield');
        requireKeys(value.shield, ['itemId', 'quantity'], 'Mission shield');
        validateItemCost(value.shield, itemIds);
      }
      break;
    case 'grant_item':
      requireKeys(value, ['type', 'itemId', 'quantity'], 'Item action');
      validateItemCost(value, itemIds);
      break;
    case 'choose_destination':
      requireKeys(value, ['type', 'selection', 'chatCommand'], 'Destination action');
      if (!['operator', 'donor_chat', 'both'].includes(value.selection as string)) {
        throw new TypeError('Destination selection must be operator, donor_chat or both');
      }
      requireText(value.chatCommand, 'Chat command');
      if (!/^![^\s!]+$/u.test(value.chatCommand)) {
        throw new TypeError('Chat command must start with ! and contain no whitespace');
      }
      break;
    default:
      throw new TypeError('Unsupported action type');
  }
}

/** Validate JSON from storage, imports or a future management API before use. */
export function validateDonationTriggerConfig(config: unknown): asserts config is DonationTriggerConfig {
  requireRecord(config, 'Configuration');
  requireKeys(config, ['schemaVersion', 'multiRollEnabled', 'items', 'rules'], 'Configuration');
  if (config.schemaVersion !== 1) throw new TypeError('Unsupported configuration schema version');
  if (typeof config.multiRollEnabled !== 'boolean') {
    throw new TypeError('multiRollEnabled must be a boolean');
  }
  if (!Array.isArray(config.items) || !Array.isArray(config.rules)) {
    throw new TypeError('Configuration items and rules must be arrays');
  }

  const itemIds = new Set<string>();
  for (const item of config.items) {
    requireRecord(item, 'Item');
    requireKeys(item, ['id', 'label'], 'Item');
    requireText(item.id, 'Item id');
    requireText(item.label, 'Item label');
    if (itemIds.has(item.id)) throw new Error('Item ids must be unique');
    itemIds.add(item.id);
  }

  const amounts = new Set<number>();
  const ids = new Set<string>();
  for (const rule of config.rules) {
    requireRecord(rule, 'Rule');
    requireKeys(rule, ['id', 'label', 'amount', 'enabled', 'action'], 'Rule');
    requireText(rule.id, 'Rule id');
    requireText(rule.label, 'Rule label');
    if (typeof rule.enabled !== 'boolean') {
      throw new TypeError('Rule enabled must be a boolean');
    }
    requirePositiveInteger(rule.amount, 'Rule amount');
    validateAction(rule.action, itemIds);
    if (amounts.has(rule.amount) || ids.has(rule.id)) {
      throw new Error('Donation rule amounts and ids must be unique');
    }
    amounts.add(rule.amount);
    ids.add(rule.id);
  }
}

/**
 * Resolve one donation independently using only the supplied configuration.
 * Multi-roll requires an exact rule and explicit opt-in. Other actions do not
 * roll dice. The caller owns persistence, authorization and action execution.
 */
export function resolveDonationTrigger(
  amount: number,
  config: DonationTriggerConfig,
): DonationTriggerResult {
  validateDonationTriggerConfig(config);
  if (!isPositiveInteger(amount)) {
    return { matched: false, reason: 'invalid-amount' };
  }
  const rule = config.rules.find((candidate) => candidate.amount === amount);
  if (!rule) return { matched: false, reason: 'no-exact-match' };
  if (!rule.enabled) return { matched: false, reason: 'rule-disabled' };
  if (rule.action.type === 'roll_dice' && rule.action.rollCount > 1 && !config.multiRollEnabled) {
    return { matched: false, reason: 'multi-roll-disabled' };
  }
  return {
    matched: true,
    ruleId: rule.id,
    label: rule.label,
    amount,
    // Accepted requests retain their data if the editable configuration changes.
    action: structuredClone(rule.action),
  };
}
