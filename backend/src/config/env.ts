import dotenv from 'dotenv';
dotenv.config();

// Constants for validation
const DEFAULT_JWT_SECRET = 'dev-secret-change-in-production';
const MIN_JWT_SECRET_LENGTH = 16;

// Helper function to validate JWT_SECRET
function validateJwtSecret(secret: string | undefined, nodeEnv: string): string {
  const isProduction = nodeEnv.toLowerCase() === 'production';

  // In production: must be explicitly set
  if (isProduction) {
    if (!secret || secret.trim() === '') {
      throw new Error('JWT_SECRET must be set in production');
    }

    // Validate minimum length
    if (secret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length})`);
    }

    // Prevent using the default value in production
    if (secret === DEFAULT_JWT_SECRET) {
      throw new Error('JWT_SECRET cannot be the default value in production');
    }
  }

  // In non-production: fall back to default if not set
  return secret || DEFAULT_JWT_SECRET;
}

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'reddit_ai_debate',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',

  JWT_SECRET: validateJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV || 'development'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  CACHE_REASONING_TTL: parseInt(process.env.CACHE_REASONING_TTL || '86400', 10),
  CACHE_FEEDBACK_TTL: parseInt(process.env.CACHE_FEEDBACK_TTL || '3600', 10),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
};
