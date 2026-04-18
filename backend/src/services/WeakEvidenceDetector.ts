import { Issue } from '../models/Issue';

/**
 * Identifies weak evidence via citation extraction and evidence strength scoring.
 */
export class WeakEvidenceDetector {
  async detect(text: string): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Detect appeal-to-popularity patterns
    const weakPatterns: Array<{ pattern: RegExp; explanation: string }> = [
      {
        pattern: /everyone (knows|agrees|says|thinks|believes)/i,
        explanation: "Appeal to popularity — 'everyone' is not evidence of quality. Cite specific data or surveys.",
      },
      {
        pattern: /all (scientists|experts|developers|researchers) (agree|think|say|believe)/i,
        explanation: 'Sweeping generalization without specific citations. Reference a particular study or survey.',
      },
      {
        pattern: /it\'?s (obvious|clear|well-known|common knowledge) that/i,
        explanation: 'Assertion presented as self-evident without supporting evidence.',
      },
      {
        pattern: /because (everyone|everybody|people|they) (use|uses|like|likes|prefer|prefers) it/i,
        explanation: "Appeal to popularity — widespread use doesn't prove quality. Provide metrics or comparisons.",
      },
      {
        pattern: /studies (show|prove|demonstrate|suggest)/i,
        explanation: 'Vague reference to studies without specific citations. Name the study, authors, or publication.',
      },
    ];

    for (const { pattern, explanation } of weakPatterns) {
      const match = pattern.exec(text);
      if (match && match.index !== undefined) {
        issues.push({
          type: 'weak_evidence',
          position: { start: match.index, end: match.index + match[0].length },
          lineNumber: this.getLineNumber(text, match.index),
          flaggedText: match[0],
          explanation,
          severity: 'medium',
          confidence: 0.76,
        });
      }
    }

    return issues;
  }

  private getLineNumber(text: string, position: number): number {
    return text.substring(0, position).split('\n').length;
  }
}
