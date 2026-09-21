'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayPresentationCommandDto } from '@rogimarble/contracts';
import { buildRollTimeline, buildTravelTimeline, rollPlayback, type PresentationMovementCommand } from '@/integrated-overlay/roll-playback';

export type RollEffectPhase = 'idle'|'anticipation'|'reveal'|'stepping'|'landing';
export type RollPresentation = { cellId:string; dice:readonly number[]; moving:boolean; effectPhase:RollEffectPhase; trailCellIds:readonly string[]; landingPulseKey:number; reducedMotion:boolean };

export function useRollPresentation(input:{sessionKey:string|null;presentationEpoch:number|null;authoritativeCellId:string;boardPath:readonly string[]}) {
  const [reducedMotion,setReducedMotion]=useState(false);
  const [view,setView]=useState<RollPresentation>({cellId:input.authoritativeCellId,dice:[],moving:false,effectPhase:'idle',trailCellIds:[],landingPulseKey:0,reducedMotion:false});
  const timers=useRef<number[]>([]),seen=useRef(new Set<string>()),session=useRef<string|null>(null),epoch=useRef<number|null>(null),generation=useRef(0);
  const cancel=useCallback((cellId:string,clearDice=false)=>{generation.current++;timers.current.forEach(window.clearTimeout);timers.current=[];setView(current=>({...current,cellId,dice:clearDice?[]:current.dice,moving:false,effectPhase:'idle',trailCellIds:[]}));},[]);

  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
  useEffect(()=>setView(current=>({...current,reducedMotion})),[reducedMotion]);
  useEffect(()=>{if(reducedMotion&&timers.current.length)cancel(input.authoritativeCellId);},[reducedMotion,input.authoritativeCellId,cancel]);
  useEffect(()=>{
    const sessionChanged=session.current!==input.sessionKey;
    const barrierChanged=epoch.current!==input.presentationEpoch;
    if(sessionChanged||barrierChanged){session.current=input.sessionKey;epoch.current=input.presentationEpoch;seen.current.clear();cancel(input.authoritativeCellId,true);}
    else if(!timers.current.length&&view.cellId!==input.authoritativeCellId)cancel(input.authoritativeCellId);
  },[input.sessionKey,input.presentationEpoch,input.authoritativeCellId,cancel]);
  useEffect(()=>()=>{generation.current++;timers.current.forEach(window.clearTimeout);},[]);

  const play=useCallback((event:{commandId:string;commandType:PresentationMovementCommand;sessionKey:string;presentationEpoch:number;finalCellId:string;result:OverlayPresentationCommandDto['result']})=>{
    if(event.sessionKey!==input.sessionKey||event.presentationEpoch!==input.presentationEpoch||seen.current.has(event.commandId))return false;
    const parsed=rollPlayback({commandId:event.commandId,sessionId:'presentation',sessionEpoch:0,presentationEpoch:event.presentationEpoch,type:event.commandType,afterRevision:0,result:event.result,createdAt:''},input.boardPath,event.finalCellId);
    if(!parsed)return false;
    seen.current.add(event.commandId);session.current=event.sessionKey;epoch.current=event.presentationEpoch;cancel(parsed.cells[0]??input.authoritativeCellId);const run=++generation.current;
    if(!parsed.dice.length&&parsed.cells.length<2){setView(current=>({...current,cellId:event.finalCellId,dice:[],effectPhase:'idle',moving:false,trailCellIds:[]}));return true;}
    if(reducedMotion){setView(current=>({...current,cellId:event.finalCellId,dice:parsed.dice,effectPhase:'idle',moving:false,trailCellIds:[]}));return true;}
    setView(current=>({...current,cellId:parsed.cells[0]??input.authoritativeCellId,dice:parsed.dice,effectPhase:'anticipation',moving:false,trailCellIds:[]}));
    if(parsed.kind==='travel')setView(current=>({...current,dice:[],effectPhase:'stepping',moving:true}));
    const timeline=parsed.kind==='travel'?buildTravelTimeline(parsed.cells):buildRollTimeline(parsed.cells);
    timeline.forEach(item=>timers.current.push(window.setTimeout(()=>{if(run!==generation.current)return;if(item.phase==='reveal')setView(current=>({...current,effectPhase:'reveal'}));else if(item.phase==='stepping')setView(current=>({...current,effectPhase:'stepping',moving:true}));else if(item.phase==='cell')setView(current=>({...current,cellId:item.cellId!,trailCellIds:[...current.trailCellIds,item.cellId!]}));else if(item.phase==='landing')setView(current=>({...current,cellId:event.finalCellId,moving:false,effectPhase:'landing',landingPulseKey:current.landingPulseKey+1}));else{timers.current=[];setView(current=>({...current,effectPhase:'idle',trailCellIds:[]}));}},item.at)));
    return true;
  },[input.authoritativeCellId,input.boardPath,input.sessionKey,input.presentationEpoch,reducedMotion,cancel]);
  return{...view,play,cancel:()=>cancel(input.authoritativeCellId)};
}
