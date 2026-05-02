const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'ayman2246',
  host: 'localhost',
  port: 5432,
  database: 'reddit_ai_debate',
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
      console.log(`✅ ${file} completed`);
    } catch (error) {
      console.error(`❌ Error running ${file}:`, error.message);
    }
  }

  console.log('\n✨ All migrations completed!');
  await pool.end();
}

runMigrations().catch(console.error);
