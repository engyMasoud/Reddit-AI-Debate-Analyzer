import { FeedbackLogInsert, FeedbackLogRow } from '../models/FeedbackLog';
import { Pool } from 'pg';

export class FeedbackLogRepository {
  constructor(private pool: Pool) {}

  async save(data: FeedbackLogInsert): Promise<FeedbackLogRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO feedback_logs
         (user_id, draft_id, draft_text, issues, score, suggestions, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.userId,
        data.draftId,
        data.draftText,
        JSON.stringify(data.issues),
        data.score,
        JSON.stringify(data.suggestions),
        data.confidence,
      ]
    );
    return rows[0];
  }

  async findByUserId(
    userId: number,
    limit: number = 20,
    offset: number = 0
  ): Promise<FeedbackLogRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM feedback_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  }

  async countByUserId(userId: number): Promise<number> {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM feedback_logs WHERE user_id = $1',
      [userId]
    );
    return rows[0].count;
  }
}
