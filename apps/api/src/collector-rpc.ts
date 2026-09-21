import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentials, loadPackageDefinition, type Client, type ClientReadableStream, type ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { CollectorDonation, CollectorChat } from './donation-ingestion.service.ts';

export interface CollectorCursor { journalGeneration:string; channelOffset:string }
export interface CollectorStatus {
  channelId:string; configured:boolean; collectionActive:boolean; processHealth:string;
  qualityReasons:string[]; earliestCursor?:CollectorCursor; currentCursor?:CollectorCursor;
  recoveryRevision:string; lastReceivedAt?:{seconds:string;nanos:number};
}
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
  status(){return this.call<CollectorStatus>('getCollectionStatus',{});}
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
  return{consumerId:config.consumerId,collectorChannelId:event.channelId,eventId:event.eventId,userId:event.userId,userDisplayName:event.userDisplayName,message:event.message,cursor:event.cursor,observedAt,occurredAt:timestamp(event.occurredAt),payload:event};
}
