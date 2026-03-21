import { FeedbackResult } from '../../models/FeedbackResult';

export interface IWritingFeedbackService {
  /** Analyze draft text and return structured feedback. */
  analyzeDraft(text: string): Promise<FeedbackResult>;
}
