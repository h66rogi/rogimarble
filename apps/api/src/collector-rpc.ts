import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentials, loadPackageDefinition, type Client, type ClientReadableStream, type ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { CollectorDonation, CollectorChat, CollectorEmote } from './donation-ingestion.service.ts';

export interface CollectorCursor { journalGeneration:string; channelOffset:string }
export interface CollectorStatus {
  channelId:string; configured:boolean; collectionActive:boolean; processHealth:string;
  qualityReasons:string[]; earliestCursor?:CollectorCursor; currentCursor?:CollectorCursor;
  recoveryRevision:string; lastReceivedAt?:{seconds:string;nanos:number};
}
export interface BroadcastStatus { channelId:string; state:string; title:string; displayName:string; broadcastId:string; checkedAt:{seconds:string;nanos:number}; cached:boolean }
export interface CollectorConnection {
  target:string; serverName:string; caFile:string; certFile:string; keyFile:string;
  consumerId:string; collectorChannelId:string; gameChannelId:string;
}
export function collectorConnection(env:NodeJS.ProcessEnv=process.env):CollectorConnection|null {
  if(env.COLLECTOR_ENABLED!=='true')return null;
  const required=(name:string)=>{const value=env[name]?.trim();if(!value)throw new Error(`Missing ${name}`);return value;};
  return {target:required('COLLECTOR_TARGET'),serverName:required('COLLECTOR_SERVER_NAME'),
    caFile:required('COLLECTOR_CA_FILE'),certFile:required('COLLECTOR_CERT_FILE'),keyFile:required('COLLECTOR_KEY_FILE'),
    consumerId:required('COLLECTOR_CONSUMER_ID'),collectorChannelId:required('COLLECTOR_CHANNEL_ID'),gameChannelId:required('COLLECTOR_GAME_CHANNEL_ID')};
}

/** Strings preserve the entire uint64 cursor range; certificates never leave the server. */
export class CollectorRpc {
  private readonly client:Client & Record<string,any>;
  readonly config:CollectorConnection;
  constructor(config:CollectorConnection) {
    this.config=config;
    const candidates=[resolve('apps/api/proto/collector.proto'),resolve('proto/collector.proto')];
    const proto=candidates.find(existsSync);if(!proto)throw new Error('Collector protocol is missing');
    const definition=loadPackageDefinition(loadSync(proto,{longs:String,enums:String,defaults:true,oneofs:true}));
    const Service=(definition as any).rogi.collector.v1.CollectorService;
    this.client=new Service(config.target,credentials.createSsl(readFileSync(config.caFile),readFileSync(config.keyFile),readFileSync(config.certFile)),{
      'grpc.ssl_target_name_override':config.serverName,'grpc.default_authority':config.serverName,
      'grpc.max_receive_message_length':4*1024*1024,'grpc.keepalive_time_ms':30000,
    });
  }
  private scoped(body:Record<string,unknown>={}) {return {...body,consumerId:this.config.consumerId,channelId:this.config.collectorChannelId};}
  private call<T>(method:string,body:Record<string,unknown>):Promise<T>{
    return new Promise((resolve,reject)=>this.client[method](this.scoped(body),{deadline:Date.now()+10000},(error:ServiceError|null,result:T)=>error?reject(error):resolve(result)));
  }
  startChatTest(targetChannelId:string,sessionId:string){return this.call<ChatTestStatus>('startChatTest',{targetChannelId,sessionId});}
  getChatTest(){return this.call<ChatTestStatus>('getChatTest',{});}
  stopChatTest(sessionId:string){return this.call<ChatTestStatus>('stopChatTest',{sessionId});}
  status(){return this.call<CollectorStatus>('getCollectionStatus',{});}
  checkBroadcast(targetChannelId:string){return this.call<BroadcastStatus>('checkBroadcast',{targetChannelId});}
  list(cursor:CollectorCursor,recoveryRevision:string){return this.call<{donations:any[];recoveryRevision:string}>('listDonations',{afterCursor:cursor,recoveryRevision,limit:100});}
  ack(cursor:CollectorCursor,recoveryRevision:string){return this.call<{acceptedCursor:CollectorCursor;recoveryRevision:string}>('ackDonations',{cursor,recoveryRevision});}
  chat(afterCursor?:{streamGeneration:string;streamId:string}) :ClientReadableStream<any>{return this.client.watchChat(this.scoped(afterCursor?{afterCursor}:{}));}
  close(){this.client.close();}
}

export function assertCollectorStatus(status:CollectorStatus,config:CollectorConnection){
  if(status.channelId!==config.collectorChannelId||!status.configured||!status.currentCursor||!status.earliestCursor)throw new Error('Collector scope is not configured');
  for(const cursor of [status.currentCursor,status.earliestCursor]){
    if(!cursor.journalGeneration||!isUint64(cursor.channelOffset))throw new Error('Invalid collector cursor');
  }
  if(!isUint64(status.recoveryRevision)||status.currentCursor.journalGeneration!==status.earliestCursor.journalGeneration)throw new Error('Invalid collector generation');
}
export function isUint64(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)&&value.length<=20&&BigInt(value)<=18446744073709551615n;}

export function timestamp(value:any):string|null{
  if(value==null)return null;
  if(!/^-?\d{1,12}$/.test(value.seconds)||!Number.isInteger(value.nanos)||value.nanos<0||value.nanos>=1e9)throw new Error('Invalid event timestamp');
  const date=new Date(Number(value.seconds)*1000+Math.floor(value.nanos/1e6));if(!Number.isFinite(date.valueOf()))throw new Error('Invalid event timestamp');return date.toISOString();
}
export function donationInput(event:any,config:CollectorConnection,recoveryRevision:string):CollectorDonation{
  if(event.channelId!==config.collectorChannelId||event.platform!=='PLATFORM_SOOP'||event.nativeCurrency!=='NATIVE_CURRENCY_SOOP_BALLOON'||event.eventType!=='donation'||event.schemaVersion!=='v1')throw new Error('Unsupported donation envelope');
  if(typeof event.nativeBalloonCount!=='string'||!/^\d+$/.test(event.nativeBalloonCount)||!Number.isSafeInteger(Number(event.nativeBalloonCount))||Number(event.nativeBalloonCount)<1)throw new Error('Invalid native count');
  if(!event.cursor||!isUint64(event.cursor.channelOffset))throw new Error('Invalid donation cursor');
  const observedAt=timestamp(event.observedAt);if(!observedAt)throw new Error('Missing observation timestamp');
  return{consumerId:config.consumerId,collectorChannelId:event.channelId,eventId:event.eventId,nativeBalloonCount:Number(event.nativeBalloonCount),donationKind:event.donationKind,identityStatus:event.identityStatus,cursor:{...event.cursor,recoveryRevision},donorId:event.donorId,donorDisplayName:event.donorDisplayName,message:event.message,observedAt,occurredAt:timestamp(event.occurredAt),payload:event};
}
export function chatInput(event:any,config:CollectorConnection):CollectorChat{
  if(event.channelId!==config.collectorChannelId||event.platform!=='PLATFORM_SOOP'||!event.cursor)throw new Error('Unsupported chat envelope');
  const observedAt=timestamp(event.observedAt);if(!observedAt)throw new Error('Missing chat observation timestamp');
  return{consumerId:config.consumerId,collectorChannelId:event.channelId,eventId:event.eventId,userId:event.userId,userDisplayName:event.userDisplayName,message:event.message,emotes:parseChatEmotes(event.emotesJson),cursor:event.cursor,observedAt,occurredAt:timestamp(event.occurredAt),payload:event};
}

function parseChatEmotes(value:unknown):CollectorEmote[]{
  if(typeof value!=='string'||!value)return [];
  let entries:unknown;
  try{entries=JSON.parse(value);}catch{return [];}
  if(!Array.isArray(entries))return [];
  return entries.slice(0,5).flatMap((entry:unknown)=>{
    if(!entry||typeof entry!=='object')return [];
    const emote=entry as Record<string,unknown>;
    if(emote.source!=='soop_ogq'||typeof emote.code!=='string'||!/^[A-Za-z0-9_-]{1,80}:[1-9][0-9]{0,5}$/.test(emote.code))return [];
    const [id,number]=emote.code.split(':');
    const expected=`https://ogq-sticker-global-cdn-z01.sooplive.com/sticker/${id}/${number}_160.${emote.animated===true?'webp':'png'}`;
    if(emote.imageUrl!==expected)return [];
    return [{code:emote.code,start:-1,end:-1,imageUrl:expected,animated:emote.animated===true,source:'soop_ogq' as const}];
  });
}

export interface ChatTestStatus {
  sessionId:string;channelId:string;state:string;active:boolean;
  startedAt?:{seconds:string;nanos:number};expiresAt?:{seconds:string;nanos:number};joinedAt?:{seconds:string;nanos:number};lastReceivedAt?:{seconds:string;nanos:number};
  receivedCount:string;messages:{sequence:string;displayName:string;message:string;receivedAt:{seconds:string;nanos:number}}[];
}
export const chatTestIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function chatTestStatus(result:ChatTestStatus){
  const states=['idle','connecting','joined','receiving','stopping','stopped','expired','disconnected','offline','cookie_required','auth_required','failed','blocked'];
  if(!states.includes(result.state)||!isUint64(result.receivedCount)||!Array.isArray(result.messages)||result.messages.length>20||typeof result.active!=='boolean')throw new Error('Invalid chat test response');
  if(result.state!=='idle'&&(!chatTestIdPattern.test(result.sessionId)||!/^[A-Za-z0-9_-]{1,50}$/.test(result.channelId)))throw new Error('Invalid chat test scope');
  return {sessionId:result.sessionId,channelId:result.channelId,state:result.state,active:result.active,
    startedAt:timestamp(result.startedAt),expiresAt:timestamp(result.expiresAt),joinedAt:timestamp(result.joinedAt),lastReceivedAt:timestamp(result.lastReceivedAt),receivedCount:result.receivedCount,
    messages:result.messages.map(item=>{if(!isUint64(item.sequence)||BigInt(item.sequence)>BigInt(result.receivedCount)||typeof item.displayName!=='string'||[...item.displayName].length>80||typeof item.message!=='string'||[...item.message].length>1000)throw new Error('Invalid chat test sample');return {sequence:item.sequence,displayName:item.displayName,message:item.message,receivedAt:timestamp(item.receivedAt)};})};
}
