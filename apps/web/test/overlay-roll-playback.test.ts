import test from 'node:test';
import assert from 'node:assert/strict';
import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';
import { rollPlayback } from '../src/integrated-overlay/roll-playback.ts';

const command = (result: unknown, presentationEpoch = 4): OverlayPresentationCommandDto => ({ commandId:'command', sessionId:'session', sessionEpoch:1, presentationEpoch, type:'roll_dice', afterRevision:2, result:result as OverlayPresentationCommandDto['result'], createdAt:'2026-09-21T00:00:00.000Z' });

test('uses the authoritative visited-cell order including the origin', () => {
  const playback=rollPlayback(command({dice:[2,1],distance:3,direction:'forward',path:['b','c','d'],fromCellId:'a',toCellId:'d'}),['a','b','c','d'],'d');
  assert.deepEqual(playback,{dice:[2,1],cells:['a','b','c','d']});
});

test('rejects incomplete, unknown, or stale-final server paths', () => {
  assert.equal(rollPlayback(command({dice:[2],path:['b'],fromCellId:'a',toCellId:'b'}),['a','b'],'a'),null);
  assert.equal(rollPlayback(command({dice:[2],path:['outside'],fromCellId:'a',toCellId:'outside'}),['a','b'],'outside'),null);
  assert.equal(rollPlayback({...command(null),type:'set_position'},['a','b'],'b'),null);
});
