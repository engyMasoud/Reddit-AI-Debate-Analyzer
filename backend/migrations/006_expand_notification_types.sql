-- Expand notification types to include emoji reactions and debate sides
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('vote', 'comment', 'emoji_reaction', 'debate_side'));
