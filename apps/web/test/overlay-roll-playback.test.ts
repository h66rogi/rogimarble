import test from 'node:test';
import assert from 'node:assert/strict';
import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';
import { buildRollTimeline, buildTravelTimeline, rollPlayback } from '../src/integrated-overlay/roll-playback.ts';

const command = (result: unknown, presentationEpoch = 4): OverlayPresentationCommandDto => ({ commandId:'command', sessionId:'session', sessionEpoch:1, presentationEpoch, type:'roll_dice', afterRevision:2, result:result as OverlayPresentationCommandDto['result'], createdAt:'2026-09-21T00:00:00.000Z' });

test('uses the authoritative visited-cell order including the origin', () => {
  const playback=rollPlayback(command({dice:[2,1],distance:3,direction:'forward',path:['b','c','d'],fromCellId:'a',toCellId:'d'}),['a','b','c','d'],'d');
  assert.deepEqual(playback,{dice:[2,1],cells:['a','b','c','d'],kind:'roll'});
});

test('rejects incomplete, unknown, or stale-final server paths', () => {
  assert.equal(rollPlayback(command({dice:[2],path:['b'],fromCellId:'a',toCellId:'b'}),['a','b'],'a'),null);
  assert.equal(rollPlayback(command({dice:[2],path:['outside'],fromCellId:'a',toCellId:'outside'}),['a','b'],'outside'),null);
  assert.equal(rollPlayback({...command(null),type:'set_position'},['a','b'],'b'),null);
});

test('accepts a locked zero-step roll and appends server-authored chained movement',()=>{
  assert.deepEqual(rollPlayback(command({dice:[3,4],distance:0,direction:'forward',path:[],fromCellId:'a',toCellId:'a'}),['a','b'],'a')?.cells,['a']);
  const chained=rollPlayback(command({dice:[1],distance:1,direction:'forward',path:['b'],fromCellId:'a',toCellId:'d',effects:[{index:1,cellId:'b',trigger:'land',type:'move_steps',result:{path:['c','d'],toCellId:'d',effects:[]}}]}),['a','b','c','d'],'d');
  assert.deepEqual(chained?.cells,['a','b','c','d']);
});

test('accepts only explicit travel-resolution commands and distinguishes waiting from movement',()=>{
  const moved={dice:[],distance:0,direction:'forward',path:['b'],fromCellId:'a',toCellId:'b',travelStatus:'moved'};
  for(const type of ['choose_destination','cancel_destination','resume'] as const){
    assert.deepEqual(rollPlayback({...command(moved),type},['a','b'],'b'),{dice:[],cells:['a','b'],kind:'travel'});
  }
  assert.equal(rollPlayback({...command(moved),type:'set_direction'},['a','b'],'b'),null);
  assert.deepEqual(rollPlayback({...command({...moved,path:[],toCellId:'a',travelStatus:'waiting'}),type:'choose_destination'},['a','b'],'a'),{dice:[],cells:['a'],kind:'travel'});
});

test('uses a brief no-dice travel landing without roll anticipation',()=>{
  assert.deepEqual(buildTravelTimeline(['a','b']),[
    {at:0,phase:'stepping'},{at:180,phase:'cell',cellId:'b'},{at:400,phase:'landing'},{at:960,phase:'idle'},
  ]);
  assert.deepEqual(buildTravelTimeline(['a']),[]);
  assert.deepEqual(buildTravelTimeline(['a','b'],true),[]);
});

test('orders anticipation follow-up, every server cell, landing and reduced-motion fallback',()=>{
  assert.deepEqual(buildRollTimeline(['a','b','c']),[
    {at:420,phase:'reveal'},{at:840,phase:'stepping'},
    {at:1440,phase:'cell',cellId:'b'},{at:2040,phase:'cell',cellId:'c'},
    {at:2640,phase:'landing'},{at:3200,phase:'idle'},
  ]);
  assert.deepEqual(buildRollTimeline(['a','b'],true),[]);
  assert.deepEqual(buildRollTimeline(Array.from({length:26},(_,index)=>`cell-${index}`)),[
    {at:420,phase:'reveal'},{at:1400,phase:'landing'},{at:1960,phase:'idle'},
  ]);
});
