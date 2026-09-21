import { DEFAULT_BROADCAST_MENU, DEFAULT_DICE_PRICE, type BroadcastDonationRule, type OverlayLayoutDto } from '@rogimarble/contracts';

/** Only published donation-rule projections enter automatic prices. No amount is inferred. */
export type PanelLayout = Pick<OverlayLayoutDto, 'boardThemeId' | 'fontId' | 'menu' | 'dicePrice'>;
export function resolveBroadcastPanel(layout: PanelLayout, rules: readonly BroadcastDonationRule[] = []) {
  const menu = layout.menu ?? DEFAULT_BROADCAST_MENU;
  const dice = layout.dicePrice ?? DEFAULT_DICE_PRICE;
  const diceRules = rules.filter(rule => rule.rollCount === 1);
  // Ambiguous prices require an explicit rule choice; silently picking a price would mislead viewers.
  const rule = dice.ruleId ? diceRules.find(rule => rule.id === dice.ruleId) : diceRules.length === 1 ? diceRules[0] : undefined;
  return {
    menu: { ...menu, rows: menu.source === 'custom' ? menu.rows : rules },
    dice: { ...dice, amount: dice.source === 'custom' ? dice.amount : rule?.amount },
  };
}
