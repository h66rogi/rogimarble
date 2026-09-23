'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { validateOverlayLayout, type OverlayLayoutSnapshotDto } from '@rogimarble/contracts';
import type { OverlayChatEvent } from '../types/chat';

const SOCKET_BASE_URL=process.env.NEXT_PUBLIC_GATEWAY_BASE_URL||process.env.NEXT_PUBLIC_GATEWAY_URL||(typeof window!=='undefined'?window.location.origin:'');
const SOCKET_PATH=process.env.NEXT_PUBLIC_GATEWAY_SOCKET_PATH||'/socket.io';

function parsePayload(payload:unknown):unknown{
  if(payload==null)return null;
  if(typeof payload==='string'){try{return JSON.parse(payload);}catch{return payload;}}
  return payload;
}

/** Rogimarble adapter for the imported meloming `overlay:event`/`layout.updated` dispatch contract. */
export function useRogimarbleOverlaySocket(token:string|null,onLayout:(snapshot:OverlayLayoutSnapshotDto)=>void,onStatus:(connected:boolean)=>void,onChatMessage:(message:OverlayChatEvent)=>void){
  useEffect(()=>{
    if(!token)return;
    const socket=io(SOCKET_BASE_URL,{path:SOCKET_PATH,transports:['websocket'],auth:{token},reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1_000,reconnectionDelayMax:30_000,randomizationFactor:.5,timeout:20_000});
    socket.on('connect',()=>onStatus(true));
    socket.on('disconnect',()=>onStatus(false));
    socket.on('connect_error',()=>onStatus(false));
    socket.on('overlay:event',(message:Record<string,unknown>)=>{
      const eventName=message?.event;
      const payload=parsePayload(message?.payload) as Record<string,unknown>|null;
      switch(eventName){
        case 'layout.updated':
          try{if(!payload||payload.widgetType!=='total'||!Number.isSafeInteger(payload.layoutVersion))return;validateOverlayLayout(payload.layout);onLayout({layout:payload.layout,layoutVersion:payload.layoutVersion as number,layoutUpdatedAt:typeof payload.layoutUpdatedAt==='string'?payload.layoutUpdatedAt:null});}catch{return;}
          break;
        case 'chat.message':
        case 'chat.donation':
          if(!payload||typeof payload.id!=='string'||typeof payload.nickname!=='string'||typeof payload.message!=='string'||typeof payload.timestamp!=='string'||payload.platform!=='soop'||payload.type!==(eventName==='chat.message'?'chat':'donation'))return;
          if(eventName==='chat.donation'&&(!Number.isSafeInteger(payload.amount)||Number(payload.amount)<1))return;
          onChatMessage(payload as unknown as OverlayChatEvent);
          break;
        default:break;
      }
    });
    return()=>{socket.disconnect();};
  },[token,onLayout,onStatus,onChatMessage]);
}
