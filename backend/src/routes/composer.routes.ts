import { Router } from 'express';
import { z } from 'zod';
import { WritingFeedbackController } from '../controllers/WritingFeedbackController';
import { authMiddleware } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';

const analyzeDraftBody = z.object({
  draftText: z.string().min(1).max(10000),
  contextId: z.coerce.number().int().positive().optional(),
});

const saveDraftBody = z.object({
  text: z.string().min(1).max(10000),
  contextId: z.coerce.number().int().positive().optional(),
});

export function composerRoutes(controller: WritingFeedbackController): Router {
  const router = Router();

  // POST /api/v1/composer/draft-feedback
  router.post(
    '/draft-feedback',
    authMiddleware,
    rateLimiter,
    validate(analyzeDraftBody, 'body'),
    controller.analyzeDraft
  );

  // GET /api/v1/composer/draft-feedback/history
  router.get(
    '/draft-feedback/history',
    authMiddleware,
    rateLimiter,
    controller.getFeedbackHistory
  );

  // POST /api/v1/composer/drafts
  router.post(
    '/drafts',
    authMiddleware,
    rateLimiter,
    validate(saveDraftBody, 'body'),
    controller.saveDraft
  );

  return router;
}
