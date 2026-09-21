import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { resolveBoardFontId, resolveBoardThemeId } from '../../../packages/contracts/src/index.ts';
import type { CreateSessionRequest, GameSessionDto, InventoryItemDto, InventoryLedgerDto, MissionDto, OperatorStateDto, OverlayLayoutDto, RunnableBoardVersionDto, SessionCommandDto, SessionCommandRequest } from '../../../packages/contracts/src/index.ts';
import type { BoardDefinition } from '../../../packages/game-core/src/board-definition.ts';
import { transaction, pool } from '../../../packages/database/src/index.ts';
import type pg from 'pg';
import { decideTravel, reserveTravelTurn, type TravelReservation } from './travel-turn.ts';
import { isBoardSupportedForLive, unsupportedBoardEffects } from './board-support.ts';
import { pawnAppearance } from './pawn-assets.ts';
import { effectiveOverlayLayout } from './overlay-layout.ts';

type Operator = { id: string; role: 'admin'|'operator'|'viewer' };
export type SessionRow = { id:string; channel_id:string; status:'ready'|'running'|'paused'|'ended'; session_epoch:number; revision:string;
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
      const counters=session?await counterState(client,session.id,result.rows[0]!.board_definition!):[];
      const effectTasks=session?await effectTaskState(client,session.id):[];
      const movementLock=session?await movementLockState(client,session.id):null;
      const rollModifiers=session?await rollModifierState(client,session.id):[];
      const latest=session?await client.query('SELECT * FROM game_commands WHERE session_id=$1 AND status=\'completed\' AND result ? \'dice\' AND result ? \'path\' ORDER BY after_revision DESC,created_at DESC,command_id DESC LIMIT 1',[session.id]):{rows:[]};
      const collectorEnabled=await client.query('SELECT 1 FROM collector_consumer_cursors WHERE channel_id=$1 LIMIT 1',[channelId]);
      const overlayLayout=await effectiveOverlayLayout(client,channelId);
      const pawn=await pawnAppearance(client,channelId);
      const canOperate=operator.role!=='viewer'&&access.rows[0].permission!=='view';
      return { boardThemeId:resolveBoardThemeId(overlayLayout.layout.boardThemeId),fontId:resolveBoardFontId(overlayLayout.layout.fontId),session,boardDefinition:result.rows[0]?.board_definition??null,latestCommand:latest.rows[0]?commandDto(latest.rows[0]):null,inventory,missions,counters,effectTasks,movementLock,rollModifiers,pawnAppearance:pawn,capabilities:{ manualRoll:canOperate,setDirection:canOperate,setPosition:canOperate,
        arrivalEffects:canOperate&&!!session&&isBoardSupportedForLive(result.rows[0]!.board_definition!),donations:canOperate&&!!collectorEnabled.rowCount,inventory:canOperate,missions:canOperate,sessionLifecycle:canOperate } };
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
      for(const counter of board.counters)await client.query(`INSERT INTO session_counters(session_id,counter_id,value) VALUES($1,$2,$3)`,[id,counter.id,counter.initialValue]);
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
        assertRunnableBoard(session.board_definition);
        result=await executeRollTurn(client,session,body.commandId,operator.id,afterCommands);
      }else if(body.type==='set_direction'){result={direction:body.payload.direction};session.direction=body.payload.direction;
      }else if(body.type==='set_position'){ if(!session.board_definition.path.includes(body.payload.cellId)) throw new UnprocessableEntityException('Cell is not on board path');
        const fromCellId=session.current_cell_id;session.current_cell_id=body.payload.cellId;session.automatic_movement_paused=true;session.status='paused';
        const effects=body.payload.triggerArrivalEffects?await executeCellEffects(client,session,session.board_definition,body.payload.cellId,'land',body.commandId,operator.id,afterCommands,{index:0,movements:0,reservations:new Map()}):[];
        result={fromCellId,toCellId:session.current_cell_id,automaticMovementPaused:true,effects}; }
      else if(body.type==='choose_destination'||body.type==='cancel_destination') {
        const donationTask=(await client.query<any>(`SELECT * FROM session_effect_tasks WHERE id=$1 AND session_id=$2 AND task_type='donation_destination' FOR UPDATE`,[body.payload.taskId,sessionId])).rows[0];
        if(donationTask){
          if(donationTask.status!=='pending'||Number(donationTask.revision)!==body.payload.expectedTaskRevision)throw new ConflictException('Destination request changed');
          if(body.type==='cancel_destination'){
            await client.query(`UPDATE session_effect_tasks SET status='cancelled',revision=revision+1,resolved_at=now() WHERE id=$1`,[donationTask.id]);
            result={taskId:donationTask.id,status:'destination_cancelled'};
          }else{
            const payload={...donationTask.payload};
            if(!['operator','both'].includes(payload.selection))throw new ForbiddenException('This request accepts donor chat only');
            if(payload.selectedCellId||Date.parse(payload.expiresAt)<=Date.now())throw new ConflictException('Destination already selected or expired');
            const allowed=payload.allowedCellIds??session.board_definition.path;
            if(!session.board_definition.path.includes(body.payload.cellId)||!allowed.includes(body.payload.cellId)||(payload.excludeCurrentCell&&body.payload.cellId===session.current_cell_id))throw new UnprocessableEntityException('Invalid destination');
            payload.selectedCellId=body.payload.cellId;
            await client.query('UPDATE session_effect_tasks SET payload=$2,revision=revision+1 WHERE id=$1',[donationTask.id,payload]);
            result={taskId:donationTask.id,status:'destination_selected',cellId:body.payload.cellId};
          }
        }else{
        const task = await pendingTravel(client, sessionId);
        if (!task || task.id !== body.payload.taskId) throw new NotFoundException('Travel reservation not found');
        if (Number(task.revision) !== body.payload.expectedTaskRevision) throw new ConflictException('Travel reservation changed');
        const reservation = {...task.payload};
        if (body.type==='choose_destination') {
          if (reservation.cancelled) throw new ConflictException('Travel is already cancelled');
          assertTravelDestination(session, reservation, body.payload.cellId);
          reservation.selectedCellId=body.payload.cellId;
        } else reservation.cancelled=true;
        const lockedMovement=await client.query('SELECT 1 FROM session_movement_locks WHERE session_id=$1',[sessionId]);
        const decision=decideTravel(reservation,session.status==='paused'||Boolean(lockedMovement.rowCount));
        result=await applyTravelDecision(client,session,task,decision,body.commandId,operator.id,afterCommands);
        }
      }
      else if(body.type==='adjust_counter'){
        const counter=(await client.query<any>('SELECT * FROM session_counters WHERE session_id=$1 AND counter_id=$2 FOR UPDATE',[sessionId,body.payload.counterId])).rows[0];
        if(!counter)throw new NotFoundException('Counter not found');
        if(Number(counter.revision)!==body.payload.expectedCounterRevision)throw new ConflictException('Counter changed');
        const reserved=Number((await client.query(`SELECT COALESCE(sum(settlement_amount),0) reserved FROM missions WHERE session_id=$1 AND settlement_counter_id=$2 AND status='pending' AND settlement_on='mission_completion'`,[sessionId,body.payload.counterId])).rows[0].reserved);
        if(body.payload.quantity<reserved)throw new UnprocessableEntityException('청산 대기 수량보다 적게 설정할 수 없습니다.');
        await client.query('UPDATE session_counters SET value=$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND counter_id=$2',[sessionId,body.payload.counterId,body.payload.quantity]);
        result={counterId:body.payload.counterId,beforeQuantity:counter.value,quantity:body.payload.quantity,reserved};
      }else if(body.type==='clear_movement_lock'){
        const removed=await client.query('DELETE FROM session_movement_locks WHERE session_id=$1 RETURNING release_type,rolls_remaining',[sessionId]);
        if(!removed.rowCount)throw new ConflictException('이미 이동 제한이 해제되었습니다.');result={clearedLock:removed.rows[0]};
      }else if(body.type==='clear_roll_modifier'){
        const removed=await client.query('DELETE FROM session_roll_modifiers WHERE session_id=$1 AND id=$2 RETURNING factor,uses_remaining',[sessionId,body.payload.modifierId]);
        if(!removed.rowCount)throw new ConflictException('이미 이동 배수가 해제되었습니다.');result={clearedModifier:removed.rows[0]};
      }else if(body.type==='apply_board_version'){
        if(session.status!=='paused'||!session.automatic_movement_paused)throw new ConflictException('Board version can only change while movement is paused');
        if(body.payload.boardVersionId===session.board_version_id)throw new ConflictException('Board version is already active');
        const target=await client.query<{id:string;board_definition:BoardDefinition}>(`SELECT id,board_definition FROM board_versions WHERE id=$1 AND channel_id=$2 AND status='validated' AND supported_for_live=true FOR SHARE`,[body.payload.boardVersionId,channelId]);
        if(!target.rowCount)throw new NotFoundException('Runnable board version not found');
        assertRunnableBoard(target.rows[0].board_definition);assertCompatibleBoardTransition(session.board_definition,target.rows[0].board_definition);
        const previousBoardVersionId=session.board_version_id;session.board_version_id=target.rows[0].id;session.board_definition=target.rows[0].board_definition;
        result={previousBoardVersionId,boardVersionId:session.board_version_id};
      }
      else if(body.type==='pause'){if(session.status!=='running')throw new ConflictException('Only a running session can pause');session.status='paused';session.automatic_movement_paused=true;result={status:'paused'};}
      else if(body.type==='resume'){if(session.status!=='paused')throw new ConflictException('Only a paused session can resume');session.status='running';session.automatic_movement_paused=false;result={status:'running'};
        const task=await pendingTravel(client,sessionId);
        const lock=await client.query('SELECT 1 FROM session_movement_locks WHERE session_id=$1',[sessionId]);
        if(task&&!lock.rowCount&&task.payload.reservedTurnCommandId)result=await applyTravelDecision(client,session,task,decideTravel(task.payload,false),body.commandId,operator.id,afterCommands);
      }
      else if(body.type==='end_session'){if(!['ready','running','paused'].includes(session.status))throw new ConflictException('Session cannot end');
        const pending=await client.query('SELECT 1 FROM missions WHERE session_id=$1 AND status=\'pending\' LIMIT 1',[sessionId]);if(pending.rowCount)throw new ConflictException('Pending missions must be resolved before ending session');
        const pendingTask=await client.query(`SELECT 1 FROM session_effect_tasks WHERE session_id=$1 AND status='pending' LIMIT 1`,[sessionId]);if(pendingTask.rowCount)throw new ConflictException('Pending effect tasks must be resolved before ending session');
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
        if(mission.settlement_on==='mission_completion'&&mission.settlement_counter_id&&mission.settlement_amount){
          const counter=await client.query<{value:number}>('SELECT value FROM session_counters WHERE session_id=$1 AND counter_id=$2 FOR UPDATE',[sessionId,mission.settlement_counter_id]);
          if(!counter.rowCount||counter.rows[0].value<mission.settlement_amount)throw new ConflictException('Settlement counter changed');
          await client.query('UPDATE session_counters SET value=value-$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND counter_id=$2',[sessionId,mission.settlement_counter_id,mission.settlement_amount]);
        }
        const resolvedAt=new Date();const resolved={...mission,status,revision:String(Number(mission.revision)+1),resolved_at:resolvedAt};
        result={mission:missionDto(resolved),...(inventory?{inventory}:{})};
        afterCommands.push(()=>client.query('UPDATE missions SET status=$2,revision=revision+1,resolved_by_command_id=$3,resolved_at=$4 WHERE id=$1',[mission.id,status,body.commandId,resolvedAt]).then(()=>undefined));
      }
      const invalidatesPresentation=body.type==='set_position'||body.type==='end_session'||body.type==='choose_destination'||body.type==='cancel_destination'||body.type==='apply_board_version'||(body.type==='resume'&&!!result&&typeof result==='object'&&'travelTaskId' in result);
      const updated=await client.query<SessionRow>(`UPDATE game_sessions SET current_cell_id=$2,direction=$3,automatic_movement_paused=$4,status=$5,revision=revision+1,presentation_epoch=presentation_epoch+$6,board_version_id=$7,updated_at=now() WHERE id=$1 RETURNING *`,
        [session.id,session.current_cell_id,session.direction,session.automatic_movement_paused,session.status,invalidatesPresentation?1:0,session.board_version_id]);
      updated.rows[0].board_definition=session.board_definition;
      const after=this.dto(updated.rows[0]);
      const inserted=await client.query(`INSERT INTO game_commands(command_id,channel_id,session_id,operator_id,type,request_hash,status,before_revision,after_revision,result,reason,session_epoch,presentation_epoch)
        VALUES($1,$2,$3,$4,$5,$6,'completed',$7,$8,$9,$10,$11,$12) RETURNING *`,[body.commandId,channelId,sessionId,operator.id,body.type,hash,before.revision,after.revision,result,body.reason,after.sessionEpoch,after.presentationEpoch]);
      for(const action of afterCommands)await action();
      await client.query(`INSERT INTO operation_ledger(id,command_id,channel_id,session_id,operator_id,operation_type,before_state,after_state,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),body.commandId,channelId,sessionId,operator.id,body.type,before,after,body.reason]);
      await client.query(`INSERT INTO game_outbox(id,aggregate_id,event_type,payload) VALUES($1,$2,'session.command.completed',$3)`,[randomUUID(),sessionId,{commandId:body.commandId,result,session:after}]);
      if(isMovementResult(result)){const delay=movementPresentationDelay(result);await client.query(`INSERT INTO collector_dispatch_state(channel_id,next_movement_at) VALUES($1,now()+($2::text||' milliseconds')::interval) ON CONFLICT(channel_id) DO UPDATE SET next_movement_at=GREATEST(collector_dispatch_state.next_movement_at,excluded.next_movement_at),updated_at=now()`,[channelId,delay]);}
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
function assertRunnableBoard(board:BoardDefinition):void{const unsupported=unsupportedBoardEffects(board);if(unsupported.length)throw new UnprocessableEntityException(`unsupported_board_effect:${unsupported.join(',')}`)}
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
  }else if(v.type==='adjust_counter'){
    if(!exactObject(v.payload,['counterId','quantity','expectedCounterRevision'])||typeof v.payload.counterId!=='string'||!v.payload.counterId||v.payload.counterId.length>128||!Number.isSafeInteger(v.payload.quantity)||Number(v.payload.quantity)<0||Number(v.payload.quantity)>100000||!Number.isSafeInteger(v.payload.expectedCounterRevision)||Number(v.payload.expectedCounterRevision)<0)throw new UnprocessableEntityException('Invalid counter adjustment');
  }else if(v.type==='clear_movement_lock'){
    if(!exactObject(v.payload,[]))throw new UnprocessableEntityException('Invalid lock command');
  }else if(v.type==='clear_roll_modifier'){
    if(!exactObject(v.payload,['modifierId'])||!isUuid(v.payload.modifierId))throw new UnprocessableEntityException('Invalid modifier command');
  }else if(v.type==='apply_board_version'){
    if(!exactObject(v.payload,['boardVersionId'])||!isUuid(v.payload.boardVersionId))throw new UnprocessableEntityException('Invalid board version command');
  }else if(v.type==='choose_destination'||v.type==='cancel_destination'){
    const keys=v.type==='choose_destination'?['taskId','cellId','expectedTaskRevision']:['taskId','expectedTaskRevision'];
    if(!exactObject(v.payload,keys)||!isUuid(v.payload.taskId)||!Number.isSafeInteger(v.payload.expectedTaskRevision)||Number(v.payload.expectedTaskRevision)<0||(v.type==='choose_destination'&&(typeof v.payload.cellId!=='string'||!v.payload.cellId||v.payload.cellId.length>128)))throw new UnprocessableEntityException('Invalid travel command');
  }else if(v.type==='set_direction'){
    if(!exactObject(v.payload,['direction'])||(v.payload.direction!=='forward'&&v.payload.direction!=='reverse'))throw new UnprocessableEntityException('Invalid direction command');
  }else if(v.type==='set_position'){
    if(!exactObject(v.payload,['cellId','pauseAutomaticMovement','triggerArrivalEffects'])||typeof v.payload.cellId!=='string'||v.payload.cellId.length<1||v.payload.cellId.length>128||v.payload.pauseAutomaticMovement!==true||typeof v.payload.triggerArrivalEffects!=='boolean')throw new UnprocessableEntityException('Invalid position command');
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
export function assertCompatibleBoardTransition(current:BoardDefinition,target:BoardDefinition):void{
  const behavior=(board:BoardDefinition)=>({path:board.path,startCellId:board.startCellId,defaultDirection:board.defaultDirection,counters:board.counters,
    cells:[...board.cells].sort((a,b)=>a.id.localeCompare(b.id)).map(cell=>({id:cell.id,onLand:cell.onLand,onPass:cell.onPass}))});
  if(canonicalJson(behavior(current))!==canonicalJson(behavior(target)))throw new UnprocessableEntityException('Board version changes game behavior or stable cell identities');
}
function canonicalJson(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;return JSON.stringify(value);}
function missionDto(row:any):MissionDto{return{durationSeconds:row.duration_seconds??null,id:row.id,message:row.message,quantity:row.quantity,status:row.status,shield:row.shield_item_id?{itemId:row.shield_item_id,quantity:row.shield_quantity}:null,
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
async function counterState(db:Queryable,sessionId:string,board:BoardDefinition){
  const rows=await db.query<any>(`SELECT c.counter_id,c.value,c.revision,COALESCE(sum(m.settlement_amount) FILTER (WHERE m.status='pending' AND m.settlement_on='mission_completion'),0) reserved
    FROM session_counters c LEFT JOIN missions m ON m.session_id=c.session_id AND m.settlement_counter_id=c.counter_id WHERE c.session_id=$1 GROUP BY c.counter_id,c.value,c.revision`,[sessionId]);
  const defs=new Map(board.counters.map(counter=>[counter.id,counter]));return rows.rows.map(row=>{const def=defs.get(row.counter_id);const reserved=Number(row.reserved);return{counterId:row.counter_id,label:def?.label??row.counter_id,unit:def?.unit??'',value:row.value,reserved,available:row.value-reserved,revision:Number(row.revision)}});
}
async function effectTaskState(db:Queryable,sessionId:string){const result=await db.query<any>('SELECT * FROM session_effect_tasks WHERE session_id=$1 ORDER BY created_at,id',[sessionId]);return result.rows.map(row=>({id:row.id,type:row.task_type,payload:row.payload,status:row.status,revision:Number(row.revision),createdAt:new Date(row.created_at).toISOString()}));}
async function movementLockState(db:Queryable,sessionId:string){const result=await db.query<any>('SELECT * FROM session_movement_locks WHERE session_id=$1',[sessionId]);if(!result.rowCount)return null;const row=result.rows[0];return{releaseType:row.release_type,rollsRemaining:row.rolls_remaining,release:row.release_payload,createdAt:new Date(row.created_at).toISOString()};}
async function rollModifierState(db:Queryable,sessionId:string){const result=await db.query<any>('SELECT * FROM session_roll_modifiers WHERE session_id=$1 ORDER BY created_at,id',[sessionId]);return result.rows.map(row=>({id:row.id,type:row.modifier_type,factor:row.factor,usesRemaining:row.uses_remaining,createdAt:new Date(row.created_at).toISOString()}));}

export type EffectContext={index:number;movements:number;reservations:Map<string,number>;travelCreated?:boolean};
async function executeMovementEffects(client:pg.PoolClient,session:SessionRow,board:BoardDefinition,path:readonly string[],commandId:string,operatorId:string|null,after:(()=>Promise<void>)[],ctx:EffectContext={index:0,movements:0,reservations:new Map()}){
  const results:any[]=[];for(const cellId of path.slice(0,-1))results.push(...await executeCellEffects(client,session,board,cellId,'pass',commandId,operatorId,after,ctx));
  const destination=path.at(-1);if(destination)results.push(...await executeCellEffects(client,session,board,destination,'land',commandId,operatorId,after,ctx));return results;
}
export async function executeCellEffects(client:pg.PoolClient,session:SessionRow,board:BoardDefinition,cellId:string,trigger:'pass'|'land',commandId:string,operatorId:string|null,after:(()=>Promise<void>)[],ctx:EffectContext):Promise<any[]>{
  const cell=board.cells.find(candidate=>candidate.id===cellId);if(!cell)throw new UnprocessableEntityException('Effect cell missing');const effects=trigger==='pass'?cell.onPass:cell.onLand;const results:any[]=[];
  for(const effect of effects){if(++ctx.index>128)throw new UnprocessableEntityException('Effect chain exceeds safety limit');const index=ctx.index;let result:unknown={};
    if(effect.type==='none'){result={};}
    else if(effect.type==='mission'){const id=randomUUID(),createdAt=new Date();after.push(()=>client.query(`INSERT INTO missions(id,session_id,message,quantity,status,shield_item_id,shield_quantity,created_by_command_id,source_effect_index,created_at,duration_seconds) VALUES($1,$2,$3,1,'pending',$4,$5,$6,$7,$8,$9)`,[id,session.id,effect.message,effect.shield?.itemId??null,effect.shield?.quantity??null,commandId,index,createdAt,effect.durationSeconds]).then(()=>undefined));result={missionId:id,message:effect.message,durationSeconds:effect.durationSeconds};}
    else if(effect.type==='set_direction'){session.direction=effect.direction==='toggle'?(session.direction==='forward'?'reverse':'forward'):effect.direction;result={direction:session.direction};}
    else if(effect.type==='counter_add'){const changed=(await client.query<any>('UPDATE session_counters SET value=value+$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND counter_id=$2 RETURNING value,revision',[session.id,effect.counterId,effect.quantity])).rows[0];if(!changed)throw new UnprocessableEntityException('Counter missing');result={counterId:effect.counterId,value:changed.value,revision:Number(changed.revision)};}
    else if(effect.type==='counter_settle'){const counter=(await client.query<any>('SELECT value FROM session_counters WHERE session_id=$1 AND counter_id=$2 FOR UPDATE',[session.id,effect.counterId])).rows[0];if(!counter)throw new UnprocessableEntityException('Counter missing');const persisted=Number((await client.query<any>(`SELECT COALESCE(sum(settlement_amount),0) value FROM missions WHERE session_id=$1 AND settlement_counter_id=$2 AND settlement_on='mission_completion' AND status='pending'`,[session.id,effect.counterId])).rows[0].value),reserved=persisted+(ctx.reservations.get(effect.counterId)??0);const amount=counter.value-reserved;if(amount>0){const id=randomUUID(),createdAt=new Date();if(effect.settleOn==='creation')await client.query('UPDATE session_counters SET value=value-$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND counter_id=$2',[session.id,effect.counterId,amount]);else ctx.reservations.set(effect.counterId,(ctx.reservations.get(effect.counterId)??0)+amount);after.push(()=>client.query(`INSERT INTO missions(id,session_id,message,quantity,status,shield_item_id,shield_quantity,created_by_command_id,source_effect_index,settlement_counter_id,settlement_amount,settlement_on,created_at) VALUES($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$4,$10,$11)`,[id,session.id,effect.message,amount,effect.shield?.itemId??null,effect.shield?.quantity??null,commandId,index,effect.counterId,effect.settleOn,createdAt]).then(()=>undefined));result={missionId:id,counterId:effect.counterId,quantity:amount,settleOn:effect.settleOn};}else result={counterId:effect.counterId,quantity:0};}
    else if(effect.type==='modify_roll'&&effect.modifier.type==='movement_multiplier'){const factor=effect.modifier.factor,uses=effect.uses;after.push(()=>client.query(`INSERT INTO session_roll_modifiers(id,session_id,modifier_type,factor,uses_remaining,source_command_id,source_effect_index) VALUES($1,$2,'movement_multiplier',$3,$4,$5,$6) ON CONFLICT(session_id,modifier_type) DO UPDATE SET id=excluded.id,factor=excluded.factor,uses_remaining=excluded.uses_remaining,source_command_id=excluded.source_command_id,source_effect_index=excluded.source_effect_index,created_at=now()`,[randomUUID(),session.id,factor,uses,commandId,index]).then(()=>undefined));result={modifierType:'movement_multiplier',factor,uses};}
    else if(effect.type==='grant_item'){const definition=(await client.query<any>('SELECT max_quantity FROM item_definitions WHERE channel_id=$1 AND item_id=$2 AND active=true',[session.channel_id,effect.itemId])).rows[0];if(!definition)throw new UnprocessableEntityException('Effect item unavailable');await client.query('INSERT INTO session_inventory(session_id,item_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[session.id,effect.itemId]);const before=(await client.query<any>('SELECT * FROM session_inventory WHERE session_id=$1 AND item_id=$2 FOR UPDATE',[session.id,effect.itemId])).rows[0];if(before.quantity+effect.quantity>definition.max_quantity)throw new UnprocessableEntityException('Effect item maximum exceeded');const changed=(await client.query<any>('UPDATE session_inventory SET quantity=quantity+$3,revision=revision+1,updated_at=now() WHERE session_id=$1 AND item_id=$2 RETURNING *',[session.id,effect.itemId,effect.quantity])).rows[0];after.push(()=>client.query(`INSERT INTO inventory_ledger(id,command_id,source_effect_index,session_id,item_id,before_quantity,delta,after_quantity,before_revision,after_revision,operator_id,reason,source_kind,donation_inbox_id) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'board effect',source_kind,donation_inbox_id FROM game_commands WHERE command_id=$2`,[randomUUID(),commandId,index,session.id,effect.itemId,before.quantity,effect.quantity,changed.quantity,before.revision,changed.revision,operatorId]).then(()=>undefined));result={itemId:effect.itemId,quantity:changed.quantity};}
    else if(effect.type==='move_steps'){ctx.movements+=effect.steps;if(ctx.movements>1000)throw new UnprocessableEntityException('Effect movement exceeds safety limit');const direction=effect.direction==='with_current'?session.direction:effect.direction==='against_current'?(session.direction==='forward'?'reverse':'forward'):effect.direction;const start=board.path.indexOf(session.current_cell_id),sign=direction==='forward'?1:-1;const path=Array.from({length:effect.steps},(_,i)=>board.path[(start+sign*(i+1)+board.path.length*effect.steps)%board.path.length]);session.current_cell_id=path.at(-1)!;const nested:any[]=[];if(effect.onPass==='trigger')for(const passed of path.slice(0,-1))nested.push(...await executeCellEffects(client,session,board,passed,'pass',commandId,operatorId,after,ctx));if(effect.onArrival==='trigger')nested.push(...await executeCellEffects(client,session,board,session.current_cell_id,'land',commandId,operatorId,after,ctx));result={direction,path,toCellId:session.current_cell_id,effects:nested};}
    else if(effect.type==='choose_destination'&&effect.timing==='next_turn'&&effect.selection!=='donor_chat'){
      if(ctx.travelCreated||await pendingTravel(client,session.id))throw new ConflictException('A travel reservation is already pending');
      ctx.travelCreated=true;const id=randomUUID();const payload:TravelReservation={...effect,selectedCellId:null,reservedTurnCommandId:null,cancelled:false};
      after.push(()=>client.query(`INSERT INTO session_effect_tasks(id,session_id,task_type,payload,source_command_id,source_effect_index) VALUES($1,$2,'choose_destination',$3,$4,$5)`,[id,session.id,JSON.stringify(payload),commandId,index]).then(()=>undefined));result={taskId:id,timing:'next_turn'};
    }
    else if(effect.type==='movement_lock'){after.push(()=>client.query(`INSERT INTO session_movement_locks(session_id,release_type,rolls_remaining,release_payload,source_command_id,source_effect_index) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id) DO UPDATE SET release_type=excluded.release_type,rolls_remaining=excluded.rolls_remaining,release_payload=excluded.release_payload,source_command_id=excluded.source_command_id,source_effect_index=excluded.source_effect_index,created_at=now()`,[session.id,effect.release.type,'count'in effect.release?effect.release.count:null,effect.release,commandId,index]).then(()=>undefined));result={release:effect.release};}
    else throw new UnprocessableEntityException('unsupported_board_effect');
    results.push({index,cellId,trigger,type:effect.type,result});
  }return results;
}

type TravelRow={id:string;revision:string;payload:TravelReservation};
async function pendingTravel(client:pg.PoolClient,sessionId:string):Promise<TravelRow|null>{
  const r=await client.query<TravelRow>(`SELECT id,revision,payload FROM session_effect_tasks WHERE session_id=$1 AND task_type='choose_destination' AND status='pending' ORDER BY created_at,id LIMIT 1 FOR UPDATE`,[sessionId]);
  return r.rows[0]??null;
}
function assertTravelDestination(session:SessionRow,reservation:TravelReservation,cellId:string){
  if(!session.board_definition!.path.includes(cellId)||(reservation.allowedCellIds&&!reservation.allowedCellIds.includes(cellId))||(reservation.excludeCurrentCell&&cellId===session.current_cell_id))throw new UnprocessableEntityException('Destination is not allowed from the current position');
}
async function applyTravelDecision(client:pg.PoolClient,session:SessionRow,task:TravelRow,decision:ReturnType<typeof decideTravel>,commandId:string,operatorId:string|null,after:(()=>Promise<void>)[]):Promise<unknown>{
  const fromCellId=session.current_cell_id;
  if(decision.type==='wait'){
    await client.query('UPDATE session_effect_tasks SET payload=$2,revision=revision+1 WHERE id=$1',[task.id,JSON.stringify(decision.reservation)]);
    return {travelTaskId:task.id,travelStatus:'waiting',reservedTurnCommandId:decision.reservation.reservedTurnCommandId,selectedCellId:decision.reservation.selectedCellId,dice:[],distance:0,path:[],fromCellId,toCellId:fromCellId};
  }
  const status=decision.type==='move'?'resolved':'cancelled';
  await client.query('UPDATE session_effect_tasks SET payload=$2,status=$3,revision=revision+1,resolved_at=now() WHERE id=$1',[task.id,JSON.stringify(decision.reservation),status]);
  if(decision.type==='cancel')return{travelTaskId:task.id,travelStatus:'cancelled'};
  if(decision.type==='return_turn')return{...await executeNormalRoll(client,session,commandId,operatorId,after),travelTaskId:task.id,travelStatus:'returned',reservedTurnCommandId:decision.turnCommandId};
  assertTravelDestination(session,decision.reservation,decision.cellId);
  session.current_cell_id=decision.cellId;
  const effects=decision.reservation.onArrival==='trigger'?await executeCellEffects(client,session,session.board_definition!,decision.cellId,'land',commandId,operatorId,after,{index:0,movements:0,reservations:new Map()}):[];
  return{dice:[],distance:0,direction:session.direction,path:[decision.cellId],fromCellId,toCellId:session.current_cell_id,effects,travelTaskId:task.id,travelStatus:'moved',reservedTurnCommandId:decision.turnCommandId};
}
export async function executeRollTurn(client:pg.PoolClient,session:SessionRow,commandId:string,operatorId:string|null,after:(()=>Promise<void>)[]){
  const task=await pendingTravel(client,session.id);
  const lockedMovement=await client.query('SELECT 1 FROM session_movement_locks WHERE session_id=$1',[session.id]);
  if(!task||lockedMovement.rowCount)return executeNormalRoll(client,session,commandId,operatorId,after);
  const decision=task.payload.reservedTurnCommandId?decideTravel(task.payload,false):reserveTravelTurn(task.payload,commandId);
  if(task.payload.reservedTurnCommandId&&decision.type==='wait')throw new ConflictException('여행 목적지를 확정하거나 여행을 취소해 주세요.');
  return applyTravelDecision(client,session,task,decision,commandId,operatorId,after);
}
export async function executeNormalRoll(client:pg.PoolClient,session:SessionRow,commandId:string,operatorId:string|null,after:(()=>Promise<void>)[],effectContext?:EffectContext){
  const board=session.board_definition!;assertRunnableBoard(board);
  const active=(await client.query<any>('SELECT * FROM session_movement_locks WHERE session_id=$1 FOR UPDATE',[session.id])).rows[0];
  const count=active?.release_type==='dice_faces'?1:active?.release_type==='skip_rolls_or_doubles'?2:board.dice.count;
  const noDice=active?.release_type==='operator'||active?.release_type==='skip_rolls';
  const dice=noDice?[]:Array.from({length:count},()=>randomInt(1,board.dice.sides+1));
  let distance=dice.reduce((a,b)=>a+b,0);
  if(active){
    const release=active.release_payload;
    if(active.release_type==='skip_rolls_or_doubles'){
      if(dice[0]===dice[1]){await client.query('DELETE FROM session_movement_locks WHERE session_id=$1',[session.id]);if(release.onDoubles==='release_only')distance=0;}
      else{const left=active.rolls_remaining-1;if(left<=0)await client.query('DELETE FROM session_movement_locks WHERE session_id=$1',[session.id]);else await client.query('UPDATE session_movement_locks SET rolls_remaining=$2 WHERE session_id=$1',[session.id,left]);distance=0;}
    }else if(active.release_type==='dice_faces'){
      if(release.faces.includes(dice[0]))await client.query('DELETE FROM session_movement_locks WHERE session_id=$1',[session.id]);distance=0;
    }else if(active.release_type==='skip_rolls'){
      const left=active.rolls_remaining-1;if(left<=0)await client.query('DELETE FROM session_movement_locks WHERE session_id=$1',[session.id]);else await client.query('UPDATE session_movement_locks SET rolls_remaining=$2 WHERE session_id=$1',[session.id,left]);distance=0;
    }else distance=0;
  }
  if(distance>0){const modifiers=await client.query<any>('SELECT * FROM session_roll_modifiers WHERE session_id=$1 ORDER BY created_at,id FOR UPDATE',[session.id]);for(const modifier of modifiers.rows){distance*=modifier.factor;if(modifier.uses_remaining===1)await client.query('DELETE FROM session_roll_modifiers WHERE id=$1',[modifier.id]);else await client.query('UPDATE session_roll_modifiers SET uses_remaining=uses_remaining-1 WHERE id=$1',[modifier.id]);}}
  if(!Number.isSafeInteger(distance)||distance>1000)throw new UnprocessableEntityException('Modified movement exceeds safety limit');
  const start=board.path.indexOf(session.current_cell_id);if(start<0)throw new UnprocessableEntityException('Current cell is not on board path');
  const direction=session.direction,sign=direction==='forward'?1:-1;
  const path=Array.from({length:distance},(_,i)=>board.path[((start+sign*(i+1))%board.path.length+board.path.length)%board.path.length]);
  const fromCellId=session.current_cell_id;session.current_cell_id=path.at(-1)??fromCellId;
  const effects=await executeMovementEffects(client,session,board,path,commandId,operatorId,after,effectContext);
  return{dice,distance,direction,path,fromCellId,toCellId:session.current_cell_id,effects,...(active?{lockAttempt:active.release_type}:{})};
}
function isMovementResult(value:unknown):value is {dice:unknown[];path:unknown[]}{return !!value&&typeof value==='object'&&Array.isArray((value as any).dice)&&Array.isArray((value as any).path);}
export function movementPresentationDelay(value:unknown){let steps=0;const visit=(item:unknown,key='')=>{if(Array.isArray(item)){if(key==='path')steps+=item.length;else for(const child of item)visit(child);}else if(item&&typeof item==='object')for(const [childKey,child] of Object.entries(item))visit(child,childKey);};visit(value);return Math.min(30000,3500+steps*600);}
