import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './index.ts';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
const client = await pool().connect();
try {
  await client.query('SELECT pg_advisory_lock($1)', [734925101]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const version of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = await readFile(resolve(directory, version), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${version}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1,$2)', [version, checksum]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('Database migrations are current');
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [734925101]).catch(() => undefined);
  client.release();
  await closePool();
}
