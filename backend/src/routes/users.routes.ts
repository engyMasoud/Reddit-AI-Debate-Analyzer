import { Router, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

export function userRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/users/me
  router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { rows } = await pool.query(
        'SELECT id, username, email, avatar, karma, joined_date FROM users WHERE id = $1',
        [userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
        return;
      }

      const memberships = await pool.query(
        'SELECT subreddit_id FROM user_subreddit_memberships WHERE user_id = $1',
        [userId]
      );

      const user = rows[0];
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        karma: user.karma,
        joinedDate: user.joined_date,
        joinedSubreddits: memberships.rows.map((r: any) => r.subreddit_id),
      });
    } catch (err) {
      console.error('Error getting user:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch user' });
    }
  });

  return router;
}
