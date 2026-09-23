import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const board = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));
const parts = [
  ['board', 1920, 1080], ['dice', 480, 240], ['current_mission', 640, 180],
  ['inventory', 640, 180], ['direction', 480, 180], ['menu', 480, 640], ['dice_price', 480, 160], ['chatbox', 400, 600],
] as const;

test('each OBS part renders alone at its recommended size with its own style', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'OBS source dimensions are checked in the desktop project.');
  const requests: string[] = [];
  const state = {
    channelId: 'channel',
    session: { id: 'session', channelId: 'channel', status: 'running', sessionEpoch: 1, revision: 1, presentationEpoch: 0, currentCellId: board.startCellId, direction: 'forward', boardVersionId: 'board', previewOnly: false },
    boardDefinition: board, inventory: [], missions: [], latestCommand: null,
    pawnAppearance: { revision: 0, styleId: 'star-medal', image: null },
    capabilities: { arrivalEffects: true, donations: true },
    donationMenu: [{ id: 'roll', label: '굴리기', amount: 10, rollCount: 1 }],
    layoutVersion: 1,
    layoutUpdatedAt: '2026-09-23T00:00:00.000Z',
    layout: { schemaVersion: 1, boardThemeId: 'lime-clover', fontId: 'nanum-square-neo', widgetStyles: { board: { themeId: 'pink-bunny' }, menu: { themeId: 'sky-soda', fontId: 'jua' }, chatbox: { themeId: 'midnight-pop', fontId: 'do-hyeon' } }, width: 1920, height: 1080, aspectRatio: '16:9', background: 'transparent', widgets: [{ id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 1 }] },
  };
  await page.route('**/v1/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ json: state });
  });
  for (const [id, width, height] of parts) {
    await page.setViewportSize({ width, height });
    await page.goto(`/overlay/${id}#token=synthetic-overlay`);
    await expect(page.locator('[data-overlay-widget]')).toHaveCount(1);
    await expect(page.locator('[data-overlay-widget]')).toHaveAttribute('data-overlay-widget', id);
    await expect.poll(async () => page.locator('[data-overlay-widget]').boundingBox()).toMatchObject({ width, height });
    expect(await page.locator('[data-overlay-widget]').evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
  }
  await page.goto('/overlay/menu#token=synthetic-overlay');
  await expect(page.locator('[data-broadcast-panel="menu"]')).toHaveAttribute('data-board-theme', 'sky-soda');
  await expect(page.locator('[data-broadcast-panel="menu"]')).toHaveAttribute('data-board-font', 'jua');
  await page.goto('/overlay/board#token=synthetic-overlay');
  await expect(page.locator('.marble-board')).toHaveAttribute('data-board-theme', 'pink-bunny');
  await page.goto('/overlay/chatbox#token=synthetic-overlay');
  await expect(page.getByText('실시간 채팅')).toBeVisible();
  await expect(page.locator('[data-board-theme="midnight-pop"][data-board-font="do-hyeon"]')).toBeVisible();
  await expect(page.getByText('실시간 채팅')).toHaveCSS('font-family', /do-hyeon|Do Hyeon|DoHyeon/i);
  expect(requests.every((url) => !url.includes('synthetic-overlay'))).toBe(true);
});
