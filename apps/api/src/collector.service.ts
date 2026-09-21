import { BadRequestException, HttpException, ServiceUnavailableException, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { status as GrpcStatus, type ClientReadableStream } from '@grpc/grpc-js';
import type pg from 'pg';
import { pool } from '../../../packages/database/src/index.ts';
import { DonationIngestionService } from './donation-ingestion.service.ts';
import { assertCollectorStatus, collectorConnection, donationInput, chatInput, CollectorRpc, type CollectorConnection, type CollectorStatus, timestamp } from './collector-rpc.ts';

@Injectable()
export class CollectorService implements OnModuleInit,OnModuleDestroy {
  private config:CollectorConnection|null=null;
  private rpc:CollectorRpc|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private stopped=false;
  private remote:CollectorStatus|null=null;
  private chatStream:ClientReadableStream<any>|null=null;
  private state={enabled:false,transport:'disabled',collectionState:'disabled',collectionActive:false,lastCheckedAt:null as string|null,lastAcceptedAt:null as string|null,errorCode:null as string|null,chatConnected:false};
  constructor(private readonly ingestion:DonationIngestionService){}
  onModuleInit(){
    try{this.config=collectorConnection();}catch{this.state={...this.state,enabled:true,transport:'error',errorCode:'configuration_missing'};return;}
    if(!this.config)return;
    this.state={...this.state,enabled:true,transport:'connecting'};
    this.timer=setTimeout(()=>void this.tick(),100);
  }
  onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.chatStream?.cancel();this.rpc?.close();}
  async status(channelId:string){
    if(!this.config)return {...this.state};
    if(channelId!==this.config.gameChannelId)return {enabled:false,transport:'disabled',collectionState:'disabled',collectionActive:false,lastCheckedAt:null,lastAcceptedAt:null,errorCode:null,chatConnected:false};
    const local=await this.ingestion.status(channelId,this.config.consumerId);
    const remote=this.remote;
    const backlog=remote?.currentCursor&&local.cursor&&remote.currentCursor.journalGeneration===local.cursor.journalGeneration&&BigInt(remote.currentCursor.channelOffset)>=BigInt(local.cursor.channelOffset)?String(BigInt(remote.currentCursor.channelOffset)-BigInt(local.cursor.channelOffset)):null;
    return {...this.state,...local,collectorChannelId:this.config.collectorChannelId,
      remote:remote?{configured:remote.configured,qualityReasons:remote.qualityReasons,earliestCursor:remote.earliestCursor,currentCursor:remote.currentCursor,recoveryRevision:remote.recoveryRevision,lastReceivedAt:timestamp(remote.lastReceivedAt)}:null,
      donationBacklog:backlog,chatStreamOpen:Boolean(this.chatStream),
      stale:!this.state.lastCheckedAt||Date.now()-Date.parse(this.state.lastCheckedAt)>15000};
  }
  async checkBroadcast(channelId:string,targetChannelId:unknown){
    if(!this.config||channelId!==this.config.gameChannelId)throw new ServiceUnavailableException('방송 조회 연결이 설정되지 않았습니다.');
    if(typeof targetChannelId!=='string'||!/^[A-Za-z0-9_-]{1,50}$/.test(targetChannelId))throw new BadRequestException('SOOP 채널 ID를 입력하세요. URL은 입력할 수 없습니다.');
    let rpc:CollectorRpc|undefined;
    try{
      rpc=new CollectorRpc(this.config);
      const result=await rpc.checkBroadcast(targetChannelId);
      if(result.channelId!==targetChannelId||!['live','offline','cookie_required','auth_required','lookup_failed'].includes(result.state))throw new Error('Invalid diagnostic response');
      return {channelId:result.channelId,state:result.state,title:result.title,displayName:result.displayName,broadcastId:result.broadcastId,checkedAt:timestamp(result.checkedAt),cached:result.cached,productionTarget:targetChannelId===this.config.collectorChannelId};
    }catch(error){
      const code=(error as {code?:number}).code;
      if(code===GrpcStatus.RESOURCE_EXHAUSTED)throw new HttpException('조회가 진행 중입니다. 잠시 후 다시 시도하세요.',429);
      if(code===GrpcStatus.UNIMPLEMENTED)throw new ServiceUnavailableException('수집기 방송 조회 기능을 준비 중입니다.');
      throw new ServiceUnavailableException('수집기에 방송 정보를 요청하지 못했습니다. 연결 상태를 확인하세요.');
    }finally{rpc?.close();}
  }
  private async tick(){
    if(this.stopped||!this.config)return;
    let guard:pg.PoolClient|undefined;
    let locked=false;
    try{
      guard=await pool().connect();
      locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`collector-poll:${this.config.consumerId}:${this.config.collectorChannelId}`])).rows[0].locked;
      if(!locked)return;
      this.rpc??=new CollectorRpc(this.config);
      const remote=await this.rpc.status();assertCollectorStatus(remote,this.config);this.remote=remote;
      this.state={...this.state,lastCheckedAt:new Date().toISOString(),collectionState:remote.processHealth,collectionActive:remote.collectionActive};
      let cursor=await this.ingestion.cursor(this.config.gameChannelId,this.config.consumerId);
      if(!cursor){
        // A first subscription explicitly starts at the retained beginning. Existing
        // durable subscriptions never advance across a retention or generation gap.
        await this.ingestion.initializeCursor(this.config.gameChannelId,this.config.consumerId,this.config.collectorChannelId,{...remote.earliestCursor!,recoveryRevision:remote.recoveryRevision});
        cursor=await this.ingestion.cursor(this.config.gameChannelId,this.config.consumerId);
      }
      if(!cursor||cursor.journalGeneration!==remote.currentCursor!.journalGeneration||cursor.recoveryRevision!==remote.recoveryRevision||BigInt(cursor.channelOffset)<BigInt(remote.earliestCursor!.channelOffset)||BigInt(cursor.channelOffset)>BigInt(remote.currentCursor!.channelOffset))throw Object.assign(new Error('Recovery required'),{code:GrpcStatus.FAILED_PRECONDITION});
      const batch=await this.rpc.list(cursor,cursor.recoveryRevision);
      if(batch.recoveryRevision!==cursor.recoveryRevision)throw Object.assign(new Error('Recovery changed'),{code:GrpcStatus.FAILED_PRECONDITION});
      for(const event of batch.donations){
        if(this.stopped)break;
        if(event.channelId!==this.config.collectorChannelId)throw new Error('Donation scope mismatch');
        const accepted=await this.ingestion.acceptDonation(this.config.gameChannelId,donationInput(event,this.config,cursor.recoveryRevision));
        // This acknowledgement can only follow the inbox+cursor transaction commit.
        const ack=await this.rpc.ack(accepted.cursor,cursor.recoveryRevision);
        if(ack.acceptedCursor.journalGeneration!==accepted.cursor.journalGeneration||ack.acceptedCursor.channelOffset!==accepted.cursor.channelOffset||ack.recoveryRevision!==cursor.recoveryRevision)throw new Error('Acknowledgement scope mismatch');
        this.state.lastAcceptedAt=new Date().toISOString();
      }
      // A lost ACK response is retried from durable acceptance, including an empty batch.
      const durable=await this.ingestion.cursor(this.config.gameChannelId,this.config.consumerId);
      if(durable&&durable.channelOffset!=='0')await this.rpc.ack(durable,durable.recoveryRevision);
      this.state={...this.state,transport:'connected',errorCode:null};
      if(!this.chatStream)await this.startChat();
    }catch(error){
      const code=(error as {code?:number}).code;
      this.state={...this.state,transport:code===GrpcStatus.FAILED_PRECONDITION?'recovery_required':'error',errorCode:code===GrpcStatus.FAILED_PRECONDITION?'cursor_recovery_required':code===GrpcStatus.UNAUTHENTICATED||code===GrpcStatus.PERMISSION_DENIED?'collector_access_denied':'collector_unavailable',collectionActive:false};
      this.chatStream?.cancel();this.chatStream=null;this.rpc?.close();this.rpc=null;
    }finally{
      // Accepted work continues even during a collector outage; receiving and
      // game execution are independent durable stages.
      if(locked&&!this.stopped)await this.ingestion.drain(this.config.gameChannelId,50).catch(()=>{this.state.errorCode='inbox_dispatch_failed';});
      if(guard){if(locked)await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`collector-poll:${this.config.consumerId}:${this.config.collectorChannelId}`]).catch(()=>{});guard.release();}
      if(!this.stopped)this.timer=setTimeout(()=>void this.tick(),this.state.transport==='connected'?1000:5000);
    }
  }
  private async startChat(){
    const rpc=this.rpc,config=this.config;if(!rpc||!config||this.stopped)return;
    const cursor=await this.ingestion.chatCursor(config.gameChannelId,config.consumerId);
    if(this.stopped||this.rpc!==rpc)return;
    const stream=rpc.chat(cursor??undefined);this.chatStream=stream;
    void (async()=>{
      try{
        for await(const event of stream){
          if(this.stopped||stream!==this.chatStream)break;
          if(event.channelId!==config.collectorChannelId)throw new Error('Chat scope mismatch');
          await this.ingestion.acceptChat(config.gameChannelId,chatInput(event,config));
          this.state.chatConnected=true;
        }
      }catch(error){if((error as {code?:number}).code===GrpcStatus.FAILED_PRECONDITION)await this.ingestion.resetChatCursor(config.gameChannelId,config.consumerId).catch(()=>{});}
      finally{stream.cancel();if(this.chatStream===stream)this.chatStream=null;this.state.chatConnected=false;}
    })();
  }
}
