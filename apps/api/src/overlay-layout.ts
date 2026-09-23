import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { upgradeLegacyOverlayLayout, validateOverlayLayout, type OverlayLayoutDto, type OverlayLayoutSnapshotDto } from '../../../packages/contracts/src/index.ts';
import { pool, transaction } from '../../../packages/database/src/index.ts';
import type { PoolClient } from 'pg';
import { OverlayRealtimeService } from './overlay-realtime.ts';

export const DEFAULT_LIVE_OVERLAY_LAYOUT:OverlayLayoutDto={schemaVersion:1,boardThemeId:'lime-clover',fontId:'nanum-square-neo',width:1920,height:1080,aspectRatio:'16:9',background:'transparent',widgets:[{id:'board',bounds:{x:0,y:0,width:1,height:1},z:1}]};

type Operator={id:string;role:'admin'|'operator'|'viewer'};
const date=(value:Date|string|null)=>value?new Date(value).toISOString():null;

export async function effectiveOverlayLayout(client:Pick<PoolClient,'query'>,channelId:string):Promise<OverlayLayoutSnapshotDto>{
  const result=await client.query<{layout:unknown;revision:string;updated_at:Date|null}>(`SELECT layout,revision,updated_at FROM channel_live_overlay_layouts WHERE channel_id=$1
    UNION ALL SELECT document,0::bigint,NULL::timestamptz FROM channel_config_versions
      WHERE channel_id=$1 AND kind='overlay-layout' AND status='published'
        AND NOT EXISTS(SELECT 1 FROM channel_live_overlay_layouts WHERE channel_id=$1)
    LIMIT 1`,[channelId]);
  const layout=upgradeLegacyOverlayLayout(result.rows[0]?.layout??DEFAULT_LIVE_OVERLAY_LAYOUT);validateOverlayLayout(layout);return{layout,layoutVersion:Number(result.rows[0]?.revision??0),layoutUpdatedAt:date(result.rows[0]?.updated_at??null)};
}

export async function resetLiveOverlayLayout(client:PoolClient,channelId:string,layout:OverlayLayoutDto,versionId:string,actorId:string):Promise<OverlayLayoutSnapshotDto>{
  const prior=await client.query<{layout:unknown;revision:string}>('SELECT layout,revision FROM channel_live_overlay_layouts WHERE channel_id=$1 FOR UPDATE',[channelId]);
  const revision=prior.rowCount?Number(prior.rows[0].revision)+1:1;
  // Publishing changes style/content defaults. A broadcaster may have moved widgets
  // moments earlier, so the live geometry remains authoritative once it exists.
  const priorLayout=prior.rows[0]?.layout as OverlayLayoutDto|undefined;
  const effective=priorLayout?{...layout,widgets:priorLayout.widgets,widgetStyles:priorLayout.widgetStyles??layout.widgetStyles}:layout;
  const row=await client.query<{updated_at:Date}>(`INSERT INTO channel_live_overlay_layouts(channel_id,layout,revision,published_version_id,updated_by) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(channel_id) DO UPDATE SET layout=excluded.layout,revision=excluded.revision,published_version_id=excluded.published_version_id,updated_by=excluded.updated_by,updated_at=now() RETURNING updated_at`,[channelId,JSON.stringify(effective),revision,versionId,actorId]);
  await client.query(`INSERT INTO channel_live_overlay_layout_audit(id,channel_id,revision,action,actor_operator_id,before_layout,after_layout) VALUES($1,$2,$3,'published.reset',$4,$5,$6)`,[randomUUID(),channelId,revision,actorId,prior.rows[0]?.layout??null,JSON.stringify(effective)]);
  return{layout:effective,layoutVersion:revision,layoutUpdatedAt:date(row.rows[0].updated_at)};
}

@Injectable()
export class OverlayLayoutService{
  constructor(private readonly realtime:OverlayRealtimeService){}
  private async access(operator:Operator,channelId:string,write=false){if(write&&operator.role==='viewer')throw new ForbiddenException('Viewer cannot change overlay layout');const permissions=write?['manage','operate']:['manage','operate','view'];const result=await pool().query('SELECT 1 FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=ANY($3)',[channelId,operator.id,permissions]);if(!result.rowCount)throw new ForbiddenException('Channel access denied');}
  async get(operator:Operator,channelId:string){await this.access(operator,channelId);const permission=await pool().query<{permission:'manage'|'operate'|'view'}>('SELECT permission FROM channel_operators WHERE channel_id=$1 AND operator_id=$2',[channelId,operator.id]);return{...await effectiveOverlayLayout(pool(),channelId),canEdit:operator.role!=='viewer'&&['manage','operate'].includes(permission.rows[0].permission)};}
  async put(operator:Operator,channelId:string,body:any):Promise<OverlayLayoutSnapshotDto>{
    await this.access(operator,channelId,true);if(!Number.isSafeInteger(body?.expectedVersion)||body.expectedVersion<0)throw new BadRequestException('expectedVersion is required');
    const layout=body?.layout;try{validateOverlayLayout(layout);}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid overlay layout');}
    const snapshot=await transaction(async client=>{const authorized=await client.query(`SELECT 1 FROM channel_operators c JOIN operators o ON o.id=c.operator_id WHERE c.channel_id=$1 AND c.operator_id=$2 AND c.permission=ANY($3) AND o.role<>'viewer' AND o.disabled_at IS NULL FOR SHARE OF c,o`,[channelId,operator.id,['manage','operate']]);if(!authorized.rowCount)throw new ForbiddenException('Channel layout access denied');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`live-overlay-layout:${channelId}`]);const current=await effectiveOverlayLayout(client,channelId);if(current.layoutVersion!==body.expectedVersion)throw new ConflictException({message:'Overlay layout version changed',current});const revision=current.layoutVersion+1;const row=await client.query<{updated_at:Date}>(`INSERT INTO channel_live_overlay_layouts(channel_id,layout,revision,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(channel_id) DO UPDATE SET layout=excluded.layout,revision=excluded.revision,published_version_id=NULL,updated_by=excluded.updated_by,updated_at=now() RETURNING updated_at`,[channelId,JSON.stringify(layout),revision,operator.id]);await client.query(`INSERT INTO channel_live_overlay_layout_audit(id,channel_id,revision,action,actor_operator_id,before_layout,after_layout) VALUES($1,$2,$3,'live.updated',$4,$5,$6)`,[randomUUID(),channelId,revision,operator.id,JSON.stringify(current.layout),JSON.stringify(layout)]);return{layout,layoutVersion:revision,layoutUpdatedAt:date(row.rows[0].updated_at)};});
    this.realtime.publishLayout(channelId,snapshot);return{...snapshot,canEdit:true};
  }
}
