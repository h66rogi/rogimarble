import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { closePool, transaction } from './index.ts';
import { assertBoardPublishable, validateBoardDefinition, type BoardDefinition } from '../../game-core/src/board-definition.ts';
import { unsupportedBoardEffects } from '../../game-core/src/runtime-support.ts';
import { knownAssetIds } from '../../asset-manifest/src/index.ts';

const source = process.argv[2];
const channelId = process.env.BOARD_CHANNEL_ID?.trim();
const username = process.env.BOARD_OPERATOR_USERNAME?.trim().toLowerCase();
if (!source || !channelId || !username) {
  throw new Error('Usage: BOARD_CHANNEL_ID=... BOARD_OPERATOR_USERNAME=... register-board.ts board.json');
}
const raw: unknown = JSON.parse(await readFile(source, 'utf8'));
validateBoardDefinition(raw);
const board = raw as BoardDefinition;
const unsupported = unsupportedBoardEffects(board);
if (unsupported.length) throw new Error(`Board cannot run: unsupported effects ${unsupported.join(',')}`);

const id = await transaction(async (client) => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`board-import:${channelId}:${board.id}`]);
  const operator = await client.query<{ id: string }>('SELECT id FROM operators WHERE username=$1 AND disabled_at IS NULL', [username]);
  if (!operator.rowCount) throw new Error('Operator not found');
  const access = await client.query('SELECT 1 FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=$3',
    [channelId, operator.rows[0].id, 'manage']);
  if (!access.rowCount) throw new Error('Operator cannot manage channel');
  const items=await client.query<{item_id:string}>('SELECT item_id FROM item_definitions WHERE channel_id=$1 AND active=true',[channelId]);
  assertBoardPublishable(board,{itemIds:items.rows.map(row=>row.item_id),assetIds:knownAssetIds});
  const existing=await client.query<{id:string;matches:boolean}>(`SELECT id,board_definition=$3::jsonb matches FROM board_versions WHERE channel_id=$1 AND board_definition->>'id'=$2 ORDER BY created_at DESC LIMIT 1`,[channelId,board.id,board]);
  if(existing.rowCount){if(!existing.rows[0].matches)throw new Error('Board id already exists with different content');await client.query(`UPDATE board_versions SET status='validated',supported_for_live=true WHERE id=$1`,[existing.rows[0].id]);return existing.rows[0].id;}
  const created=randomUUID();await client.query(`INSERT INTO board_versions(id, channel_id, board_definition, status, supported_for_live, created_by)
    VALUES ($1,$2,$3,'validated',true,$4)`, [created, channelId, board, operator.rows[0].id]);return created;
});
console.log(`Validated board registered: ${id}`);
await closePool();
