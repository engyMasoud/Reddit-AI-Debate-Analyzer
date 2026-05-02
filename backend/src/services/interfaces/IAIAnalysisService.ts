import { Claim } from '../../models/Claim';
import { EvidenceBlock } from '../../models/EvidenceBlock';
import { AnalysisResult } from '../../models/AnalysisResult';
import { FeedbackResult } from '../../models/FeedbackResult';

export interface IAIAnalysisService {
  extractClaims(text: string): Promise<Claim[]>;
  extractEvidence(text: string): Promise<EvidenceBlock[]>;
  evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise<number>;
  generateSummary(analysis: AnalysisResult): Promise<string>;
  /**
   * Holistic draft scoring via a single LLM call.
   * Returns a FeedbackResult with score, issues, suggestions, and goodPoints.
   * Implementations that do not support this should return null so the
   * caller falls back to the regex pipeline.
   */
  scoreDraft(text: string, context?: string): Promise<FeedbackResult | null>;
}
