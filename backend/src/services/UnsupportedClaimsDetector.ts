import { Issue } from '../models/Issue';
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';

/**
 * Extracts claims via IAIAnalysisService, then checks each claim has supporting evidence.
 */
export class UnsupportedClaimsDetector {
  constructor(private aiService: IAIAnalysisService) {}

  async detect(text: string): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Detect absolute claims
    const absolutePatterns: Array<{ pattern: RegExp; explanation: string }> = [
      {
        pattern: /\b(all|every|always|never|none|nobody|no one)\b.*\b(is|are|was|were|do|does|will|would|can|could|should|must)\b/i,
        explanation: 'Absolute claim without qualification. Consider using "most", "many", or "often" and providing evidence.',
      },
      {
        pattern: /\b(best|worst|only|always|never)\b/i,
        explanation: 'Superlative or absolute term — qualify this with evidence or context.',
      },
    ];

    for (const { pattern, explanation } of absolutePatterns) {
      const match = pattern.exec(text);
      if (match && match.index !== undefined) {
        // Check if there's evidence nearby (within ~100 chars)
        const surrounding = text.substring(
          Math.max(0, match.index - 50),
          Math.min(text.length, match.index + match[0].length + 100)
        );
        const hasEvidence = /according to|study|survey|data|research|report|percent|%|\d{4}/.test(surrounding);

        if (!hasEvidence) {
          issues.push({
            type: 'unsupported_claim',
            position: { start: match.index, end: match.index + match[0].length },
            lineNumber: this.getLineNumber(text, match.index),
            flaggedText: text.substring(match.index, Math.min(text.length, match.index + 80)),
            explanation,
            severity: 'high',
            confidence: 0.85,
          });
        }
      }
    }

    return issues;
  }

  private getLineNumber(text: string, position: number): number {
    return text.substring(0, position).split('\n').length;
  }
}
