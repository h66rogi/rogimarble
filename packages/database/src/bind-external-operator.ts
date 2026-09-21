import { closePool, transaction } from './index.ts';

const issuer=process.env.EXTERNAL_AUTH_ISSUER?.trim();
const subject=process.env.EXTERNAL_AUTH_SUBJECT?.trim();
const username=process.env.EXTERNAL_AUTH_OPERATOR_USERNAME?.trim().toLowerCase();
if(issuer!=='rogichat'||!subject||!/^[A-Za-z0-9_-]{43}$/.test(subject)||!username){
  throw new Error('EXTERNAL_AUTH_ISSUER=rogichat, a 43-character EXTERNAL_AUTH_SUBJECT, and EXTERNAL_AUTH_OPERATOR_USERNAME are required');
}
await transaction(async client=>{
  const operator=await client.query<{id:string}>('SELECT id FROM operators WHERE username=$1 AND disabled_at IS NULL',[username]);
  if(!operator.rowCount)throw new Error('Enabled local operator not found');
  await client.query('INSERT INTO external_auth_bindings(issuer,subject,operator_id) VALUES($1,$2,$3)',[issuer,subject,operator.rows[0].id]);
});
console.log('External identity bound to existing local operator');
await closePool();
