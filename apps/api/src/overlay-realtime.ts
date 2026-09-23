import { createHash } from 'node:crypto';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { OverlayLayoutSnapshotDto } from '../../../packages/contracts/src/index.ts';
import { pool } from '../../../packages/database/src/index.ts';
import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { overlayChatMessage, overlayDonationMessage } from './overlay-chat.ts';

const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class OverlayRealtimeService implements OnApplicationShutdown{
  private server?:Server;private timer?:NodeJS.Timeout;
  attach(httpServer:HttpServer){
    const allowed=new Set((process.env.WEB_ORIGIN??'').split(',').map(x=>x.trim()).filter(Boolean));
    if(process.env.NODE_ENV==='production'&&!allowed.size)throw new Error('WEB_ORIGIN is required for production realtime');
    const validOrigin=(origin:string|undefined)=>!origin||allowed.size===0||allowed.has(origin);
    this.server=new Server(httpServer,{path:'/socket.io',transports:['websocket','polling'],perMessageDeflate:false,pingInterval:25_000,pingTimeout:60_000,allowRequest:(request,callback)=>callback(null,validOrigin(request.headers.origin)),cors:{credentials:false,origin:(origin,callback)=>callback(null,validOrigin(origin))}});
    this.server.use(async(socket,next)=>{try{const token=socket.handshake.auth?.token;if(typeof token!=='string'||!TOKEN.test(token))return next(new Error('unauthorized'));const found=await pool().query<{id:string;channel_id:string}>('UPDATE obs_access_tokens SET last_used_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id,channel_id',[digest(token)]);if(!found.rowCount)return next(new Error('unauthorized'));socket.data.tokenId=found.rows[0].id;socket.data.channelId=found.rows[0].channel_id;next();}catch{next(new Error('unauthorized'));}});
    this.server.on('connection',async(socket:Socket)=>{await socket.join(this.room(socket.data.channelId));socket.emit('ready',{widgetType:'total'});});
    this.timer=setInterval(()=>void this.revalidate().catch(()=>this.server?.disconnectSockets(true)),15_000);this.timer.unref();
  }
  publishLayout(channelId:string,snapshot:OverlayLayoutSnapshotDto){this.server?.to(this.room(channelId)).emit('overlay:event',{widgetType:'total',event:'layout.updated',payload:JSON.stringify({widgetType:'total',layout:snapshot.layout,layoutVersion:snapshot.layoutVersion,layoutUpdatedAt:snapshot.layoutUpdatedAt}),emittedAt:new Date().toISOString()});}
  publishChat(channelId:string,message:ReturnType<typeof overlayChatMessage>){this.publishMessage(channelId,'chat.message',message);}
  publishDonation(channelId:string,message:NonNullable<ReturnType<typeof overlayDonationMessage>>){this.publishMessage(channelId,'chat.donation',message);}
  private publishMessage(channelId:string,event:'chat.message'|'chat.donation',payload:object){this.server?.to(this.room(channelId)).emit('overlay:event',{widgetType:'total',event,payload:JSON.stringify(payload),emittedAt:new Date().toISOString()});}
  disconnectToken(tokenId:string){for(const socket of this.server?.sockets.sockets.values()??[])if(socket.data.tokenId===tokenId)socket.disconnect(true);}
  private room(channelId:string){return`channel:${channelId}:overlay`;}
  private async revalidate(){const sockets=[...(this.server?.sockets.sockets.values()??[])];if(!sockets.length)return;const ids=[...new Set(sockets.map(s=>String(s.data.tokenId)))];const valid=await pool().query<{id:string}>('SELECT id FROM obs_access_tokens WHERE id=ANY($1) AND revoked_at IS NULL',[ids]);const allowed=new Set(valid.rows.map(x=>x.id));for(const socket of sockets)if(!allowed.has(socket.data.tokenId))socket.disconnect(true);}
  onApplicationShutdown(){if(this.timer)clearInterval(this.timer);this.server?.disconnectSockets(true);this.server?.close();}
}
