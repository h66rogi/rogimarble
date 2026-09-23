import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const board = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));

test('the live board starts with the star medal and follows saved pawn style changes', async ({ page }) => {
  const state = {
    channelId: 'synthetic-channel',
    session: { id: 'synthetic-session', channelId: 'synthetic-channel', status: 'running', sessionEpoch: 1, revision: 0, presentationEpoch: 0, currentCellId: board.startCellId, direction: 'forward', boardVersionId: 'synthetic-board', previewOnly: false },
    boardDefinition: board, inventory: [], missions: [], latestCommand: null,
    pawnAppearance: { revision: 0, styleId: 'star-medal', image: null },
    layout: { schemaVersion: 1, boardThemeId: 'pink-bunny', width: 1920, height: 1080, aspectRatio: '16:9', background: 'transparent', widgets: [{ id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 0 }] },
  };
  await page.route('**/v1/**', route => route.fulfill({ json: state }));
  await page.goto('/overlay#token=synthetic-overlay');
  const pawn = page.locator('.token-wrapper');
  await expect(pawn).toHaveAttribute('data-pawn-style', 'star-medal');
  await expect(pawn.locator('img')).toHaveAttribute('src', '/artwork/pawn-star-medal.webp');

  state.pawnAppearance.styleId = 'heart-chip';
  state.pawnAppearance.revision++;
  await expect(pawn).toHaveAttribute('data-pawn-style', 'heart-chip');
  await expect(pawn.locator('img')).toHaveAttribute('src', '/artwork/pawn-heart-chip.webp');

  state.pawnAppearance.styleId = 'bunny-face';
  state.pawnAppearance.revision++;
  await expect(pawn).toHaveAttribute('data-pawn-style', 'bunny-face');
  await expect(pawn.locator('img')).toHaveAttribute('src', '/artwork/pawn-bunny-face.webp');
});
