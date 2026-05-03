import { IReasoningSummaryService } from './interfaces/IReasoningSummaryService';
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { ICacheService } from './interfaces/ICacheService';
import { CommentRepository } from '../repositories/CommentRepository';
import { ReasoningSummaryRepository } from '../repositories/ReasoningSummaryRepository';
import { ReasoningSummaryDTO, ReasoningSummaryRow } from '../models/ReasoningSummary';
import { Comment } from '../models/Comment';
import { env } from '../config/env';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export class ReasoningSummaryService implements IReasoningSummaryService {
  constructor(
    private aiService: IAIAnalysisService,
    private cache: ICacheService,
    private commentRepo: CommentRepository,
    private summaryRepo: ReasoningSummaryRepository,
  ) {}

  async getSummary(commentId: number): Promise<ReasoningSummaryDTO | null> {
    const cacheKey = `reasoning_summary:${commentId}`;

    // 1. Check result cache
    const cached = await this.cache.get<ReasoningSummaryDTO>(cacheKey);
    if (cached) return cached;

    // 2. Check DB
    const dbRow = await this.summaryRepo.findByCommentId(commentId);
    if (dbRow) {
      const dto = this.buildDTO(dbRow);
      await this.cache.set(cacheKey, dto as unknown as object, env.CACHE_REASONING_TTL);
      return dto;
    }

    // 3. Fetch comment — 404 if not found
    const comment = await this.commentRepo.getById(commentId);
    if (!comment) {
      const err: any = new Error(`No comment found with id ${commentId}`);
      err.statusCode = 404;
      err.errorCode = 'COMMENT_NOT_FOUND';
      throw err;
    }

    // 5. Kick off background generation via async Lambda self-invocation.
    //    InvocationType: 'Event' returns in <1s (just confirms enqueue) — safe to await.
    //    We MUST await (not fire-and-forget) so the SDK HTTP call completes before the
    //    Lambda container freezes when the outer async handler returns.
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (functionName) {
      try {
        const client = new LambdaClient({});
        await client.send(new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event', // async: Lambda API returns 202 immediately after enqueueing
          Payload: Buffer.from(JSON.stringify({
            type: 'generate_reasoning_summary',
            commentId: comment.id,
            commentText: comment.text,
            commentPostId: comment.postId,
          })),
        }));
        console.log(`[ReasoningSummaryService] background invocation enqueued for comment ${comment.id}`);
      } catch (err: any) {
        console.error(`[ReasoningSummaryService] failed to invoke Lambda (code=${err.Code ?? err.code}):`, err.message);
      }
    } else {
      // Fallback for local dev (no Lambda): run synchronously
      this.generateAndCacheSummary(comment).catch(err =>
        console.error('[ReasoningSummaryService] local background generation failed:', err)
      );
    }

    // Return null → caller sends 202
    return null;
  }

  async generateAndCacheSummary(comment: Comment): Promise<ReasoningSummaryDTO> {
    const cacheKey = `reasoning_summary:${comment.id}`;

    // Single consolidated AI call instead of 5 separate ones — stays under 29s
    const analysis = await this.aiService.analyzeCommentFull(comment.text);
    const { claims, evidence, coherenceScore, summary } = analysis;

    const row = await this.summaryRepo.upsert({
      commentId: comment.id,
      summary,
      primaryClaim: claims[0]?.text ?? 'No primary claim identified',
      evidenceBlocks: evidence,
      coherenceScore,
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
