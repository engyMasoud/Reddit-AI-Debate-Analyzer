const pg = require('pg');
const pool = new pg.Pool({
  user: 'postgres',
  password: 'ayman2246',
  host: 'localhost',
  port: 5432,
  database: 'reddit_ai_debate'
});

async function createTestPoll() {
  try {
    // Insert a poll for post 31
    const pollRes = await pool.query(
      'INSERT INTO polls (post_id, question, ends_at) VALUES ($1, $2, $3) RETURNING id',
      [31, 'Is social media more harmful than beneficial?', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );
    
    const pollId = pollRes.rows[0].id;
    console.log('Created poll:', pollId);
    
    // Insert poll options
    const options = [
      'Yes, definitely harmful',
      'No, it has more benefits',
      'Neutral - depends on usage',
      'Not sure'
    ];
    
    for (let i = 0; i < options.length; i++) {
      await pool.query(
        'INSERT INTO poll_options (poll_id, text, position) VALUES ($1, $2, $3)',
        [pollId, options[i], i]
      );
      console.log(`  Option ${i + 1}: ${options[i]}`);
    }
    
    console.log('\n✅ Test poll created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating poll:', error.message);
    process.exit(1);
  }
}

createTestPoll();
