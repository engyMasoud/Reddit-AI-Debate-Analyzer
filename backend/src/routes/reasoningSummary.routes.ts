import { Router } from 'express';
import { ReasoningSummaryController } from '../controllers/ReasoningSummaryController';
import { authMiddleware } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';

export function reasoningSummaryRoutes(controller: ReasoningSummaryController): Router {
  const router = Router();

  // GET /api/v1/comments/:commentId/reasoning-summary
  router.get('/:commentId/reasoning-summary', authMiddleware, rateLimiter, controller.getSummary);

  return router;
}
