/**
 * Unit tests for WritingFeedbackService.ts
 * Based on: backend/tests/P5/test-specs/WritingFeedbackService.test-spec.md
 *
 * US3 — Real-Time Writing Feedback
 */
import crypto from 'crypto';
import { WritingFeedbackService } from '../../src/services/WritingFeedbackService';
import { FeedbackResult } from '../../src/models/FeedbackResult';
import { Issue } from '../../src/models/Issue';
import { env } from '../../src/config/env';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    type: 'circular_logic',
    position: { start: 0, end: 10 },
    lineNumber: 1,
    flaggedText: 'some text',
    explanation: 'test explanation',
    severity: 'medium',
    confidence: 0.8,
    ...overrides,
  };
}

function createMockFeedbackResult(overrides: Partial<FeedbackResult> = {}): FeedbackResult {
  return {
    issues: [],
    score: 1.0,
    suggestions: [],
    goodPoints: ['Draft submitted for analysis'],
    confidence: 0.5,
    generatedAt: new Date(),
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  destroy: jest.fn(),
};

const mockFeedbackLogRepo = {
  save: jest.fn(),
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
};

const mockAiService = {
  analyze: jest.fn(),
};

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('WritingFeedbackService', () => {
  let service: WritingFeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);
    mockFeedbackLogRepo.save.mockResolvedValue({ id: 1 });

    service = new WritingFeedbackService(
      mockAiService as any,
      mockCache as any,
      mockFeedbackLogRepo as any,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // analyzeDraft
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-01: Return cached result — detectors must NOT be invoked ──
  test('T-01 returns cached FeedbackResult without invoking any detector', async () => {
    const cachedResult = createMockFeedbackResult({ score: 0.85 });
    mockCache.get.mockResolvedValue(cachedResult);

    // Spy on all three detectors to verify they are never called
    const circularSpy = jest.spyOn((service as any).circularLogicDetector, 'detect');
    const weakSpy = jest.spyOn((service as any).weakEvidenceDetector, 'detect');
    const unsupportedSpy = jest.spyOn((service as any).unsupportedClaimsDetector, 'detect');

    const result = await service.analyzeDraft('Previously analyzed draft');

    expect(result).toBe(cachedResult);
    expect(result.score).toBe(0.85);
    expect(mockCache.get).toHaveBeenCalledTimes(1);
    expect(mockCache.set).not.toHaveBeenCalled();

    // None of the three detectors should have been invoked
    expect(circularSpy).not.toHaveBeenCalled();
    expect(weakSpy).not.toHaveBeenCalled();
    expect(unsupportedSpy).not.toHaveBeenCalled();
  });

  // ── T-02: Run all three detectors, get exactly 3 issues, verify cache key ──
  test('T-02 runs all three detectors and returns exactly 3 issues when each returns 1', async () => {
    const text = 'A fresh draft with no cache entry';
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    // Stub each detector to return exactly one issue
    jest.spyOn((service as any).circularLogicDetector, 'detect')
      .mockResolvedValue([createMockIssue({ type: 'circular_logic' })]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect')
      .mockResolvedValue([createMockIssue({ type: 'weak_evidence' })]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect')
      .mockResolvedValue([createMockIssue({ type: 'unsupported_claim' })]);

    const result = await service.analyzeDraft(text);

    // Exactly 3 issues — one from each detector
    expect(result.issues).toHaveLength(3);
    expect(result.issues.map((i: Issue) => i.type)).toEqual([
      'circular_logic',
      'weak_evidence',
      'unsupported_claim',
    ]);

    // cache.set called once with correct key and TTL
    expect(mockCache.set).toHaveBeenCalledTimes(1);
    expect(mockCache.set).toHaveBeenCalledWith(
      `draft_feedback:${hash}`,
      expect.any(Object),
      env.CACHE_FEEDBACK_TTL,
    );
  });

  // ── T-03: Handle empty-string draft ──
  test('T-03 returns score 1.0, empty issues, confidence 0.5 for empty string', async () => {
    // Stub detectors to return empty arrays
    jest.spyOn((service as any).circularLogicDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect').mockResolvedValue([]);

    const result = await service.analyzeDraft('');

    expect(result.issues).toEqual([]);
    expect(result.score).toBe(1.0);
    expect(result.suggestions).toEqual([]);
    expect(result.confidence).toBe(0.5);
    // Still cached even for empty string
    expect(mockCache.set).toHaveBeenCalledTimes(1);
  });

  // ── T-04: Aggregate issues from multiple detectors (2 + 1 + 1 = 4) ──
  test('T-04 aggregates 4 issues from detectors returning 2, 1, and 1', async () => {
    jest.spyOn((service as any).circularLogicDetector, 'detect')
      .mockResolvedValue([
        createMockIssue({ type: 'circular_logic', flaggedText: 'a' }),
        createMockIssue({ type: 'circular_logic', flaggedText: 'b' }),
      ]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect')
      .mockResolvedValue([
        createMockIssue({ type: 'weak_evidence' }),
      ]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect')
      .mockResolvedValue([
        createMockIssue({ type: 'unsupported_claim' }),
      ]);

    const result = await service.analyzeDraft('Draft text');

    expect(result.issues).toHaveLength(4);
    // Verify the order: circular first, then weak, then unsupported
    expect(result.issues[0].type).toBe('circular_logic');
    expect(result.issues[1].type).toBe('circular_logic');
    expect(result.issues[2].type).toBe('weak_evidence');
    expect(result.issues[3].type).toBe('unsupported_claim');
  });

  // ── T-05: Same text produces same cache key (deterministic hash) ──
  test('T-05 second call returns cached result; cache.set called exactly once', async () => {
    // Stub detectors for deterministic first call
    jest.spyOn((service as any).circularLogicDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect').mockResolvedValue([]);

    const text = 'identical text';
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    // First call — cache miss
    mockCache.get.mockResolvedValueOnce(null);
    const firstResult = await service.analyzeDraft(text);

    // Second call — cache hit returns first result
    mockCache.get.mockResolvedValueOnce(firstResult);
    const secondResult = await service.analyzeDraft(text);

    expect(secondResult).toBe(firstResult);
    expect(mockCache.set).toHaveBeenCalledTimes(1);

    // Both calls used the same cache key
    expect(mockCache.get).toHaveBeenNthCalledWith(1, `draft_feedback:${hash}`);
    expect(mockCache.get).toHaveBeenNthCalledWith(2, `draft_feedback:${hash}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // analyzeDraftAndLog
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-06: Persist analysis result with explicit draftId — strict save args ──
  test('T-06 persists result with all fields including score, issues, suggestions, confidence', async () => {
    // Stub detectors for predictable result
    jest.spyOn((service as any).circularLogicDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect').mockResolvedValue([]);
    mockFeedbackLogRepo.save.mockResolvedValue({ id: 101 });

    const result = await service.analyzeDraftAndLog('Log me', 42, 7);

    expect(result.feedbackId).toBe(101);
    expect(result.result).toHaveProperty('score');

    // Strict check: save receives ALL expected fields
    const saveArg = mockFeedbackLogRepo.save.mock.calls[0][0];
    expect(saveArg).toEqual({
      userId: 42,
      draftId: 7,
      draftText: 'Log me',
      issues: result.result.issues,
      score: result.result.score,
      suggestions: result.result.suggestions,
      confidence: result.result.confidence,
    });
  });

  // ── T-07: Persist with draftId omitted (defaults to null) ──
  test('T-07 defaults draftId to null when argument is omitted', async () => {
    jest.spyOn((service as any).circularLogicDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect').mockResolvedValue([]);
    mockFeedbackLogRepo.save.mockResolvedValue({ id: 200 });

    const result = await service.analyzeDraftAndLog('No draft id', 5);

    expect(result.feedbackId).toBe(200);
    expect(mockFeedbackLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, draftId: null, draftText: 'No draft id' }),
    );
  });

  // ── T-08: Persist with draftId explicitly set to null ──
  test('T-08 passes draftId as null when explicitly provided', async () => {
    jest.spyOn((service as any).circularLogicDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).weakEvidenceDetector, 'detect').mockResolvedValue([]);
    jest.spyOn((service as any).unsupportedClaimsDetector, 'detect').mockResolvedValue([]);
    mockFeedbackLogRepo.save.mockResolvedValue({ id: 200 });

    const result = await service.analyzeDraftAndLog('Explicit null', 5, null);

    expect(mockFeedbackLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: null }),
    );
    expect(result.feedbackId).toBe(200);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // aggregateFeedback (private — accessed via `as any`)
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-09: Confidence is the average of issue confidences ──
  test('T-09 confidence is the mean of issue confidences', () => {
    const issues: Issue[] = [
      createMockIssue({ confidence: 0.8 }),
      createMockIssue({ confidence: 0.6 }),
    ];

    const result: FeedbackResult = (service as any).aggregateFeedback(issues, 'any');

    expect(result.confidence).toBeCloseTo(0.7, 5);
  });

  // ── T-10: Default confidence for zero issues ──
  test('T-10 confidence defaults to 0.5 when issues array is empty', () => {
    const result: FeedbackResult = (service as any).aggregateFeedback([], 'clean draft');

    expect(result.confidence).toBe(0.5);
  });

  // ── T-11: Result includes a generatedAt Date ──
  test('T-11 result has a generatedAt Date close to now', () => {
    const before = Date.now();
    const result: FeedbackResult = (service as any).aggregateFeedback(
      [createMockIssue()],
      'some text',
    );
    const after = Date.now();

    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // computeScore (private)
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-12: Perfect score when no issues ──
  test('T-12 returns 1.0 when issues array is empty', () => {
    const score = (service as any).computeScore([]);
    expect(score).toBe(1.0);
  });

  // ── T-13: Single high-severity issue ──
  test('T-13 returns 0.85 for a single high-severity issue', () => {
    const score = (service as any).computeScore([createMockIssue({ severity: 'high' })]);
    expect(score).toBe(0.85);
  });

  // ── T-14: Single medium-severity issue ──
  test('T-14 returns 0.90 for a single medium-severity issue', () => {
    const score = (service as any).computeScore([createMockIssue({ severity: 'medium' })]);
    expect(score).toBe(0.9);
  });

  // ── T-15: Single low-severity issue ──
  test('T-15 returns 0.95 for a single low-severity issue', () => {
    const score = (service as any).computeScore([createMockIssue({ severity: 'low' })]);
    expect(score).toBe(0.95);
  });

  // ── T-16: Mixed severities accumulate ──
  test('T-16 returns 0.70 for high + medium + low issues', () => {
    const issues = [
      createMockIssue({ severity: 'high' }),
      createMockIssue({ severity: 'medium' }),
      createMockIssue({ severity: 'low' }),
    ];
    const score = (service as any).computeScore(issues);
    expect(score).toBe(0.7);
  });

  // ── T-17: Score floors at 0 ──
  test('T-17 returns 0 when penalties exceed 1.0', () => {
    const issues = Array.from({ length: 10 }, () => createMockIssue({ severity: 'high' }));
    const score = (service as any).computeScore(issues);
    expect(score).toBe(0);
  });

  // ── T-18: Unknown severity defaults to 0.05 penalty ──
  test('T-18 returns 0.95 for an unrecognized severity string', () => {
    const issue = createMockIssue({ severity: 'critical' as any });
    const score = (service as any).computeScore([issue]);
    expect(score).toBe(0.95);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // generateSuggestions (private)
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-19: Suggestion for circular_logic ──
  test('T-19 returns structure suggestion for circular_logic issue', () => {
    const suggestions = (service as any).generateSuggestions([
      createMockIssue({ type: 'circular_logic' }),
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      text: 'Remove the repeated argument or expand it with new evidence',
      type: 'structure',
      priority: 'medium',
      exampleFix: 'Move this to a separate paragraph with new supporting points',
    });
  });

  // ── T-20: Suggestion for weak_evidence ──
  test('T-20 returns reference suggestion for weak_evidence issue', () => {
    const suggestions = (service as any).generateSuggestions([
      createMockIssue({ type: 'weak_evidence' }),
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('reference');
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[0].text).toContain('Add a specific citation');
  });

  // ── T-21: Suggestion for unsupported_claim ──
  test('T-21 returns clarity suggestion for unsupported_claim issue', () => {
    const suggestions = (service as any).generateSuggestions([
      createMockIssue({ type: 'unsupported_claim' }),
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('clarity');
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[0].text).toContain('Avoid absolute claims');
  });

  // ── T-22: Empty array when no issues ──
  test('T-22 returns empty suggestions array for no issues', () => {
    const suggestions = (service as any).generateSuggestions([]);
    expect(suggestions).toEqual([]);
  });

  // ── T-23: Multiple issues of mixed types ──
  test('T-23 returns 3 suggestions for 3 different issue types', () => {
    const issues = [
      createMockIssue({ type: 'circular_logic' }),
      createMockIssue({ type: 'weak_evidence' }),
      createMockIssue({ type: 'unsupported_claim' }),
    ];
    const suggestions = (service as any).generateSuggestions(issues);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].type).toBe('structure');
    expect(suggestions[1].type).toBe('reference');
    expect(suggestions[2].type).toBe('clarity');
  });

  // ── T-24: Unrecognized issue type produces no suggestion ──
  test('T-24 returns empty array for unrecognized issue type', () => {
    const suggestions = (service as any).generateSuggestions([
      createMockIssue({ type: 'logical_fallacy' as any }),
    ]);
    expect(suggestions).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // identifyGoodPoints (private)
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-25: Detects "I think" — only position statement, nothing else ──
  test('T-25 identifies "I think" as position statement and returns only that', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'I think renewable energy is important',
    );
    expect(points).toContain('Clear assertion of main position');
    expect(points).toHaveLength(1);
  });

  // ── T-26: Detects "I believe" — only position statement ──
  test('T-26 identifies "I believe" as position statement and returns only that', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'I believe we should act now',
    );
    expect(points).toContain('Clear assertion of main position');
    expect(points).toHaveLength(1);
  });

  // ── T-27: Detects "I argue" — only position statement ──
  test('T-27 identifies "I argue" as position statement and returns only that', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'I argue that policy must change',
    );
    expect(points).toContain('Clear assertion of main position');
    expect(points).toHaveLength(1);
  });

  // ── T-28: Detects evidence keywords — should NOT also trigger technical concepts ──
  // BUG: regex /\b[A-Z][a-zA-Z]+/ matches "According" (common word, not a tech term)
  test('T-28 identifies evidence keywords only, without false-positive technical concepts', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'According to a 2024 study, results show improvement',
    );
    expect(points).toContain('Attempts to provide evidence');
    expect(points).not.toContain('Mentions specific technical concepts');
    expect(points).toHaveLength(1);
  });

  // ── T-29: Detects percentage — should NOT also trigger technical concepts ──
  // BUG: regex /\b[A-Z][a-zA-Z]+/ matches "Approximately" (not a tech term)
  test('T-29 identifies percentage as evidence only, without false-positive technical concepts', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'Approximately 75% of respondents agreed',
    );
    expect(points).toContain('Attempts to provide evidence');
    expect(points).not.toContain('Mentions specific technical concepts');
    expect(points).toHaveLength(1);
  });

  // ── T-30: Detects four-digit year — should NOT also trigger technical concepts ──
  // BUG: regex /\b[A-Z][a-zA-Z]+/ matches "The" (not a tech term)
  test('T-30 identifies year as evidence only, without false-positive technical concepts', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'The data from 2023 confirms this trend',
    );
    expect(points).toContain('Attempts to provide evidence');
    expect(points).not.toContain('Mentions specific technical concepts');
    expect(points).toHaveLength(1);
  });

  // ── T-31: Detects capitalized technical concepts — only that category ──
  test('T-31 identifies capitalized terms as technical concepts only', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'Using Machine Learning to solve NLP tasks',
    );
    expect(points).toContain('Mentions specific technical concepts');
    expect(points).toHaveLength(1);
  });

  // ── T-32: All three good-point categories at once ──
  test('T-32 identifies all three good-point categories and exactly 3', () => {
    const points = (service as any).identifyGoodPoints(
      [],
      'I believe that according to the 2024 study, Machine Learning is vital',
    );
    expect(points).toContain('Clear assertion of main position');
    expect(points).toContain('Attempts to provide evidence');
    expect(points).toContain('Mentions specific technical concepts');
    expect(points).toHaveLength(3);
  });

  // ── T-33: Fallback when nothing matches ──
  test('T-33 returns fallback message when no patterns match', () => {
    const points = (service as any).identifyGoodPoints([], 'ok sure');
    expect(points).toEqual(['Draft submitted for analysis']);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // hashText (private)
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-34: Returns a valid SHA-256 hex string ──
  test('T-34 returns correct SHA-256 hex digest', () => {
    const expected = crypto.createHash('sha256').update('hello world').digest('hex');
    const result = (service as any).hashText('hello world');

    expect(result).toBe(expected);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── T-35: Different inputs produce different hashes ──
  test('T-35 different inputs produce different hashes', () => {
    const hash1 = (service as any).hashText('abc');
    const hash2 = (service as any).hashText('def');

    expect(hash1).not.toBe(hash2);
  });

  // ── T-36: Identical inputs produce identical hashes ──
  test('T-36 identical inputs produce identical hashes', () => {
    const hash1 = (service as any).hashText('same');
    const hash2 = (service as any).hashText('same');

    expect(hash1).toBe(hash2);
  });
});
