import { IReasoningSummaryService } from './interfaces/IReasoningSummaryService';
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { ICacheService } from './interfaces/ICacheService';
import { CommentRepository } from '../repositories/CommentRepository';
import { ReasoningSummaryRepository } from '../repositories/ReasoningSummaryRepository';
import { ReasoningSummaryDTO, ReasoningSummaryRow } from '../models/ReasoningSummary';
import { Comment } from '../models/Comment';
import { env } from '../config/env';
import { WritingFeedbackService } from './WritingFeedbackService';
import { Pool } from 'pg';

export class ReasoningSummaryService implements IReasoningSummaryService {
  constructor(
    private aiService: IAIAnalysisService,
    private cache: ICacheService,
    private commentRepo: CommentRepository,
    private summaryRepo: ReasoningSummaryRepository,
    private pool?: Pool,
    private writingFeedbackService?: WritingFeedbackService,
  ) {}

  async getSummary(commentId: number): Promise<ReasoningSummaryDTO> {
    const cacheKey = `reasoning_summary:${commentId}`;

    // 1. Check cache
    const cached = await this.cache.get<ReasoningSummaryDTO>(cacheKey);
    if (cached) return cached;

    // 2. Check DB
    const dbRow = await this.summaryRepo.findByCommentId(commentId);
    if (dbRow) {
      const dto = this.buildDTO(dbRow);
      await this.cache.set(cacheKey, dto as unknown as object, env.CACHE_REASONING_TTL);
      return dto;
    }

    // 3. Fetch comment and generate
    const comment = await this.commentRepo.getById(commentId);
    if (!comment) {
      const err: any = new Error(`No comment found with id ${commentId}`);
      err.statusCode = 404;
      err.errorCode = 'COMMENT_NOT_FOUND';
      throw err;
    }

    return this.generateAndCacheSummary(comment);
  }

  async generateAndCacheSummary(comment: Comment): Promise<ReasoningSummaryDTO> {
    const cacheKey = `reasoning_summary:${comment.id}`;

    const [claims, evidence] = await Promise.all([
      this.aiService.extractClaims(comment.text),
      this.aiService.extractEvidence(comment.text),
    ]);
    let coherenceScore = await this.aiService.evaluateCoherence(claims, evidence);
    
    // CRITICAL: Also detect issues to align final score with live feedback
    // Get post context for relevance check
    let postContext = '';
    if (this.pool) {
      try {
        const result = await this.pool.query(
          'SELECT title, content FROM posts WHERE id = $1',
          [comment.postId]
        );
        postContext = result.rows?.[0] ? `${result.rows[0].title} ${result.rows[0].content}` : '';
      } catch (err) {
        console.warn('Could not fetch post context for relevance check:', err);
      }
    }

    // Apply blended scoring if WritingFeedbackService is available
    let finalScore = coherenceScore;
    if (this.writingFeedbackService) {
      try {
        const feedback = await this.writingFeedbackService.analyzeDraft(comment.text, postContext);
        // Use the blended score from WritingFeedbackService
        finalScore = feedback.score;
      } catch (err) {
        console.warn('Could not run WritingFeedbackService analysis for final score:', err);
        // Fall back to just coherence score
        finalScore = coherenceScore;
      }
    }

    const summary = await this.aiService.generateSummary({ claims, evidence, coherenceScore });

    const primaryClaim = claims[0]?.text ?? 'No primary claim identified';

    const row = await this.summaryRepo.upsert({
      commentId: comment.id,
      summary,
      primaryClaim,
      evidenceBlocks: evidence,
      coherenceScore: finalScore, // Use blended score for final display
    });

    const dto = this.buildDTO(row);
    await this.cache.set(cacheKey, dto as unknown as object, env.CACHE_REASONING_TTL);
    return dto;
  }

  async invalidateCache(commentId: number): Promise<void> {
    const cacheKey = `reasoning_summary:${commentId}`;
    await this.cache.delete(cacheKey);
    await this.summaryRepo.deleteByCommentId(commentId);
  }

  private buildDTO(row: ReasoningSummaryRow): ReasoningSummaryDTO {
    return {
      commentId: row.comment_id,
      summary: row.summary,
      primaryClaim: row.primary_claim,
      evidenceBlocks: row.evidence_blocks,
      coherenceScore: parseFloat(row.coherence_score),
      generatedAt: row.updated_at ?? row.created_at,
    };
  }
}
