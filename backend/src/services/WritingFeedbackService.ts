import crypto from 'crypto';
import { IWritingFeedbackService } from './interfaces/IWritingFeedbackService';
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { ICacheService } from './interfaces/ICacheService';
import { FeedbackLogRepository } from '../repositories/FeedbackLogRepository';
import { FeedbackResult } from '../models/FeedbackResult';
import { Issue } from '../models/Issue';
import { Suggestion } from '../models/Suggestion';
import { CircularLogicDetector } from './CircularLogicDetector';
import { WeakEvidenceDetector } from './WeakEvidenceDetector';
import { UnsupportedClaimsDetector } from './UnsupportedClaimsDetector';
import { env } from '../config/env';

export class WritingFeedbackService implements IWritingFeedbackService {
  private circularLogicDetector: CircularLogicDetector;
  private weakEvidenceDetector: WeakEvidenceDetector;
  private unsupportedClaimsDetector: UnsupportedClaimsDetector;

  constructor(
    private aiService: IAIAnalysisService,
    private cache: ICacheService,
    private feedbackLogRepo: FeedbackLogRepository,
  ) {
    this.circularLogicDetector = new CircularLogicDetector();
    this.weakEvidenceDetector = new WeakEvidenceDetector();
    this.unsupportedClaimsDetector = new UnsupportedClaimsDetector(this.aiService);
  }

  async analyzeDraft(text: string): Promise<FeedbackResult> {
    const hash = this.hashText(text);
    const cacheKey = `draft_feedback:${hash}`;

    // Check cache
    const cached = await this.cache.get<FeedbackResult>(cacheKey);
    if (cached) return cached;

    // Run three detectors in parallel
    const [circularIssues, weakIssues, unsupportedIssues] = await Promise.all([
      this.circularLogicDetector.detect(text),
      this.weakEvidenceDetector.detect(text),
      this.unsupportedClaimsDetector.detect(text),
    ]);

    const allIssues = [...circularIssues, ...weakIssues, ...unsupportedIssues];
    const result = this.aggregateFeedback(allIssues, text);

    // Cache
    await this.cache.set(cacheKey, result as unknown as object, env.CACHE_FEEDBACK_TTL);

    return result;
  }

  async analyzeDraftAndLog(text: string, userId: number, draftId?: number | null): Promise<{ feedbackId: number; result: FeedbackResult }> {
    const result = await this.analyzeDraft(text);

    // Persist to feedback_logs
    const logRow = await this.feedbackLogRepo.save({
      userId,
      draftId: draftId ?? null,
      draftText: text,
      issues: result.issues,
      score: result.score,
      suggestions: result.suggestions,
      confidence: result.confidence,
    });

    return { feedbackId: logRow.id, result };
  }

  private aggregateFeedback(issues: Issue[], _text: string): FeedbackResult {
    const score = this.computeScore(issues);
    const suggestions = this.generateSuggestions(issues);
    const goodPoints = this.identifyGoodPoints(issues, _text);

    return {
      issues,
      score,
      suggestions,
      goodPoints,
      confidence: issues.length > 0
        ? issues.reduce((sum, i) => sum + i.confidence, 0) / issues.length
        : 0.5,
      generatedAt: new Date(),
    };
  }

  private computeScore(issues: Issue[]): number {
    if (issues.length === 0) return 1.0;
    const severityWeights: Record<string, number> = { high: 0.15, medium: 0.1, low: 0.05 };
    let penalty = 0;
    for (const issue of issues) {
      penalty += severityWeights[issue.severity] || 0.05;
    }
    return Math.max(0, Math.min(1, parseFloat((1 - penalty).toFixed(2))));
  }

  private generateSuggestions(issues: Issue[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'circular_logic':
          suggestions.push({
            text: 'Remove the repeated argument or expand it with new evidence',
            type: 'structure',
            priority: 'medium',
            exampleFix: 'Move this to a separate paragraph with new supporting points',
          });
          break;
        case 'weak_evidence':
          suggestions.push({
            text: 'Add a specific citation (e.g., study name, survey data, or URL)',
            type: 'reference',
            priority: 'high',
            exampleFix: "'According to the [specific study/survey]...'",
          });
          break;
        case 'unsupported_claim':
          suggestions.push({
            text: 'Avoid absolute claims — qualify your statement with evidence',
            type: 'clarity',
            priority: 'high',
            exampleFix: "'Many/Most [subject] prefer...' instead of 'All [subject] prefer...'",
          });
          break;
      }
    }

    return suggestions;
  }

  private identifyGoodPoints(issues: Issue[], text: string): string[] {
    const goodPoints: string[] = [];

    // Check for clear position statement
    if (/I (think|believe|argue|contend)\b/.test(text)) {
      goodPoints.push('Clear assertion of main position');
    }

    // Check for any evidence attempt
    if (/according to|study|data|research|survey|report|percent|%|\d{4}/.test(text)) {
      goodPoints.push('Attempts to provide evidence');
    }

    // Check for specific technical terms
    if (/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b/.test(text)) {
      goodPoints.push('Mentions specific technical concepts');
    }

    if (goodPoints.length === 0) {
      goodPoints.push('Draft submitted for analysis');
    }

    return goodPoints;
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
