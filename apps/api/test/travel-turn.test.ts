import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideTravel, moveTravelNow, reserveTravelTurn, type TravelReservation } from '../src/travel-turn.ts';
const trip:TravelReservation={type:'choose_destination',selection:'both',allowedCellIds:null,onArrival:'trigger',timing:'next_turn',excludeCurrentCell:true,selectedCellId:null,reservedTurnCommandId:null,cancelled:false};
test('preselection does not move until a normal turn is reserved',()=>{
  const selected={...trip,selectedCellId:'target'};
  assert.equal(decideTravel(selected,false).type,'wait');
  assert.deepEqual(reserveTravelTurn(selected,'turn').type,'move');
});
test('destinationless turn waits and cannot be overtaken',()=>{
  const waiting=reserveTravelTurn(trip,'turn');assert.equal(waiting.type,'wait');
  assert.throws(()=>reserveTravelTurn(waiting.reservation,'other'));
  const selected={...waiting.reservation,selectedCellId:'target'};
  assert.equal(decideTravel(selected,true).type,'wait');
  const moved=decideTravel(selected,false);assert.equal(moved.type,'move');if(moved.type==='move')assert.equal(moved.turnCommandId,'turn');
});
test('cancelling returns exactly the same unrolled turn, including after a pause',()=>{
  assert.equal(decideTravel({...trip,cancelled:true},false).type,'cancel');
  const reserved={...trip,reservedTurnCommandId:'original',cancelled:true};
  assert.equal(decideTravel(reserved,true).type,'wait');
  const returned=decideTravel(reserved,false);assert.equal(returned.type,'return_turn');if(returned.type==='return_turn')assert.equal(returned.turnCommandId,'original');
});
test('explicit immediate travel consumes exactly one turn and reuses a waiting turn',()=>{
  const selected={...trip,selectedCellId:'target'};
  const direct=moveTravelNow(selected,'move-command');
  assert.equal(direct.type,'move');
  if(direct.type==='move')assert.equal(direct.turnCommandId,'move-command');
  const reserved={...selected,reservedTurnCommandId:'original-turn'};
  const resumed=moveTravelNow(reserved,'move-command');
  assert.equal(resumed.type,'move');
  if(resumed.type==='move')assert.equal(resumed.turnCommandId,'original-turn');
});
