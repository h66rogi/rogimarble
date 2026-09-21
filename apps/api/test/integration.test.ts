import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

const root=new URL('../../../',import.meta.url).pathname;
const container=`rogimarble-api-test-${randomUUID()}`;
const databasePassword=randomBytes(24).toString('base64url');
const adminPassword=randomBytes(24).toString('base64url');
const sessionSecret=randomBytes(48).toString('base64url');
const apiPort=41000+Math.floor(Math.random()*1000);
let databaseUrl='';
let api:ChildProcess|undefined;
let apiOutput='';
let creationRequest:any;
let creationAck:any;

function command(program:string,args:string[],options:{env?:NodeJS.ProcessEnv;allowFailure?:boolean}={}):string{
  const result=spawnSync(program,args,{cwd:root,env:{...process.env,...options.env},encoding:'utf8',timeout:120_000});
  if(!options.allowFailure&&result.status!==0)throw new Error(`${program} failed (${result.status}): ${result.stderr||result.stdout}`);
  return `${result.stdout}${result.stderr}`;
}
async function waitFor(url:string,attempts=120):Promise<void>{
  for(let i=0;i<attempts;i++){try{if((await fetch(url)).ok)return;}catch{} await new Promise(r=>setTimeout(r,250));}
  throw new Error(`Timed out waiting for ${url}`);
}
async function startApi(extraEnv:NodeJS.ProcessEnv={}):Promise<void>{
  apiOutput='';
  api=spawn(process.execPath,['apps/api/dist/apps/api/src/main.js'],{cwd:root,env:{...process.env,DATABASE_URL:databaseUrl,
    SESSION_SECRET:sessionSecret,COOKIE_SECURE:'false',PORT:String(apiPort),...extraEnv},stdio:['ignore','pipe','pipe']});
  api.stdout?.on('data',chunk=>{apiOutput+=String(chunk);});api.stderr?.on('data',chunk=>{apiOutput+=String(chunk);});
  try{await waitFor(`http://127.0.0.1:${apiPort}/health`,480);}catch(error){throw new Error(`${String(error)}; api=${apiOutput.slice(-2000)}`);}
}
async function stopApi():Promise<void>{
  if(!api||api.exitCode!==null)return;
  api.kill('SIGTERM');
  await Promise.race([new Promise<void>(resolve=>api!.once('exit',()=>resolve())),new Promise<void>(resolve=>setTimeout(resolve,3000))]);
  if(api.exitCode===null)api.kill('SIGKILL');
}
async function login(username='admin',origin?:string){
  const response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},
    body:JSON.stringify({username,password:adminPassword})});
  assert.equal(response.status,200); const body=await response.json() as {csrfToken:string};
  const cookie=response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  return {csrf:body.csrfToken,cookie};
}
function client(auth:{csrf:string;cookie:string}){
  const get=(path:string)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{headers:{cookie:auth.cookie}});
  const post=(path:string,body:unknown,csrf:string|null=auth.csrf)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'POST',
    headers:{cookie:auth.cookie,'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify(body)});
  const put=(path:string,body:unknown)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'PUT',headers:{cookie:auth.cookie,'content-type':'application/json','x-csrf-token':auth.csrf},body:JSON.stringify(body)});
  const del=(path:string)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'DELETE',headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf}});
  return {get,post,put,del};
}

test.before(async()=>{
  command('docker',['run','--name',container,'-e',`POSTGRES_PASSWORD=${databasePassword}`,'-e','POSTGRES_DB=rogimarble_test','-p','127.0.0.1::5432','-d','postgres:17-alpine']);
  const published=command('docker',['port',container,'5432/tcp']).trim(); const port=published.slice(published.lastIndexOf(':')+1);
  databaseUrl=`postgresql://postgres:${databasePassword}@127.0.0.1:${port}/rogimarble_test`;
  for(let i=0;i<120;i++){const probe=new pg.Client({connectionString:databaseUrl,connectionTimeoutMillis:500});try{await probe.connect();await probe.query('SELECT 1');await probe.end();break;}catch{await probe.end().catch(()=>{});await new Promise(r=>setTimeout(r,500));if(i===119)throw new Error('PostgreSQL TCP endpoint did not become ready');}}
  command(process.execPath,['--experimental-strip-types','packages/database/src/migrate.ts'],{env:{DATABASE_URL:databaseUrl}});
  command(process.execPath,['--experimental-strip-types','packages/database/src/bootstrap-admin.ts'],{env:{DATABASE_URL:databaseUrl,
    BOOTSTRAP_ADMIN_USERNAME:'admin',BOOTSTRAP_ADMIN_PASSWORD:adminPassword,BOOTSTRAP_CHANNEL_ID:'test-channel',BOOTSTRAP_CHANNEL_NAME:'Test Channel'}});
  command(process.execPath,['--experimental-strip-types','packages/database/src/register-preview-board.ts'],{env:{DATABASE_URL:databaseUrl,
    BOARD_CHANNEL_ID:'test-channel',BOARD_OPERATOR_USERNAME:'admin'}});
  command(process.execPath,['--experimental-strip-types','packages/database/src/import-items.ts','presets/streamer-initial.json'],{env:{DATABASE_URL:databaseUrl,
    ITEM_CHANNEL_ID:'test-channel'}});
  command('tsc',['-p','apps/api/tsconfig.json','--pretty','false']);
  await startApi();
});
test.after(async()=>{await stopApi();spawnSync('docker',['rm','-f',container],{stdio:'ignore'});});

test('health, readiness, cookie session and CSRF fail closed',async()=>{
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/ready`)).status,200);
  const auth=await login(),http=client(auth);
  const boards=await http.get('/v1/channels/test-channel/board-versions/runnable');assert.equal(boards.status,200);
  const boardList=await boards.json() as unknown[];assert.equal(boardList.length,1);
  assert.equal((await http.post('/v1/channels/test-channel/sessions',{},null)).status,403);
});

test('original effect board is rejected instead of silently degraded',()=>{
  const output=command(process.execPath,['--experimental-strip-types','packages/database/src/register-board.ts','presets/streamer-board.json'],
    {env:{DATABASE_URL:databaseUrl,BOARD_CHANNEL_ID:'test-channel',BOARD_OPERATOR_USERNAME:'admin'},allowFailure:true});
  assert.match(output,/unsupported effect/);
});

test('malformed commands are rejected as 4xx',async()=>{
  const http=client(await login());
  const unknown=await http.post(`/v1/channels/test-channel/sessions/${randomUUID()}/commands`,{type:'unknown'});assert.equal(unknown.status,422);
  const nullBody=await http.post(`/v1/channels/test-channel/sessions/${randomUUID()}/commands`,null);assert.ok(nullBody.status>=400&&nullBody.status<500);
});

test('concurrent identical session creation is idempotent',async(t)=>{
  const http=client(await login());const boards=await (await http.get('/v1/channels/test-channel/board-versions/runnable')).json() as any[];
  const body={commandId:randomUUID(),boardVersionId:boards[0].id,initialCellId:boards[0].initialCellId,direction:'forward'};
  const responses=await Promise.all([http.post('/v1/channels/test-channel/sessions',body),http.post('/v1/channels/test-channel/sessions',body)]);
  assert.deepEqual(responses.map(r=>r.status),[201,201]);const sessions=await Promise.all(responses.map(r=>r.json())) as any[];assert.equal(sessions[0].id,sessions[1].id);
  creationRequest=body;creationAck=sessions[0];
  assert.equal((await http.post('/v1/channels/test-channel/sessions',{...body,commandId:randomUUID()})).status,409);
  t.diagnostic(`session=${sessions[0].id}`);
});

test('concurrent roll is applied once; scope and stale revision are rejected',async()=>{
  const http=client(await login()),state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  const path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`,commandId=randomUUID();
  const body={commandId,sessionEpoch:1,expectedRevision:0,type:'roll_dice',reason:'integration test',payload:{count:1}};
  const responses=await Promise.all([http.post(path,body),http.post(path,body)]);assert.deepEqual(responses.map(r=>r.status),[201,201]);
  const results=await Promise.all(responses.map(r=>r.json())) as any[];assert.deepEqual(results[0],results[1]);assert.equal(results[0].afterRevision,1);
  const replay=await http.post('/v1/channels/test-channel/sessions',creationRequest);assert.equal(replay.status,201);assert.deepEqual(await replay.json(),creationAck);
  assert.equal((await http.post(`/v1/channels/test-channel/sessions/${randomUUID()}/commands`,body)).status,409);
  assert.equal((await http.post(path,{...body,commandId:randomUUID(),type:'set_direction',payload:{direction:'reverse'}})).status,409);
});

test('legacy 001 create acknowledgement is rejected as recoverable conflict',async()=>{
  const http=client(await login());
  if(!creationRequest){const boards=await (await http.get('/v1/channels/test-channel/board-versions/runnable')).json() as any[];creationRequest={commandId:randomUUID(),boardVersionId:boards[0].id,initialCellId:boards[0].initialCellId,direction:'forward'};const created=await http.post('/v1/channels/test-channel/sessions',creationRequest);assert.equal(created.status,201);creationAck=await created.json();}
  const current=await http.get(`/v1/channels/test-channel/commands/${creationRequest.commandId}`);assert.equal(current.status,200);assert.deepEqual((await current.json() as any).result,creationAck);
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `UPDATE game_commands SET result=jsonb_build_object('sessionId',session_id) WHERE command_id='${creationRequest.commandId}';`]);
  assert.equal((await http.get(`/v1/channels/test-channel/commands/${creationRequest.commandId}`)).status,409);
  const retry=await http.post('/v1/channels/test-channel/sessions',creationRequest);assert.equal(retry.status,409);
  assert.match(JSON.stringify(await retry.json()),/Legacy create command/);
});

test('viewer relation cannot override global read-only role',async()=>{
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `INSERT INTO operators(id,username,password_hash,role) SELECT '${randomUUID()}','viewer',password_hash,'viewer' FROM operators WHERE username='admin';
     INSERT INTO channel_operators(channel_id,operator_id,permission) SELECT 'test-channel',id,'operate' FROM operators WHERE username='viewer';`]);
  const http=client(await login('viewer')),state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(state.capabilities.inventory,false);assert.equal(state.capabilities.sessionLifecycle,false);
  const response=await http.post(`/v1/channels/test-channel/sessions/${state.session.id}/commands`,{commandId:randomUUID(),sessionEpoch:1,
    expectedRevision:1,type:'set_direction',reason:'viewer check',payload:{direction:'reverse'}});assert.equal(response.status,403);
});

test('channel view permission disables writes even for operator role',async()=>{
  const id=randomUUID();command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `INSERT INTO operators(id,username,password_hash,role) SELECT '${id}','channel-viewer',password_hash,'operator' FROM operators WHERE username='admin';
     INSERT INTO channel_operators(channel_id,operator_id,permission) VALUES('test-channel','${id}','operate');`]);
  const auth=await login('channel-viewer');command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-c',`UPDATE channel_operators SET permission='view' WHERE operator_id='${id}';`]);
  const http=client(auth),state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(state.capabilities.inventory,false);assert.equal(state.capabilities.manualRoll,false);
  assert.equal((await http.post(`/v1/channels/test-channel/sessions/${state.session.id}/commands`,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:1,type:'pause',reason:'view permission check',payload:{}})).status,403);
});

test('role revocation after login blocks the next mutation',async()=>{
  const id=randomUUID();command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `INSERT INTO operators(id,username,password_hash,role) SELECT '${id}','role-revoked',password_hash,'operator' FROM operators WHERE username='admin';
     INSERT INTO channel_operators(channel_id,operator_id,permission) VALUES('test-channel','${id}','operate');`]);
  const auth=await login('role-revoked');command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-c',`UPDATE operators SET role='viewer' WHERE id='${id}';`]);
  const http=client(auth),state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(state.capabilities.sessionLifecycle,false);
  assert.equal((await http.post(`/v1/channels/test-channel/sessions/${state.session.id}/commands`,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:1,type:'pause',reason:'role revocation check',payload:{}})).status,403);
});

test('direction and position persist across API restart',async()=>{
  const auth=await login(),http=client(auth);let state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  const path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`;
  let response=await http.post(path,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:1,type:'set_direction',reason:'integration test',payload:{direction:'reverse'}});assert.equal(response.status,201);assert.equal((await response.json() as any).presentationEpoch,1);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.session.presentationEpoch,1);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:2,type:'set_position',reason:'integration test',payload:{cellId:'cell-05',pauseAutomaticMovement:true,triggerArrivalEffects:false}});assert.equal(response.status,201);assert.equal((await response.json() as any).presentationEpoch,2);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:1,expectedRevision:3,type:'roll_dice',reason:'paused single step',payload:{count:1}});assert.equal(response.status,201);assert.equal((await response.json() as any).presentationEpoch,2);
  await stopApi();await startApi();state=await (await http.get('/v1/channels/test-channel/operator-state')).json();
  assert.equal(state.session.revision,4);assert.equal(state.session.direction,'reverse');assert.equal(state.session.status,'paused');assert.equal(state.session.presentationEpoch,2);assert.equal(state.session.previewOnly,true);
});

test('inventory and shield policy are data-driven, atomic and concurrency safe',async()=>{
  const http=client(await login());let state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  const path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`,send=(body:any)=>http.post(path,{commandId:randomUUID(),sessionEpoch:1,reason:'integration test',...body});
  assert.equal((await send({expectedRevision:4,type:'resume',payload:{}})).status,201);
  let created=await send({expectedRevision:5,type:'create_mission',payload:{message:'data driven shield mission',quantity:3,shield:{itemId:'drink-shield',quantity:1}}});assert.equal(created.status,201);
  const mission=(await created.json() as any).result.mission;assert.equal(mission.quantity,3);
  const insufficient=await send({expectedRevision:6,type:'use_shield',payload:{missionId:mission.id,expectedMissionRevision:0,expectedInventoryRevision:0}});assert.equal(insufficient.status,422);
  assert.equal((await send({expectedRevision:6,type:'adjust_inventory',payload:{itemId:'drink-shield',mode:'delta',quantity:1,expectedInventoryRevision:0}})).status,201);
  const shieldBody={sessionEpoch:1,expectedRevision:7,type:'use_shield',reason:'concurrent defense',payload:{missionId:mission.id,expectedMissionRevision:0,expectedInventoryRevision:1}};
  const defenses=await Promise.all([http.post(path,{...shieldBody,commandId:randomUUID()}),http.post(path,{...shieldBody,commandId:randomUUID()})]);
  assert.deepEqual(defenses.map(r=>r.status).sort(),[201,409]);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.inventory[0].quantity,0);assert.equal(state.inventory[0].revision,2);assert.equal(state.missions[0].status,'shielded');
});

test('missions complete or waive exactly once and session lifecycle permits a clean new session',async()=>{
  const http=client(await login());let state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  const oldSessionId=state.session.id;
  let path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`;
  const send=(expectedRevision:number,type:string,payload:unknown)=>http.post(path,{commandId:randomUUID(),sessionEpoch:1,expectedRevision,type,reason:'integration test',payload});
  let response=await send(8,'create_mission',{message:'complete me',quantity:1,shield:null});assert.equal(response.status,201);const completeId=(await response.json() as any).result.mission.id;
  assert.equal((await send(9,'end_session',{})).status,409);
  assert.equal((await send(9,'complete_mission',{missionId:completeId,expectedMissionRevision:0})).status,201);
  response=await send(10,'create_mission',{message:'waive me',shield:null});assert.equal(response.status,201);const waiveId=(await response.json() as any).result.mission.id;
  assert.equal((await send(11,'waive_mission',{missionId:waiveId,expectedMissionRevision:0})).status,201);
  assert.equal((await send(12,'pause',{})).status,201);assert.equal((await send(13,'end_session',{})).status,201);
  assert.equal((await send(14,'adjust_inventory',{itemId:'drink-shield',mode:'delta',quantity:1,expectedInventoryRevision:2})).status,409);
  const ledger=await http.get(`/v1/channels/test-channel/sessions/${oldSessionId}/inventory-ledger`);assert.equal(ledger.status,200);assert.equal((await ledger.json() as any[]).length,2);
  const history=await http.get(`/v1/channels/test-channel/sessions/${oldSessionId}/missions`);assert.equal(history.status,200);assert.equal((await history.json() as any[]).length,3);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.session,null);
  const boards=await (await http.get('/v1/channels/test-channel/board-versions/runnable')).json() as any[];
  response=await http.post('/v1/channels/test-channel/sessions',{commandId:randomUUID(),boardVersionId:boards[0].id,initialCellId:boards[0].initialCellId,direction:'forward'});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.session.status,'running');assert.equal(state.session.previewOnly,true);assert.equal(state.inventory[0].quantity,0);assert.deepEqual(state.missions,[]);
});

test('versioned configuration, honest donation feed and revocable OBS snapshot are persisted',async()=>{
  const http=client(await login());
  const itemConfig=await (await http.get('/v1/channels/test-channel/config/items')).json() as any;assert.equal(itemConfig.effectiveDocument[0].id,'drink-shield');
  const rules={schemaVersion:1,multiRollEnabled:false,items:[{id:'drink-shield',label:'한잔 실드'}],rules:[{id:'roll',label:'주사위',amount:33,enabled:true,action:{type:'roll_dice',rollCount:1}}]};
  let response=await http.post('/v1/channels/test-channel/config/rules',{document:rules});assert.equal(response.status,201);
  let version=await response.json() as any;assert.equal(version.status,'draft');
  response=await http.put(`/v1/channels/test-channel/config/rules/${version.id}`,{expectedRevision:version.revision,document:{...rules,rules:[...rules.rules,{...rules.rules[0],id:'duplicate',amount:33}]}});assert.equal(response.status,200);
  version=await response.json();response=await http.post(`/v1/channels/test-channel/config/rules/${version.id}/validate`,{expectedRevision:version.revision});assert.equal(response.status,201);version=await response.json();assert.equal(version.status,'draft');assert.ok(version.validationErrors.length>0);
  response=await http.put(`/v1/channels/test-channel/config/rules/${version.id}`,{expectedRevision:version.revision,document:rules});assert.equal(response.status,200);version=await response.json();
  response=await http.post(`/v1/channels/test-channel/config/rules/${version.id}/validate`,{expectedRevision:version.revision});assert.equal(response.status,201);version=await response.json();assert.equal(version.status,'validated');
  response=await http.post(`/v1/channels/test-channel/config/rules/${version.id}/publish`,{expectedRevision:version.revision});assert.equal(response.status,201);assert.equal((await response.json() as any).status,'published');
  const feed=await (await http.get('/v1/channels/test-channel/donations?limit=10')).json() as any;assert.equal(feed.collectionConnected,false);assert.deepEqual(feed.items,[]);
  response=await http.post('/v1/channels/test-channel/obs-tokens',{label:'integration OBS'});assert.equal(response.status,201);const issued=await response.json() as any;assert.match(issued.token,/^[A-Za-z0-9_-]{43}$/);
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}});assert.equal(response.status,200);const overlay=await response.json() as any;assert.equal(overlay.channelId,'test-channel');assert.equal(overlay.capabilities.donations,false);assert.ok(overlay.session);assert.ok(overlay.boardDefinition);
  assert.equal((await http.del(`/v1/channels/test-channel/obs-tokens/${issued.id}`)).status,204);
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})).status,401);
});

test('configuration rejects stale revisions and read-only writes; OBS permits concurrent readers',async()=>{
  const http=client(await login()),viewer=client(await login('viewer'));
  const path='/v1/channels/test-channel/config/overlay-layout';
  const document={schemaVersion:1,width:1920,height:1080,aspectRatio:'16:9',background:'transparent',widgets:[{id:'board',bounds:{x:0,y:0,width:1,height:1},z:0}]};
  assert.equal((await viewer.post(path,{document})).status,403);
  assert.equal((await viewer.post('/v1/channels/test-channel/obs-tokens',{label:'forbidden'})).status,403);
  let response=await http.post(path,{document});assert.equal(response.status,201);let version=await response.json() as any;
  assert.equal((await http.put(`${path}/${version.id}`,{expectedRevision:version.revision+1,document})).status,409);
  response=await http.post(`${path}/${version.id}/validate`,{expectedRevision:version.revision});version=await response.json();assert.equal(version.status,'validated');
  response=await http.post(`${path}/${version.id}/publish`,{expectedRevision:version.revision});assert.equal(response.status,201);version=await response.json();
  assert.equal((await http.put(`${path}/${version.id}`,{expectedRevision:version.revision,document})).status,409);
  response=await http.post(path,{document:{...document,widgets:[{id:'board',bounds:{x:0.8,y:0,width:1,height:1},z:0}]}});version=await response.json();
  response=await http.post(`${path}/${version.id}/validate`,{expectedRevision:version.revision});version=await response.json();assert.equal(version.status,'draft');assert.ok(version.validationErrors.length);
  assert.equal((await http.post(`${path}/${version.id}/publish`,{expectedRevision:version.revision})).status,409);
  const issued=await (await http.post('/v1/channels/test-channel/obs-tokens',{label:'concurrent readers'})).json() as any;
  const readers=await Promise.all(Array.from({length:4},()=>fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})));
  assert.deepEqual(readers.map(x=>x.status),[200,200,200,200]);
  for(const reader of readers){const state=await reader.json() as any;assert.deepEqual(state.layout,document);assert.equal(state.latestCommand?.operatorId,undefined);}
  assert.equal((await http.del(`/v1/channels/test-channel/obs-tokens/${issued.id}`)).status,204);
  const first=await (await http.get('/v1/channels/test-channel/operations?limit=1')).json() as any;assert.equal(first.items.length,1);assert.ok(first.nextCursor);
  const second=await (await http.get(`/v1/channels/test-channel/operations?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json() as any;assert.equal(second.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id);
  assert.equal((await http.get('/v1/channels/test-channel/operations?cursor=invalid')).status,400);
});

test('password change keeps the current session and revokes other sessions',async()=>{
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `INSERT INTO operators(id,username,password_hash,role) SELECT '${randomUUID()}','password-user',password_hash,'operator' FROM operators WHERE username='admin';`]);
  const first=await login('password-user'),second=await login('password-user');
  const nextPassword=randomBytes(24).toString('base64url');
  assert.equal((await client(first).post('/v1/auth/password',{currentPassword:'incorrect',newPassword:nextPassword})).status,401);
  assert.equal((await client(first).post('/v1/auth/password',{currentPassword:adminPassword,newPassword:nextPassword})).status,200);
  assert.equal((await client(first).get('/v1/auth/session')).status,200);
  assert.equal((await client(second).get('/v1/auth/session')).status,401);
  const response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'password-user',password:nextPassword})});assert.equal(response.status,200);
});

test('array item configuration round-trips as JSON and publishes active definitions',async()=>{
  const http=client(await login()),path='/v1/channels/test-channel/config/items';
  const document=[{id:'drink-shield',label:'Editable shield',maxQuantity:100}];
  let response=await http.post(path,{document});assert.equal(response.status,201);let version=await response.json() as any;assert.deepEqual(version.document,document);
  response=await http.put(`${path}/${version.id}`,{expectedRevision:version.revision,document});assert.equal(response.status,200);version=await response.json();assert.deepEqual(version.document,document);
  response=await http.post(`${path}/${version.id}/validate`,{expectedRevision:version.revision});version=await response.json();assert.equal(version.status,'validated');
  response=await http.post(`${path}/${version.id}/publish`,{expectedRevision:version.revision});assert.equal(response.status,201);
  const state=await (await http.get(path)).json() as any;assert.deepEqual(state.published.document,document);assert.deepEqual(state.effectiveDocument,document);
});

test('shared mode still issues and validates explicit local operator sessions',async()=>{
  await stopApi();
  await startApi({AUTH_MODE:'rogichat_shared_cookie',ROGICHAT_COOKIE_NAME:'__Secure-rogi_session',ROGICHAT_SESSION_URL:'https://api.rogi.chat/v1/auth/session',WEB_ORIGIN:'https://marble.rogi.chat'});
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:adminPassword})})).status,403);
  const auth=await login('admin','https://marble.rogi.chat');
  let response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/session`,{headers:{cookie:auth.cookie}});assert.equal(response.status,200);assert.equal((await response.json() as any).authMode,'local');
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/session`,{headers:{cookie:'rogimarble_session=bad.bad'}});assert.equal(response.status,401);
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/login`,{method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/json'},body:JSON.stringify({username:'admin',password:adminPassword})});assert.equal(response.status,403);
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-c',`UPDATE operators SET disabled_at=now() WHERE username='admin';`]);
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/session`,{headers:{cookie:auth.cookie}});assert.equal(response.status,401);
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-c',`UPDATE operators SET disabled_at=NULL WHERE username='admin';`]);
});
