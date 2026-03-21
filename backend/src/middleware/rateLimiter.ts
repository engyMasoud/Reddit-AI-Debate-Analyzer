import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from './authMiddleware';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<number, RateLimitEntry>();

export function rateLimiter(req: AuthRequest, res: Response, next: NextFunction): void {
  const userId = req.userId;
  if (!userId) {
    next();
    return;
  }

  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

  const entry = store.get(userId);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(userId, { count: 1, windowStart: now });
    next();
    return;
  }

  if (entry.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit of ${maxRequests} requests per minute exceeded`,
      retryAfterMs,
    });
    return;
  }

  entry.count++;
  next();
}
