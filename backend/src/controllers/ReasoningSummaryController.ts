import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { IReasoningSummaryService } from '../services/interfaces/IReasoningSummaryService';

export class ReasoningSummaryController {
  constructor(private reasoningSummaryService: IReasoningSummaryService) {}

  getSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const commentId = parseInt(req.params.commentId, 10);
      if (isNaN(commentId) || commentId <= 0) {
        res.status(400).json({
          error: 'INVALID_COMMENT_ID',
          message: 'commentId must be a positive integer',
        });
        return;
      }

      const summary = await this.reasoningSummaryService.getSummary(commentId);

      if (summary === null) {
        // Generation kicked off in background — tell client to poll
        res.status(202).json({ status: 'pending', commentId });
        return;
      }

      res.json({
        commentId: summary.commentId,
        summary: summary.summary,
        primaryClaim: summary.primaryClaim,
        evidenceBlocks: summary.evidenceBlocks,
        coherenceScore: summary.coherenceScore,
        generatedAt: summary.generatedAt.toISOString(),
      });
    } catch (err: any) {
      if (err.statusCode === 404) {
        res.status(404).json({
          error: err.errorCode || 'COMMENT_NOT_FOUND',
          message: err.message,
        });
        return;
      }
      console.error('Error getting reasoning summary:', err);
      res.status(500).json({
        error: 'ANALYSIS_FAILED',
        message: 'Failed to generate reasoning summary. Please try again.',
      });
    }
  };
}
