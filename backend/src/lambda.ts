import serverless from 'serverless-http';
import { app } from './app';
import { pool } from './config/database';
import fs from 'fs';
import path from 'path';

// Run pending migrations on cold start so the prod DB is always up to date
async function runMigrationsOnce() {
  const migrationsDir = path.join(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[lambda] migrations dir not found, skipping');
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`[lambda] migration applied: ${file}`);
    } catch (err: any) {
      // Ignore "already exists" errors — migration was already applied
      if (err.code === '42P07' || err.code === '42701' || err.code === '42P04') {
        console.log(`[lambda] migration already applied: ${file}`);
      } else {
        console.error(`[lambda] migration error in ${file}:`, err.message);
      }
    }
  }
}

const migrationPromise = runMigrationsOnce().catch(err =>
  console.error('[lambda] migration run failed:', err.message)
);

const _serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  await migrationPromise;
  return _serverlessHandler(event, context);
};
