import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { io } from 'socket.io-client';

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
    SESSION_SECRET:sessionSecret,COOKIE_SECURE:'false',PASSWORD_RECOVERY_ENABLED:'true',PORT:String(apiPort),...extraEnv},stdio:['ignore','pipe','pipe']});
  api.stdout?.on('data',chunk=>{apiOutput+=String(chunk);});api.stderr?.on('data',chunk=>{apiOutput+=String(chunk);});
  try{await waitFor(`http://127.0.0.1:${apiPort}/health`,480);}catch(error){throw new Error(`${String(error)}; api=${apiOutput.slice(-2000)}`);}
}
async function stopApi():Promise<void>{
  if(!api||api.exitCode!==null)return;
  api.kill('SIGTERM');
  await Promise.race([new Promise<void>(resolve=>api!.once('exit',()=>resolve())),new Promise<void>(resolve=>setTimeout(resolve,3000))]);
  if(api.exitCode===null)api.kill('SIGKILL');
}
async function login(username='admin',origin='https://console.example'){
  let path='/v1/auth/login',requestBody:unknown={username,password:adminPassword};
  if(!['admin','password-user'].includes(username)){
    const raw=`rma_${randomBytes(32).toString('base64url')}`,digest=createHash('sha256').update(raw).digest('hex');
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query(`INSERT INTO operator_access_tokens(id,operator_id,token_hash,label,expires_at) SELECT $1,id,$2,'integration login',now()+interval '1 hour' FROM operators WHERE username=$3`,[randomUUID(),digest,username]);await db.end();path='/v1/auth/token';requestBody={token:raw};
  }
  const response=await fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(requestBody)});
  assert.equal(response.status,200); const sessionBody=await response.json() as {csrfToken:string};
  const cookie=response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  return {csrf:sessionBody.csrfToken,cookie};
}
function client(auth:{csrf:string;cookie:string}){
  const get=(path:string)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{headers:{origin:'https://console.example',cookie:auth.cookie}});
  const post=(path:string,body:unknown,csrf:string|null=auth.csrf)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'POST',
    headers:{origin:'https://console.example',cookie:auth.cookie,'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify(body)});
  const put=(path:string,body:unknown)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'PUT',headers:{origin:'https://console.example',cookie:auth.cookie,'content-type':'application/json','x-csrf-token':auth.csrf},body:JSON.stringify(body)});
  const del=(path:string)=>fetch(`http://127.0.0.1:${apiPort}${path}`,{method:'DELETE',headers:{origin:'https://console.example',cookie:auth.cookie,'x-csrf-token':auth.csrf}});
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
  await startApi({WEB_ORIGIN:'https://console.example'});
});
test.after(async()=>{await stopApi();spawnSync('docker',['rm','-f',container],{stdio:'ignore'});});

test('health, readiness, cookie session and CSRF fail closed',async()=>{
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/ready`)).status,200);
  const auth=await login(),http=client(auth);
  const boards=await http.get('/v1/channels/test-channel/board-versions/runnable');assert.equal(boards.status,200);
  const boardList=await boards.json() as unknown[];assert.equal(boardList.length,1);
  assert.equal((await http.post('/v1/channels/test-channel/sessions',{},null)).status,403);
});

test('chat history is scoped, searchable, cursor paged, and its live stream requires a session',async()=>{
  const auth=await login(),http=client(auth),db=new pg.Client({connectionString:databaseUrl});
  await db.connect();
  try{
    for(const [index,name,message] of [[1,'첫 시청자','첫 메시지'],[2,'둘째 시청자','다음 메시지']] as const){
      await db.query(`INSERT INTO collector_chat_inbox(id,channel_id,consumer_id,collector_channel_id,external_event_id,stream_generation,stream_id,gap_before,payload,received_at) VALUES($1,'test-channel','integration','synthetic',$2,'g1',$3,false,$4,now()+$5::interval)`,
        [randomUUID(),`chat-${index}`,String(index),{userId:`viewer-${index}`,userDisplayName:name,message,observedAt:'2026-01-01T00:00:00Z',occurredAt:null},`${index} seconds`]);
    }
  }finally{await db.end();}
  const base='/v1/channels/test-channel/chats';
  let response=await http.get(`${base}?limit=1`);assert.equal(response.status,200);
  const first=await response.json() as any;assert.equal(first.items.length,1);assert.equal(first.items[0].userDisplayName,'둘째 시청자');assert.ok(first.nextCursor);
  response=await http.get(`${base}?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);assert.equal(response.status,200);
  const second=await response.json() as any;assert.equal(second.items[0].userDisplayName,'첫 시청자');assert.notEqual(first.items[0].id,second.items[0].id);
  response=await http.get(`${base}?search=${encodeURIComponent('다음 메시지')}`);assert.equal(response.status,200);
  assert.deepEqual((await response.json() as any).items.map((item:any)=>item.userDisplayName),['둘째 시청자']);
  assert.equal((await http.get('/v1/channels/unrelated-channel/chats')).status,403);
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/feed/events`)).status,401);
  const controller=new AbortController();
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/feed/events`,{headers:{origin:'https://console.example',cookie:auth.cookie},signal:controller.signal});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/text\/event-stream/);
  const reader=response.body!.getReader();
  try{assert.match(new TextDecoder().decode((await reader.read()).value),/heartbeat/);}finally{controller.abort();await reader.cancel().catch(()=>{});}
});

test('live overlay layout persists, uses CAS, scopes channels, and revoked OBS tokens fail closed',async()=>{
  const auth=await login(),http=client(auth),path='/v1/channels/test-channel/overlay-layout/live';
  let response=await http.get(path);assert.equal(response.status,200);const initial=await response.json() as any;
  assert.equal(initial.layoutVersion,0);assert.equal(initial.layout.width,1920);assert.equal(initial.layout.fontId,'nanum-square-neo');
  const changed={...initial.layout,background:'#112233',widgets:[{id:'board',bounds:{x:.1,y:.1,width:.8,height:.8},z:1}]};
  response=await http.put(path,{layout:changed,expectedVersion:0});assert.equal(response.status,200);const saved=await response.json() as any;assert.equal(saved.layoutVersion,1);
  assert.equal((await http.put(path,{layout:initial.layout,expectedVersion:0})).status,409);
  response=await http.get(path);assert.equal(response.status,200);const reloaded=await response.json() as any;assert.equal(reloaded.layoutVersion,1);assert.deepEqual(reloaded.layout.widgets,changed.widgets);
  assert.equal((await http.get('/v1/channels/unrelated-channel/overlay-layout/live')).status,403);
  response=await http.post('/v1/channels/test-channel/obs-tokens',{label:'layout integration'});assert.equal(response.status,201);const issued=await response.json() as any;
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}});assert.equal(response.status,200);const overlay=await response.json() as any;assert.equal(overlay.layoutVersion,1);assert.deepEqual(overlay.layout.widgets,changed.widgets);
  const hostile=io(`http://127.0.0.1:${apiPort}`,{path:'/socket.io',transports:['websocket'],auth:{token:issued.token},extraHeaders:{origin:'https://hostile.example'},reconnection:false});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('hostile origin was not rejected')),3000);hostile.once('connect_error',()=>{clearTimeout(timeout);resolve();});hostile.once('connect',()=>reject(new Error('hostile origin connected')));});hostile.close();
  const socket=io(`http://127.0.0.1:${apiPort}`,{path:'/socket.io',transports:['websocket'],auth:{token:issued.token},extraHeaders:{origin:'https://console.example'},reconnection:false});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('socket connect timeout')),3000);socket.once('connect',()=>{clearTimeout(timeout);resolve();});socket.once('connect_error',reject);});
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query(`INSERT INTO channels(id,display_name,owner_operator_id) SELECT 'second-channel','Second',id FROM operators WHERE username='admin' ON CONFLICT DO NOTHING`);await db.query(`INSERT INTO channel_operators(channel_id,operator_id,permission) SELECT 'second-channel',id,'manage' FROM operators WHERE username='admin' ON CONFLICT DO NOTHING`);await db.end();
  const secondIssued=await (await http.post('/v1/channels/second-channel/obs-tokens',{label:'isolated reader'})).json() as any;
  const secondSocket=io(`http://127.0.0.1:${apiPort}`,{path:'/socket.io',transports:['websocket'],auth:{token:secondIssued.token},extraHeaders:{origin:'https://console.example'},reconnection:false});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('second socket connect timeout')),3000);secondSocket.once('connect',()=>{clearTimeout(timeout);resolve();});secondSocket.once('connect_error',reject);});
  try{
    let crossRoomEvent=false;secondSocket.on('overlay:event',()=>{crossRoomEvent=true;});
    const pushed=new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('layout.updated timeout')),3000);socket.once('overlay:event',message=>{clearTimeout(timeout);resolve(message);});});
    const changedAgain={...changed,background:'#445566'};response=await http.put(path,{layout:changedAgain,expectedVersion:1});assert.equal(response.status,200);const message=await pushed;assert.equal(message.event,'layout.updated');assert.equal(JSON.parse(message.payload).layoutVersion,2);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(crossRoomEvent,false);
    const disconnected=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('socket revoke timeout')),3000);socket.once('disconnect',()=>{clearTimeout(timeout);resolve();});});
    assert.equal((await http.del(`/v1/channels/test-channel/obs-tokens/${issued.id}`)).status,204);await disconnected;
  }finally{socket.close();secondSocket.close();await http.del(`/v1/channels/second-channel/obs-tokens/${secondIssued.id}`);}
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})).status,401);
});

test('pawn image upload is revisioned, sanitized, replaced, and deleted',async()=>{
  const auth=await login();
  const pawnPath=`http://127.0.0.1:${apiPort}/v1/channels/test-channel/pawn-style`;
  const selectStyle=(styleId:string,expectedRevision:number,csrf:string|null=auth.csrf)=>fetch(pawnPath,{method:'PUT',headers:{origin:'https://console.example',cookie:auth.cookie,'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify({styleId,expectedRevision})});
  let response=await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/pawn-image`,{headers:{origin:'https://console.example',cookie:auth.cookie}});
  assert.deepEqual(await response.json(),{revision:0,styleId:'star-medal',image:null});
  assert.equal((await selectStyle('heart-chip',0,null)).status,403);
  assert.equal((await selectStyle('unknown',0)).status,400);
  response=await selectStyle('heart-chip',0);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:1,styleId:'heart-chip',image:null});
  assert.equal((await selectStyle('bunny-face',0)).status,409);
  response=await selectStyle('bunny-face',1);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:2,styleId:'bunny-face',image:null});
  response=await selectStyle('star-medal',2);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:3,styleId:'star-medal',image:null});
  response=await selectStyle('star-medal',3);assert.equal(response.status,200);assert.equal((await response.json()).revision,3);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const upload=(revision:number,csrf:string|null=auth.csrf,mime='image/png')=>fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/pawn-image?expectedRevision=${revision}`,{method:'PUT',headers:{origin:'https://console.example',cookie:auth.cookie,'content-type':mime,...(csrf?{'x-csrf-token':csrf}:{})},body:png});
  assert.equal((await upload(3,null)).status,403);
  assert.equal((await upload(3,auth.csrf,'image/jpeg')).status,415);
  response=await upload(3);assert.equal(response.status,200);const first=await response.json() as any;assert.equal(first.revision,4);assert.equal(first.styleId,'star-medal');assert.equal(first.image.mimeType,'image/png');
  response=await fetch(`http://127.0.0.1:${apiPort}${first.image.url}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  assert.equal((await upload(3)).status,409);
  const replacements=await Promise.all([upload(4),upload(4)]);assert.deepEqual(replacements.map(item=>item.status).sort(),[200,409]);response=replacements.find(item=>item.status===200)!;const second=await response.json() as any;assert.equal(second.revision,5);assert.notEqual(second.image.assetId,first.image.assetId);
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}${first.image.url}`)).status,404);
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/pawn-image?expectedRevision=5`,{method:'DELETE',headers:{origin:'https://console.example',cookie:auth.cookie,'x-csrf-token':auth.csrf}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:6,styleId:'star-medal',image:null});
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}${second.image.url}`)).status,404);
  response=await selectStyle('heart-chip',6);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:7,styleId:'heart-chip',image:null});
  response=await upload(7);assert.equal(response.status,200);const photo=await response.json() as any;assert.equal(photo.styleId,'heart-chip');
  response=await selectStyle('bunny-face',8);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:9,styleId:'bunny-face',image:null});
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}${photo.image.url}`)).status,404);
  const state=await (await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/operator-state`,{headers:{origin:'https://console.example',cookie:auth.cookie}})).json() as any;assert.deepEqual(state.pawnAppearance,{revision:9,styleId:'bunny-face',image:null});
  const issued=await (await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/obs-tokens`,{method:'POST',headers:{origin:'https://console.example',cookie:auth.cookie,'x-csrf-token':auth.csrf,'content-type':'application/json'},body:JSON.stringify({label:'pawn style reader'})})).json() as any;
  const overlay=await (await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})).json() as any;
  assert.deepEqual(overlay.pawnAppearance,{revision:9,styleId:'bunny-face',image:null});
  await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/obs-tokens/${issued.id}`,{method:'DELETE',headers:{origin:'https://console.example',cookie:auth.cookie,'x-csrf-token':auth.csrf}});
});

test('the initial effect board registers once through the shared runtime gate',()=>{
  const env={DATABASE_URL:databaseUrl,BOARD_CHANNEL_ID:'test-channel',BOARD_OPERATOR_USERNAME:'admin'};
  const first=command(process.execPath,['--experimental-strip-types','packages/database/src/register-board.ts','presets/streamer-board.json'],{env});
  const second=command(process.execPath,['--experimental-strip-types','packages/database/src/register-board.ts','presets/streamer-board.json'],{env});
  assert.match(first,/Validated board registered/);assert.equal(second,first);
});

test('malformed commands are rejected as 4xx',async()=>{
  const http=client(await login());
  const unknown=await http.post(`/v1/channels/test-channel/sessions/${randomUUID()}/commands`,{type:'unknown'});assert.equal(unknown.status,422);
  const nullBody=await http.post(`/v1/channels/test-channel/sessions/${randomUUID()}/commands`,null);assert.ok(nullBody.status>=400&&nullBody.status<500);
});

test('concurrent identical session creation is idempotent',async(t)=>{
  const http=client(await login());const boards=await (await http.get('/v1/channels/test-channel/board-versions/runnable')).json() as any[];
  const body={commandId:randomUUID(),boardVersionId:boards.find((board:any)=>board.previewOnly)!.id,initialCellId:boards.find((board:any)=>board.previewOnly)!.initialCellId,direction:'forward'};
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
  if(!creationRequest){const boards=await (await http.get('/v1/channels/test-channel/board-versions/runnable')).json() as any[];creationRequest={commandId:randomUUID(),boardVersionId:boards.find((board:any)=>board.previewOnly)!.id,initialCellId:boards.find((board:any)=>board.previewOnly)!.initialCellId,direction:'forward'};const created=await http.post('/v1/channels/test-channel/sessions',creationRequest);assert.equal(created.status,201);creationAck=await created.json();}
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
  const viewerAuth=await login('viewer'),http=client(viewerAuth),state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(state.capabilities.inventory,false);assert.equal(state.capabilities.sessionLifecycle,false);
  const response=await http.post(`/v1/channels/test-channel/sessions/${state.session.id}/commands`,{commandId:randomUUID(),sessionEpoch:1,
    expectedRevision:1,type:'set_direction',reason:'viewer check',payload:{direction:'reverse'}});assert.equal(response.status,403);
  const forbiddenUpload=await fetch(`http://127.0.0.1:${apiPort}/v1/channels/test-channel/pawn-image?expectedRevision=0`,{method:'PUT',headers:{origin:'https://console.example',cookie:viewerAuth.cookie,'x-csrf-token':viewerAuth.csrf,'content-type':'image/png'},body:Buffer.from('not an image')});assert.equal(forbiddenUpload.status,403);
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
  response=await http.post('/v1/channels/test-channel/sessions',{commandId:randomUUID(),boardVersionId:boards.find((board:any)=>board.previewOnly)!.id,initialCellId:boards.find((board:any)=>board.previewOnly)!.initialCellId,direction:'forward'});assert.equal(response.status,201);
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
  const document={schemaVersion:1,boardThemeId:'lime-clover',width:1920,height:1080,aspectRatio:'16:9',background:'transparent',widgets:[{id:'board',bounds:{x:0,y:0,width:1,height:1},z:0}]};
  const liveBeforePublish=await (await http.get('/v1/channels/test-channel/overlay-layout/live')).json() as any;
  const beforeTheme=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(beforeTheme.boardThemeId,'lime-clover');
  assert.equal((await viewer.post(path,{document})).status,403);
  assert.equal((await viewer.post('/v1/channels/test-channel/obs-tokens',{label:'forbidden'})).status,403);
  for(const boardThemeId of ['classic-party','unknown-theme',null,42]){
    let invalid=await http.post(path,{document:{...document,boardThemeId}});assert.equal(invalid.status,201);const invalidVersion=await invalid.json() as any;
    invalid=await http.post(`${path}/${invalidVersion.id}/validate`,{expectedRevision:invalidVersion.revision});assert.equal(invalid.status,201);
    const invalidBody=await invalid.json() as any;assert.equal(invalidBody.status,'draft');assert.match(invalidBody.validationErrors[0],/boardThemeId/);
  }
  let response=await http.post(path,{document});assert.equal(response.status,201);let version=await response.json() as any;
  assert.equal((await http.put(`${path}/${version.id}`,{expectedRevision:version.revision+1,document})).status,409);
  response=await http.post(`${path}/${version.id}/validate`,{expectedRevision:version.revision});version=await response.json();assert.equal(version.status,'validated');
  response=await http.post(`${path}/${version.id}/publish`,{expectedRevision:version.revision});assert.equal(response.status,201);version=await response.json();
  const liveAfterPublish=await (await http.get('/v1/channels/test-channel/overlay-layout/live')).json() as any;
  assert.equal(liveAfterPublish.layoutVersion,liveBeforePublish.layoutVersion+1);assert.deepEqual(liveAfterPublish.layout.widgets,liveBeforePublish.layout.widgets);assert.equal(liveAfterPublish.layout.background,document.background);
  const afterTheme=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
  assert.equal(afterTheme.boardThemeId,'lime-clover');
  assert.deepEqual({revision:afterTheme.session?.revision,currentCellId:afterTheme.session?.currentCellId,inventory:afterTheme.inventory,missions:afterTheme.missions},
    {revision:beforeTheme.session?.revision,currentCellId:beforeTheme.session?.currentCellId,inventory:beforeTheme.inventory,missions:beforeTheme.missions});
  assert.equal((await http.put(`${path}/${version.id}`,{expectedRevision:version.revision,document})).status,409);
  response=await http.post(path,{document:{...document,widgets:[{id:'board',bounds:{x:0.8,y:0,width:1,height:1},z:0}]}});version=await response.json();
  response=await http.post(`${path}/${version.id}/validate`,{expectedRevision:version.revision});version=await response.json();assert.equal(version.status,'draft');assert.ok(version.validationErrors.length);
  assert.equal((await http.post(`${path}/${version.id}/publish`,{expectedRevision:version.revision})).status,409);
  const issued=await (await http.post('/v1/channels/test-channel/obs-tokens',{label:'concurrent readers'})).json() as any;
  const readers=await Promise.all(Array.from({length:4},()=>fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})));
  assert.deepEqual(readers.map(x=>x.status),[200,200,200,200]);
  const expectedEffectiveLayout={...document,widgets:liveBeforePublish.layout.widgets};
  for(const reader of readers){const state=await reader.json() as any;assert.deepEqual(state.layout,expectedEffectiveLayout);assert.equal(state.latestCommand?.operatorId,undefined);}
  const legacyClient=new pg.Client({connectionString:databaseUrl});await legacyClient.connect();
  try {
    await legacyClient.query(`UPDATE channel_config_versions SET document=jsonb_set(document,'{boardThemeId}','"classic-party"') WHERE channel_id=$1 AND kind='overlay-layout' AND status='published'`,['test-channel']);
    const legacyOperator=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;
    assert.equal(legacyOperator.boardThemeId,'lime-clover');assert.deepEqual(legacyOperator.session,afterTheme.session);
    const legacyOverlay=await (await fetch(`http://127.0.0.1:${apiPort}/v1/overlay/state`,{headers:{authorization:`Bearer ${issued.token}`}})).json() as any;
    assert.deepEqual(legacyOverlay.layout,expectedEffectiveLayout);
  } finally {await legacyClient.end();}
  assert.equal((await http.del(`/v1/channels/test-channel/obs-tokens/${issued.id}`)).status,204);
  const first=await (await http.get('/v1/channels/test-channel/operations?limit=1')).json() as any;assert.equal(first.items.length,1);assert.ok(first.nextCursor);
  const second=await (await http.get(`/v1/channels/test-channel/operations?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json() as any;assert.equal(second.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id);
  assert.equal((await http.get('/v1/channels/test-channel/operations?cursor=invalid')).status,400);
});

test('live PUT queued with publish advances twice and publish preserves the newest widget geometry',async()=>{
  const http=client(await login()),configPath='/v1/channels/test-channel/config/overlay-layout',livePath='/v1/channels/test-channel/overlay-layout/live';
  const before=await (await http.get(livePath)).json() as any;
  const geometry=[{id:'board',bounds:{x:.2,y:.15,width:.6,height:.7},z:7}];
  const liveDocument={...before.layout,background:'#102030',widgets:geometry};
  const publishedDocument={...before.layout,fontId:'jua',background:'#abcdef',widgets:[{id:'board',bounds:{x:0,y:0,width:1,height:1},z:0}]};
  let response=await http.post(configPath,{document:publishedDocument});assert.equal(response.status,201);let version=await response.json() as any;
  response=await http.post(`${configPath}/${version.id}/validate`,{expectedRevision:version.revision});assert.equal(response.status,201);version=await response.json();assert.equal(version.status,'validated');
  const blocker=new pg.Client({connectionString:databaseUrl});await blocker.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`live-overlay-layout:test-channel`]);
  const waitForBlockedLayouts=async(count:number)=>{for(let attempt=0;attempt<100;attempt++){const result=await blocker.query("SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype='advisory' AND NOT granted");if(result.rows[0].waiting>=count)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Layout requests did not reach the advisory lock');};
  try{
    const putPromise=http.put(livePath,{layout:liveDocument,expectedVersion:before.layoutVersion});
    await waitForBlockedLayouts(1);
    const publishPromise=http.post(`${configPath}/${version.id}/publish`,{expectedRevision:version.revision});
    await waitForBlockedLayouts(2);await blocker.query('COMMIT');
    const [put,publish]=await Promise.all([putPromise,publishPromise]);assert.equal(put.status,200);assert.equal(publish.status,201);
  }finally{await blocker.query('ROLLBACK').catch(()=>{});await blocker.end();}
  const after=await (await http.get(livePath)).json() as any;
  assert.equal(after.layoutVersion,before.layoutVersion+2);assert.deepEqual(after.layout.widgets,geometry);assert.equal(after.layout.fontId,'jua');assert.equal(after.layout.background,'#abcdef');
});

test('password change keeps the current session and revokes other sessions',async()=>{
  command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-v','ON_ERROR_STOP=1','-c',
    `INSERT INTO operators(id,username,password_hash,role) SELECT '${randomUUID()}','password-user',password_hash,'admin' FROM operators WHERE username='admin';`]);
  const first=await login('password-user'),second=await login('password-user');
  const nextPassword=randomBytes(24).toString('base64url');
  assert.equal((await client(first).post('/v1/auth/password',{currentPassword:'incorrect',newPassword:nextPassword})).status,401);
  assert.equal((await client(first).post('/v1/auth/password',{currentPassword:adminPassword,newPassword:nextPassword})).status,200);
  assert.equal((await client(first).get('/v1/auth/session')).status,200);
  assert.equal((await client(second).get('/v1/auth/session')).status,401);
  const response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json',origin:'https://console.example'},body:JSON.stringify({username:'password-user',password:nextPassword})});assert.equal(response.status,200);
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

test('access token exchange stores only a hash and revocation invalidates its sessions',async()=>{
  const recovery=await login(),http=client(recovery);
  let response=await http.post('/v1/auth/tokens',{label:'integration browser'});assert.equal(response.status,201);const issued=await response.json() as any;assert.match(issued.token,/^rma_[A-Za-z0-9_-]{43}$/);
  response=await fetch(`http://127.0.0.1:${apiPort}/v1/auth/token`,{method:'POST',headers:{'content-type':'application/json',origin:'https://console.example'},body:JSON.stringify({token:issued.token})});assert.equal(response.status,200);const exchanged=await response.json() as any;assert.equal(exchanged.authMode,'token');const cookie=response.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/auth/session`,{headers:{cookie}})).status,200);
  const stored=command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-At','-c',`SELECT token_hash FROM operator_access_tokens WHERE id='${issued.id}'`]).trim();assert.equal(stored.length,64);assert.notEqual(stored,issued.token);
  const listed=await (await http.get('/v1/auth/tokens')).text();assert.equal(listed.includes(issued.token),false);
  assert.equal((await http.del(`/v1/auth/tokens/${issued.id}`)).status,204);assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/auth/session`,{headers:{cookie}})).status,401);
  response=await http.post('/v1/auth/tokens',{label:'expired fixture'});const expired=await response.json() as any;command('docker',['exec',container,'psql','-U','postgres','-d','rogimarble_test','-c',`UPDATE operator_access_tokens SET created_at=now()-interval '2 seconds',expires_at=now()-interval '1 second' WHERE id='${expired.id}'`]);
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/v1/auth/token`,{method:'POST',headers:{'content-type':'application/json',origin:'https://console.example'},body:JSON.stringify({token:expired.token})})).status,401);
});

test('supported arrival effects persist counters, reservations, missions, modifiers, locks and chained movement',async()=>{
  await stopApi();await startApi();
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();
  await db.query(`UPDATE game_sessions SET status='ended' WHERE channel_id='test-channel' AND status<>'ended'`);
  const board=JSON.parse(await readFile(new URL('../../../presets/streamer-board.json',import.meta.url),'utf8')) as any;
  board.id=`effect-test-${randomUUID()}`;board.name='Effect integration board';board.dice={count:1,sides:2};
  for(const cell of board.cells){cell.onLand=[];cell.onPass=[];}
  board.cells[1].onLand=[{type:'counter_add',counterId:'drink-bank',quantity:1}];
  board.cells[2].onLand=[{type:'mission',message:'effect mission',shield:null,durationSeconds:30}];
  board.cells[3].onLand=[{type:'modify_roll',uses:1,modifier:{type:'movement_multiplier',factor:2}}];
  board.cells[4].onLand=[{type:'movement_lock',release:{type:'skip_rolls',count:1}}];
  board.cells[5].onLand=[{type:'counter_settle',counterId:'drink-bank',message:'settle snapshot',shield:null,settleOn:'mission_completion'}];
  board.cells[6].onLand=[{type:'move_steps',steps:2,direction:'with_current',onArrival:'skip',onPass:'skip'}];
  board.cells[7].onLand=[{type:'movement_lock',release:{type:'skip_rolls_or_doubles',count:3,onDoubles:'release_only'}}];
  const boardVersionId=randomUUID();const operator=(await db.query(`SELECT id FROM operators WHERE username='admin'`)).rows[0].id;
  await db.query(`INSERT INTO board_versions(id,channel_id,board_definition,status,supported_for_live,created_by) VALUES($1,'test-channel',$2,'validated',true,$3)`,[boardVersionId,board,operator]);
  await db.end();
  const http=client(await login()),created=await http.post('/v1/channels/test-channel/sessions',{commandId:randomUUID(),boardVersionId,initialCellId:board.startCellId,direction:'forward'});assert.equal(created.status,201);
  let state=await (await http.get('/v1/channels/test-channel/operator-state')).json() as any;const path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`;
  const land=async(cellId:string)=>{state=await (await http.get('/v1/channels/test-channel/operator-state')).json();const response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'set_position',reason:'effect integration',payload:{cellId,pauseAutomaticMovement:true,triggerArrivalEffects:true}});assert.equal(response.status,201);return response.json() as Promise<any>;};
  let response:Response;
  await land(board.cells[1].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.counters[0].value,1);assert.equal(state.counters[0].available,1);
  await land(board.cells[2].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.missions.at(-1).message,'effect mission');assert.equal(state.missions.at(-1).durationSeconds,30);
  await land(board.cells[3].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.deepEqual(state.rollModifiers.map((x:any)=>[x.factor,x.usesRemaining]),[[2,1]]);
  const clearModifier={commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'clear_roll_modifier',reason:'operator correction',payload:{modifierId:state.rollModifiers[0].id}};
  response=await http.post(path,clearModifier);assert.equal(response.status,201);const modifierAck=await response.json();response=await http.post(path,clearModifier);assert.equal(response.status,201);assert.deepEqual(await response.json(),modifierAck);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.deepEqual(state.rollModifiers,[]);assert.equal((await http.post(path,{...clearModifier,commandId:randomUUID(),expectedRevision:state.session.revision})).status,409);
  await land(board.cells[4].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.movementLock.rollsRemaining,1);
  const clearLock={commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'clear_movement_lock',reason:'operator correction',payload:{}};
  response=await http.post(path,clearLock);assert.equal(response.status,201);const lockAck=await response.json();response=await http.post(path,clearLock);assert.equal(response.status,201);assert.deepEqual(await response.json(),lockAck);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.movementLock,null);assert.equal((await http.post(path,{...clearLock,commandId:randomUUID(),expectedRevision:state.session.revision})).status,409);
  await land(board.cells[5].id);await land(board.cells[5].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.counters[0].reserved,1);assert.equal(state.counters[0].available,0);const settlement=state.missions.find((x:any)=>x.message==='settle snapshot');assert.equal(settlement.quantity,1);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'adjust_counter',reason:'invalid correction',payload:{counterId:'drink-bank',quantity:0,expectedCounterRevision:state.counters[0].revision}});assert.equal(response.status,422);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'adjust_counter',reason:'operator correction',payload:{counterId:'drink-bank',quantity:2,expectedCounterRevision:state.counters[0].revision}});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.counters[0].value,2);assert.equal(state.counters[0].available,1);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'complete_mission',reason:'settlement complete',payload:{missionId:settlement.id,expectedMissionRevision:0}});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.counters[0].value,1);assert.equal(state.counters[0].reserved,0);
  const moved=await land(board.cells[6].id);assert.equal((await moved).result.toCellId,board.path[(board.path.indexOf(board.cells[6].id)+2)%board.path.length]);
  await land(board.cells[7].id);state=await (await http.get('/v1/channels/test-channel/operator-state')).json();
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'resume',reason:'island dice integration',payload:{}});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'roll_dice',reason:'island escape attempt',payload:{}});assert.equal(response.status,201);assert.equal(((await response.json() as any).result.dice as number[]).length,2);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();if(state.movementLock){response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'clear_movement_lock',reason:'finish island test',payload:{}});assert.equal(response.status,201);}
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'roll_dice',reason:'normal one die',payload:{}});assert.equal(response.status,201);assert.equal(((await response.json() as any).result.dice as number[]).length,1);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'pause',reason:'board version transition',payload:{}});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();const sessionIdBefore=state.session.id,missionIds=state.missions.map((x:any)=>x.id),inventoryBefore=state.inventory;
  const compatible=structuredClone(board),compatibleId=randomUUID();compatible.id=`compatible-${compatibleId}`;compatible.name='Visual refresh';compatible.canvas={...compatible.canvas,width:compatible.canvas.width+100};compatible.dice={count:1,sides:6};
  const incompatible=structuredClone(compatible),incompatibleId=randomUUID();incompatible.id=`incompatible-${incompatibleId}`;incompatible.cells[0].onLand=[{type:'set_direction',direction:'toggle'}];
  const transitionDb=new pg.Client({connectionString:databaseUrl});await transitionDb.connect();await transitionDb.query(`INSERT INTO board_versions(id,channel_id,board_definition,status,supported_for_live,created_by) VALUES($1,'test-channel',$2,'validated',true,$3),($4,'test-channel',$5,'validated',true,$3)`,[compatibleId,compatible,operator,incompatibleId,incompatible]);await transitionDb.end();
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'apply_board_version',reason:'reject behavior change',payload:{boardVersionId:incompatibleId}});assert.equal(response.status,422);
  response=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type:'apply_board_version',reason:'apply visual and dice update',payload:{boardVersionId:compatibleId}});assert.equal(response.status,201);
  state=await (await http.get('/v1/channels/test-channel/operator-state')).json();assert.equal(state.session.id,sessionIdBefore);assert.equal(state.session.boardVersionId,compatibleId);assert.equal(state.session.status,'paused');assert.equal(state.session.automaticMovementPaused,true);assert.deepEqual(state.missions.map((x:any)=>x.id),missionIds);assert.deepEqual(state.inventory,inventoryBefore);assert.equal(state.boardDefinition.canvas.width,compatible.canvas.width);
});

test('next-turn travel reserves exactly one turn and supports selection, pause, resume and cancellation',async()=>{
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query(`UPDATE game_sessions SET status='ended' WHERE channel_id='test-channel' AND status<>'ended'`);
  const board=JSON.parse(await readFile(new URL('../../../presets/streamer-board.json',import.meta.url),'utf8')) as any;board.id=`travel-test-${randomUUID()}`;board.name='Travel integration board';board.dice={count:1,sides:2};
  for(const cell of board.cells){cell.onLand=[];cell.onPass=[];}const travelCell=board.cells[1].id,destination=board.cells[8].id;
  board.cells[1].onLand=[{type:'choose_destination',selection:'operator',allowedCellIds:[destination],onArrival:'skip',timing:'next_turn',excludeCurrentCell:true}];
  board.cells[2].onLand=[{type:'movement_lock',release:{type:'skip_rolls',count:1}}];
  const boardVersionId=randomUUID(),operator=(await db.query(`SELECT id FROM operators WHERE username='admin'`)).rows[0].id;await db.query(`INSERT INTO board_versions(id,channel_id,board_definition,status,supported_for_live,created_by) VALUES($1,'test-channel',$2,'validated',true,$3)`,[boardVersionId,board,operator]);await db.end();
  const http=client(await login());let response=await http.post('/v1/channels/test-channel/sessions',{commandId:randomUUID(),boardVersionId,initialCellId:board.startCellId,direction:'forward'});assert.equal(response.status,201);
  let state:any;const refresh=async()=>state=await (await http.get('/v1/channels/test-channel/operator-state')).json();await refresh();const path=`/v1/channels/test-channel/sessions/${state.session.id}/commands`;
  const send=async(type:string,payload:unknown)=>{await refresh();const result=await http.post(path,{commandId:randomUUID(),sessionEpoch:state.session.sessionEpoch,expectedRevision:state.session.revision,type,reason:'travel integration',payload});return result;};
  const arrive=async()=>{const landed=await send('set_position',{cellId:travelCell,pauseAutomaticMovement:true,triggerArrivalEffects:true});assert.equal(landed.status,201);await refresh();return state.effectTasks.find((x:any)=>x.status==='pending');};
  let task=await arrive();response=await send('choose_destination',{taskId:task.id,cellId:destination,expectedTaskRevision:task.revision});assert.equal(response.status,201);assert.equal((await response.json() as any).result.travelStatus,'waiting');
  response=await send('resume',{});assert.equal(response.status,201);response=await send('roll_dice',{count:1});let result=(await response.json() as any).result;assert.equal(result.travelStatus,'moved');assert.deepEqual(result.dice,[]);assert.equal(result.toCellId,destination);
  assert.equal((await send('choose_destination',{taskId:task.id,cellId:destination,expectedTaskRevision:1})).status,404);
  task=await arrive();response=await send('resume',{});assert.equal(response.status,201);response=await send('roll_dice',{count:1});result=(await response.json() as any).result;assert.equal(result.travelStatus,'waiting');assert.ok(result.reservedTurnCommandId);assert.equal((await send('roll_dice',{count:1})).status,409);
  await refresh();task=state.effectTasks.find((x:any)=>x.status==='pending');response=await send('pause',{});assert.equal(response.status,201);response=await send('choose_destination',{taskId:task.id,cellId:destination,expectedTaskRevision:task.revision});assert.equal(response.status,201);assert.equal((await response.json() as any).result.travelStatus,'waiting');response=await send('resume',{});result=(await response.json() as any).result;assert.equal(result.travelStatus,'moved');assert.equal(result.toCellId,destination);
  task=await arrive();await send('resume',{});response=await send('roll_dice',{count:1});result=(await response.json() as any).result;const reserved=result.reservedTurnCommandId;await send('pause',{});await refresh();task=state.effectTasks.find((x:any)=>x.status==='pending');response=await send('cancel_destination',{taskId:task.id,expectedTaskRevision:task.revision});assert.equal(response.status,201);assert.equal((await response.json() as any).result.travelStatus,'waiting');response=await send('resume',{});result=(await response.json() as any).result;assert.equal(result.travelStatus,'returned');assert.equal(result.reservedTurnCommandId,reserved);assert.ok(result.dice.length>0);
  for(const cancel of [false,true]){
    await refresh();if(state.movementLock)assert.equal((await send('clear_movement_lock',{})).status,201);
    task=await arrive();await send('resume',{});response=await send('roll_dice',{});const waiting=(await response.json() as any).result;assert.ok(waiting.reservedTurnCommandId);
    assert.equal((await send('set_position',{cellId:board.cells[2].id,pauseAutomaticMovement:true,triggerArrivalEffects:true})).status,201);
    await refresh();task=state.effectTasks.find((x:any)=>x.status==='pending');
    response=await send(cancel?'cancel_destination':'choose_destination',{taskId:task.id,expectedTaskRevision:task.revision,...(cancel?{}:{cellId:destination})});assert.equal(response.status,201);
    assert.equal((await send('resume',{})).status,201);
    response=await send('roll_dice',{});assert.equal(response.status,201);await refresh();assert.equal(state.movementLock,null);
    response=await send('roll_dice',{});assert.equal(response.status,201);const resumed=(await response.json() as any).result;assert.equal(resumed.travelStatus,cancel?'returned':'moved');assert.equal(resumed.reservedTurnCommandId,waiting.reservedTurnCommandId);
  }

});

test('collector donation ingestion runs against the integration PostgreSQL database',()=>{
  const result=spawnSync(process.execPath,[
    '--experimental-strip-types',
    '--test',
    'apps/api/test/donation-ingestion.integration.test.ts',
  ],{
    cwd:root,
    env:{...process.env,DONATION_TEST_DATABASE_URL:databaseUrl},
    encoding:'utf8',
    timeout:120_000,
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('collector management uses sessions, CSRF and current channel permissions',async()=>{
  const path='/v1/channels/test-channel/collector',body={targetChannelId:'fixture-broadcast'};
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}${path}`)).status,401);
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}${path}/broadcast-check`,{method:'POST',headers:{'content-type':'application/json',origin:'https://console.example'},body:JSON.stringify(body)})).status,401);
  const http=client(await login());const response=await http.get(path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const state=await response.json() as any;assert.equal(state.enabled,false);assert.equal(state.canCheckBroadcast,false);
  assert.equal((await http.post(path+'/broadcast-check',body,null)).status,403);
  assert.equal((await http.post(path+'/broadcast-check',body)).status,503);
  assert.equal((await http.get('/v1/channels/unrelated-channel/collector')).status,403);
  assert.equal((await http.post('/v1/channels/unrelated-channel/collector/broadcast-check',body)).status,403);
  for(const username of ['viewer','channel-viewer']){
    const readOnly=client(await login(username));const status=await readOnly.get(path);assert.equal(status.status,200);assert.equal((await status.json() as any).canCheckBroadcast,false);
    assert.equal((await readOnly.post(path+'/broadcast-check',body)).status,403);
  }
});

test('chat test start, status and stop require operator scope; mutations require CSRF',async()=>{
 const base='/v1/channels/test-channel/collector/chat-test',id=randomUUID(),body={targetChannelId:'fixture-channel',sessionId:id};
 assert.equal((await fetch(`http://127.0.0.1:${apiPort}${base}`)).status,401);
 const http=client(await login());assert.equal((await http.post(base,body,null)).status,403);assert.equal((await http.post(base+'/'+id+'/stop',{},null)).status,403);
 assert.equal((await http.get(base)).status,503);assert.equal((await http.post(base,body)).status,503);assert.equal((await http.post(base+'/'+id+'/stop',{})).status,503);
 for(const name of ['viewer','channel-viewer']){const reader=client(await login(name));assert.equal((await reader.get(base)).status,403);assert.equal((await reader.post(base,body)).status,403);assert.equal((await reader.post(base+'/'+id+'/stop',{})).status,403);}
 assert.equal((await http.post('/v1/channels/unrelated-channel/collector/chat-test',body)).status,403);
});
