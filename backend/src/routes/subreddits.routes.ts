import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

export function subredditRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/subreddits
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM subreddits ORDER BY id ASC'
      );
      res.json(rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        memberCount: r.member_count,
        color: r.color,
      })));
    } catch (err) {
      console.error('Error listing subreddits:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch subreddits' });
    }
  });

  // POST /api/v1/subreddits/:id/join
  router.post('/:id/join', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const subId = parseInt(req.params.id, 10);
      const userId = req.userId!;

      // Check if already joined
      const existing = await pool.query(
        'SELECT * FROM user_subreddit_memberships WHERE user_id = $1 AND subreddit_id = $2',
        [userId, subId]
      );

      if (existing.rows.length > 0) {
        // Leave
        await pool.query(
          'DELETE FROM user_subreddit_memberships WHERE user_id = $1 AND subreddit_id = $2',
          [userId, subId]
        );
        await pool.query(
          'UPDATE subreddits SET member_count = member_count - 1 WHERE id = $1',
          [subId]
        );
        res.json({ joined: false });
      } else {
        // Join
        await pool.query(
          'INSERT INTO user_subreddit_memberships (user_id, subreddit_id) VALUES ($1, $2)',
          [userId, subId]
        );
        await pool.query(
          'UPDATE subreddits SET member_count = member_count + 1 WHERE id = $1',
          [subId]
        );
        res.json({ joined: true });
      }
    } catch (err) {
      console.error('Error joining/leaving subreddit:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to join/leave subreddit' });
    }
  });

  return router;
}
