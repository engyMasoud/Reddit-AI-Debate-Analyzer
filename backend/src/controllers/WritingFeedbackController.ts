import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { WritingFeedbackService } from '../services/WritingFeedbackService';
import { DraftRepository } from '../repositories/DraftRepository';
import { FeedbackLogRepository } from '../repositories/FeedbackLogRepository';

export class WritingFeedbackController {
  constructor(
    private writingFeedbackService: WritingFeedbackService,
    private draftRepo: DraftRepository,
    private feedbackLogRepo: FeedbackLogRepository,
  ) {}

  analyzeDraft = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { draftText, contextId } = req.body;
      const userId = req.userId!;

      const { feedbackId, result } = await this.writingFeedbackService.analyzeDraftAndLog(
        draftText, userId
      );

      res.json({
        feedbackId,
        issues: result.issues,
        score: result.score,
        suggestions: result.suggestions,
        goodPoints: result.goodPoints,
        confidence: result.confidence,
        generatedAt: result.generatedAt.toISOString(),
      });
    } catch (err: any) {
      console.error('Error analyzing draft:', err);
      res.status(500).json({
        error: 'ANALYSIS_FAILED',
        message: 'Failed to analyze draft. Please try again.',
      });
    }
  };

  getFeedbackHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const [feedbacks, total] = await Promise.all([
        this.feedbackLogRepo.findByUserId(userId, limit, offset),
        this.feedbackLogRepo.countByUserId(userId),
      ]);

      res.json({
        feedbacks: feedbacks.map(f => ({
          id: f.id,
          draftText: f.draft_text,
          score: parseFloat(f.score),
          issues: f.issues,
          confidence: parseFloat(f.confidence),
          createdAt: f.created_at.toISOString(),
        })),
        total,
        limit,
        offset,
      });
    } catch (err: any) {
      console.error('Error getting feedback history:', err);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve feedback history.',
      });
    }
  };

  saveDraft = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { text, contextId } = req.body;
      const userId = req.userId!;

      const row = await this.draftRepo.save({
        userId,
        postId: contextId || null,
        text,
      });

      res.status(201).json({
        id: row.id,
        text: row.text,
        contextId: row.post_id,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
      });
    } catch (err: any) {
      console.error('Error saving draft:', err);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to save draft.',
      });
    }
  };
}
