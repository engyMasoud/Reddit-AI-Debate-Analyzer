// scripts/ensureTestSubreddit.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'reddit_ai_debate',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost'
    ? { rejectUnauthorized: false }
    : undefined,
});

async function ensureTestSubreddit() {
  try {
    await pool.query(
      `INSERT INTO subreddits (name, icon, color) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      ['Social', '👥', 'bg-amber-500']
    );
    console.log('Social subreddit ensured.');
  } catch (err) {
    console.error('Error ensuring Social subreddit:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

ensureTestSubreddit();
