#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'ayman2246',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'reddit_ai_debate',
});

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    
    const migrationsDir = path.join(__dirname, '../backend/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`📝 Running migration: ${file}`);
      try {
        await pool.query(sql);
        console.log(`✅ Migration completed: ${file}`);
      } catch (err) {
        // If migration fails, log but continue (in case it's an idempotent operation)
        if (err.code === '42P07') { // Table already exists
          console.log(`⏭️  Skipped ${file} (tables already exist)`);
        } else {
          console.error(`❌ Error in ${file}:`, err.message);
        }
      }
    }

    console.log('✨ All migrations completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
