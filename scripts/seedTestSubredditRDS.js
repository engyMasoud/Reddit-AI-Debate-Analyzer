const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'reddit-ai-debate-db.cx862uy86vbl.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: 'reddit_ai_debate',
    user: 'postgres',
    password: 'Ayman2246$',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const res = await c.query(
    "INSERT INTO subreddits (name, icon, member_count, color) VALUES ('test', '🧪', 0, 'bg-gray-500') ON CONFLICT (name) DO NOTHING"
  );
  console.log('Test subreddit ready! Rows:', res.rowCount);
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
