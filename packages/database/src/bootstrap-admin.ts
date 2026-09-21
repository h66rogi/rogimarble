import { randomUUID } from 'node:crypto';
import { closePool, transaction } from './index.ts';
import { hashPassword } from './password.ts';

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const channelId = process.env.BOOTSTRAP_CHANNEL_ID?.trim();
const channelName = process.env.BOOTSTRAP_CHANNEL_NAME?.trim();
if (!username || !password || !channelId || !channelName) {
  throw new Error('BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_CHANNEL_ID and BOOTSTRAP_CHANNEL_NAME are required');
}

await transaction(async (client) => {
  const existing = await client.query('SELECT 1 FROM operators WHERE username=$1', [username]);
  if (existing.rowCount) throw new Error('Bootstrap administrator already exists');
  const operatorId = randomUUID();
  await client.query('INSERT INTO operators(id, username, password_hash, role) VALUES ($1,$2,$3,$4)',
    [operatorId, username, await hashPassword(password), 'admin']);
  await client.query('INSERT INTO channels(id, display_name, owner_operator_id) VALUES ($1,$2,$3)',
    [channelId, channelName, operatorId]);
  await client.query('INSERT INTO channel_operators(channel_id, operator_id, permission) VALUES ($1,$2,$3)',
    [channelId, operatorId, 'manage']);
});
console.log('Bootstrap administrator and owned channel created');
await closePool();
