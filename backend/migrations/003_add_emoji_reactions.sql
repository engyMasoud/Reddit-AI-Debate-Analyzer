-- Migration: Add emoji reactions support

CREATE TABLE IF NOT EXISTS emoji_reactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id INT NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, target_type, target_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_target ON emoji_reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON emoji_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_emoji ON emoji_reactions(emoji);
