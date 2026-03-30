import { CircularLogicDetector } from '../src/services/CircularLogicDetector';

describe('CircularLogicDetector', () => {
  let detector: CircularLogicDetector;

  beforeEach(() => {
    detector = new CircularLogicDetector();
  });

  // ── Repeated phrases ──

  it('should detect repeated sentences with high word overlap', async () => {
    const text =
      'The economy is growing because jobs are increasing. ' +
      'The economy is growing because jobs are increasing.';
    const issues = await detector.detect(text);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].type).toBe('circular_logic');
    expect(issues[0].severity).toBe('medium');
  });

  it('should not flag unrelated sentences', async () => {
    const text =
      'TypeScript is a typed superset of JavaScript. ' +
      'PostgreSQL is a powerful relational database.';
    const issues = await detector.detect(text);
    const circularIssues = issues.filter(i => i.confidence > 0.6);
    expect(circularIssues.length).toBe(0);
  });

  it('should return empty for a single sentence', async () => {
    const issues = await detector.detect('Just one sentence here');
    expect(issues).toHaveLength(0);
  });

  // ── Self-referential patterns ──

  it('should detect "I already said" pattern', async () => {
    const text =
      'This framework is efficient. ' +
      'I already said this is the best option.';
    const issues = await detector.detect(text);
    const selfRef = issues.find(i => i.flaggedText.includes('I already said'));
    expect(selfRef).toBeDefined();
    expect(selfRef!.type).toBe('circular_logic');
    expect(selfRef!.confidence).toBe(0.82);
  });

  it('should detect "as I mentioned before" pattern', async () => {
    const text =
      'We should use React. ' +
      'As I mentioned before, React is good.';
    const issues = await detector.detect(text);
    const selfRef = issues.find(i => /as I mentioned before/i.test(i.flaggedText));
    expect(selfRef).toBeDefined();
  });

  // ── Position and lineNumber ──

  it('should report correct position for flagged text', async () => {
    const text = 'First sentence. I already stated this fact.';
    const issues = await detector.detect(text);
    const match = issues.find(i => i.flaggedText.includes('I already stated'));
    if (match) {
      expect(match.position.start).toBeGreaterThanOrEqual(0);
      expect(match.position.end).toBeGreaterThan(match.position.start);
    }
  });

  // ── Empty / whitespace ──

  it('should return empty for empty string', async () => {
    const issues = await detector.detect('');
    expect(issues).toHaveLength(0);
  });
});
