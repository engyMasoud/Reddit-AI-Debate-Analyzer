import { Router, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';
import { ReasoningSummaryController } from '../controllers/ReasoningSummaryController';

export function commentRoutes(pool: Pool, summaryCtrl: ReasoningSummaryController): Router {
  const router = Router();

  // POST /api/v1/comments/:id/vote
  router.post('/:id/vote', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { voteType } = req.body;

      if (voteType !== 'up' && voteType !== 'down') {
        res.status(400).json({ error: 'INVALID_VOTE', message: "voteType must be 'up' or 'down'" });
        return;
      }

      const existing = await pool.query(
        "SELECT * FROM votes WHERE user_id = $1 AND target_type = 'comment' AND target_id = $2",
        [userId, commentId]
      );

      if (existing.rows.length > 0) {
        const oldVote = existing.rows[0].vote_type;
        if (oldVote === voteType) {
          await pool.query('DELETE FROM votes WHERE id = $1', [existing.rows[0].id]);
          const col = voteType === 'up' ? 'upvotes' : 'downvotes';
          await pool.query(`UPDATE comments SET ${col} = ${col} - 1 WHERE id = $1`, [commentId]);
        } else {
          await pool.query('UPDATE votes SET vote_type = $1 WHERE id = $2', [voteType, existing.rows[0].id]);
          if (voteType === 'up') {
            await pool.query('UPDATE comments SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1', [commentId]);
          } else {
            await pool.query('UPDATE comments SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1', [commentId]);
          }
        }
      } else {
        await pool.query(
          "INSERT INTO votes (user_id, target_type, target_id, vote_type) VALUES ($1, 'comment', $2, $3)",
          [userId, commentId, voteType]
        );
        const col = voteType === 'up' ? 'upvotes' : 'downvotes';
        await pool.query(`UPDATE comments SET ${col} = ${col} + 1 WHERE id = $1`, [commentId]);
      }

      const { rows } = await pool.query('SELECT upvotes, downvotes, author_id, post_id FROM comments WHERE id = $1', [commentId]);

      // Create notification for comment author (if not self-voting)
      const commentAuthorId = rows[0].author_id;
      if (commentAuthorId !== userId) {
        const voteLabel = voteType === 'up' ? 'upvoted' : 'downvoted';
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
           VALUES ($1, 'vote', $2, $3, $4, $5)`,
          [commentAuthorId, userId, rows[0].post_id, commentId, `${req.username} ${voteLabel} your comment`]
        );
      }

      // Determine the user's current vote after the toggle
      const currentVote = await pool.query(
        "SELECT vote_type FROM votes WHERE user_id = $1 AND target_type = 'comment' AND target_id = $2",
        [userId, commentId]
      );
      const userVote = currentVote.rows.length > 0 ? currentVote.rows[0].vote_type : null;

      res.json({ upvotes: rows[0].upvotes, downvotes: rows[0].downvotes, userVote });
    } catch (err) {
      console.error('Error voting on comment:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to vote' });
    }
  });

  // POST /api/v1/comments/:id/report
  router.post('/:id/report', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason is required' });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO reports (reporter_user_id, comment_id, reason)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, commentId, reason]
      );

      res.status(201).json({
        id: rows[0].id,
        status: rows[0].status,
        createdAt: rows[0].created_at,
      });
    } catch (err) {
      console.error('Error reporting comment:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to report comment' });
    }
  });

  // GET /api/v1/comments/:commentId/reasoning-summary  (US1)
  router.get('/:commentId/reasoning-summary', authMiddleware, rateLimiter, summaryCtrl.getSummary);

  return router;
}
