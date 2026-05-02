import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';

export function pollRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/posts/:postId/poll
  router.get('/:postId/poll', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.postId, 10);
      const userId = req.userId;

      // Get poll
      const { rows: pollRows } = await pool.query(
        `SELECT id, post_id, question, ends_at, created_at FROM polls WHERE post_id = $1`,
        [postId]
      );

      if (pollRows.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Poll not found' });
      }

      const poll = pollRows[0];

      // Get options with vote counts
      const { rows: optionRows } = await pool.query(
        `SELECT 
          po.id, 
          po.poll_id, 
          po.text, 
          po.position,
          COUNT(pv.id) as vote_count
         FROM poll_options po
         LEFT JOIN poll_votes pv ON pv.option_id = po.id
         WHERE po.poll_id = $1
         GROUP BY po.id, po.poll_id, po.text, po.position
         ORDER BY po.position ASC`,
        [poll.id]
      );

      // Check if user has voted
      const { rows: userVoteRows } = await pool.query(
        `SELECT pv.option_id FROM poll_votes pv
         JOIN poll_options po ON pv.option_id = po.id
         WHERE po.poll_id = $1 AND pv.user_id = $2`,
        [poll.id, userId]
      );

      res.json({
        id: poll.id,
        postId: poll.post_id,
        question: poll.question,
        endsAt: poll.ends_at,
        createdAt: poll.created_at,
        options: optionRows.map((opt: any) => ({
          id: opt.id,
          text: opt.text,
          position: opt.position,
          voteCount: parseInt(opt.vote_count, 10),
        })),
        userVote: userVoteRows.length > 0 ? userVoteRows[0].option_id : null,
      });
    } catch (err) {
      console.error('Error fetching poll:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch poll' });
    }
  });

  // POST /api/v1/polls/:optionId/vote
  router.post('/:optionId/vote', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const optionId = parseInt(req.params.optionId, 10);
      const userId = req.userId;

      // Get the poll_id from the option
      const { rows: optionRows } = await pool.query(
        `SELECT poll_id FROM poll_options WHERE id = $1`,
        [optionId]
      );

      if (optionRows.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Option not found' });
      }

      const pollId = optionRows[0].poll_id;

      // Remove any existing vote for this user on this poll
      await pool.query(
        `DELETE FROM poll_votes pv
         WHERE pv.user_id = $1
         AND pv.option_id IN (
           SELECT id FROM poll_options WHERE poll_id = $2
         )`,
        [userId, pollId]
      );

      // Add new vote
      const { rows: voteRows } = await pool.query(
        `INSERT INTO poll_votes (user_id, option_id, created_at)
         VALUES ($1, $2, NOW())
         RETURNING id, user_id, option_id, created_at`,
        [userId, optionId]
      );

      // Notify post author (skip self-votes)
      const postRow = await pool.query(
        `SELECT p.author_id, p.id AS post_id FROM polls pl
         JOIN posts p ON p.id = pl.post_id
         WHERE pl.id = $1`,
        [pollId]
      );
      if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
           VALUES ($1, 'vote', $2, $3, $4)`,
          [postRow.rows[0].author_id, userId, postRow.rows[0].post_id,
           `${req.username} voted on your poll`]
        );
      }

      res.json({
        id: voteRows[0].id,
        userId: voteRows[0].user_id,
        optionId: voteRows[0].option_id,
        createdAt: voteRows[0].created_at,
      });
    } catch (err) {
      console.error('Error voting on poll:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to vote on poll' });
    }
  });

  return router;
}
