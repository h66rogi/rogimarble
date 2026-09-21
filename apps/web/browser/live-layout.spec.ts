import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  const writes: Array<{ expectedVersion: number; layout: typeof baseLayout }> = [];

  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
    let data: unknown;
    if (path.endsWith('/auth/session')) data = { csrfToken: 'synthetic-csrf', operator: { id: 'synthetic', username: '테스트', role } };
    else if (path.endsWith('/auth/config')) data = { mode: 'token', localLoginEnabled: false };
    else if (path.endsWith('/operator-state')) data = { session: null, boardDefinition: board, inventory: [], missions: [], pawnAppearance: { revision: 0, image: null }, capabilities: {} };
    else if (path.endsWith('/config/rules')) data = { draft: null, published: { id: 'rules', revision: 1, status: 'published', document: rules }, effectiveDocument: rules };
    else if (path.endsWith('/collector')) data = { enabled: false, transport: 'disconnected', counts: {} };
    else if (path.endsWith('/obs-tokens') || path.endsWith('/auth/tokens') || path.includes('/board-versions/runnable')) data = [];
    else if (path.endsWith('/donations')) data = { items: [], nextCursor: null, collectionConnected: false };
    else if (path.endsWith('/operations')) data = { items: [], nextCursor: null };
    else throw new Error(`Unexpected API ${request.method()} ${path}`);
    await route.fulfill({ json: data });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'OBS 설정', exact: true }).click();
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

function widgetSwitch(page: Page, label: string) {
  return page.getByText(label, { exact: true }).last().locator('..').getByRole('switch');
}

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
