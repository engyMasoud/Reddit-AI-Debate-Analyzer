import { ReasoningSummaryDTO } from '../../models/ReasoningSummary';
import { Comment } from '../../models/Comment';

export interface IReasoningSummaryService {
  /** Retrieve summary (cache → DB → generate). Returns null if generation is in progress. */
  getSummary(commentId: number): Promise<ReasoningSummaryDTO | null>;

  /** Force-generate summary, persist, and cache. */
  generateAndCacheSummary(comment: Comment): Promise<ReasoningSummaryDTO>;

  /** Remove from both cache and DB. */
  invalidateCache(commentId: number): Promise<void>;
}
