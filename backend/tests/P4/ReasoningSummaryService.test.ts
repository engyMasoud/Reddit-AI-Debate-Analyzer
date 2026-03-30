import { ReasoningSummaryService } from '../src/services/ReasoningSummaryService';
import { MockAIAnalysisService } from '../src/services/MockAIAnalysisService';
import { InMemoryCacheService } from '../src/services/InMemoryCacheService';
import { ReasoningSummaryRow } from '../src/models/ReasoningSummary';

// ── Mock repositories ──

const now = new Date();

const mockCommentRepo = {
  getById: jest.fn(),
  getByPostId: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
};

const sampleRow: ReasoningSummaryRow = {
  id: 1,
  comment_id: 42,
  summary: 'DB summary',
  primary_claim: 'DB claim',
  evidence_blocks: [{ type: 'study' as const, content: 'evidence', strength: 'high' as const }],
  coherence_score: '0.75',
  created_at: now,
  updated_at: now,
  expires_at: new Date(Date.now() + 86_400_000),
};

const mockSummaryRepo = {
  findByCommentId: jest.fn(),
  upsert: jest.fn().mockResolvedValue(sampleRow),
  deleteByCommentId: jest.fn().mockResolvedValue(undefined),
};

describe('ReasoningSummaryService', () => {
  let service: ReasoningSummaryService;
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService(100, 60_000);
    service = new ReasoningSummaryService(
      new MockAIAnalysisService(),
      cache,
      mockCommentRepo as any,
      mockSummaryRepo as any,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    cache.destroy();
  });

  // ── Layer 1: cache hit ──

  it('should return cached summary when available', async () => {
    const dto = {
      commentId: 42,
      summary: 'cached summary',
      primaryClaim: 'cached claim',
      evidenceBlocks: [],
      coherenceScore: 0.8,
      generatedAt: now,
    };
    await cache.set('reasoning_summary:42', dto as unknown as object, 3600);

    const result = await service.getSummary(42);
    expect(result.summary).toBe('cached summary');
    // Should NOT hit the DB
    expect(mockSummaryRepo.findByCommentId).not.toHaveBeenCalled();
    expect(mockCommentRepo.getById).not.toHaveBeenCalled();
  });

  // ── Layer 2: DB hit ──

  it('should return DB summary when cache misses', async () => {
    mockSummaryRepo.findByCommentId.mockResolvedValueOnce(sampleRow);

    const result = await service.getSummary(42);
    expect(result.summary).toBe('DB summary');
    expect(result.coherenceScore).toBe(0.75);
    expect(mockSummaryRepo.findByCommentId).toHaveBeenCalledWith(42);
    // Should NOT try to fetch the comment
    expect(mockCommentRepo.getById).not.toHaveBeenCalled();
  });

  it('should cache the DB result for future calls', async () => {
    mockSummaryRepo.findByCommentId.mockResolvedValueOnce(sampleRow);
    await service.getSummary(42);

    // Second call should hit cache
    const result2 = await service.getSummary(42);
    expect(result2.summary).toBe('DB summary');
    expect(mockSummaryRepo.findByCommentId).toHaveBeenCalledTimes(1); // only the first
  });

  // ── Layer 3: generate ──

  it('should generate summary when cache and DB both miss', async () => {
    mockSummaryRepo.findByCommentId.mockResolvedValueOnce(null);
    mockCommentRepo.getById.mockResolvedValueOnce({
      id: 99,
      postId: 1,
      authorId: 1,
      parentCommentId: null,
      text: 'A reasoned argument about software engineering practices.',
      upvotes: 0,
      downvotes: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.getSummary(99);
    expect(result.commentId).toBe(42); // from sampleRow returned by upsert mock
    expect(result.summary).toBeDefined();
    expect(mockCommentRepo.getById).toHaveBeenCalledWith(99);
    expect(mockSummaryRepo.upsert).toHaveBeenCalled();
  });

  // ── 404 when comment not found ──

  it('should throw 404 when comment does not exist', async () => {
    mockSummaryRepo.findByCommentId.mockResolvedValueOnce(null);
    mockCommentRepo.getById.mockResolvedValueOnce(null);

    await expect(service.getSummary(999)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'COMMENT_NOT_FOUND',
    });
  });

  // ── invalidateCache ──

  it('should delete cache entry and DB row', async () => {
    await cache.set('reasoning_summary:42', { test: true }, 3600);
    await service.invalidateCache(42);

    const cached = await cache.get('reasoning_summary:42');
    expect(cached).toBeNull();
    expect(mockSummaryRepo.deleteByCommentId).toHaveBeenCalledWith(42);
  });

  // ── generateAndCacheSummary ──

  it('should generate, persist, and cache summary from a comment object', async () => {
    const comment = {
      id: 7,
      postId: 1,
      authorId: 1,
      parentCommentId: null,
      text: 'A solid argument with clear reasoning.',
      upvotes: 5,
      downvotes: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await service.generateAndCacheSummary(comment);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('coherenceScore');
    expect(mockSummaryRepo.upsert).toHaveBeenCalled();

    // Should now be cached
    const cached = await cache.get<object>('reasoning_summary:7');
    expect(cached).not.toBeNull();
  });
});
