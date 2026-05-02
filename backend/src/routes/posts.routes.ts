import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { rateLimiter } from '../middleware/rateLimiter';
import { createEndpointRateLimiter } from '../middleware/endpointRateLimiters';
import { IReasoningSummaryService } from '../services/interfaces/IReasoningSummaryService';
import { Comment } from '../models/Comment';
import { validatePost, validateComment, validateEmoji, validateVoteType, validateDebateSide } from '../utils/validation';

export function postRoutes(pool: Pool, reasoningSummaryService?: IReasoningSummaryService): Router {
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
        ${userId ? `, ds_user.side AS user_debate_side` : ''}
        , COALESCE(ds_counts.for_count, 0) AS for_count
        , COALESCE(ds_counts.against_count, 0) AS against_count
        FROM posts p
        JOIN users u ON p.author_id = u.id
        JOIN subreddits s ON p.subreddit_id = s.id
        ${userId ? `LEFT JOIN votes v ON v.target_type = 'post' AND v.target_id = p.id AND v.user_id = $${1}` : ''}
        ${userId ? `LEFT JOIN debate_sides ds_user ON ds_user.post_id = p.id AND ds_user.user_id = $${1}` : ''}
        LEFT JOIN (
          SELECT post_id,
            COUNT(CASE WHEN side = 'for' THEN 1 END) AS for_count,
            COUNT(CASE WHEN side = 'against' THEN 1 END) AS against_count
          FROM debate_sides
          GROUP BY post_id
        ) ds_counts ON ds_counts.post_id = p.id
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

      // Sort by popularity for Popular tab, by date otherwise
      if (subreddit === 'Popular') {
        query += ' ORDER BY p.upvotes DESC, p.created_at DESC';
      } else {
        query += ' ORDER BY p.created_at DESC';
      }

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
        forCount: parseInt(r.for_count, 10) || 0,
        againstCount: parseInt(r.against_count, 10) || 0,
        userDebateSide: r.user_debate_side || null,
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
      const { title, content, subreddit, image, poll } = req.body;
      const userId = req.userId!;

      // Validate title and content
      const validation = validatePost(title, content);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid post data', details: validation.errors });
        return;
      }

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

      // Create poll if provided
      if (poll && poll.question && poll.options && poll.options.length >= 2) {
        try {
          // Create poll
          const pollRes = await pool.query(
            `INSERT INTO polls (post_id, question, created_at, ends_at)
             VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')
             RETURNING *`,
            [post.id, poll.question]
          );
          const pollRecord = pollRes.rows[0];

          // Create poll options
          for (let i = 0; i < poll.options.length; i++) {
            await pool.query(
              `INSERT INTO poll_options (poll_id, text, position)
               VALUES ($1, $2, $3)`,
              [pollRecord.id, poll.options[i], i]
            );
          }
        } catch (pollErr) {
          console.error('Error creating poll:', pollErr);
          // Don't fail the post creation if poll creation fails
        }
      }

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
  router.post('/:id/vote', authMiddleware, rateLimiter, createEndpointRateLimiter('vote'), async (req: AuthRequest, res: Response) => {
    let client = null;
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { voteType } = req.body; // 'up' or 'down'

      // Validate voteType
      const validation = validateVoteType(voteType);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid vote data', details: validation.errors });
        return;
      }

      // Use transaction with FOR UPDATE lock to prevent race conditions
      client = await pool.connect();
      await client.query('BEGIN');

      // Lock the post row
      const { rows: postRows } = await client.query(
        'SELECT upvotes, downvotes, author_id FROM posts WHERE id = $1 FOR UPDATE',
        [postId]
      );

      if (postRows.length === 0) {
        throw new Error('Post not found');
      }

      // Lock vote row if exists
      const { rows: existing } = await client.query(
        "SELECT id, vote_type FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2 FOR UPDATE",
        [userId, postId]
      );

      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        if (oldVote === voteType) {
          // Remove vote
          await client.query('DELETE FROM votes WHERE id = $1', [existing[0].id]);
          const col = voteType === 'up' ? 'upvotes' : 'downvotes';
          await client.query(`UPDATE posts SET ${col} = ${col} - 1 WHERE id = $1`, [postId]);
        } else {
          // Change vote
          await client.query('UPDATE votes SET vote_type = $1 WHERE id = $2', [voteType, existing[0].id]);
          if (voteType === 'up') {
            await client.query('UPDATE posts SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1', [postId]);
          } else {
            await client.query('UPDATE posts SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1', [postId]);
          }
        }
      } else {
        await client.query(
          "INSERT INTO votes (user_id, target_type, target_id, vote_type) VALUES ($1, 'post', $2, $3)",
          [userId, postId, voteType]
        );
        const col = voteType === 'up' ? 'upvotes' : 'downvotes';
        await client.query(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = $1`, [postId]);
      }

      // Get updated counts
      const { rows: updated } = await client.query('SELECT upvotes, downvotes, author_id FROM posts WHERE id = $1', [postId]);

      // Create notification for post author (if not self-voting)
      const postAuthorId = updated[0].author_id;
      if (postAuthorId !== userId) {
        const voteLabel = voteType === 'up' ? 'upvoted' : 'downvoted';
        await client.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
           VALUES ($1, 'vote', $2, $3, $4)`,
          [postAuthorId, userId, postId, `${req.username} ${voteLabel} your post`]
        );
      }

      // Get user's current vote
      const { rows: currentVotes } = await client.query(
        "SELECT vote_type FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2",
        [userId, postId]
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
      console.error('Error voting on post:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to vote' });
    } finally {
      if (client) {
        client.release();
      }
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
  router.post('/:id/comments', authMiddleware, rateLimiter, createEndpointRateLimiter('comment'), async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { text, parentCommentId } = req.body;

      // Validate text
      const validation = validateComment(text);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid comment text', details: validation.errors });
        return;
      }

      const trimmedText = text.trim();
      
      // Check maximum length
      const MAX_COMMENT_LENGTH = 10000;
      if (trimmedText.length > MAX_COMMENT_LENGTH) {
        res.status(400).json({ 
          error: 'VALIDATION_ERROR', 
          message: `Comment exceeds maximum length of ${MAX_COMMENT_LENGTH} characters` 
        });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO comments (post_id, author_id, parent_comment_id, text)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [postId, userId, parentCommentId || null, trimmedText]
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

      // NEW: Notify the parent comment author (if replying to a comment, not the post)
      if (parentCommentId) {
        const parentCommentRow = await pool.query(
          'SELECT author_id FROM comments WHERE id = $1',
          [parentCommentId]
        );
        if (parentCommentRow.rows.length > 0 && parentCommentRow.rows[0].author_id !== userId) {
          await pool.query(
            `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
             VALUES ($1, 'comment', $2, $3, $4, $5)`,
            [parentCommentRow.rows[0].author_id, userId, postId, rows[0].id, `${req.username} replied to your comment`]
          );
        }
      }

      const comment = rows[0];
      
      // Generate reasoning summary in background (don't wait for it)
      if (reasoningSummaryService) {
        const commentObj: Comment = {
          id: comment.id,
          postId: comment.post_id,
          authorId: userId,
          text: comment.text,
          upvotes: comment.upvotes,
          downvotes: comment.downvotes,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          parentCommentId: comment.parent_comment_id,
        };
        reasoningSummaryService.generateAndCacheSummary(commentObj).catch((err) => {
          console.error('Failed to generate reasoning summary for comment:', err);
        });
      }

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

  // POST /api/v1/posts/:id/emoji-reaction
  router.post('/:id/emoji-reaction', authMiddleware, rateLimiter, createEndpointRateLimiter('emojiReaction'), async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
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
         VALUES ($1, 'post', $2, $3)
         ON CONFLICT (user_id, target_type, target_id, emoji) DO UPDATE SET created_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, postId, emoji]
      );

      // Notify post author (skip self-reactions)
      const postRow = await pool.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
      if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
           VALUES ($1, 'emoji_reaction', $2, $3, $4)`,
          [postRow.rows[0].author_id, userId, postId, `${req.username} reacted ${emoji} to your post`]
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

  // DELETE /api/v1/posts/:id/emoji-reaction/:emoji
  router.delete('/:id/emoji-reaction/:emoji', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const emoji = req.params.emoji;

      await pool.query(
        `DELETE FROM emoji_reactions WHERE user_id = $1 AND target_type = 'post' AND target_id = $2 AND emoji = $3`,
        [userId, postId, emoji]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Error removing emoji reaction:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to remove emoji reaction' });
    }
  });

  // GET /api/v1/posts/:id/emoji-reactions
  router.get('/:id/emoji-reactions', async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);

      const { rows } = await pool.query(
        `SELECT emoji, COUNT(*) as count, array_agg(user_id) as user_ids
         FROM emoji_reactions
         WHERE target_type = 'post' AND target_id = $1
         GROUP BY emoji
         ORDER BY count DESC`,
        [postId]
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

  // ── Debate Sides ──

  // POST /api/v1/posts/:id/debate-side
  router.post('/:id/debate-side', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId;
      const { side } = req.body; // 'for' or 'against'

      // Validate side
      const validation = validateDebateSide(side);
      if (!validation.isValid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid debate side', details: validation.errors });
        return;
      }

      // Check if user already had a side set (to detect new vs update)
      const existing = await pool.query(
        'SELECT side FROM debate_sides WHERE user_id = $1 AND post_id = $2',
        [userId, postId]
      );
      const isNew = existing.rows.length === 0;

      const { rows } = await pool.query(
        `INSERT INTO debate_sides (user_id, post_id, side, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (user_id, post_id) DO UPDATE SET side = $3, updated_at = NOW()
         RETURNING id, side, created_at, updated_at`,
        [userId, postId, side]
      );

      // Notify post author on new stance (skip self, skip if changing existing stance)
      if (isNew) {
        const postRow = await pool.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
        if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
          const sideLabel = side === 'for' ? 'is For' : 'is Against';
          await pool.query(
            `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
             VALUES ($1, 'debate_side', $2, $3, $4)`,
            [postRow.rows[0].author_id, userId, postId, `${req.username} took a stance on your post (${sideLabel})`]
          );
        }
      }

      res.json({ id: rows[0].id, side: rows[0].side, createdAt: rows[0].created_at, updatedAt: rows[0].updated_at });
    } catch (err) {
      console.error('Error setting debate side:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to set debate side' });
    }
  });

  // GET /api/v1/posts/:id/debate-side
  router.get('/:id/debate-side', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId;

      const { rows } = await pool.query(
        `SELECT side FROM debate_sides WHERE user_id = $1 AND post_id = $2`,
        [userId, postId]
      );

      if (rows.length === 0) {
        return res.json({ side: null });
      }

      res.json({ side: rows[0].side });
    } catch (err) {
      console.error('Error fetching debate side:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch debate side' });
    }
  });

  // DELETE /api/v1/posts/:id/debate-side
  router.delete('/:id/debate-side', authMiddleware, rateLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId;

      // Delete user's debate side for this post
      await pool.query(
        `DELETE FROM debate_sides WHERE user_id = $1 AND post_id = $2`,
        [userId, postId]
      );

      res.json({ success: true, message: 'Debate side removed' });
    } catch (err) {
      console.error('Error removing debate side:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to remove debate side' });
    }
  });

  // GET /api/v1/posts/:id/debate-sides (counts)
  router.get('/:id/debate-sides', async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);

      const { rows } = await pool.query(
        `SELECT side, COUNT(*) as count FROM debate_sides WHERE post_id = $1 AND side IN ('for', 'against') GROUP BY side`,
        [postId]
      );

      const result = { for: 0, against: 0 };
      rows.forEach((r: any) => {
        if (r.side === 'for') result.for = parseInt(r.count, 10);
        else if (r.side === 'against') result.against = parseInt(r.count, 10);
      });

      res.json(result);
    } catch (err) {
      console.error('Error fetching debate sides:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch debate sides' });
    }
  });

  return router;
}
