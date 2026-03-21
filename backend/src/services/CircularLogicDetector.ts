import { Issue } from '../models/Issue';

/**
 * Detects self-referential or repeated arguments via n-gram overlap.
 */
export class CircularLogicDetector {
  async detect(text: string): Promise<Issue[]> {
    const issues: Issue[] = [];
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    if (sentences.length < 2) return issues;

    // Check for repeated phrases / n-gram overlap
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        const overlap = this.computeOverlap(sentences[i], sentences[j]);
        if (overlap > 0.6) {
          const start = text.indexOf(sentences[j]);
          issues.push({
            type: 'circular_logic',
            position: { start, end: start + sentences[j].length },
            lineNumber: this.getLineNumber(text, start),
            flaggedText: sentences[j].substring(0, 80),
            explanation: `This argument repeats a point made earlier in the draft (see sentence ${i + 1}).`,
            severity: 'medium',
            confidence: Math.min(0.95, overlap),
          });
        }
      }
    }

    // Check for self-referential patterns
    const selfRefPatterns = [
      /I already (said|mentioned|stated)/i,
      /as I (said|mentioned|stated) (before|earlier|above)/i,
      /this proves .* because .* this/i,
    ];

    for (const pattern of selfRefPatterns) {
      const match = pattern.exec(text);
      if (match && match.index !== undefined) {
        issues.push({
          type: 'circular_logic',
          position: { start: match.index, end: match.index + match[0].length },
          lineNumber: this.getLineNumber(text, match.index),
          flaggedText: match[0],
          explanation: 'This repeats a point already made without adding new information or evidence.',
          severity: 'medium',
          confidence: 0.82,
        });
      }
    }

    return issues;
  }

  private computeOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  private getLineNumber(text: string, position: number): number {
    return text.substring(0, position).split('\n').length;
  }
}
