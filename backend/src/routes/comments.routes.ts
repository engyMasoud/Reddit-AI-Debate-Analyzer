import { Router, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';
import { createEndpointRateLimiter } from '../middleware/endpointRateLimiters';
import { ReasoningSummaryController } from '../controllers/ReasoningSummaryController';
import { validateVoteType, validateEmoji } from '../utils/validation';

export function commentRoutes(pool: Pool, summaryCtrl: ReasoningSummaryController): Router {
  const router = Router();

  // POST /api/v1/comments/:id/vote
  router.post('/:id/vote', authMiddleware, rateLimiter, createEndpointRateLimiter('vote'), async (req: AuthRequest, res: Response) => {
    let client = null;
    try {
      const commentId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { voteType } = req.body;

      // Validate voteType
      const validation = validateVoteType(voteType);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid vote data', details: validation.errors });
        return;
      }

      // Use transaction with FOR UPDATE lock to prevent race conditions
      client = await pool.connect();
      await client.query('BEGIN');

      // Lock the comment row
      const { rows: commentRows } = await client.query(
        'SELECT upvotes, downvotes, author_id, post_id FROM comments WHERE id = $1 FOR UPDATE',
        [commentId]
      );

      if (commentRows.length === 0) {
        throw new Error('Comment not found');
      }

      // Lock vote row if exists
      const { rows: existing } = await client.query(
        "SELECT id, vote_type FROM votes WHERE user_id = $1 AND target_type = 'comment' AND target_id = $2 FOR UPDATE",
        [userId, commentId]
      );

      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        if (oldVote === voteType) {
          await client.query('DELETE FROM votes WHERE id = $1', [existing[0].id]);
          const col = voteType === 'up' ? 'upvotes' : 'downvotes';
          await client.query(`UPDATE comments SET ${col} = ${col} - 1 WHERE id = $1`, [commentId]);
        } else {
          await client.query('UPDATE votes SET vote_type = $1 WHERE id = $2', [voteType, existing[0].id]);
          if (voteType === 'up') {
            await client.query('UPDATE comments SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1', [commentId]);
          } else {
            await client.query('UPDATE comments SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1', [commentId]);
          }
        }
      } else {
        await client.query(
          "INSERT INTO votes (user_id, target_type, target_id, vote_type) VALUES ($1, 'comment', $2, $3)",
          [userId, commentId, voteType]
        );
        const col = voteType === 'up' ? 'upvotes' : 'downvotes';
        await client.query(`UPDATE comments SET ${col} = ${col} + 1 WHERE id = $1`, [commentId]);
      }

      // Get updated counts
      const { rows: updated } = await client.query('SELECT upvotes, downvotes, author_id, post_id FROM comments WHERE id = $1', [commentId]);

      // Create notification for comment author (if not self-voting)
      const commentAuthorId = updated[0].author_id;
      if (commentAuthorId !== userId) {
        const voteLabel = voteType === 'up' ? 'upvoted' : 'downvoted';
        await client.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
           VALUES ($1, 'vote', $2, $3, $4, $5)`,
          [commentAuthorId, userId, updated[0].post_id, commentId, `${req.username} ${voteLabel} your comment`]
        );
      }

      // Get user's current vote
      const { rows: currentVotes } = await client.query(
        "SELECT vote_type FROM votes WHERE user_id = $1 AND target_type = 'comment' AND target_id = $2",
        [userId, commentId]
      );
      const userVote = currentVotes.length > 0 ? currentVotes[0].vote_type : null;

      await client.query('COMMIT');
      res.json({ upvotes: updated[0].upvotes, downvotes: updated[0].downvotes, userVote });
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Rollback error:', rollbackErr);
        }
      }
      console.error('Error voting on comment:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to vote' });
    } finally {
      if (client) {
        client.release();
      }
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

  // POST /api/v1/comments/:id/emoji-reaction
  router.post('/:id/emoji-reaction', authMiddleware, rateLimiter, createEndpointRateLimiter('emojiReaction'), async (req: AuthRequest, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { emoji } = req.body;

      // Validate emoji
      const validation = validateEmoji(emoji);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid emoji', details: validation.errors });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO emoji_reactions (user_id, target_type, target_id, emoji)
         VALUES ($1, 'comment', $2, $3)
         ON CONFLICT (user_id, target_type, target_id, emoji) DO UPDATE SET created_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, commentId, emoji]
      );

      // Notify comment author (skip self-reactions)
      const commentRow = await pool.query('SELECT author_id, post_id FROM comments WHERE id = $1', [commentId]);
      if (commentRow.rows.length > 0 && commentRow.rows[0].author_id !== userId) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
           VALUES ($1, 'emoji_reaction', $2, $3, $4, $5)`,
          [commentRow.rows[0].author_id, userId, commentRow.rows[0].post_id, commentId, `${req.username} reacted ${emoji} to your comment`]
        );
      }

      res.status(201).json({
        id: rows[0].id,
        emoji: rows[0].emoji,
        createdAt: rows[0].created_at,
      });
    } catch (err) {
      console.error('Error adding emoji reaction:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to add emoji reaction' });
    }
  });

  // DELETE /api/v1/comments/:id/emoji-reaction/:emoji
  router.delete('/:id/emoji-reaction/:emoji', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const emoji = req.params.emoji;

      await pool.query(
        `DELETE FROM emoji_reactions WHERE user_id = $1 AND target_type = 'comment' AND target_id = $2 AND emoji = $3`,
        [userId, commentId, emoji]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Error removing emoji reaction:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to remove emoji reaction' });
    }
  });

  // GET /api/v1/comments/:id/emoji-reactions
  router.get('/:id/emoji-reactions', async (req: AuthRequest, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);

      const { rows } = await pool.query(
        `SELECT emoji, COUNT(*) as count, array_agg(user_id) as user_ids
         FROM emoji_reactions
         WHERE target_type = 'comment' AND target_id = $1
         GROUP BY emoji
         ORDER BY count DESC`,
        [commentId]
      );

      res.json(rows.map((r: any) => ({
        emoji: r.emoji,
        count: parseInt(r.count, 10),
        userIds: r.user_ids,
      })));
    } catch (err) {
      console.error('Error fetching emoji reactions:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch emoji reactions' });
    }
  });

  return router;
}
