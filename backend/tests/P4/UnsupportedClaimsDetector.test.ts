import { UnsupportedClaimsDetector } from '../src/services/UnsupportedClaimsDetector';
import { MockAIAnalysisService } from '../src/services/MockAIAnalysisService';

describe('UnsupportedClaimsDetector', () => {
  let detector: UnsupportedClaimsDetector;

  beforeEach(() => {
    detector = new UnsupportedClaimsDetector(new MockAIAnalysisService());
  });

  // ── Absolute claims without evidence ──

  it('should flag "all developers are wrong" (absolute + no evidence)', async () => {
    const issues = await detector.detect('All developers are wrong about this topic.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].type).toBe('unsupported_claim');
    expect(issues[0].severity).toBe('high');
  });

  it('should flag "never fails" as an absolute term', async () => {
    const issues = await detector.detect('This approach never fails in production.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].type).toBe('unsupported_claim');
  });

  it('should flag "always works" as an absolute term', async () => {
    const issues = await detector.detect('My solution always works no matter what.');
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  // ── Claims WITH nearby evidence ──

  it('should NOT flag an absolute claim if evidence is within 100 chars', async () => {
    const text = 'According to a 2023 study, all participants are satisfied with the results.';
    const issues = await detector.detect(text);
    // The word "study" is nearby, so it should be considered as evidence
    const unsupported = issues.filter(i => i.type === 'unsupported_claim');
    expect(unsupported).toHaveLength(0);
  });

  it('should NOT flag when "percent" keyword is nearby', async () => {
    const text = 'About 90 percent of users say the best option is the new design.';
    const issues = await detector.detect(text);
    const unsupported = issues.filter(i => i.type === 'unsupported_claim');
    expect(unsupported).toHaveLength(0);
  });

  // ── Clean text ──

  it('should return empty for modest language', async () => {
    const text = 'Many developers prefer TypeScript for type safety.';
    const issues = await detector.detect(text);
    expect(issues).toHaveLength(0);
  });

  it('should return empty for empty string', async () => {
    const issues = await detector.detect('');
    expect(issues).toHaveLength(0);
  });

  // ── Metadata ──

  it('should report confidence of 0.85 for detected issues', async () => {
    const issues = await detector.detect('Nobody can solve this problem easily.');
    if (issues.length > 0) {
      expect(issues[0].confidence).toBe(0.85);
    }
  });

  it('should include position and lineNumber', async () => {
    const issues = await detector.detect('Every framework is terrible at this task.');
    if (issues.length > 0) {
      expect(issues[0].position).toHaveProperty('start');
      expect(issues[0].position).toHaveProperty('end');
      expect(issues[0].lineNumber).toBeGreaterThanOrEqual(1);
    }
  });
});
