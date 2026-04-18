import { FeedbackResult } from './FeedbackResult';

/** DTO for draft state. */
export interface DraftDTO {
  id: number;
  userId: number;
  postId: number | null;
  text: string;
  lastFeedback: FeedbackResult | null;
  lastAnalyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/** Shape for inserting into the DB. */
export interface DraftInsert {
  userId: number;
  postId: number | null;
  text: string;
}

/** Raw row shape from PostgreSQL. */
export interface DraftRow {
  id: number;
  user_id: number;
  post_id: number | null;
  text: string;
  last_feedback: object | null;
  last_analyzed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}
