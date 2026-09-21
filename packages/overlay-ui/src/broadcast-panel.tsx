import type { CSSProperties } from 'react';
import { resolveBoardFontId, resolveBoardThemeId, type BroadcastDonationRule } from '@rogimarble/contracts';
import { BOARD_FONT_FAMILIES } from './themes';

import { resolveBroadcastPanel, type PanelLayout } from './broadcast-panel-model';
export { resolveBroadcastPanel } from './broadcast-panel-model';

export function BroadcastPanel({ kind, layout, rules = [] }: {
  kind: 'menu' | 'dice_price'; layout: PanelLayout; rules?: readonly BroadcastDonationRule[];
}) {
  const model = resolveBroadcastPanel(layout, rules);
  const fontId = resolveBoardFontId(layout.fontId);
  const themeId = resolveBoardThemeId(layout.boardThemeId);
  const format = (amount: number) => amount.toLocaleString('ko-KR');
  return <section className={`broadcast-panel broadcast-panel--${kind}`} data-broadcast-panel={kind}
    data-board-theme={themeId} data-board-font={fontId} aria-label={kind === 'menu' ? model.menu.title : model.dice.label}
    style={{ fontFamily: BOARD_FONT_FAMILIES[fontId], '--menu-rows': Math.max(1, model.menu.rows.length) } as CSSProperties}>
    <div className="broadcast-panel__surface">
      {kind === 'dice_price' ? <>
        <span className="broadcast-panel__dice" aria-hidden="true">⚄</span>
        <span className="broadcast-panel__price-label">{model.dice.label}</span>
        <strong className="broadcast-panel__price">{model.dice.amount === undefined ? '가격 미설정' : `${format(model.dice.amount)}${model.dice.currencyLabel}`}</strong>
      </> : <>
        <header className="broadcast-panel__heading"><span aria-hidden="true">✦</span><strong>{model.menu.title}</strong><span aria-hidden="true">✦</span></header>
        <div className="broadcast-panel__rows">
          {model.menu.rows.map(row => <div className="broadcast-panel__row" key={row.id}>
            <span>{row.label}</span><strong>{format(row.amount)}{model.menu.currencyLabel}</strong>
          </div>)}
          {!model.menu.rows.length && <p className="broadcast-panel__empty">등록된 메뉴가 없어요</p>}
        </div>
        <footer className="broadcast-panel__footer" aria-hidden="true">♥ ♥ ♥</footer>
      </>}
    </div>
  </section>;
}
