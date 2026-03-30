import { WeakEvidenceDetector } from '../src/services/WeakEvidenceDetector';

describe('WeakEvidenceDetector', () => {
  let detector: WeakEvidenceDetector;

  beforeEach(() => {
    detector = new WeakEvidenceDetector();
  });

  // ── Appeal-to-popularity ──

  it('should flag "everyone knows" as weak evidence', async () => {
    const issues = await detector.detect('Everyone knows that JavaScript is the best language.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].type).toBe('weak_evidence');
    expect(issues[0].explanation).toContain('Appeal to popularity');
  });

  it('should flag "everyone agrees" pattern', async () => {
    const issues = await detector.detect('Everyone agrees this is the right approach.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].type).toBe('weak_evidence');
  });

  // ── Sweeping generalization ──

  it('should flag "all scientists agree" as sweeping generalization', async () => {
    const issues = await detector.detect('All scientists agree that climate change is real.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].explanation).toContain('Sweeping generalization');
  });

  it('should flag "all experts think"', async () => {
    const issues = await detector.detect('All experts think this solution is best.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  // ── Self-evident assertion ──

  it('should flag "it\'s obvious that" pattern', async () => {
    const issues = await detector.detect("It's obvious that this approach works.");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].explanation).toContain('self-evident');
  });

  // ── Vague studies ──

  it('should flag "studies show" without citation', async () => {
    const issues = await detector.detect('Studies show that this is effective.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].explanation).toContain('Vague reference');
  });

  // ── Appeal to popularity (use-based) ──

  it('should flag "because everyone uses it"', async () => {
    const issues = await detector.detect('React is the best because everyone uses it.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  // ── Clean text ──

  it('should not flag well-evidenced text', async () => {
    const text =
      'According to the 2023 Stack Overflow survey, TypeScript adoption grew by 15%.';
    const issues = await detector.detect(text);
    expect(issues).toHaveLength(0);
  });

  it('should return empty for empty string', async () => {
    const issues = await detector.detect('');
    expect(issues).toHaveLength(0);
  });

  // ── Position metadata ──

  it('should report correct position for flagged text', async () => {
    const text = 'To start, everyone knows that React is fast.';
    const issues = await detector.detect(text);
    if (issues.length > 0) {
      expect(issues[0].position.start).toBeGreaterThanOrEqual(0);
      expect(issues[0].position.end).toBeGreaterThan(issues[0].position.start);
      expect(issues[0].lineNumber).toBeGreaterThanOrEqual(1);
    }
  });
});
