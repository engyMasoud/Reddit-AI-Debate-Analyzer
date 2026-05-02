import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'reddit_ai_debate',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',

  JWT_SECRET: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return secret || 'dev-secret-change-in-production';
  })(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  CACHE_REASONING_TTL: parseInt(process.env.CACHE_REASONING_TTL || '86400', 10),
  CACHE_FEEDBACK_TTL: parseInt(process.env.CACHE_FEEDBACK_TTL || '3600', 10),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
};
