-- Migration 007: Remove test data, ensure Home + Social subreddits exist.
-- Idempotent: safe to re-run.

-- 1. Delete every post in the 'test' subreddit (cascades to comments, votes, etc.)
DELETE FROM posts
 WHERE subreddit_id IN (SELECT id FROM subreddits WHERE name = 'test');

-- 2. Delete posts whose title suggests they are integration/test fixtures
DELETE FROM posts
 WHERE title ILIKE 'Integration Test Post%'
    OR title ILIKE 'Test Post via Lambda%'
    OR title = 'Test Post';

-- 3. Drop memberships for the 'test' subreddit, then drop the subreddit itself
DELETE FROM user_subreddit_memberships
 WHERE subreddit_id IN (SELECT id FROM subreddits WHERE name = 'test');

DELETE FROM subreddits WHERE name = 'test';

-- 4. Ensure 'Home' exists (was missing in some deployed environments)
INSERT INTO subreddits (name, icon, member_count, color)
VALUES ('Home', '🏠', 0, 'bg-blue-500')
ON CONFLICT (name) DO NOTHING;

-- 5. Ensure 'Social' is present in the community list
INSERT INTO subreddits (name, icon, member_count, color)
VALUES ('Social', '👥', 2400000, 'bg-amber-500')
ON CONFLICT (name) DO NOTHING;
