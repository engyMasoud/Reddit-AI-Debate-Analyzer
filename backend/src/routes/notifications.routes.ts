import { Router, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

export function notificationRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/notifications — fetch current user's notifications
  router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;

      const { rows } = await pool.query(
        `SELECT n.*, u.username AS source_username
         FROM notifications n
         JOIN users u ON n.source_user_id = u.id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [userId]
      );

      res.json(rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        sourceUsername: r.source_username,
        postId: r.post_id,
        commentId: r.comment_id,
        message: r.message,
        isRead: r.is_read,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' });
    }
  });

  // GET /api/v1/notifications/unread-count
  router.get('/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );
      res.json({ count: rows[0].count });
    } catch (err) {
      console.error('Error fetching unread count:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch unread count' });
    }
  });

  // PATCH /api/v1/notifications/:id/read — mark single notification as read
  router.patch('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const notifId = parseInt(req.params.id, 10);

      await pool.query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [notifId, userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error marking notification read:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to mark notification read' });
    }
  });

  // POST /api/v1/notifications/read-all — mark all as read
  router.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
        [userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error marking all notifications read:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to mark all read' });
    }
  });

  return router;
}
