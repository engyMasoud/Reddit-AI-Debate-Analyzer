import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from './authMiddleware';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

// Per-endpoint rate limit configurations
const limits: Record<string, RateLimitConfig> = {
  vote: { max: 60, windowMs: 60000 }, // 60 votes per minute
  comment: { max: 20, windowMs: 60000 }, // 20 comments per minute
  analysis: { max: 5, windowMs: 60000 }, // 5 AI analyses per minute (expensive!)
  report: { max: 10, windowMs: 60000 }, // 10 reports per minute
  emojiReaction: { max: 30, windowMs: 60000 }, // 30 emoji reactions per minute
};

const store = new Map<string, RateLimitEntry>();

/**
 * Create a rate limiter for a specific endpoint.
 * @param endpoint - The endpoint name (vote, comment, analysis, etc.)
 */
export function createEndpointRateLimiter(endpoint: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userId = req.userId;
    if (!userId) {
      next();
      return;
    }

    const config = limits[endpoint];
    if (!config) {
      // No specific limit defined, use default global limit
      next();
      return;
    }

    const key = `${endpoint}:${userId}`;
    const now = Date.now();
    const entry = store.get(key);

    // Reset window if expired
    if (!entry || now - entry.windowStart > config.windowMs) {
      store.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    // Check if limit exceeded
    if (entry.count >= config.max) {
      const retryAfterMs = config.windowMs - (now - entry.windowStart);
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit of ${config.max} requests per minute exceeded for this action`,
        retryAfterMs,
      });
      return;
    }

    // Increment counter
    entry.count++;
    next();
  };
}
