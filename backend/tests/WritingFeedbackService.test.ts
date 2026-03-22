import { WritingFeedbackService } from '../src/services/WritingFeedbackService';
import { MockAIAnalysisService } from '../src/services/MockAIAnalysisService';
import { InMemoryCacheService } from '../src/services/InMemoryCacheService';
import { FeedbackResult } from '../src/models/FeedbackResult';

// ── Minimal mock for FeedbackLogRepository ──
const mockFeedbackLogRepo = {
  save: jest.fn().mockResolvedValue({ id: 1 }),
  findByUserId: jest.fn().mockResolvedValue([]),
  countByUserId: jest.fn().mockResolvedValue(0),
};

describe('WritingFeedbackService', () => {
  let service: WritingFeedbackService;
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService(100, 60_000);
    service = new WritingFeedbackService(
      new MockAIAnalysisService(),
      cache,
      mockFeedbackLogRepo as any,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    cache.destroy();
  });

  // ── analyzeDraft ──

  it('should return a FeedbackResult with score, issues, and suggestions', async () => {
    const result = await service.analyzeDraft('Some draft text for analysis.');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('suggestions');
    expect(result).toHaveProperty('goodPoints');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('generatedAt');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('should return score of 1.0 for text with no issues', async () => {
    // Clean text — no weak evidence, no absolutes, no circular logic
    const result = await service.analyzeDraft('TypeScript provides type safety for developers.');
    expect(result.score).toBe(1.0);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect weak evidence issues', async () => {
    const result = await service.analyzeDraft('Everyone knows that React is great.');
    const weakIssues = result.issues.filter(i => i.type === 'weak_evidence');
    expect(weakIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should produce suggestions for detected issues', async () => {
    const result = await service.analyzeDraft('Everyone knows that React is great.');
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect unsupported claims', async () => {
    const result = await service.analyzeDraft('This is the best framework in existence.');
    const unsupported = result.issues.filter(i => i.type === 'unsupported_claim');
    expect(unsupported.length).toBeGreaterThanOrEqual(1);
  });

  // ── Cache behaviour ──

  it('should return cached result on second call with same text', async () => {
    const text = 'A unique draft for cache test.';
    const first = await service.analyzeDraft(text);
    const second = await service.analyzeDraft(text);
    // Both should be equal (cached clone)
    expect(second.score).toBe(first.score);
    expect(second.issues.length).toBe(first.issues.length);
  });

  // ── analyzeDraftAndLog ──

  it('should persist to feedback log and return feedbackId', async () => {
    const { feedbackId, result } = await service.analyzeDraftAndLog('Draft text', 42, 7);
    expect(feedbackId).toBe(1);
    expect(result).toHaveProperty('score');
    expect(mockFeedbackLogRepo.save).toHaveBeenCalledTimes(1);
    expect(mockFeedbackLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        draftId: 7,
        draftText: 'Draft text',
      }),
    );
  });

  it('should pass null draftId when not provided', async () => {
    await service.analyzeDraftAndLog('Some text', 10);
    expect(mockFeedbackLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: null }),
    );
  });

  // ── Score computation ──

  it('should reduce score proportionally to issue severity', async () => {
    // Text with multiple issues should score lower
    const result = await service.analyzeDraft(
      'Everyone knows the best approach always works. Studies show it never fails.',
    );
    expect(result.score).toBeLessThan(1.0);
  });

  // ── Good points identification ──

  it('should identify a clear position statement', async () => {
    const result = await service.analyzeDraft('I think TypeScript is valuable.');
    expect(result.goodPoints).toContain('Clear assertion of main position');
  });

  it('should identify evidence attempts', async () => {
    const result = await service.analyzeDraft('According to a 2023 survey, adoption increased.');
    expect(result.goodPoints).toContain('Attempts to provide evidence');
  });
});
