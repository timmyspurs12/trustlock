import 'server-only';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let initPromise: Promise<void> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set (expected postgresql://user:pass@127.0.0.1:5432/trustlock)');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

/** Idempotently applies lib/db/schema.sql. Safe to call from every route. */
export async function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      await getPool().query(schema);
    })();
  }
  return initPromise;
}
