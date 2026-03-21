import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';

export function postRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/posts
  router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const subreddit = req.query.subreddit as string | undefined;
      const q = req.query.q as string | undefined;
      const authorId = req.query.authorId as string | undefined;
      const userId = req.userId;

      let query = `
        SELECT p.*, u.username AS author, s.name AS subreddit
        ${userId ? `, v.vote_type AS user_vote` : ''}
        FROM posts p
        JOIN users u ON p.author_id = u.id
        JOIN subreddits s ON p.subreddit_id = s.id
        ${userId ? `LEFT JOIN votes v ON v.target_type = 'post' AND v.target_id = p.id AND v.user_id = $${1}` : ''}
      `;
      const params: any[] = userId ? [userId] : [];
      const conditions: string[] = [];

      if (subreddit && subreddit !== 'Home' && subreddit !== 'Popular') {
        conditions.push(`s.name = $${params.length + 1}`);
        params.push(subreddit);
      }

      if (q) {
        conditions.push(`(p.title ILIKE $${params.length + 1} OR p.content ILIKE $${params.length + 1})`);
        params.push(`%${q}%`);
      }

      if (authorId) {
        const parsedAuthorId = parseInt(authorId, 10);
        if (!isNaN(parsedAuthorId)) {
          conditions.push(`p.author_id = $${params.length + 1}`);
          params.push(parsedAuthorId);
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY p.created_at DESC';

      const { rows } = await pool.query(query, params);

      res.json(rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        author: r.author,
        subreddit: r.subreddit,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        commentCount: r.comment_count,
        timestamp: r.created_at,
        image: r.image,
        userVote: r.user_vote || null,
      })));
    } catch (err) {
      console.error('Error listing posts:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch posts' });
    }
  });

  // GET /api/v1/posts/:id
  router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const userId = req.userId;

      const params: any[] = [id];
      let voteJoin = '';
      let voteSelect = '';
      if (userId) {
        voteJoin = `LEFT JOIN votes v ON v.target_type = 'post' AND v.target_id = p.id AND v.user_id = $2`;
        voteSelect = `, v.vote_type AS user_vote`;
        params.push(userId);
      }

      const { rows } = await pool.query(
        `SELECT p.*, u.username AS author, s.name AS subreddit${voteSelect}
         FROM posts p
         JOIN users u ON p.author_id = u.id
         JOIN subreddits s ON p.subreddit_id = s.id
         ${voteJoin}
         WHERE p.id = $1`,
        params
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Post not found' });
        return;
      }
      const r = rows[0];
      res.json({
        id: r.id,
        title: r.title,
        content: r.content,
        author: r.author,
        subreddit: r.subreddit,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        commentCount: r.comment_count,
        timestamp: r.created_at,
        image: r.image,
        userVote: r.user_vote || null,
      });
    } catch (err) {
      console.error('Error getting post:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch post' });
    }
  });

  // POST /api/v1/posts
  router.post('/', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { title, content, subreddit, image } = req.body;
      const userId = req.userId!;

      // Look up subreddit
      const sub = await pool.query('SELECT id FROM subreddits WHERE name = $1', [subreddit]);
      if (sub.rows.length === 0) {
        res.status(400).json({ error: 'INVALID_SUBREDDIT', message: 'Subreddit not found' });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO posts (title, content, author_id, subreddit_id, image)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [title, content, userId, sub.rows[0].id, image || null]
      );

      const post = rows[0];
      res.status(201).json({
        id: post.id,
        title: post.title,
        content: post.content,
        author: req.username,
        subreddit,
        upvotes: post.upvotes,
        downvotes: post.downvotes,
        commentCount: post.comment_count,
        timestamp: post.created_at,
        image: post.image,
      });
    } catch (err) {
      console.error('Error creating post:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create post' });
    }
  });

  // POST /api/v1/posts/:id/vote
  router.post('/:id/vote', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { voteType } = req.body; // 'up' or 'down'

      if (voteType !== 'up' && voteType !== 'down') {
        res.status(400).json({ error: 'INVALID_VOTE', message: "voteType must be 'up' or 'down'" });
        return;
      }

      // Upsert vote
      const existing = await pool.query(
        "SELECT * FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2",
        [userId, postId]
      );

      if (existing.rows.length > 0) {
        const oldVote = existing.rows[0].vote_type;
        if (oldVote === voteType) {
          // Remove vote
          await pool.query('DELETE FROM votes WHERE id = $1', [existing.rows[0].id]);
          const col = voteType === 'up' ? 'upvotes' : 'downvotes';
          await pool.query(`UPDATE posts SET ${col} = ${col} - 1 WHERE id = $1`, [postId]);
        } else {
          // Change vote
          await pool.query('UPDATE votes SET vote_type = $1 WHERE id = $2', [voteType, existing.rows[0].id]);
          if (voteType === 'up') {
            await pool.query('UPDATE posts SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1', [postId]);
          } else {
            await pool.query('UPDATE posts SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1', [postId]);
          }
        }
      } else {
        await pool.query(
          "INSERT INTO votes (user_id, target_type, target_id, vote_type) VALUES ($1, 'post', $2, $3)",
          [userId, postId, voteType]
        );
        const col = voteType === 'up' ? 'upvotes' : 'downvotes';
        await pool.query(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = $1`, [postId]);
      }

      // Return updated post
      const { rows } = await pool.query('SELECT upvotes, downvotes, author_id FROM posts WHERE id = $1', [postId]);

      // Create notification for post author (if not self-voting)
      const postAuthorId = rows[0].author_id;
      if (postAuthorId !== userId) {
        const voteLabel = voteType === 'up' ? 'upvoted' : 'downvoted';
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
           VALUES ($1, 'vote', $2, $3, $4)`,
          [postAuthorId, userId, postId, `${req.username} ${voteLabel} your post`]
        );
      }

      // Determine the user's current vote after the toggle
      const currentVote = await pool.query(
        "SELECT vote_type FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2",
        [userId, postId]
      );
      const userVote = currentVote.rows.length > 0 ? currentVote.rows[0].vote_type : null;

      res.json({ upvotes: rows[0].upvotes, downvotes: rows[0].downvotes, userVote });
    } catch (err) {
      console.error('Error voting on post:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to vote' });
    }
  });

  // GET /api/v1/posts/:id/comments
  router.get('/:id/comments', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId;

      const params: any[] = [postId];
      let voteJoin = '';
      let voteSelect = '';
      if (userId) {
        voteJoin = `LEFT JOIN votes v ON v.target_type = 'comment' AND v.target_id = c.id AND v.user_id = $2`;
        voteSelect = `, v.vote_type AS user_vote`;
        params.push(userId);
      }

      const { rows } = await pool.query(
        `SELECT c.*, u.username AS author${voteSelect}
         FROM comments c
         JOIN users u ON c.author_id = u.id
         ${voteJoin}
         WHERE c.post_id = $1
         ORDER BY c.created_at ASC`,
        params
      );

      res.json(rows.map((r: any) => ({
        id: r.id,
        postId: r.post_id,
        author: r.author,
        text: r.text,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        timestamp: r.created_at,
        parentCommentId: r.parent_comment_id,
        userVote: r.user_vote || null,
        aiSummary: null,
      })));
    } catch (err) {
      console.error('Error listing comments:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch comments' });
    }
  });

  // POST /api/v1/posts/:id/comments
  router.post('/:id/comments', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { text, parentCommentId } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'text is required' });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO comments (post_id, author_id, parent_comment_id, text)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [postId, userId, parentCommentId || null, text.trim()]
      );
      await pool.query(
        'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1',
        [postId]
      );

      // Notify the post author about the new comment (if not self-commenting)
      const postRow = await pool.query('SELECT author_id, title FROM posts WHERE id = $1', [postId]);
      if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
           VALUES ($1, 'comment', $2, $3, $4, $5)`,
          [postRow.rows[0].author_id, userId, postId, rows[0].id, `${req.username} commented on your post`]
        );
      }

      const comment = rows[0];
      res.status(201).json({
        id: comment.id,
        postId: comment.post_id,
        author: req.username,
        text: comment.text,
        upvotes: comment.upvotes,
        downvotes: comment.downvotes,
        timestamp: comment.created_at,
        parentCommentId: comment.parent_comment_id,
        userVote: null,
        aiSummary: null,
      });
    } catch (err) {
      console.error('Error creating comment:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create comment' });
    }
  });

  return router;
}
