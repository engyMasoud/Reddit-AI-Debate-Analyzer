import { EvidenceBlock } from './EvidenceBlock';

/** Immutable DTO returned to the frontend. */
export interface ReasoningSummaryDTO {
  commentId: number;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: EvidenceBlock[];
  coherenceScore: number; // 0–1
  generatedAt: Date;
}

/** Shape for inserting/upserting into the DB. */
export interface ReasoningSummaryInsert {
  commentId: number;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: EvidenceBlock[]; // stored as JSONB
  coherenceScore: number;
}

/** Raw row shape from PostgreSQL. */
export interface ReasoningSummaryRow {
  id: number;
  comment_id: number;
  summary: string;
  primary_claim: string;
  evidence_blocks: EvidenceBlock[]; // JSONB auto-parsed by pg
  coherence_score: string; // NUMERIC comes as string from pg
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}
