import { readFile } from 'node:fs/promises';
import { closePool, transaction } from './index.ts';

const source=process.argv[2],channelId=process.env.ITEM_CHANNEL_ID?.trim();
if(!source||!channelId)throw new Error('Usage: ITEM_CHANNEL_ID=... import-items.ts config.json');
const value:unknown=JSON.parse(await readFile(source,'utf8'));
if(!value||typeof value!=='object'||!Array.isArray((value as {items?:unknown}).items))throw new Error('Config items are required');
const items=(value as {items:unknown[]}).items.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid item');
  const {id,label}=item as {id?:unknown;label?:unknown};
  if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)||typeof label!=='string'||!label.trim()||label.length>100)throw new Error('Invalid item definition');
  return{id,label:label.trim()};
});
if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Duplicate item id');
await transaction(async client=>{
  const channel=await client.query('SELECT 1 FROM channels WHERE id=$1',[channelId]);if(!channel.rowCount)throw new Error('Channel not found');
  for(const item of items)await client.query(`INSERT INTO item_definitions(channel_id,item_id,name) VALUES($1,$2,$3)
    ON CONFLICT(channel_id,item_id) DO NOTHING`,[channelId,item.id,item.label]);
});
console.log(`Imported ${items.length} item definitions without overwriting existing settings`);
await closePool();
