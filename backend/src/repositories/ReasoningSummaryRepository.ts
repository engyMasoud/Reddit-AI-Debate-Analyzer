import { ReasoningSummaryInsert, ReasoningSummaryRow } from '../models/ReasoningSummary';
import { Pool } from 'pg';

export class ReasoningSummaryRepository {
  constructor(private pool: Pool) {}

  async findByCommentId(commentId: number): Promise<ReasoningSummaryRow | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM reasoning_summaries
       WHERE comment_id = $1 AND expires_at > NOW()`,
      [commentId]
    );
    return rows.length ? rows[0] : null;
  }

  async upsert(data: ReasoningSummaryInsert): Promise<ReasoningSummaryRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO reasoning_summaries
         (comment_id, summary, primary_claim, evidence_blocks, coherence_score, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
       ON CONFLICT (comment_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         primary_claim = EXCLUDED.primary_claim,
         evidence_blocks = EXCLUDED.evidence_blocks,
         coherence_score = EXCLUDED.coherence_score,
         updated_at = NOW(),
         expires_at = NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [data.commentId, data.summary, data.primaryClaim,
       JSON.stringify(data.evidenceBlocks), data.coherenceScore]
    );
    return rows[0];
  }

  async deleteByCommentId(commentId: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM reasoning_summaries WHERE comment_id = $1',
      [commentId]
    );
  }
}
