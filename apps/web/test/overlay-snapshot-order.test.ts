import test from 'node:test';
import assert from 'node:assert/strict';
import type { OverlayStateDto } from '@rogimarble/contracts';
import { isNewerOverlayState } from '../src/integrated-overlay/snapshot-order.ts';

const state = (revision:number,presentationEpoch:number,sessionEpoch=1,id='session-a',createdAt='2026-09-21T00:00:00.000Z'):OverlayStateDto => ({ channelId:'channel', session:{ id,channelId:'channel',status:'running',sessionEpoch,revision,boardVersionId:'board',currentCellId:'cell-01',direction:'forward',automaticMovementPaused:false,presentationEpoch,previewOnly:false,createdAt,updatedAt:createdAt },boardDefinition:{},inventory:[],missions:[],pawnAppearance:{revision:0,image:null},layout:null,capabilities:{arrivalEffects:false,donations:false} });

test('overlay polling rejects regression in either authoritative clock',()=>{
 const current=state(8,10);
 assert.equal(isNewerOverlayState(state(7,11),current),false);
 assert.equal(isNewerOverlayState(state(9,9),current),false);
 assert.equal(isNewerOverlayState(state(9,10),current),true);
 assert.equal(isNewerOverlayState(state(8,11),current),true);
});

test('overlay polling orders epochs and new sessions',()=>{
 const current=state(8,10,2);
 assert.equal(isNewerOverlayState(state(99,99,1),current),false);
 assert.equal(isNewerOverlayState(state(0,0,3),current),true);
 assert.equal(isNewerOverlayState(state(0,0,1,'session-old','2026-09-20T00:00:00.000Z'),current),false);
 assert.equal(isNewerOverlayState(state(0,0,1,'session-new','2026-09-22T00:00:00.000Z'),current),true);
});

test('latest no-session response clears the prior session in serial polling',()=>{
 const current=state(8,10);
 const empty:OverlayStateDto={...current,session:null};
 assert.equal(isNewerOverlayState(empty,current),true);
});
