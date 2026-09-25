import test from 'node:test';
import assert from 'node:assert/strict';
import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';
import { buildRollTimeline, buildTravelTimeline, DICE_THROW_DURATION_MS, rollPlayback } from '../src/integrated-overlay/roll-playback.ts';
import { diceThrowMotion, diceThrowPose, roundedDieSupportHeight } from '../../../packages/overlay-ui/src/dice-motion.ts';

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
    {at:DICE_THROW_DURATION_MS,phase:'reveal'},{at:2170,phase:'stepping'},
    {at:2770,phase:'cell',cellId:'b'},{at:3370,phase:'cell',cellId:'c'},
    {at:3970,phase:'landing'},{at:4530,phase:'idle'},
  ]);
  assert.deepEqual(buildRollTimeline(['a','b'],true),[]);
  assert.deepEqual(buildRollTimeline(Array.from({length:26},(_,index)=>`cell-${index}`)),[
    {at:DICE_THROW_DURATION_MS,phase:'reveal'},{at:2730,phase:'landing'},{at:3290,phase:'idle'},
  ]);
});

test('visual throw variation is stable per command and always settles before the server result is revealed',()=>{
  const first=diceThrowMotion('command-a',0,1);
  assert.deepEqual(first,diceThrowMotion('command-a',0,1));
  assert.notDeepEqual(first,diceThrowMotion('command-b',0,1));
  const singleSides=new Set<number>();
  const impactTimes=new Set<number>();
  for(let index=0;index<64;index++){
    const key=`command-${index}`;
    const motion=diceThrowMotion(key,0,1);
    const pair=[diceThrowMotion(key,0,2),diceThrowMotion(key,1,2)];
    assert.ok(motion.durationMs+motion.delayMs<DICE_THROW_DURATION_MS);
    assert.ok(motion.launchY>0&&motion.bounceHeight>0);
    assert.ok(Math.abs(motion.launchX)>=4.9);
    assert.ok(pair[0].launchX<0&&pair[1].launchX>0);
    assert.ok(pair.every(die=>die.durationMs+die.delayMs<DICE_THROW_DURATION_MS));
    assert.ok(Math.abs(diceThrowPose(motion,0).rollRadians)<2*Math.PI);
    singleSides.add(Math.sign(motion.launchX));
    impactTimes.add(motion.impactAt);
  }
  assert.deepEqual([...singleSides].sort(),[-1,1]);
  assert.ok(impactTimes.size>50);
});

test('a thrown die lands once, rolls toward its result, and rests on the ground',()=>{
  const motion=diceThrowMotion('one-short-throw',0,1);
  const airborne=diceThrowPose(motion,motion.impactAt/2);
  const impact=diceThrowPose(motion,motion.impactAt);
  const rebound=diceThrowPose(motion,(motion.impactAt+motion.bounceEndAt)/2);
  const groundRoll=diceThrowPose(motion,(motion.bounceEndAt+motion.rollEndAt)/2);
  const settled=diceThrowPose(motion,motion.rollEndAt);
  assert.ok(airborne.lift>0);
  assert.ok(Math.abs(airborne.x)>Math.abs(impact.x));
  assert.ok(Math.abs(impact.lift)<1e-10);
  assert.ok(rebound.lift>0);
  assert.equal(groundRoll.lift,0);
  assert.ok(Math.abs(impact.x)>Math.abs(groundRoll.x));
  assert.ok(Math.abs(groundRoll.rollRadians)>0);
  assert.deepEqual(settled,{x:0,z:0,lift:0,rollRadians:0});
  for(const time of [motion.impactAt,motion.bounceEndAt,motion.rollEndAt]){
    const before=diceThrowPose(motion,time-1e-6);
    const after=diceThrowPose(motion,time);
    assert.ok(Math.abs(before.x-after.x)<1e-4);
    assert.ok(Math.abs(before.z-after.z)<1e-4);
    assert.ok(Math.abs(before.rollRadians-after.rollRadians)<1e-4);
  }
});

test('rounded dice stay above the ground as their corners rotate toward it',()=>{
  const upright=roundedDieSupportHeight({x:0,y:0,z:0,w:1});
  const tilted=roundedDieSupportHeight({x:0,y:0,z:Math.sin(Math.PI/8),w:Math.cos(Math.PI/8)});
  assert.equal(upright,1);
  assert.ok(tilted>upright);
  assert.ok(tilted<Math.SQRT2);
});
