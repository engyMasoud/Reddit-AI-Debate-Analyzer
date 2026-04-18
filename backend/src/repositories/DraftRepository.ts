import { DraftInsert, DraftRow } from '../models/Draft';
import { Pool } from 'pg';

export class DraftRepository {
  constructor(private pool: Pool) {}

  async save(data: DraftInsert): Promise<DraftRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO drafts (user_id, post_id, text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.userId, data.postId, data.text]
    );
    return rows[0];
  }

  async findByUserId(userId: number): Promise<DraftRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM drafts
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY updated_at DESC`,
      [userId]
    );
    return rows;
  }

  async findById(id: number): Promise<DraftRow | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM drafts WHERE id = $1',
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async updateText(id: number, text: string): Promise<DraftRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE drafts SET text = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [text, id]
    );
    return rows.length ? rows[0] : null;
  }

  async deleteById(id: number): Promise<void> {
    await this.pool.query('DELETE FROM drafts WHERE id = $1', [id]);
  }
}
