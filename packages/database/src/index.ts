import pg from 'pg';
import { readFileSync } from 'node:fs';

const { Pool } = pg;
let sharedPool: pg.Pool | undefined;

export function databaseUrl(): string {
  if(process.env.DATABASE_URL&&process.env.DATABASE_URL_FILE)throw new Error('Set only one of DATABASE_URL or DATABASE_URL_FILE');
  const value = process.env.DATABASE_URL_FILE?readFileSync(process.env.DATABASE_URL_FILE,'utf8').trim():process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export function pool(): pg.Pool {
  sharedPool ??= new Pool({ connectionString: databaseUrl(), max: 10 });
  return sharedPool;
}

export async function closePool(): Promise<void> {
  if (sharedPool) await sharedPool.end();
  sharedPool = undefined;
}

export async function transaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
