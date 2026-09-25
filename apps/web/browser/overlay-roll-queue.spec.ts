import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const board = JSON.parse(readFileSync(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8'));

test('OBS finishes each queued donation roll before starting the next', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The queue is exercised once in the desktop browser.');
  const state: any = {
    channelId: 'queue-channel',
    session: { id: 'queue-session', channelId: 'queue-channel', status: 'running', sessionEpoch: 1, revision: 0, presentationEpoch: 0, currentCellId: board.path[0], direction: 'forward', boardVersionId: 'board', previewOnly: false },
    boardDefinition: board, inventory: [], missions: [], latestCommand: null, presentationCommands: [],
    pawnAppearance: { revision: 0, styleId: 'star-medal', image: null },
    capabilities: { arrivalEffects: true, donations: true },
    layout: { schemaVersion: 1, boardThemeId: 'lime-clover', width: 1920, height: 1080, aspectRatio: '16:9', background: 'transparent', widgets: [{ id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 1 }] },
  };
  await page.route('**/v1/overlay/state', route => route.fulfill({ json: state }));
  await page.goto('/overlay#token=queued-rolls');
  const surface=page.locator('.marble-board');
  await expect(surface).toHaveAttribute('data-presentation-phase','idle');

  const first={commandId:'first-donation',sessionId:state.session.id,sessionEpoch:1,presentationEpoch:0,type:'roll_dice',afterRevision:1,createdAt:'2026-09-25T00:00:00Z',result:{dice:[1],distance:1,direction:'forward',fromCellId:board.path[0],toCellId:board.path[1],path:[board.path[1]]}};
  const second={commandId:'second-donation',sessionId:state.session.id,sessionEpoch:1,presentationEpoch:0,type:'roll_dice',afterRevision:2,createdAt:'2026-09-25T00:00:01Z',result:{dice:[1],distance:1,direction:'forward',fromCellId:board.path[1],toCellId:board.path[2],path:[board.path[2]]}};
  state.session.revision=1;state.session.currentCellId=board.path[1];state.latestCommand=first;state.presentationCommands=[first];
  await expect(surface).toHaveAttribute('data-presentation-phase','rolling',{timeout:7000});
  state.session.revision=2;state.session.currentCellId=board.path[2];state.latestCommand=second;state.presentationCommands=[first,second];
  await page.waitForFunction(cellId => document.querySelector('.marble-board')?.getAttribute('data-presentation-phase')==='landing' && document.querySelector('.token-wrapper')?.getAttribute('data-cell-id')===cellId, board.path[1], {timeout:7000});
  await page.waitForFunction(cellId => document.querySelector('.marble-board')?.getAttribute('data-presentation-phase')==='rolling' && document.querySelector('.token-wrapper')?.getAttribute('data-cell-id')===cellId, board.path[1], {timeout:7000});
  await expect(page.locator('.token-wrapper')).toHaveAttribute('data-cell-id',board.path[2],{timeout:7000});
  await expect(surface).toHaveAttribute('data-presentation-phase','idle',{timeout:7000});
});
