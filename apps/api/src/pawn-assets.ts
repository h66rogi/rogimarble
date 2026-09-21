import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import sharp from 'sharp';
import type pg from 'pg';
import type { PawnAppearanceDto } from '../../../packages/contracts/src/index.ts';
import { pool, transaction } from '../../../packages/database/src/index.ts';

const MAX_INPUT_BYTES=5*1024*1024;
const allowed=new Set(['image/png','image/jpeg','image/webp']);
type Operator={id:string;role:'admin'|'operator'|'viewer'};

export async function readImageBody(request:Request):Promise<Buffer>{
  const declared=Number(request.header('content-length')??0);
  if(Number.isFinite(declared)&&declared>MAX_INPUT_BYTES)throw new PayloadTooLargeException('Image must be at most 5 MiB');
  const chunks:Buffer[]=[];let total=0;
  for await(const raw of request){const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw);total+=chunk.length;if(total>MAX_INPUT_BYTES)throw new PayloadTooLargeException('Image must be at most 5 MiB');chunks.push(chunk);}
  if(total===0)throw new BadRequestException('Image body is required');
  return Buffer.concat(chunks,total);
}

function signature(input:Buffer):'image/png'|'image/jpeg'|'image/webp'|null{
  if(input.length>=8&&input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';
  if(input.length>=3&&input[0]===0xff&&input[1]===0xd8&&input[2]===0xff)return'image/jpeg';
  if(input.length>=12&&input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP')return'image/webp';
  return null;
}

export async function normalizePawnImage(input:Buffer,declaredMime:string):Promise<{bytes:Buffer;mimeType:'image/png'|'image/jpeg'|'image/webp';width:number;height:number}>{
  if(input.length>MAX_INPUT_BYTES)throw new PayloadTooLargeException('Image must be at most 5 MiB');
  if(!allowed.has(declaredMime))throw new UnsupportedMediaTypeException('Only PNG, JPEG, and WebP images are accepted');
  const detected=signature(input);
  if(!detected||detected!==declaredMime)throw new UnsupportedMediaTypeException('Image signature does not match Content-Type');
  try{
    const source=sharp(input,{failOn:'error',limitInputPixels:16_777_216,sequentialRead:true});
    const metadata=await source.metadata();
    const expected=detected==='image/jpeg'?'jpeg':detected.slice(6);
    if(metadata.format!==expected||!metadata.width||!metadata.height||(metadata.pages??1)!==1)throw new Error('unsupported image structure');
    let pipeline=source.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true});
    pipeline=detected==='image/png'?pipeline.png({compressionLevel:6}):detected==='image/jpeg'?pipeline.jpeg({quality:90,mozjpeg:true}):pipeline.webp({quality:90});
    const {data,info}=await pipeline.toBuffer({resolveWithObject:true});
    if(data.length>MAX_INPUT_BYTES)throw new PayloadTooLargeException('Normalized image must be at most 5 MiB');
    return{bytes:data,mimeType:detected,width:info.width,height:info.height};
  }catch(error){if(error instanceof PayloadTooLargeException)throw error;throw new BadRequestException('Image could not be decoded safely');}
}

export async function pawnAppearance(client:pg.Pool|pg.PoolClient,channelId:string):Promise<PawnAppearanceDto>{
  const result=await client.query(`SELECT p.revision,p.updated_at,a.id,a.mime_type,a.width,a.height,a.created_at
    FROM channel_pawn_appearances p LEFT JOIN pawn_assets a ON a.id=p.asset_id WHERE p.channel_id=$1`,[channelId]);
  if(!result.rowCount)return{revision:0,image:null};
  const row=result.rows[0];return{revision:Number(row.revision),image:row.id?{assetId:row.id,url:`/v1/pawn-assets/${row.id}`,mimeType:row.mime_type,width:row.width,height:row.height,source:'upload',updatedAt:new Date(row.created_at).toISOString()}:null};
}

@Injectable()
export class PawnAssetService {
  private async access(operator:Operator,channelId:string,write=false){
    if(write&&operator.role==='viewer')throw new ForbiddenException('Viewer cannot change pawn appearance');
    const allowed=write?['manage']:['manage','operate','view'];
    const result=await pool().query('SELECT 1 FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=ANY($3)',[channelId,operator.id,allowed]);
    if(!result.rowCount)throw new ForbiddenException('Channel access denied');
  }
  async assertWrite(operator:Operator,channelId:string):Promise<void>{await this.access(operator,channelId,true);}
  async current(operator:Operator,channelId:string){await this.access(operator,channelId);return pawnAppearance(pool(),channelId);}
  async upload(operator:Operator,channelId:string,expectedRevision:number,image:Awaited<ReturnType<typeof normalizePawnImage>>):Promise<PawnAppearanceDto>{
    await this.access(operator,channelId,true);return transaction(async client=>{
      await assertManage(client,operator,channelId);await client.query('INSERT INTO channel_pawn_appearances(channel_id) VALUES($1) ON CONFLICT DO NOTHING',[channelId]);
      const current=await client.query('SELECT asset_id,revision FROM channel_pawn_appearances WHERE channel_id=$1 FOR UPDATE',[channelId]);
      if(Number(current.rows[0].revision)!==expectedRevision)throw new ConflictException('Pawn appearance revision changed');
      const assetId=randomUUID();await client.query(`INSERT INTO pawn_assets(id,channel_id,mime_type,image_bytes,width,height,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,[assetId,channelId,image.mimeType,image.bytes,image.width,image.height,operator.id]);
      const next=await client.query('UPDATE channel_pawn_appearances SET asset_id=$2,revision=revision+1,updated_at=now() WHERE channel_id=$1 RETURNING revision',[channelId,assetId]);
      await client.query(`INSERT INTO pawn_asset_audit(id,channel_id,actor_operator_id,action,asset_id,revision) VALUES($1,$2,$3,'uploaded',$4,$5)`,[randomUUID(),channelId,operator.id,assetId,next.rows[0].revision]);
      if(current.rows[0].asset_id)await client.query('DELETE FROM pawn_assets WHERE id=$1 AND channel_id=$2',[current.rows[0].asset_id,channelId]);
      return pawnAppearance(client,channelId);
    });
  }
  async remove(operator:Operator,channelId:string,expectedRevision:number):Promise<PawnAppearanceDto>{
    await this.access(operator,channelId,true);return transaction(async client=>{
      await assertManage(client,operator,channelId);await client.query('INSERT INTO channel_pawn_appearances(channel_id) VALUES($1) ON CONFLICT DO NOTHING',[channelId]);
      const current=await client.query('SELECT asset_id,revision FROM channel_pawn_appearances WHERE channel_id=$1 FOR UPDATE',[channelId]);
      if(Number(current.rows[0].revision)!==expectedRevision)throw new ConflictException('Pawn appearance revision changed');
      if(!current.rows[0].asset_id)throw new NotFoundException('Pawn image not found');
      const next=await client.query('UPDATE channel_pawn_appearances SET asset_id=NULL,revision=revision+1,updated_at=now() WHERE channel_id=$1 RETURNING revision',[channelId]);
      await client.query(`INSERT INTO pawn_asset_audit(id,channel_id,actor_operator_id,action,asset_id,revision) VALUES($1,$2,$3,'deleted',$4,$5)`,[randomUUID(),channelId,operator.id,current.rows[0].asset_id,next.rows[0].revision]);
      if(current.rows[0].asset_id)await client.query('DELETE FROM pawn_assets WHERE id=$1 AND channel_id=$2',[current.rows[0].asset_id,channelId]);
      return pawnAppearance(client,channelId);
    });
  }
  async bytes(assetId:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))throw new NotFoundException('Pawn image not found');const result=await pool().query('SELECT mime_type,image_bytes FROM pawn_assets WHERE id=$1',[assetId]);if(!result.rowCount)throw new NotFoundException('Pawn image not found');return{mimeType:result.rows[0].mime_type,bytes:result.rows[0].image_bytes as Buffer};}
}

async function assertManage(client:pg.PoolClient,operator:Operator,channelId:string){const result=await client.query(`SELECT 1 FROM channel_operators c JOIN operators o ON o.id=c.operator_id WHERE c.channel_id=$1 AND c.operator_id=$2 AND c.permission='manage' AND o.role<>'viewer' AND o.disabled_at IS NULL FOR SHARE OF c,o`,[channelId,operator.id]);if(!result.rowCount)throw new ForbiddenException('Channel management access denied');}
