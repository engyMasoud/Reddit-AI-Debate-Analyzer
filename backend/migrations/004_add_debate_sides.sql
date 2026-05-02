-- Migration: Add debate sides tracking

CREATE TABLE IF NOT EXISTS debate_sides (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  side VARCHAR(20) NOT NULL CHECK (side IN ('for', 'against', 'neutral')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_debate_sides_user ON debate_sides(user_id);
CREATE INDEX IF NOT EXISTS idx_debate_sides_post ON debate_sides(post_id);
CREATE INDEX IF NOT EXISTS idx_debate_sides_side ON debate_sides(side);
