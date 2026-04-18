import { Comment } from '../models/Comment';
import { Pool } from 'pg';

export class CommentRepository {
  constructor(private pool: Pool) {}

  async getById(id: number): Promise<Comment | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );
    return rows.length ? this.mapRow(rows[0]) : null;
  }

  async getByPostId(postId: number): Promise<Comment[]> {
    const { rows } = await this.pool.query(
      `SELECT c.*, u.username AS author_name
       FROM comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );
    return rows.map(this.mapRow);
  }

  async create(postId: number, authorId: number, text: string, parentCommentId?: number | null): Promise<Comment> {
    const { rows } = await this.pool.query(
      `INSERT INTO comments (post_id, author_id, parent_comment_id, text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [postId, authorId, parentCommentId || null, text]
    );
    // Increment comment count on the post
    await this.pool.query(
      'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1',
      [postId]
    );
    return this.mapRow(rows[0]);
  }

  private mapRow(row: any): Comment {
    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentCommentId: row.parent_comment_id,
      text: row.text,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
