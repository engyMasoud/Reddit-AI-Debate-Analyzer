/** Shape for inserting into feedback_logs. */
export interface FeedbackLogInsert {
  userId: number;
  draftId: number | null;
  draftText: string;
  issues: object; // JSONB
  score: number;
  suggestions: object; // JSONB
  confidence: number;
}

/** Raw row shape from PostgreSQL. */
export interface FeedbackLogRow {
  id: number;
  user_id: number;
  draft_id: number | null;
  draft_text: string;
  issues: object;
  score: string; // NUMERIC comes as string from pg
  suggestions: object;
  confidence: string; // NUMERIC comes as string from pg
  created_at: Date;
}
