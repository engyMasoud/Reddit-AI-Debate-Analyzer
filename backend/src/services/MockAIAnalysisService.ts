import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { Claim } from '../models/Claim';
import { EvidenceBlock } from '../models/EvidenceBlock';
import { AnalysisResult } from '../models/AnalysisResult';
import { FeedbackResult } from '../models/FeedbackResult';

/**
 * Deterministic mock — returns fixtures based on text length.
 * Zero network calls. Used in all dev/test builds.
 */
export class MockAIAnalysisService implements IAIAnalysisService {
  async extractClaims(text: string): Promise<Claim[]> {
    return [
      { id: 1, text: text.substring(0, 60), supportingEvidence: ['mock-ev-1'] },
    ];
  }

  async extractEvidence(text: string): Promise<EvidenceBlock[]> {
    const strength: EvidenceBlock['strength'] =
      text.length > 200 ? 'high' : text.length > 100 ? 'medium' : 'low';
    return [
      {
        type: 'anecdote',
        content: 'Mock evidence from text analysis',
        strength,
      },
    ];
  }

  async evaluateCoherence(
    _claims: Claim[],
    _evidence: EvidenceBlock[],
  ): Promise<number> {
    return 0.75;
  }

  async generateSummary(analysis: AnalysisResult): Promise<string> {
    const claimText = analysis.claims[0]?.text ?? 'No claims found';
    return `Mock summary: Argues "${claimText}" with ${analysis.evidence.length} piece(s) of evidence.`;
  }

  /** Mock scoreDraft — returns null so WritingFeedbackService uses regex pipeline. */
  async scoreDraft(_text: string, _context?: string): Promise<FeedbackResult | null> {
    return null;
  }
}
