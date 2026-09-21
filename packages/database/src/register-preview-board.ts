import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBoardDefinition, type BoardDefinition } from '../../game-core/src/board-definition.ts';
import { closePool, transaction } from './index.ts';

const channelId=process.env.BOARD_CHANNEL_ID?.trim();
const username=process.env.BOARD_OPERATOR_USERNAME?.trim().toLowerCase();
if(!channelId||!username)throw new Error('BOARD_CHANNEL_ID and BOARD_OPERATOR_USERNAME are required');
const presetPath=resolve(dirname(fileURLToPath(import.meta.url)),'../../../presets/streamer-board.json');
const source:unknown=JSON.parse(await readFile(presetPath,'utf8'));
validateBoardDefinition(source);
const preset=source as BoardDefinition;
const board:BoardDefinition={...preset,id:`${preset.id}-safe-preview`,name:`${preset.name} · 효과 없는 격리 미리보기`,
  cells:preset.cells.map(cell=>({...cell,onLand:[{type:'none'}],onPass:[]}))};
validateBoardDefinition(board);
const id=randomUUID();
await transaction(async client=>{
  const operator=await client.query<{id:string}>('SELECT id FROM operators WHERE username=$1 AND disabled_at IS NULL',[username]);
  if(!operator.rowCount)throw new Error('Operator not found');
  const access=await client.query('SELECT 1 FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=$3',[channelId,operator.rows[0].id,'manage']);
  if(!access.rowCount)throw new Error('Operator cannot manage channel');
  await client.query(`INSERT INTO board_versions(id,channel_id,board_definition,status,supported_for_live,created_by)
    VALUES($1,$2,$3,'validated',true,$4)`,[id,channelId,board,operator.rows[0].id]);
});
console.log(`Safe 26-cell preview board registered: ${id}`);
await closePool();
