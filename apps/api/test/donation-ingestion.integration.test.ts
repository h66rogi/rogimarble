import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const databaseUrl=process.env.DONATION_TEST_DATABASE_URL;
test('collector inbox atomically deduplicates, snapshots exact rules and executes once', {skip:!databaseUrl}, async()=>{
  process.env.DATABASE_URL=databaseUrl!;
  const {DonationIngestionService}=await import('../dist/apps/api/src/donation-ingestion.service.js');
  const {closePool}=await import('../dist/packages/database/src/index.js');
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();
  const channel=`collector-test-${randomBytes(8).toString('hex')}`,operator=randomUUID(),boardVersion=randomUUID(),session=randomUUID(),rulesVersion=randomUUID();
  try{
    const board=JSON.parse(await readFile(new URL('../../../presets/streamer-board.json',import.meta.url),'utf8'));board.id=`collector-board-${randomUUID()}`;for(const cell of board.cells){cell.onLand=[];cell.onPass=[];}
    await db.query(`INSERT INTO channels(id,name) VALUES($1,'collector test')`,[channel]);await db.query(`INSERT INTO operators(id,username,password_hash,role) VALUES($1,$2,'x','admin')`,[operator,`collector-${randomUUID()}`]);await db.query(`INSERT INTO channel_operators(channel_id,operator_id,permission) VALUES($1,$2,'manage')`,[channel,operator]);
    await db.query(`INSERT INTO board_versions(id,channel_id,board_definition,status,supported_for_live,created_by) VALUES($1,$2,$3,'validated',true,$4)`,[boardVersion,channel,board,operator]);
    await db.query(`INSERT INTO game_sessions(id,channel_id,board_version_id,status,current_cell_id,direction) VALUES($1,$2,$3,'running',$4,'forward')`,[session,channel,boardVersion,board.startCellId]);
    await db.query(`INSERT INTO channel_config_versions(id,channel_id,kind,document,status,created_by,published_at) VALUES($1,$2,'rules',$3,'published',$4,now())`,[rulesVersion,channel,{schemaVersion:1,multiRollEnabled:false,items:[],rules:[{id:'exact',label:'exact',amount:33,enabled:true,action:{type:'mission',message:'collector mission',shield:null}}]},operator]);
    const service=new DonationIngestionService(),consumer='rogimarble-test',collectorChannel='fixture-channel';await service.initializeCursor(channel,consumer,collectorChannel,{journalGeneration:'g1',channelOffset:'0',recoveryRevision:'0'});
    const event={consumerId:consumer,collectorChannelId:collectorChannel,eventId:'event-1',nativeBalloonCount:33,donationKind:'balloon',identityStatus:'IDENTITY_STATUS_SOURCE_ID',cursor:{journalGeneration:'g1',channelOffset:'1',recoveryRevision:'0'},donorId:'donor',donorDisplayName:'donor',message:'',observedAt:new Date().toISOString(),occurredAt:null,payload:{fixture:true}};
    const accepted=await service.acceptDonation(channel,event);assert.equal(accepted.disposition,'pending');assert.equal((await service.acceptDonation(channel,event)).duplicate,true);assert.equal((await service.cursor(channel,consumer))?.channelOffset,'1');
    assert.deepEqual(await service.drain(channel,1),{processed:1,remaining:false});assert.equal(Number((await db.query(`SELECT count(*) count FROM missions WHERE session_id=$1 AND message='collector mission'`,[session])).rows[0].count),1);
    assert.equal(Number((await db.query(`SELECT count(*) count FROM game_commands WHERE session_id=$1 AND source_kind='donation'`,[session])).rows[0].count),1);assert.equal((await service.status(channel,consumer)).counts.executed,1);

    await db.query(`UPDATE channel_config_versions SET document=$2 WHERE id=$1`,[rulesVersion,{schemaVersion:1,multiRollEnabled:true,items:[],rules:[{id:'multi',label:'multi',amount:44,enabled:true,action:{type:'roll_dice',rollCount:2}}]}]);
    const multi={...event,eventId:'event-2',nativeBalloonCount:44,cursor:{...event.cursor,channelOffset:'2'}};
    assert.equal((await service.acceptDonation(channel,multi)).disposition,'pending');
    assert.equal((await service.drain(channel,1)).processed,1);
    let inbox=(await db.query(`SELECT disposition,action_progress FROM collector_donation_inbox WHERE external_event_id='event-2'`)).rows[0];assert.deepEqual(inbox,{disposition:'pending',action_progress:1});
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);await db.query(`UPDATE collector_donation_inbox SET not_before=now()-interval '1 second' WHERE external_event_id='event-2'`);
    assert.equal((await service.drain(channel,1)).processed,1);inbox=(await db.query(`SELECT disposition,action_progress FROM collector_donation_inbox WHERE external_event_id='event-2'`)).rows[0];assert.deepEqual(inbox,{disposition:'executed',action_progress:2});
    assert.equal(Number((await db.query(`SELECT count(*) count FROM game_commands WHERE donation_inbox_id=(SELECT id FROM collector_donation_inbox WHERE external_event_id='event-2')`)).rows[0].count),2);

    await db.query(`UPDATE channel_config_versions SET document=$2 WHERE id=$1`,[rulesVersion,{schemaVersion:1,multiRollEnabled:false,items:[],rules:[{id:'destination',label:'destination',amount:55,enabled:true,action:{type:'choose_destination',selection:'donor_chat',chatCommand:'!move'}}]}]);
    const destination={...event,eventId:'event-3',nativeBalloonCount:55,cursor:{...event.cursor,channelOffset:'3'}};
    assert.equal((await service.acceptDonation(channel,destination)).disposition,'pending');await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);assert.equal((await service.drain(channel,1)).processed,1);
    const task=(await db.query(`SELECT id,created_at FROM session_effect_tasks WHERE donation_inbox_id=(SELECT id FROM collector_donation_inbox WHERE external_event_id='event-3')`)).rows[0];assert.ok(task);
    const stale=await service.acceptChat(channel,{consumerId:consumer,collectorChannelId:collectorChannel,eventId:'chat-stale',cursor:{streamGeneration:'s1',streamId:'1-0',gapBefore:false},userId:'donor',message:'!move 2',observedAt:new Date(new Date(destination.observedAt).getTime()-1000).toISOString(),payload:{fixture:true}});assert.equal(stale.matchedTaskId,undefined);
    const chat=await service.acceptChat(channel,{consumerId:consumer,collectorChannelId:collectorChannel,eventId:'chat-1',cursor:{streamGeneration:'s1',streamId:'2-0',gapBefore:false},userId:'donor',message:'!move 2',observedAt:new Date(new Date(task.created_at).getTime()+1000).toISOString(),payload:{fixture:true}});assert.equal(chat.matchedTaskId,task.id);assert.deepEqual(await service.chatCursor(channel,consumer),{streamGeneration:'s1',streamId:'2-0',gapBefore:false});
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);await db.query(`UPDATE collector_donation_inbox SET not_before=now()-interval '1 second' WHERE external_event_id='event-3'`);assert.equal((await service.drain(channel,1)).processed,1);
    assert.equal((await db.query(`SELECT disposition FROM collector_donation_inbox WHERE external_event_id='event-3'`)).rows[0].disposition,'executed');assert.equal((await db.query(`SELECT current_cell_id FROM game_sessions WHERE id=$1`,[session])).rows[0].current_cell_id,board.path[1]);

    // Burst donations remain unrolled while the streamer must resolve travel or an island lock.
    await db.query(`UPDATE channel_config_versions SET document=$2 WHERE id=$1`,[rulesVersion,{schemaVersion:1,multiRollEnabled:false,items:[],rules:[{id:'roll',label:'roll',amount:66,enabled:true,action:{type:'roll_dice',rollCount:1}}]}]);
    const fourth={...event,eventId:'event-4',nativeBalloonCount:66,cursor:{...event.cursor,channelOffset:'4'}};
    const fifth={...fourth,eventId:'event-5',cursor:{...event.cursor,channelOffset:'5'}};
    await service.acceptDonation(channel,fourth);await service.acceptDonation(channel,fifth);
    const sourceCommandId=(await db.query(`SELECT command_id FROM game_commands WHERE donation_inbox_id=(SELECT id FROM collector_donation_inbox WHERE external_event_id='event-2') LIMIT 1`)).rows[0].command_id;
    const travelTaskId=randomUUID();
    await db.query(`INSERT INTO session_effect_tasks(id,session_id,task_type,payload,source_command_id,source_effect_index) VALUES($1,$2,'choose_destination',$3,$4,99)`,[travelTaskId,session,{type:'choose_destination',selection:'operator',allowedCellIds:null,onArrival:'trigger',timing:'next_turn',excludeCurrentCell:true,selectedCellId:null,reservedTurnCommandId:null,cancelled:false},sourceCommandId]);
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);
    await service.drain(channel,50);
    assert.equal(Number((await db.query(`SELECT count(*) count FROM game_commands WHERE donation_inbox_id IN (SELECT id FROM collector_donation_inbox WHERE external_event_id IN ('event-4','event-5'))`)).rows[0].count),0);
    const {ApiService}=await import('../dist/apps/api/src/api.service.js');
    const api=new ApiService();
    let revision=Number((await db.query('SELECT revision FROM game_sessions WHERE id=$1',[session])).rows[0].revision);
    await api.command({id:operator,role:'admin'},channel,session,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:revision,type:'roll_dice',reason:'streamer starts the travel turn',payload:{}});
    revision=Number((await db.query('SELECT revision FROM game_sessions WHERE id=$1',[session])).rows[0].revision);
    await api.command({id:operator,role:'admin'},channel,session,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:revision,type:'choose_destination',reason:'streamer selects travel destination',payload:{taskId:travelTaskId,cellId:board.path[2],expectedTaskRevision:1}});
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);
    await service.drain(channel,50);
    assert.equal((await db.query(`SELECT disposition FROM collector_donation_inbox WHERE external_event_id='event-4'`)).rows[0].disposition,'executed');
    assert.equal((await db.query(`SELECT disposition FROM collector_donation_inbox WHERE external_event_id='event-5'`)).rows[0].disposition,'pending');

    await db.query(`INSERT INTO session_movement_locks(session_id,release_type,rolls_remaining,release_payload,source_command_id,source_effect_index) VALUES($1,'skip_rolls',1,$2,$3,100)`,[session,{type:'skip_rolls',count:1},sourceCommandId]);
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);
    await db.query(`UPDATE collector_donation_inbox SET not_before=now()-interval '1 second' WHERE external_event_id='event-5'`);
    await service.drain(channel,50);
    assert.equal((await db.query(`SELECT disposition FROM collector_donation_inbox WHERE external_event_id='event-5'`)).rows[0].disposition,'pending');
    revision=Number((await db.query('SELECT revision FROM game_sessions WHERE id=$1',[session])).rows[0].revision);
    await api.command({id:operator,role:'admin'},channel,session,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:revision,type:'roll_dice',reason:'streamer rolls to leave island',payload:{}});
    assert.equal(Number((await db.query('SELECT count(*) count FROM session_movement_locks WHERE session_id=$1',[session])).rows[0].count),0);
    await db.query(`UPDATE collector_dispatch_state SET next_movement_at=now()-interval '1 second' WHERE channel_id=$1`,[channel]);
    await service.drain(channel,50);
    assert.equal((await db.query(`SELECT disposition FROM collector_donation_inbox WHERE external_event_id='event-5'`)).rows[0].disposition,'executed');
  }finally{await db.query('DELETE FROM channels WHERE id=$1',[channel]).catch(()=>{});await db.end();await closePool();}
});
