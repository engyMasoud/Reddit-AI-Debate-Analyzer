import serverless from 'serverless-http';
import { app, reasoningSummaryService } from './app';
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

let migrationsComplete = false;
let migrationsRunning = false;
const migrationPromise = runMigrationsOnce()
  .then(() => { migrationsComplete = true; })
  .catch(err => {
    console.error('[lambda] migration run failed:', err.message);
    migrationsComplete = true; // don't block forever on error
  });

const _serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Only await migrations for background jobs; HTTP requests proceed immediately.
  // Migrations run idempotently, so warm-start requests are unaffected.
  if (event?.type === 'generate_reasoning_summary') {
    await migrationPromise;
  }

  // ── Background job: generate reasoning summary ──
  if (event?.type === 'generate_reasoning_summary') {
    const { commentId, commentText, commentPostId } = event;
    console.log(`[lambda] background: generating reasoning summary for comment ${commentId}`);
    try {
      await reasoningSummaryService.generateAndCacheSummary({
        id: commentId,
        text: commentText,
        postId: commentPostId,
      } as any);
      console.log(`[lambda] background: summary saved for comment ${commentId}`);
    } catch (err: any) {
      console.error(`[lambda] background: failed to generate summary for comment ${commentId}:`, err.message);
    }
    return;
  }

  // ── Normal HTTP request ──
  return _serverlessHandler(event, context);
};
