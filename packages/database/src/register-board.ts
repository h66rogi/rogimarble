import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { closePool, transaction } from './index.ts';
import { validateBoardDefinition, type BoardDefinition } from '../../game-core/src/board-definition.ts';

const source = process.argv[2];
const channelId = process.env.BOARD_CHANNEL_ID?.trim();
const username = process.env.BOARD_OPERATOR_USERNAME?.trim().toLowerCase();
if (!source || !channelId || !username) {
  throw new Error('Usage: BOARD_CHANNEL_ID=... BOARD_OPERATOR_USERNAME=... register-board.ts board.json');
}
const raw: unknown = JSON.parse(await readFile(source, 'utf8'));
validateBoardDefinition(raw);
const board = raw as BoardDefinition;
const unsupported = board.cells.flatMap((cell) => [...cell.onLand, ...cell.onPass]).find((effect) => effect.type !== 'none');
if (unsupported) throw new Error(`Board cannot run in this slice: unsupported effect ${unsupported.type}`);

const id = randomUUID();
await transaction(async (client) => {
  const operator = await client.query<{ id: string }>('SELECT id FROM operators WHERE username=$1 AND disabled_at IS NULL', [username]);
  if (!operator.rowCount) throw new Error('Operator not found');
  const access = await client.query('SELECT 1 FROM channel_operators WHERE channel_id=$1 AND operator_id=$2 AND permission=$3',
    [channelId, operator.rows[0].id, 'manage']);
  if (!access.rowCount) throw new Error('Operator cannot manage channel');
  await client.query(`INSERT INTO board_versions(id, channel_id, board_definition, status, supported_for_live, created_by)
    VALUES ($1,$2,$3,'validated',true,$4)`, [id, channelId, board, operator.rows[0].id]);
});
console.log(`Validated board registered: ${id}`);
await closePool();
