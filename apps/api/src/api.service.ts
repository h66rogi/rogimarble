import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { CreateSessionRequest, GameSessionDto, InventoryItemDto, InventoryLedgerDto, MissionDto, OperatorStateDto, RunnableBoardVersionDto, SessionCommandDto, SessionCommandRequest } from '../../../packages/contracts/src/index.ts';
import type { BoardDefinition } from '../../../packages/game-core/src/board-definition.ts';
import { transaction, pool } from '../../../packages/database/src/index.ts';
import type pg from 'pg';

type Operator = { id: string; role: 'admin'|'operator'|'viewer' };
type SessionRow = { id:string; channel_id:string; status:'ready'|'running'|'paused'|'ended'; session_epoch:number; revision:string;
  board_version_id:string; current_cell_id:string; direction:'forward'|'reverse'; automatic_movement_paused:boolean;
  presentation_epoch:string; created_at:Date; updated_at:Date; board_definition?:BoardDefinition };
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
    .map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
const requestHash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');

@Injectable()
export class ApiService {
  async assertAccess(operator: Operator, channelId: string, write = false): Promise<'manage'|'operate'|'view'> {
    if(write&&operator.role==='viewer')throw new ForbiddenException('Viewer cannot change game state');
    const allowed = write ? ['manage','operate'] : ['manage','operate','view'];
    const result = await pool().query<{permission:'manage'|'operate'|'view'}>('SELECT permission FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=ANY($3)',
      [channelId, operator.id, allowed]);
    if (!result.rowCount) throw new ForbiddenException('Channel access denied');
    return result.rows[0].permission;
  }
  private dto(row: SessionRow): GameSessionDto {
    return { id:row.id, channelId:row.channel_id, status:row.status, sessionEpoch:row.session_epoch,
      revision:Number(row.revision), boardVersionId:row.board_version_id, currentCellId:row.current_cell_id,
      direction:row.direction, automaticMovementPaused:row.automatic_movement_paused,
      presentationEpoch:Number(row.presentation_epoch),previewOnly:row.board_definition?.id.endsWith('-safe-preview')??false,
      createdAt:row.created_at.toISOString(), updatedAt:row.updated_at.toISOString() };
  }
  async state(operator:Operator, channelId:string):Promise<OperatorStateDto> {
    return transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const access=await client.query<{permission:'manage'|'operate'|'view'}>('SELECT permission FROM channel_operators WHERE channel_id=$1 AND operator_id=$2',[channelId,operator.id]);
      if(!access.rowCount)throw new ForbiddenException('Channel access denied');
      const result=await client.query<SessionRow>(`SELECT s.*,b.board_definition FROM game_sessions s JOIN board_versions b ON b.id=s.board_version_id WHERE s.channel_id=$1 AND s.status<>'ended' ORDER BY s.created_at DESC LIMIT 1`,[channelId]);
      const session=result.rowCount?this.dto(result.rows[0]):null;
      const inventory:InventoryItemDto[]=session?await inventoryState(client,session.id,channelId):[];
      const missions:MissionDto[]=session?await missionState(client,session.id):[];
      const canOperate=operator.role!=='viewer'&&access.rows[0].permission!=='view';
      return { session,inventory,missions,capabilities:{ manualRoll:canOperate,setDirection:canOperate,setPosition:canOperate,
        arrivalEffects:false,donations:false,inventory:canOperate,missions:canOperate,sessionLifecycle:canOperate } };
    });
  }
  async runnableBoards(operator:Operator,channelId:string):Promise<RunnableBoardVersionDto[]>{
    await this.assertAccess(operator,channelId);
    const result=await pool().query<{id:string;board_definition:BoardDefinition}>(`SELECT id,board_definition FROM board_versions
      WHERE channel_id=$1 AND status='validated' AND supported_for_live=true ORDER BY created_at DESC`,[channelId]);
    return result.rows.map(({id,board_definition:board})=>({id,boardId:board.id,name:board.name,path:board.path,
      initialCellId:board.startCellId,previewOnly:board.id.endsWith('-safe-preview')}));
  }
  async createSession(operator:Operator, channelId:string, body:CreateSessionRequest):Promise<GameSessionDto> {
    await this.assertAccess(operator,channelId,true);
    validateSessionRequest(body);
    const hash=requestHash({channelId,operatorId:operator.id,body});
    return transaction(async client=>{
      await assertTransactionalWriteAccess(client,operator,channelId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[body.commandId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`open-session:${channelId}`]);
      const prior=await client.query<{request_hash:string;session_id:string;channel_id:string;operator_id:string;type:string;result:GameSessionDto}>('SELECT request_hash,session_id,channel_id,operator_id,type,result FROM game_commands WHERE command_id=$1',[body.commandId]);
      if(prior.rowCount){ if(prior.rows[0].request_hash!==hash||prior.rows[0].channel_id!==channelId||prior.rows[0].operator_id!==operator.id||prior.rows[0].type!=='create_session') throw new ConflictException('commandId scope or payload mismatch');
        if(!isStoredSessionAck(prior.rows[0].result))throw new ConflictException('Legacy create command has no immutable creation response; reconcile current state before issuing a new command');
        return prior.rows[0].result; }
      const active=await client.query('SELECT 1 FROM game_sessions WHERE channel_id=$1 AND status<>\'ended\'',[channelId]);if(active.rowCount)throw new ConflictException('Channel already has an active session');
      const boardResult=await client.query<{board_definition:BoardDefinition}>(`SELECT board_definition FROM board_versions
        WHERE id=$1 AND channel_id=$2 AND status='validated' AND supported_for_live=true`,[body.boardVersionId,channelId]);
      if(!boardResult.rowCount) throw new UnprocessableEntityException('Board is not validated for this server');
      const board=boardResult.rows[0].board_definition;
      assertRunnableBoard(board);
      if(!board.path.includes(body.initialCellId)) throw new UnprocessableEntityException('Initial cell is not on board path');
      const id=randomUUID(), now=new Date();
      const session=await client.query<SessionRow>(`INSERT INTO game_sessions(id,channel_id,board_version_id,status,current_cell_id,direction)
        VALUES($1,$2,$3,'running',$4,$5) RETURNING *`,[id,channelId,body.boardVersionId,body.initialCellId,body.direction??board.defaultDirection]);
      session.rows[0].board_definition=board;
      const created=this.dto(session.rows[0]);
      await client.query(`INSERT INTO game_commands(command_id,channel_id,session_id,operator_id,type,request_hash,status,before_revision,after_revision,result,reason,session_epoch,presentation_epoch)
        VALUES($1,$2,$3,$4,'create_session',$5,'completed',0,0,$6,'create session',$7,$8)`,[body.commandId,channelId,id,operator.id,hash,created,created.sessionEpoch,created.presentationEpoch]);
      await client.query(`INSERT INTO game_outbox(id,aggregate_id,event_type,payload) VALUES($1,$2,'session.created',$3)`,[randomUUID(),id,{sessionId:id,at:now.toISOString()}]);
      await client.query(`INSERT INTO session_inventory(session_id,item_id) SELECT $1,item_id FROM item_definitions WHERE channel_id=$2 AND active=true`,[id,channelId]);
      return created;
    });
  }
  async command(operator:Operator,channelId:string,sessionId:string,body:SessionCommandRequest):Promise<SessionCommandDto>{
    await this.assertAccess(operator,channelId,true);
    validateCommand(body);
    const hash=requestHash({channelId,sessionId,operatorId:operator.id,body});
    return transaction(async client=>{
      await assertTransactionalWriteAccess(client,operator,channelId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[body.commandId]);
      const prior=await client.query('SELECT * FROM game_commands WHERE command_id=$1',[body.commandId]);
      if(prior.rowCount){if(prior.rows[0].request_hash!==hash||prior.rows[0].channel_id!==channelId||prior.rows[0].session_id!==sessionId||prior.rows[0].operator_id!==operator.id||prior.rows[0].type!==body.type) throw new ConflictException('commandId scope or payload mismatch'); return commandDto(prior.rows[0]);}
      const locked=await client.query<SessionRow & {board_definition:BoardDefinition}>(`SELECT s.*,b.board_definition FROM game_sessions s JOIN board_versions b ON b.id=s.board_version_id
        WHERE s.id=$1 AND s.channel_id=$2 FOR UPDATE OF s`,[sessionId,channelId]);
      if(!locked.rowCount) throw new NotFoundException('Session not found');
      const session=locked.rows[0];
      if(session.status==='ended'||session.session_epoch!==body.sessionEpoch||Number(session.revision)!==body.expectedRevision) throw new ConflictException('Session revision or epoch changed');
      const before=this.dto(session); let result:unknown;const afterCommands:(()=>Promise<void>)[]=[];
      if(body.type==='roll_dice'){
        if(session.status!=='running'&&session.status!=='paused')throw new ConflictException('Dice can only roll in an active session');
        assertRunnableBoard(session.board_definition); const board=session.board_definition;
        const dice=Array.from({length:board.dice.count},()=>randomInt(1,board.dice.sides+1));
        const distance=dice.reduce((a,b)=>a+b,0), start=board.path.indexOf(session.current_cell_id);
        if(start<0) throw new UnprocessableEntityException('Current cell is not on board path');
        const sign=session.direction==='forward'?1:-1;
        const path=Array.from({length:distance},(_,i)=>board.path[(start+sign*(i+1)+board.path.length*distance)%board.path.length]);
        const destination=path.at(-1)??session.current_cell_id;
        result={dice,distance,direction:session.direction,path,fromCellId:session.current_cell_id,toCellId:destination}; session.current_cell_id=destination;
      }else if(body.type==='set_direction'){result={direction:body.payload.direction};session.direction=body.payload.direction;
      }else if(body.type==='set_position'){ if(!session.board_definition.path.includes(body.payload.cellId)) throw new UnprocessableEntityException('Cell is not on board path');
        result={fromCellId:session.current_cell_id,toCellId:body.payload.cellId,automaticMovementPaused:true};session.current_cell_id=body.payload.cellId;session.automatic_movement_paused=true;session.status='paused'; }
      else if(body.type==='pause'){if(session.status!=='running')throw new ConflictException('Only a running session can pause');session.status='paused';session.automatic_movement_paused=true;result={status:'paused'};}
      else if(body.type==='resume'){if(session.status!=='paused')throw new ConflictException('Only a paused session can resume');session.status='running';session.automatic_movement_paused=false;result={status:'running'};}
      else if(body.type==='end_session'){if(!['ready','running','paused'].includes(session.status))throw new ConflictException('Session cannot end');
        const pending=await client.query('SELECT 1 FROM missions WHERE session_id=$1 AND status=\'pending\' LIMIT 1',[sessionId]);if(pending.rowCount)throw new ConflictException('Pending missions must be resolved before ending session');
        session.status='ended';session.automatic_movement_paused=true;result={status:'ended'};}
      else if(body.type==='adjust_inventory'){
        const definition=await client.query<{name:string;max_quantity:number}>('SELECT name,max_quantity FROM item_definitions WHERE channel_id=$1 AND item_id=$2 AND active=true',[channelId,body.payload.itemId]);
        if(!definition.rowCount)throw new UnprocessableEntityException('Unknown or inactive item');
        await client.query(`INSERT INTO session_inventory(session_id,item_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[sessionId,body.payload.itemId]);
        const current=(await client.query<{quantity:number;revision:string;updated_at:Date}>('SELECT quantity,revision,updated_at FROM session_inventory WHERE session_id=$1 AND item_id=$2 FOR UPDATE',[sessionId,body.payload.itemId])).rows[0];
        if(Number(current.revision)!==body.payload.expectedInventoryRevision)throw new ConflictException('Inventory revision changed');
        const next=body.payload.mode==='delta'?current.quantity+body.payload.quantity:body.payload.quantity;
        if(!Number.isSafeInteger(next)||next<0||next>definition.rows[0].max_quantity)throw new UnprocessableEntityException('Inventory quantity out of range');
        const changed=(await client.query<{quantity:number;revision:string;updated_at:Date}>('UPDATE session_inventory SET quantity=$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND item_id=$2 RETURNING quantity,revision,updated_at',[sessionId,body.payload.itemId,next])).rows[0];
        const inventory:InventoryItemDto={itemId:body.payload.itemId,name:definition.rows[0].name,quantity:changed.quantity,revision:Number(changed.revision),updatedAt:changed.updated_at.toISOString()};result={inventory};
        afterCommands.push(()=>client.query(`INSERT INTO inventory_ledger(id,command_id,session_id,item_id,before_quantity,delta,after_quantity,before_revision,after_revision,operator_id,reason)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),body.commandId,sessionId,body.payload.itemId,current.quantity,next-current.quantity,next,current.revision,changed.revision,operator.id,body.reason]).then(()=>undefined));
      }else if(body.type==='create_mission'){
        if(body.payload.shield){const item=await client.query('SELECT 1 FROM item_definitions WHERE channel_id=$1 AND item_id=$2 AND active=true',[channelId,body.payload.shield.itemId]);if(!item.rowCount)throw new UnprocessableEntityException('Unknown shield item');}
        const missionId=randomUUID(),createdAt=new Date(),quantity=body.payload.quantity??1;const mission:MissionDto={id:missionId,message:body.payload.message,quantity,status:'pending',shield:body.payload.shield,revision:0,createdAt:createdAt.toISOString(),resolvedAt:null};result={mission};
        afterCommands.push(()=>client.query(`INSERT INTO missions(id,session_id,message,quantity,status,shield_item_id,shield_quantity,created_by_command_id,created_at)
          VALUES($1,$2,$3,$4,'pending',$5,$6,$7,$8)`,[missionId,sessionId,body.payload.message,quantity,body.payload.shield?.itemId??null,body.payload.shield?.quantity??null,body.commandId,createdAt]).then(()=>undefined));
      }else{
        const mission=(await client.query<any>('SELECT * FROM missions WHERE id=$1 AND session_id=$2 FOR UPDATE',[body.payload.missionId,sessionId])).rows[0];
        if(!mission)throw new NotFoundException('Mission not found');if(mission.status!=='pending'||Number(mission.revision)!==body.payload.expectedMissionRevision)throw new ConflictException('Mission already resolved or revision changed');
        let status:'completed'|'waived'|'shielded'=body.type==='complete_mission'?'completed':body.type==='waive_mission'?'waived':'shielded';let inventory:InventoryItemDto|undefined;
        if(body.type==='use_shield'){
          if(!mission.shield_item_id||!mission.shield_quantity)throw new UnprocessableEntityException('Mission does not allow a shield');
          const definition=(await client.query<{name:string}>('SELECT name FROM item_definitions WHERE channel_id=$1 AND item_id=$2 AND active=true',[channelId,mission.shield_item_id])).rows[0];if(!definition)throw new UnprocessableEntityException('Shield item is inactive');
          const stock=(await client.query<{quantity:number;revision:string;updated_at:Date}>('SELECT quantity,revision,updated_at FROM session_inventory WHERE session_id=$1 AND item_id=$2 FOR UPDATE',[sessionId,mission.shield_item_id])).rows[0];
          if(!stock||Number(stock.revision)!==body.payload.expectedInventoryRevision)throw new ConflictException('Inventory revision changed');if(stock.quantity<mission.shield_quantity)throw new UnprocessableEntityException('Insufficient inventory');
          const changed=(await client.query<{quantity:number;revision:string;updated_at:Date}>('UPDATE session_inventory SET quantity=quantity-$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND item_id=$2 RETURNING quantity,revision,updated_at',[sessionId,mission.shield_item_id,mission.shield_quantity])).rows[0];
          inventory={itemId:mission.shield_item_id,name:definition.name,quantity:changed.quantity,revision:Number(changed.revision),updatedAt:changed.updated_at.toISOString()};
          afterCommands.push(()=>client.query(`INSERT INTO inventory_ledger(id,command_id,session_id,item_id,before_quantity,delta,after_quantity,before_revision,after_revision,operator_id,reason)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),body.commandId,sessionId,mission.shield_item_id,stock.quantity,-mission.shield_quantity,changed.quantity,stock.revision,changed.revision,operator.id,body.reason]).then(()=>undefined));
        }
        const resolvedAt=new Date();const resolved={...mission,status,revision:String(Number(mission.revision)+1),resolved_at:resolvedAt};
        result={mission:missionDto(resolved),...(inventory?{inventory}:{})};
        afterCommands.push(()=>client.query('UPDATE missions SET status=$2,revision=revision+1,resolved_by_command_id=$3,resolved_at=$4 WHERE id=$1',[mission.id,status,body.commandId,resolvedAt]).then(()=>undefined));
      }
      const invalidatesPresentation=body.type==='set_position'||body.type==='end_session';
      const updated=await client.query<SessionRow>(`UPDATE game_sessions SET current_cell_id=$2,direction=$3,automatic_movement_paused=$4,status=$5,revision=revision+1,presentation_epoch=presentation_epoch+$6,updated_at=now() WHERE id=$1 RETURNING *`,
        [session.id,session.current_cell_id,session.direction,session.automatic_movement_paused,session.status,invalidatesPresentation?1:0]);
      updated.rows[0].board_definition=session.board_definition;
      const after=this.dto(updated.rows[0]);
      const inserted=await client.query(`INSERT INTO game_commands(command_id,channel_id,session_id,operator_id,type,request_hash,status,before_revision,after_revision,result,reason,session_epoch,presentation_epoch)
        VALUES($1,$2,$3,$4,$5,$6,'completed',$7,$8,$9,$10,$11,$12) RETURNING *`,[body.commandId,channelId,sessionId,operator.id,body.type,hash,before.revision,after.revision,result,body.reason,after.sessionEpoch,after.presentationEpoch]);
      for(const action of afterCommands)await action();
      await client.query(`INSERT INTO operation_ledger(id,command_id,channel_id,session_id,operator_id,operation_type,before_state,after_state,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),body.commandId,channelId,sessionId,operator.id,body.type,before,after,body.reason]);
      await client.query(`INSERT INTO game_outbox(id,aggregate_id,event_type,payload) VALUES($1,$2,'session.command.completed',$3)`,[randomUUID(),sessionId,{commandId:body.commandId,result,session:after}]);
      return commandDto(inserted.rows[0]);
    });
  }
  async getCommand(operator:Operator,channelId:string,commandId:string):Promise<SessionCommandDto>{await this.assertAccess(operator,channelId);const r=await pool().query('SELECT * FROM game_commands WHERE command_id=$1 AND channel_id=$2',[commandId,channelId]);if(!r.rowCount)throw new NotFoundException('Command not found');if(r.rows[0].type==='create_session'&&!isStoredSessionAck(r.rows[0].result))throw new ConflictException('Legacy create command has no immutable creation response; reconcile current state before issuing a new command');return commandDto(r.rows[0]);}
  async inventoryLedger(operator:Operator,channelId:string,sessionId:string):Promise<InventoryLedgerDto[]>{await this.assertAccess(operator,channelId);await this.assertSessionChannel(sessionId,channelId);const result=await pool().query<any>('SELECT * FROM inventory_ledger WHERE session_id=$1 ORDER BY created_at,id',[sessionId]);return result.rows.map(row=>({id:row.id,commandId:row.command_id,itemId:row.item_id,beforeQuantity:row.before_quantity,delta:row.delta,afterQuantity:row.after_quantity,beforeRevision:Number(row.before_revision),afterRevision:Number(row.after_revision),operatorId:row.operator_id,reason:row.reason,createdAt:new Date(row.created_at).toISOString()}));}
  async missions(operator:Operator,channelId:string,sessionId:string):Promise<MissionDto[]>{await this.assertAccess(operator,channelId);await this.assertSessionChannel(sessionId,channelId);return missionState(pool(),sessionId);}
  private async assertSessionChannel(sessionId:string,channelId:string):Promise<void>{const result=await pool().query('SELECT 1 FROM game_sessions WHERE id=$1 AND channel_id=$2',[sessionId,channelId]);if(!result.rowCount)throw new NotFoundException('Session not found');}
}
function isUuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)}
function isStoredSessionAck(value:unknown):value is GameSessionDto{return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  isUuid((value as any).id)&&typeof (value as any).channelId==='string'&&typeof (value as any).boardVersionId==='string'&&
  typeof (value as any).currentCellId==='string'&&Number.isSafeInteger((value as any).sessionEpoch)&&Number.isSafeInteger((value as any).revision)&&
  Number.isSafeInteger((value as any).presentationEpoch)&&typeof (value as any).previewOnly==='boolean'&&typeof (value as any).createdAt==='string'&&typeof (value as any).updatedAt==='string';}
function assertRunnableBoard(board:BoardDefinition):void{const unsupported=board.cells.flatMap(c=>[...c.onPass,...c.onLand]).find(e=>e.type!=='none');if(unsupported)throw new UnprocessableEntityException(`unsupported_board_effect:${unsupported.type}`)}
function exactObject(value:unknown,keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(value,k));}
function validateSessionRequest(v:unknown):asserts v is CreateSessionRequest{
  if(!exactObject(v,['commandId','boardVersionId','initialCellId','direction'])&&!exactObject(v,['commandId','boardVersionId','initialCellId']))throw new UnprocessableEntityException('Invalid session request');
  if(!isUuid(v.commandId)||!isUuid(v.boardVersionId)||typeof v.initialCellId!=='string'||v.initialCellId.length<1||v.initialCellId.length>128||
    (v.direction!==undefined&&v.direction!=='forward'&&v.direction!=='reverse'))throw new UnprocessableEntityException('Invalid session request');
}
function validateCommand(v:unknown):asserts v is SessionCommandRequest{
  if(!exactObject(v,['commandId','sessionEpoch','expectedRevision','type','reason','payload'])||!isUuid(v.commandId)||
    !Number.isSafeInteger(v.sessionEpoch)||Number(v.sessionEpoch)<1||!Number.isSafeInteger(v.expectedRevision)||Number(v.expectedRevision)<0||
    typeof v.reason!=='string'||v.reason.trim().length<1||v.reason.length>500||!v.payload||typeof v.payload!=='object'||Array.isArray(v.payload))throw new UnprocessableEntityException('Invalid command envelope');
  if(v.type==='roll_dice'){
    if(!(exactObject(v.payload,[])||exactObject(v.payload,['count']))||(v.payload.count!==undefined&&v.payload.count!==1))throw new UnprocessableEntityException('Only one roll per command is supported');
  }else if(v.type==='set_direction'){
    if(!exactObject(v.payload,['direction'])||(v.payload.direction!=='forward'&&v.payload.direction!=='reverse'))throw new UnprocessableEntityException('Invalid direction command');
  }else if(v.type==='set_position'){
    if(!exactObject(v.payload,['cellId','pauseAutomaticMovement','triggerArrivalEffects'])||typeof v.payload.cellId!=='string'||v.payload.cellId.length<1||v.payload.cellId.length>128||v.payload.pauseAutomaticMovement!==true||v.payload.triggerArrivalEffects!==false)throw new UnprocessableEntityException('Arrival effects are not implemented');
  }else if(v.type==='pause'||v.type==='resume'||v.type==='end_session'){
    if(!exactObject(v.payload,[]))throw new UnprocessableEntityException('Lifecycle command payload must be empty');
  }else if(v.type==='adjust_inventory'){
    if(!exactObject(v.payload,['itemId','mode','quantity','expectedInventoryRevision'])||typeof v.payload.itemId!=='string'||v.payload.itemId.length<1||v.payload.itemId.length>64||
      (v.payload.mode!=='delta'&&v.payload.mode!=='set')||!Number.isSafeInteger(v.payload.quantity)||Math.abs(Number(v.payload.quantity))>100000||
      (v.payload.mode==='set'&&Number(v.payload.quantity)<0)||!Number.isSafeInteger(v.payload.expectedInventoryRevision)||Number(v.payload.expectedInventoryRevision)<0)throw new UnprocessableEntityException('Invalid inventory command');
  }else if(v.type==='create_mission'){
    if(!(exactObject(v.payload,['message','shield'])||exactObject(v.payload,['message','quantity','shield']))||typeof v.payload.message!=='string'||!v.payload.message.trim()||v.payload.message.length>500||
      (v.payload.quantity!==undefined&&(!Number.isSafeInteger(v.payload.quantity)||Number(v.payload.quantity)<1||Number(v.payload.quantity)>100000)))throw new UnprocessableEntityException('Invalid mission');
    if(v.payload.shield!==null&&(!exactObject(v.payload.shield,['itemId','quantity'])||typeof v.payload.shield.itemId!=='string'||!v.payload.shield.itemId||!Number.isSafeInteger(v.payload.shield.quantity)||Number(v.payload.shield.quantity)<1||Number(v.payload.shield.quantity)>100000))throw new UnprocessableEntityException('Invalid shield policy');
  }else if(v.type==='complete_mission'||v.type==='waive_mission'){
    if(!exactObject(v.payload,['missionId','expectedMissionRevision'])||!isUuid(v.payload.missionId)||!Number.isSafeInteger(v.payload.expectedMissionRevision)||Number(v.payload.expectedMissionRevision)<0)throw new UnprocessableEntityException('Invalid mission resolution');
  }else if(v.type==='use_shield'){
    if(!exactObject(v.payload,['missionId','expectedMissionRevision','expectedInventoryRevision'])||!isUuid(v.payload.missionId)||!Number.isSafeInteger(v.payload.expectedMissionRevision)||Number(v.payload.expectedMissionRevision)<0||!Number.isSafeInteger(v.payload.expectedInventoryRevision)||Number(v.payload.expectedInventoryRevision)<0)throw new UnprocessableEntityException('Invalid shield command');
  }else throw new UnprocessableEntityException('Unsupported command type');
}
function commandDto(row:any):SessionCommandDto{return{commandId:row.command_id,sessionId:row.session_id,sessionEpoch:row.session_epoch,presentationEpoch:Number(row.presentation_epoch),type:row.type,status:row.status,operatorId:row.operator_id,beforeRevision:Number(row.before_revision),afterRevision:Number(row.after_revision),result:row.result,rejectionCode:row.rejection_code,createdAt:new Date(row.created_at).toISOString()}}
function missionDto(row:any):MissionDto{return{id:row.id,message:row.message,quantity:row.quantity,status:row.status,shield:row.shield_item_id?{itemId:row.shield_item_id,quantity:row.shield_quantity}:null,
  revision:Number(row.revision),createdAt:new Date(row.created_at).toISOString(),resolvedAt:row.resolved_at?new Date(row.resolved_at).toISOString():null};}
type Queryable=Pick<pg.PoolClient,'query'>;
async function assertTransactionalWriteAccess(client:pg.PoolClient,operator:Operator,channelId:string):Promise<void>{
  const access=await client.query<{permission:string;role:string;disabled_at:Date|null}>(`SELECT co.permission,o.role,o.disabled_at FROM channel_operators co JOIN operators o ON o.id=co.operator_id
    WHERE co.channel_id=$1 AND co.operator_id=$2 FOR SHARE OF co,o`,[channelId,operator.id]);
  if(!access.rowCount||access.rows[0].disabled_at||access.rows[0].role==='viewer'||!['manage','operate'].includes(access.rows[0].permission))throw new ForbiddenException('Channel write access denied');
}
async function inventoryState(db:Queryable,sessionId:string,channelId:string):Promise<InventoryItemDto[]>{
  const result=await db.query<any>(`SELECT d.item_id,d.name,COALESCE(i.quantity,0) quantity,COALESCE(i.revision,0) revision,COALESCE(i.updated_at,d.created_at) updated_at
    FROM item_definitions d LEFT JOIN session_inventory i ON i.item_id=d.item_id AND i.session_id=$1 WHERE d.channel_id=$2 AND d.active=true ORDER BY d.created_at,d.item_id`,[sessionId,channelId]);
  return result.rows.map(row=>({itemId:row.item_id,name:row.name,quantity:row.quantity,revision:Number(row.revision),updatedAt:new Date(row.updated_at).toISOString()}));
}
async function missionState(db:Queryable,sessionId:string):Promise<MissionDto[]>{const result=await db.query('SELECT * FROM missions WHERE session_id=$1 ORDER BY created_at,id',[sessionId]);return result.rows.map(missionDto);}
