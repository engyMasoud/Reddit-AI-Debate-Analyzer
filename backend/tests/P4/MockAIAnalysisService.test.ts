import { MockAIAnalysisService } from '../src/services/MockAIAnalysisService';
import { Claim } from '../src/models/Claim';
import { EvidenceBlock } from '../src/models/EvidenceBlock';

describe('MockAIAnalysisService', () => {
  let service: MockAIAnalysisService;

  beforeEach(() => {
    service = new MockAIAnalysisService();
  });

  // ── extractClaims ──

  it('should return an array with one claim', async () => {
    const claims = await service.extractClaims('Some text for analysis');
    expect(claims).toHaveLength(1);
    expect(claims[0].id).toBe(1);
  });

  it('should use the first 60 characters as claim text', async () => {
    const longText = 'A'.repeat(100);
    const claims = await service.extractClaims(longText);
    expect(claims[0].text).toBe('A'.repeat(60));
  });

  it('should include mock supporting evidence', async () => {
    const claims = await service.extractClaims('test');
    expect(claims[0].supportingEvidence).toEqual(['mock-ev-1']);
  });

  // ── extractEvidence ──

  it('should return "low" strength for text < 100 characters', async () => {
    const evidence = await service.extractEvidence('short text');
    expect(evidence).toHaveLength(1);
    expect(evidence[0].strength).toBe('low');
    expect(evidence[0].type).toBe('anecdote');
  });

  it('should return "medium" strength for text 100–200 characters', async () => {
    const evidence = await service.extractEvidence('x'.repeat(150));
    expect(evidence[0].strength).toBe('medium');
  });

  it('should return "high" strength for text > 200 characters', async () => {
    const evidence = await service.extractEvidence('y'.repeat(250));
    expect(evidence[0].strength).toBe('high');
  });

  // ── evaluateCoherence ──

  it('should always return 0.75', async () => {
    const claims: Claim[] = [{ id: 1, text: 'test', supportingEvidence: [] }];
    const evidence: EvidenceBlock[] = [{ type: 'study', content: 'test', strength: 'high' }];
    const score = await service.evaluateCoherence(claims, evidence);
    expect(score).toBe(0.75);
  });

  // ── generateSummary ──

  it('should produce a summary using the first claim text', async () => {
    const summary = await service.generateSummary({
      claims: [{ id: 1, text: 'Climate change is real', supportingEvidence: [] }],
      evidence: [{ type: 'study', content: 'evidence', strength: 'high' }],
      coherenceScore: 0.75,
    });
    expect(summary).toBe('Mock summary: Argues "Climate change is real" with 1 piece(s) of evidence.');
  });

  it('should handle empty claims gracefully', async () => {
    const summary = await service.generateSummary({
      claims: [],
      evidence: [],
      coherenceScore: 0.5,
    });
    expect(summary).toContain('No claims found');
  });
});
