import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const board = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));

for (const part of [false, true]) {
  test(`OBS inventory shows accumulation, settlement and shield quantities (${part ? 'part' : 'total'})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'OBS sources use desktop browser dimensions.');
    await page.setViewportSize(part ? { width: 640, height: 180 } : { width: 1920, height: 1080 });
    const state = {
      channelId: 'inventory-channel',
      session: { id: 'inventory-session', channelId: 'inventory-channel', status: 'running', sessionEpoch: 1, revision: 0, presentationEpoch: 0, currentCellId: board.startCellId, direction: 'forward', boardVersionId: 'board', previewOnly: false },
      boardDefinition: board,
      counters: [{ counterId: 'drink-bank', label: '술 적립', unit: '잔', value: 0, reserved: 0, available: 0, revision: 0 }],
      inventory: [{ itemId: 'drink-shield', name: '한잔 실드', quantity: 0, revision: 0, updatedAt: '2026-01-01T00:00:00Z' }],
      missions: [], latestCommand: null,
      pawnAppearance: { revision: 0, styleId: 'star-medal', image: null },
      capabilities: { arrivalEffects: true, donations: true },
      layout: { schemaVersion: 1, boardThemeId: 'lime-clover', width: 1920, height: 1080, aspectRatio: '16:9', background: 'transparent', widgets: [{ id: 'inventory', bounds: { x: .1, y: .1, width: .3, height: .14 }, z: 1 }] },
    };
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/v1/overlay/state', route => route.fulfill({ json: state }));
    await page.goto(`/overlay${part ? '/inventory' : ''}#token=synthetic-inventory`);
    const inventory = page.locator('[data-overlay-widget="inventory"]');
    const value = inventory.locator('.broadcast-hud-value');
    await expect(value).toHaveText('술 적립 0잔 · 한잔 실드 0개');

    state.session.revision++;
    Object.assign(state.counters[0], { value: 3, available: 3, revision: 1 });
    Object.assign(state.inventory[0], { quantity: 2, revision: 1 });
    await expect(value).toHaveText('술 적립 3잔 · 한잔 실드 2개');
    expect(await value.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    if (part) await page.screenshot({ path: '/tmp/rogimarble-inventory-preview.png' });

    state.session.revision++;
    Object.assign(state.counters[0], { value: 5, available: 5, revision: 2 });
    Object.assign(state.inventory[0], { quantity: 1, revision: 2 });
    await expect(value).toHaveText('술 적립 5잔 · 한잔 실드 1개');

    state.session.revision++;
    Object.assign(state.counters[0], { value: 0, available: 0, revision: 3 });
    Object.assign(state.inventory[0], { quantity: 0, revision: 3 });
    await expect(value).toHaveText('술 적립 0잔 · 한잔 실드 0개');
    await expect(inventory).not.toContainText('없음');
  });
}
