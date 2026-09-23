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
  await page.routeWebSocket('**/socket.io/**', socket => {
    socket.onMessage(message => {
      const frame = message.toString();
      if (frame === '2') socket.send('3');
      if (!frame.startsWith('40')) return;
      socket.send('40{"sid":"synthetic"}');
      for (const payload of [
        { id: 'chat-1', type: 'chat', sessionId: 1, platform: 'soop', channelId: 'channel', userId: 'viewer', nickname: '시청자', message: '반가워요!', timestamp: '2026-09-23T00:00:00Z' },
        { id: 'donation-1', type: 'donation', sessionId: 1, platform: 'soop', channelId: 'channel', userId: 'supporter', nickname: '후원자', message: '주사위 굴려요', timestamp: '2026-09-23T00:00:01Z', amount: 33, currency: '별풍선' },
      ]) socket.send(`42${JSON.stringify(['overlay:event', { event: payload.type === 'chat' ? 'chat.message' : 'chat.donation', payload }])}`);
    });
    socket.send('0{"sid":"synthetic","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
  });
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
  const chatbox = page.locator('.rogimarble-chatbox');
  await expect(chatbox).toHaveAttribute('data-board-theme', 'midnight-pop');
  await expect(chatbox).toHaveAttribute('data-board-font', 'do-hyeon');
  await expect(chatbox).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(chatbox).toHaveCSS('font-family', /do-hyeon|Do Hyeon|DoHyeon/i);
  await expect(chatbox.locator('.rogimarble-chatbox__message')).toHaveCount(2);
  await expect(page.getByText('실시간 채팅', { exact: true })).toHaveCount(0);
  await expect(chatbox.locator('.rogimarble-chatbox__message').first()).toHaveCSS('background-color', 'rgba(244, 245, 252, 0.97)');
  await expect(chatbox.locator('.rogimarble-chatbox__platform')).toHaveCount(0);
  await expect(chatbox.locator('.rogimarble-chatbox__nickname')).toHaveText(['시청자', '후원자']);
  await expect(chatbox.locator('[data-chat-kind="donation"]')).toContainText('별풍선 33개');
  Object.assign(state.layout.widgetStyles.chatbox, { showPlatformBadge: true, showNickname: false, fontScale: 1.2 });
  await page.reload();
  await expect(chatbox.locator('.rogimarble-chatbox__message')).toHaveCount(2);
  await expect(chatbox.locator('.rogimarble-chatbox__platform')).toHaveText(['SOOP', 'SOOP']);
  await expect(chatbox.locator('.rogimarble-chatbox__nickname')).toHaveCount(0);
  await expect(chatbox).toHaveAttribute('data-font-scale', '1.2');
  expect(requests.every((url) => !url.includes('synthetic-overlay'))).toBe(true);
});

test('empty chat source renders no title, count, or outer status card', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'OBS source dimensions are checked in the desktop project.');
  await page.setViewportSize({ width: 400, height: 600 });
  await page.goto('/overlay/chatbox');
  await expect(page.locator('.rogimarble-chatbox')).toBeVisible();
  await expect(page.locator('.rogimarble-chatbox__message')).toHaveCount(0);
  await expect(page.getByText('실시간 채팅', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PREVIEW · 정적 프리셋')).toHaveCount(0);
});
