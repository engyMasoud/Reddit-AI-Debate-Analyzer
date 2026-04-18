-- Migration: Add Google OAuth support to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google'));

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
