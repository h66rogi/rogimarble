import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { OverlayLayoutDto } from '@rogimarble/contracts';

const board = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));
const rules = JSON.parse(readFileSync(new URL('../../../presets/streamer-initial.json', import.meta.url), 'utf8'));

const baseLayout = {
  schemaVersion: 1,
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
  background: 'transparent',
  widgets: [
    { id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 1 },
    { id: 'direction', bounds: { x: 0.3, y: 0.28, width: 0.14, height: 0.07 }, z: 3 },
  ],
};

async function fixture(page: Page, role: 'operator' | 'viewer' = 'operator') {
  let version = 4;
  let layout = structuredClone(baseLayout);
  let conflictNext = false;
  let editable = role !== 'viewer';
  let currentToken = { id: 'first', token: 'synthetic-overlay', tokenSuffix: 'rlay', createdAt: '2026-09-23T00:00:00Z', lastUsedAt: null, overlayUrlPath: '/overlay#token=synthetic-overlay' };
  const writes: Array<{ expectedVersion: number; layout: OverlayLayoutDto }> = [];

  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/feed/events')) return route.fulfill({ status: 204 });
    if (path.endsWith('/overlay-layout/live')) {
      if (request.method() === 'GET') return route.fulfill({ json: { layout, layoutVersion: version, layoutUpdatedAt: null, canEdit: editable } });
      const body = request.postDataJSON();
      writes.push(body);
      if (conflictNext) {
        conflictNext = false;
        version = 20;
        layout = { ...layout, widgets: layout.widgets.map(widget => widget.id === 'direction' ? { ...widget, bounds: { ...widget.bounds, x: 0.62 } } : widget) };
        return route.fulfill({ status: 409, json: { message: 'layout version conflict' } });
      }
      expect(body.expectedVersion).toBe(version);
      layout = structuredClone(body.layout);
      version += 1;
      return route.fulfill({ json: { layout, layoutVersion: version, layoutUpdatedAt: '2026-09-22T00:00:00Z' } });
    }
    if (path.endsWith('/overlay-token/rotate') && request.method() === 'PATCH') {
      expect(request.postDataJSON().expectedTokenId).toBe(currentToken.id);
      currentToken = { ...currentToken, id: 'rotated', token: 'rotated-overlay', tokenSuffix: 'erlay', overlayUrlPath: '/overlay#token=rotated-overlay' };
      return route.fulfill({ json: currentToken });
    }
    let data: unknown;
    if (path.endsWith('/auth/session')) data = { csrfToken: 'synthetic-csrf', operator: { id: 'synthetic', username: '테스트', role } };
    else if (path.endsWith('/auth/config')) data = { mode: 'token', localLoginEnabled: false };
    else if (path.endsWith('/operator-state')) data = { session: null, boardDefinition: board, inventory: [], missions: [], pawnAppearance: { revision: 0, image: null }, capabilities: {} };
    else if (path.endsWith('/config/board')) data = { draft: null, published: { id: 'board', revision: 1, status: 'published', document: board }, effectiveDocument: board };
    else if (path.endsWith('/config/rules')) data = { draft: null, published: { id: 'rules', revision: 1, status: 'published', document: rules }, effectiveDocument: rules };
    else if (path.endsWith('/collector')) data = { enabled: false, transport: 'disconnected', counts: {} };
    else if (path.endsWith('/overlay-token')) data = currentToken;
    else if (path.endsWith('/auth/tokens') || path.includes('/board-versions/runnable')) data = [];
    else if (path.endsWith('/donations')) data = { items: [], nextCursor: null, collectionConnected: false };
    else if (path.endsWith('/chats')) data = { items: [], nextCursor: null, collectionConnected: false };
    else if (path.endsWith('/operations')) data = { items: [], nextCursor: null };
    else throw new Error(`Unexpected API ${request.method()} ${path}`);
    await route.fulfill({ json: data });
  });

  await page.goto('/');
  await page.getByRole('tablist', { name: '운영 콘솔 메뉴' }).getByRole('tab', { name: '오버레이 설정', exact: true }).click();
  await expect(page.getByText('레이아웃 편집', { exact: true })).toBeVisible();
  return {
    writes,
    conflict: () => { conflictNext = true; },
    version: () => version,
    publishDirection: (x: number) => {
      version += 1;
      layout = { ...layout, widgets: layout.widgets.map(widget => widget.id === 'direction' ? { ...widget, bounds: { ...widget.bounds, x } } : widget) };
    },
    setEditable: (value: boolean) => { editable = value; },
  };
}

function widgetSwitch(page: Page | Locator, label: string) {
  const priorityCard = page.getByText('위젯 우선순위', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"][1]');
  return priorityCard.getByText(label, { exact: true }).locator('..').getByRole('switch');
}

test('board preview fills its actual OBS widget bounds instead of a square', async ({ page }) => {
  await fixture(page);
  const boardWidget = page.locator('.react-draggable').filter({ has: page.locator('.marble-board') });
  const bounds = await boardWidget.boundingBox();
  const preview = await boardWidget.locator('.marble-board').boundingBox();
  expect(bounds).not.toBeNull();
  expect(preview).not.toBeNull();
  expect(Math.abs(preview!.width - bounds!.width)).toBeLessThan(2);
  expect(Math.abs(preview!.height - bounds!.height)).toBeLessThan(2);
});

test('resizing and moving the board keeps the visual bounds in sync with saved OBS coordinates', async ({ page }) => {
  const state = await fixture(page);
  const boardWidget = page.locator('.react-draggable').filter({ has: page.locator('.marble-board') });
  const handle = boardWidget.locator('.rogimarble-resize-bottom-right');
  const initial = await boardWidget.boundingBox();
  await handle.scrollIntoViewIfNeeded();
  const handleBounds = await handle.boundingBox();
  expect(initial).not.toBeNull();
  expect(handleBounds).not.toBeNull();

  await page.mouse.move(handleBounds!.x + 2, handleBounds!.y + 2);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x - 120, handleBounds!.y - 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.find(widget => widget.id === 'board')?.bounds.width).toBeLessThan(1);
  await page.locator('#console-panel-overlay').evaluate(element => { element.scrollTop = 0; });
  const resized = await boardWidget.boundingBox();
  const preview = await boardWidget.locator('.marble-board').boundingBox();
  expect(resized).not.toBeNull();
  expect(preview).not.toBeNull();
  expect(Math.abs(preview!.height - resized!.height)).toBeLessThan(2);
  expect(Math.abs(preview!.width - resized!.width)).toBeLessThan(2);

  await page.mouse.move(resized!.x + 30, resized!.y + 30);
  await page.mouse.down();
  await page.mouse.move(resized!.x + 90, resized!.y + 65, { steps: 8 });
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.find(widget => widget.id === 'board')?.bounds.x).toBeGreaterThan(0);
  const duringDrag = await boardWidget.boundingBox();
  expect(duringDrag!.x).toBeGreaterThan(resized!.x + 40);
  expect(duringDrag!.y).toBeGreaterThan(resized!.y + 20);
  await page.mouse.up();
  const moved = await boardWidget.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.x).toBeGreaterThan(resized!.x + 40);
  expect(moved!.y).toBeGreaterThan(resized!.y + 20);
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.find(widget => widget.id === 'board')?.bounds.x).toBeGreaterThan(0);
});

test('chatbox can shrink to the small part minimum and grow again in the combined overlay', async ({ page }) => {
  const state = await fixture(page);
  await widgetSwitch(page, '채팅창').click();
  const widget = page.locator('.react-draggable').filter({ has: page.locator('.rogimarble-chatbox') });
  await expect(widget).toBeVisible();
  const resize = async (dx: number, dy: number) => {
    const beforeWrites = state.writes.length;
    const handle = widget.locator('.rogimarble-resize-bottom-right');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    await page.keyboard.down('Shift');
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect.poll(() => state.writes.length).toBeGreaterThan(beforeWrites);
    return state.writes.at(-1)!.layout.widgets.find(item => item.id === 'chatbox')!.bounds;
  };

  const small = await resize(-180, -240);
  expect(small.width).toBeGreaterThanOrEqual(0.099);
  expect(small.width).toBeLessThan(0.2);
  expect(small.height).toBeGreaterThanOrEqual(0.058);
  expect(small.height).toBeLessThan(0.2);

  const large = await resize(70, 60);
  expect(large.width).toBeGreaterThan(small.width);
  expect(large.height).toBeGreaterThan(small.height);
});

test('original Rnd editor throttles held drag, persists final resize, and recovers a 409 before the next save', async ({ page }) => {
  const state = await fixture(page);
  await widgetSwitch(page, '후원 메뉴').click();
  await expect(page.getByLabel('주루마블 메뉴판')).toBeVisible();

  const widget = page.getByLabel('주루마블 메뉴판').locator('xpath=ancestor::*[contains(@class,"react-draggable")][1]');
  await widget.scrollIntoViewIfNeeded();
  const box = await widget.boundingBox();
  expect(box).not.toBeNull();
  const beforeHeldDrag = state.writes.length;
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 70, box!.y + box!.height / 2 + 25, { steps: 8 });
  await expect.poll(() => state.writes.length).toBeGreaterThan(beforeHeldDrag);
  await page.mouse.up();
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.find(widget => widget.id === 'menu')?.bounds.x).toBeGreaterThan(0.13);

  const beforeResizeWidth = state.writes.at(-1)!.layout.widgets.find(widget => widget.id === 'menu')!.bounds.width;
  const handle = widget.locator('.rogimarble-resize-bottom-right');
  await handle.scrollIntoViewIfNeeded();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + 2, handleBox!.y + 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 55, handleBox!.y + 35, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.find(widget => widget.id === 'menu')?.bounds.width).toBeGreaterThan(beforeResizeWidth);

  state.conflict();
  await widgetSwitch(page, '주사위 결과').click();
  await expect(page.getByText('다른 운영자의 최신 배치를 불러왔습니다. 변경 내용을 다시 확인해 주세요.')).toBeVisible();
  await expect.poll(() => state.version()).toBe(20);
  await widgetSwitch(page, '주사위 결과').click();
  await expect.poll(() => state.writes.at(-1)?.expectedVersion).toBe(20);
});

test('viewer sees the live layout but every edit entry point is disabled', async ({ page }) => {
  const state = await fixture(page, 'viewer');
  await expect(page.getByText('보기 권한에서는 실시간 배치를 변경할 수 없습니다.')).toBeVisible();
  await expect(widgetSwitch(page, '후원 메뉴')).toBeDisabled();
  await expect(page.getByRole('button', { name: '기본 레이아웃 복원' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  expect(state.writes).toEqual([]);
});

test('overlay tab keeps one channel URL after reload and rotates it on request', async ({ page }) => {
  const state = await fixture(page);
  const overlayTabs = page.getByRole('tablist', { name: '오버레이 세부 메뉴' });
  const settingsTab = overlayTabs.getByRole('tab', { name: '오버레이 설정' });
  const addressesTab = overlayTabs.getByRole('tab', { name: '오버레이 주소' });
  await expect(settingsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '주소 교체' })).toBeHidden();
  const menuStyleTab = page.getByRole('tablist', { name: '스타일을 편집할 파츠' }).getByRole('tab', { name: '후원 메뉴' });
  await menuStyleTab.click();
  await expect(menuStyleTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('combobox', { name: '후원 메뉴 테마' }).click();
  await page.getByRole('option', { name: '스카이 소다' }).click();
  await expect.poll(() => state.writes.at(-1)?.layout.widgetStyles?.menu?.themeId).toBe('sky-soda');
  await page.getByRole('combobox', { name: '후원 메뉴 글꼴' }).click();
  await page.getByRole('option', { name: '주아' }).click();
  await expect.poll(() => state.writes.at(-1)?.layout.widgetStyles?.menu?.fontId).toBe('jua');
  await expect(page.getByRole('tabpanel', { name: '후원 메뉴' }).getByText('OBS 권장 크기 480 × 640px')).toBeVisible();
  await expect(page.getByRole('button', { name: '주소 발급' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '회수' })).toHaveCount(0);
  await addressesTab.click();
  await expect(addressesTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('레이아웃 편집', { exact: true })).toBeHidden();
  const addressPanel = page.getByRole('tabpanel', { name: '오버레이 주소' });
  const combinedUrlCard = addressPanel.getByText('통합 오버레이', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"][1]');
  await expect(combinedUrlCard).toHaveAttribute('data-variant', 'featured');
  await expect(combinedUrlCard).toHaveCSS('border-top-width', '2px');
  await expect(combinedUrlCard.getByText('추천 · 하나로 전체 표시')).toBeVisible();
  await expect(combinedUrlCard.getByText('이 주소 하나만 OBS에 추가하면 모든 파츠가 함께 표시됩니다.')).toBeVisible();
  const boardUrlCard = addressPanel.getByText('주루마블 보드', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"][1]');
  await expect(boardUrlCard).toHaveCSS('border-top-width', '1px');
  const combinedBorder = await combinedUrlCard.evaluate(element => getComputedStyle(element).borderTopColor);
  const boardBorder = await boardUrlCard.evaluate(element => getComputedStyle(element).borderTopColor);
  expect(combinedBorder).not.toBe(boardBorder);
  const menuUrl = page.getByRole('textbox', { name: '후원 메뉴 OBS 주소' });
  await expect(menuUrl).toHaveValue('http://127.0.0.1:3417/overlay/menu#token=synthetic-overlay');
  await expect(menuUrl).toHaveCSS('filter', 'blur(6px)');
  await page.getByRole('button', { name: '후원 메뉴 OBS 주소 표시' }).click();
  await expect(menuUrl).toHaveCSS('filter', 'none');
  await expect(page.getByRole('textbox', { name: '주루마블 보드 OBS 주소' })).toHaveValue('http://127.0.0.1:3417/overlay/board#token=synthetic-overlay');
  await expect(page.getByRole('textbox', { name: '주루마블 보드 OBS 주소' })).toHaveCSS('filter', 'blur(6px)');
  await settingsTab.click();
  await expect(menuStyleTab).toHaveAttribute('aria-selected', 'true');
  await expect(menuStyleTab).toBeVisible();
  await page.reload();
  await page.getByRole('tablist', { name: '운영 콘솔 메뉴' }).getByRole('tab', { name: '오버레이 설정', exact: true }).click();
  await page.getByRole('tablist', { name: '오버레이 세부 메뉴' }).getByRole('tab', { name: '오버레이 주소' }).click();
  await expect(page.getByRole('textbox', { name: '후원 메뉴 OBS 주소' })).toHaveCSS('filter', 'blur(6px)');
  await page.getByRole('button', { name: '후원 메뉴 OBS 주소 표시' }).click();
  await expect(page.getByRole('textbox', { name: '후원 메뉴 OBS 주소' })).toHaveCSS('filter', 'none');
  await page.getByRole('button', { name: '주소 교체' }).click();
  await expect(page.getByText('기존 주소는 즉시 중단됩니다. OBS 브라우저 소스에 새 주소를 다시 입력해야 합니다.')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: '주소 교체' }).click();
  await expect(page.getByRole('textbox', { name: '후원 메뉴 OBS 주소' })).toHaveValue('http://127.0.0.1:3417/overlay/menu#token=rotated-overlay');
  await expect(page.getByRole('textbox', { name: '후원 메뉴 OBS 주소' })).toHaveCSS('filter', 'blur(6px)');
});

test('home game management overlay copies the combined URL and saves the shared live layout', async ({ page, context }) => {
  const state = await fixture(page);
  await expect(page.getByRole('region', { name: '파츠별 방송 스타일' })).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('tablist', { name: '운영 콘솔 메뉴' }).getByRole('tab', { name: '홈' }).click();
  const gameTabs = page.getByRole('tablist', { name: '게임 관리 메뉴' });
  await expect(gameTabs.getByRole('tab')).toHaveCount(4);
  await gameTabs.getByRole('tab', { name: '오버레이' }).click();
  const panel = page.getByRole('tabpanel', { name: '오버레이', exact: true });
  await expect(panel.getByRole('textbox', { name: '통합 오버레이 OBS 주소' }))
    .toHaveValue('http://127.0.0.1:3417/overlay#token=synthetic-overlay');
  const address = panel.getByRole('textbox', { name: '통합 오버레이 OBS 주소' });
  const copy = panel.getByRole('button', { name: '복사' });
  await expect(address).toHaveCSS('filter', 'none');
  const inputBounds = await address.boundingBox();
  const buttonBounds = await copy.boundingBox();
  expect(inputBounds).not.toBeNull();
  expect(buttonBounds).not.toBeNull();
  expect(buttonBounds!.x).toBeGreaterThanOrEqual(inputBounds!.x + inputBounds!.width);
  expect(Math.abs(buttonBounds!.y - inputBounds!.y)).toBeLessThan(6);
  await expect(panel.getByText('레이아웃 편집', { exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: '파츠별 방송 스타일' })).toHaveCount(0);
  await copy.click();
  await expect(panel.getByText('통합 오버레이 주소를 복사했습니다.')).toBeVisible();
  await widgetSwitch(panel, '후원 메뉴').click();
  await expect.poll(() => state.writes.at(-1)?.layout.widgets.some(widget => widget.id === 'menu')).toBe(true);
  await gameTabs.getByRole('tab', { name: '게임 기록' }).click();
  await expect(panel.getByText('레이아웃 편집', { exact: true })).toBeHidden();
  await gameTabs.getByRole('tab', { name: '오버레이' }).click();
  await expect(panel.getByText('레이아웃 편집', { exact: true })).toBeVisible();
  await page.getByRole('tablist', { name: '운영 콘솔 메뉴' }).getByRole('tab', { name: '오버레이 설정', exact: true }).click();
  await page.getByRole('tablist', { name: '오버레이 세부 메뉴' }).getByRole('tab', { name: '오버레이 주소' }).click();
  await page.getByRole('button', { name: '주소 교체' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '주소 교체' }).click();
  await page.getByRole('tablist', { name: '운영 콘솔 메뉴' }).getByRole('tab', { name: '홈' }).click();
  await expect(panel.getByRole('textbox', { name: '통합 오버레이 OBS 주소' }))
    .toHaveValue('http://127.0.0.1:3417/overlay#token=rotated-overlay');
});

test('overlay sections use the same workspace width as board settings', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 900 });
  await fixture(page);
  const workspace = page.getByTestId('overlay-workspace');
  await expect(workspace).toHaveCSS('max-width', '1600px');
  const settingsWidth = await workspace.evaluate(element => element.getBoundingClientRect().width);
  expect(settingsWidth).toBe(1600);
  await page.getByRole('tablist', { name: '오버레이 세부 메뉴' }).getByRole('tab', { name: '오버레이 주소' }).click();
  await expect(workspace).toHaveCSS('max-width', '1600px');
  expect(await workspace.evaluate(element => element.getBoundingClientRect().width)).toBe(settingsWidth);
});

test('visible editor polls a newer published layout and permission without requiring a failed gesture', async ({ page }) => {
  const state = await fixture(page);
  const direction = page.getByText('진행 방향', { exact: true }).locator('xpath=ancestor::*[contains(@class,"react-draggable")][1]');
  const before = await direction.boundingBox();
  expect(before).not.toBeNull();
  state.publishDirection(0.62);
  state.setEditable(false);
  await expect.poll(async () => direction.evaluate(element => { const bounds=element.getBoundingClientRect(),canvas=element.parentElement!.getBoundingClientRect(); return (bounds.x-canvas.x)/canvas.width; }), { timeout: 5_000 }).toBeCloseTo(0.62,2);
  await expect(page.getByText('보기 권한에서는 실시간 배치를 변경할 수 없습니다.')).toBeVisible();
  await expect(widgetSwitch(page, '후원 메뉴')).toBeDisabled();
  expect(state.writes).toEqual([]);
});
