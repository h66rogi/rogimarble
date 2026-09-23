import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSync } from '@grpc/proto-loader';
import { collectorConnection, donationInput, chatInput, isUint64, timestamp, type CollectorConnection } from '../src/collector-rpc.ts';
import { parseCollectorConfig } from '../src/collector-config.ts';

const config:CollectorConnection={target:'127.0.0.1:7443',serverName:'collector.test',caFile:'/tmp/fixture/ca.pem',certFile:'/tmp/fixture/client.pem',keyFile:'/tmp/fixture/client.key',consumerId:'fixture-consumer',collectorChannelId:'fixture-channel',gameChannelId:'fixture-game'};
const donation=()=>({schemaVersion:'v1',eventType:'donation',eventId:'fixture-event',channelId:config.collectorChannelId,platform:'PLATFORM_SOOP',nativeCurrency:'NATIVE_CURRENCY_SOOP_BALLOON',nativeBalloonCount:'33',donationKind:'balloon',identityStatus:'IDENTITY_STATUS_OBSERVATION_ONLY',cursor:{journalGeneration:'fixture-generation',channelOffset:'18446744073709551615'},donorId:'fixture-donor',donorDisplayName:'Fixture',message:'',observedAt:{seconds:'1700000000',nanos:123000000},occurredAt:null});

test('collector is opt-in and incomplete enabled credentials fail closed',()=>{
  assert.equal(collectorConnection({}),null);assert.throws(()=>collectorConnection({COLLECTOR_ENABLED:'true'}),/Missing/);
  assert.deepEqual(parseCollectorConfig('COLLECTOR_ENABLED=false\n'),{COLLECTOR_ENABLED:'false'});
  assert.throws(()=>parseCollectorConfig('SESSION_SECRET=not-allowed'));
  assert.throws(()=>parseCollectorConfig('COLLECTOR_ENABLED=true\nCOLLECTOR_ENABLED=false'));
});
test('native count and cursor do not pass through lossy integer conversion',()=>{
  const event=donationInput(donation(),config,'0');assert.equal(event.nativeBalloonCount,33);assert.equal(event.cursor.channelOffset,'18446744073709551615');assert.equal(event.observedAt,'2023-11-14T22:13:20.123Z');
  assert.equal(isUint64('18446744073709551616'),false);assert.equal(isUint64('01'),false);
  assert.throws(()=>donationInput({...donation(),nativeBalloonCount:'9007199254740992'},config,'0'));
  assert.throws(()=>donationInput({...donation(),channelId:'another-channel'},config,'0'));
  assert.throws(()=>donationInput({...donation(),platform:'PLATFORM_UNSPECIFIED'},config,'0'));
});
test('unknown donation kinds and ambiguous observations retain their identity for review',()=>{
  const event=donationInput({...donation(),donationKind:'future_kind',identityStatus:'IDENTITY_STATUS_RECONNECT_AMBIGUOUS'},config,'3');
  assert.equal(event.donationKind,'future_kind');assert.equal(event.identityStatus,'IDENTITY_STATUS_RECONNECT_AMBIGUOUS');assert.equal(event.cursor.recoveryRevision,'3');
  assert.equal(timestamp(null),null);assert.throws(()=>timestamp({seconds:'1',nanos:1e9}));
});
test('actual protobuf service decoder preserves uint64 and enum representations',()=>{
  const definition=loadSync(new URL('../proto/collector.proto',import.meta.url).pathname,{longs:String,enums:String,defaults:true,oneofs:true});
  const service=definition['rogi.collector.v1.CollectorService'] as any;
  const encoded=service.ListDonations.responseSerialize({donations:[donation()],recoveryRevision:'18446744073709551615'});
  const decoded=service.ListDonations.responseDeserialize(encoded);
  assert.equal(decoded.recoveryRevision,'18446744073709551615');assert.equal(decoded.donations[0].nativeBalloonCount,'33');
  assert.equal(decoded.donations[0].identityStatus,'IDENTITY_STATUS_OBSERVATION_ONLY');
  assert.equal(donationInput(decoded.donations[0],config,'0').cursor.channelOffset,'18446744073709551615');
});

test('OGQ image metadata survives protobuf and only the SOOP CDN path reaches OBS',()=>{
  const definition=loadSync(new URL('../proto/collector.proto',import.meta.url).pathname,{longs:String,enums:String,defaults:true,oneofs:true});
  const method=(definition['rogi.collector.v1.CollectorService'] as any).WatchChat;
  const imageUrl='https://ogq-sticker-global-cdn-z01.sooplive.com/sticker/17d73948ad610a6/1_160.png';
  const packet={eventId:'synthetic-ogq',channelId:config.collectorChannelId,userId:'viewer',userDisplayName:'시청자',message:'',platform:'PLATFORM_SOOP',cursor:{streamGeneration:'synthetic',streamId:'1-0'},observedAt:{seconds:'1700000000',nanos:0},emotesJson:JSON.stringify([{code:'17d73948ad610a6:1',start:-1,end:-1,imageUrl,source:'soop_ogq'}])};
  const event=chatInput(method.responseDeserialize(method.responseSerialize(packet)),config);
  assert.deepEqual(event.emotes,[{code:'17d73948ad610a6:1',start:-1,end:-1,imageUrl,animated:false,source:'soop_ogq'}]);
  assert.deepEqual(chatInput({...packet,emotesJson:JSON.stringify([{...event.emotes[0],imageUrl:'https://example.invalid/image.png'}])},config).emotes,[]);
});

test('broadcast lookup serializes a separate test target without changing production authorization',async()=>{
  const { CollectorRpc }=await import('../src/collector-rpc.ts');
  const rpc=Object.create(CollectorRpc.prototype) as InstanceType<typeof CollectorRpc>;
  Object.assign(rpc,{config,client:{checkBroadcast:(body:any,options:any,done:any)=>{
    assert.equal(body.consumerId,config.consumerId);assert.equal(body.channelId,config.collectorChannelId);
    assert.equal(body.targetChannelId,'another-fixture');assert.ok(options.deadline>Date.now());
    const definition=loadSync(new URL('../proto/collector.proto',import.meta.url).pathname,{longs:String,enums:String,defaults:true,oneofs:true});
    const method=(definition['rogi.collector.v1.CollectorService'] as any).CheckBroadcast;
    assert.deepEqual(method.requestDeserialize(method.requestSerialize(body)),body);
    done(null,method.responseDeserialize(method.responseSerialize({channelId:'another-fixture',state:'live',checkedAt:{seconds:'1700000000',nanos:0},title:'Fixture broadcast'})));
  }}});
  const result=await rpc.checkBroadcast('another-fixture');assert.equal(result.channelId,'another-fixture');assert.equal(result.state,'live');assert.equal(timestamp(result.checkedAt),'2023-11-14T22:13:20.000Z');
  assert.equal(rpc.config.collectorChannelId,'fixture-channel');
});

test('chat test RPCs keep the authorized channel and use a separate session ID',async()=>{
  const {CollectorRpc}=await import('../src/collector-rpc.ts');const rpc=Object.create(CollectorRpc.prototype) as InstanceType<typeof CollectorRpc>;
  const calls:any[]=[];const sessionId='11111111-2222-4333-8444-555555555555';
  const client=Object.fromEntries(['startChatTest','getChatTest','stopChatTest'].map(method=>[method,(body:any,_options:any,done:any)=>{assert.equal(body.channelId,config.collectorChannelId);assert.equal(body.consumerId,config.consumerId);calls.push({method,...body});done(null,{state:'idle'});} ]));
  Object.assign(rpc,{config,client});await rpc.startChatTest('other-fixture',sessionId);await rpc.getChatTest();await rpc.stopChatTest(sessionId);
  assert.equal(calls[0].targetChannelId,'other-fixture');assert.equal(calls[0].sessionId,sessionId);assert.equal(calls[2].sessionId,sessionId);assert.equal(calls[1].targetChannelId,undefined);
});
test('chat test response exposes only bounded samples and preserves uint64 counters',async()=>{
  const {chatTestStatus}=await import('../src/collector-rpc.ts');const input:any={sessionId:'11111111-2222-4333-8444-555555555555',channelId:'fixture-channel',state:'receiving',active:true,receivedCount:'18446744073709551615',messages:[{sequence:'18446744073709551615',displayName:'Fixture',message:'Synthetic chat',receivedAt:{seconds:'1700000000',nanos:0},raw:'synthetic-private-packet',userId:'excluded-id'}],cookie:'synthetic-private-cookie'};
  const result=chatTestStatus(input);assert.equal(result.receivedCount,'18446744073709551615');assert.equal(result.messages[0].receivedAt,'2023-11-14T22:13:20.000Z');assert.equal('raw' in result.messages[0],false);assert.equal('cookie' in result,false);
  assert.throws(()=>chatTestStatus({...input,messages:Array(21).fill(input.messages[0])}));assert.throws(()=>chatTestStatus({...input,messages:[{...input.messages[0],message:'x'.repeat(1001)}]}));assert.throws(()=>chatTestStatus({...input,channelId:'https://example.com'}));
});
