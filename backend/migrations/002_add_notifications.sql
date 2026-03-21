-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('vote', 'comment')),
    source_user_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id         INTEGER     REFERENCES posts(id) ON DELETE CASCADE,
    comment_id      INTEGER     REFERENCES comments(id) ON DELETE CASCADE,
    message         TEXT        NOT NULL,
    is_read         BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
