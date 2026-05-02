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

  async analyzeDraft(text: string, context?: string): Promise<FeedbackResult> {
    try {
      // Create cache key that includes context if provided
      const contextHash = context ? this.hashText(context) : '';
      const hash = this.hashText(text + contextHash);
      const cacheKey = `draft_feedback:${hash}`;

      // Check cache
      const cached = await this.cache.get<FeedbackResult>(cacheKey);
      if (cached) {
        console.log(`[WritingFeedback] Cache hit for draft (${text.length} chars)`);
        return cached;
      }

      console.log(`[WritingFeedback] Starting analysis for draft (${text.length} chars)`);

      // Run three detectors in parallel
      const [circularIssues, weakIssues, unsupportedIssues] = await Promise.all([
        this.circularLogicDetector.detect(text),
        this.weakEvidenceDetector.detect(text),
        this.unsupportedClaimsDetector.detect(text),
      ]);

      console.log(`[WritingFeedback] Detectors found: circular=${circularIssues.length}, weak=${weakIssues.length}, unsupported=${unsupportedIssues.length}`);

      // Check relevance to context if provided
      const relevanceIssue = context ? this.checkRelevance(text, context) : null;
      if (relevanceIssue) console.log(`[WritingFeedback] Relevance issue: ${relevanceIssue.type}`);

      const allIssues = [
        ...circularIssues,
        ...weakIssues,
        ...unsupportedIssues,
        ...(relevanceIssue ? [relevanceIssue] : []),
      ];

      // Calculate lightweight coherence score based on text structure (no AI calls)
      const lightweightCoherence = this.calculateLightweightCoherence(text);
      console.log(`[WritingFeedback] Coherence score: ${lightweightCoherence}`);

      const result = this.aggregateFeedback(allIssues, text, lightweightCoherence);
      console.log(`[WritingFeedback] Final score: ${result.score}`);

      // Cache
      await this.cache.set(cacheKey, result as unknown as object, env.CACHE_FEEDBACK_TTL);

      return result;
    } catch (err) {
      console.error('[WritingFeedback] Error in analyzeDraft:', err);
      throw err;
    }
  }

  async analyzeDraftAndLog(
    text: string,
    userId: number,
    draftId?: number | null,
    context?: string,
  ): Promise<{ feedbackId: number; result: FeedbackResult }> {
    const result = await this.analyzeDraft(text, context);

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

  private aggregateFeedback(issues: Issue[], text: string, coherenceScore: number = 0.5): FeedbackResult {
    const score = this.computeScore(issues, text, coherenceScore);
    const suggestions = this.generateSuggestions(issues);
    const goodPoints = this.identifyGoodPoints(issues, text);

    return {
      issues,
      score,
      suggestions,
      goodPoints,
      confidence: issues.length > 0
        ? issues.reduce((sum, i) => sum + i.confidence, 0) / issues.length
        : coherenceScore, // Use coherence as confidence if no issues
      generatedAt: new Date(),
    };
  }

  private computeScore(issues: Issue[], text: string, coherenceScore: number = 0.5): number {
    // If comment is off-topic (irrelevant to context), score is 0
    const offTopicIssue = issues.find((issue) => issue.type === 'off_topic' && issue.confidence > 0.8);
    if (offTopicIssue) {
      return 0.0;
    }

    // Calculate issue-based score
    let issueBasedScore = 1.0;
    if (issues.length === 0) {
      // Check for minimum quality even if no specific issues detected
      const qualityIssues = this.checkMinimumQuality(text);
      if (qualityIssues.length > 0) {
        const penalty = qualityIssues.reduce((sum, _) => sum + 0.2, 0);
        issueBasedScore = Math.max(0, Math.min(1, parseFloat((1 - penalty).toFixed(2))));
      }
    } else {
      // Apply severity penalties
      const severityWeights: Record<string, number> = { high: 0.25, medium: 0.15, low: 0.08 };
      let penalty = 0;
      for (const issue of issues) {
        penalty += severityWeights[issue.severity] || 0.08;
      }
      // Multiplier for multiple issues (compound penalty)
      if (issues.length > 1) {
        penalty *= 1.1;
      }
      issueBasedScore = Math.max(0, Math.min(1, parseFloat((1 - penalty).toFixed(2))));
    }

    // Blend coherence score with issue-based score (60% coherence, 40% issues)
    const blendedScore = (coherenceScore * 0.6 + issueBasedScore * 0.4);
    return Math.max(0, Math.min(1, parseFloat(blendedScore.toFixed(2))));
  }

  private checkMinimumQuality(text: string): string[] {
    const issues: string[] = [];

    // Too short/vague
    if (text.trim().length < 15) {
      issues.push('Too short or vague');
    }

    // Just opinion, no substance (expanded pattern)
    if (text.toLowerCase().match(/^(this|it|that|they|your|the)? ?(sucks|is (bad|good|awful|great|worst|best)|rocks)/i) && text.length < 50) {
      issues.push('Vague opinion without reasoning');
    }

    // No actual claim or evidence attempt
    if (!/\b(because|since|therefore|shows|proves|data|according|study|fact|evidence|reason|argument)\b/i.test(text) && text.length < 50) {
      issues.push('Lacks supporting reasoning or evidence');
    }

    return issues;
  }

  private calculateLightweightCoherence(text: string): number {
    let score = 0.45; // Start lower (more conservative than 0.5)

    // Sentence structure (more sentences = better organization)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length >= 2) score += 0.1; // Multiple sentences
    if (sentences.length >= 3) score += 0.05; // Even better with 3+

    // Strong reasoning words (because alone is weak without evidence)
    if (/\b(therefore|thus|consequently|as a result)\b/i.test(text)) {
      score += 0.15; // These are stronger conclusions
    } else if (/\b(because|since)\b/i.test(text)) {
      score += 0.08; // Weaker - just states reason, not strong evidence
    }

    // Concrete evidence (specific > general)
    if (/\b(data|study|research|shows|proved|showed|found|according|survey|percent|%|\d+\s*(study|people|percent|%))\b/i.test(text)) {
      score += 0.15; // Has some evidence
    }

    // Qualifiers (hedging language = more cautious = better coherence)
    if (/\b(often|may|might|some|many|could|tends?|seems?|appears?)\b/i.test(text)) {
      score += 0.05; // Shows nuanced thinking
    }

    // Penalize vague language more heavily
    if (/\b(very|really|definitely|basically|essentially|kind of|sort of|pretty much)\b/i.test(text)) {
      score -= 0.05; // Filler words reduce coherence
    }

    // Text length scoring (too short or too long is suspicious)
    const textLength = text.trim().length;
    if (textLength < 20) {
      score -= 0.15; // Way too short
    } else if (textLength < 40) {
      score -= 0.05; // Somewhat short
    } else if (textLength > 300) {
      score -= 0.1; // Too rambly
    }

    // Avoid all caps or excessive punctuation
    if (/[A-Z]{5,}/.test(text)) score -= 0.1;
    if (/!{2,}|\?{2,}/.test(text)) score -= 0.1;

    // Normalize to 0-1 range (min 0.25 for non-spam text)
    return Math.max(0.25, Math.min(1, score));
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

    // Don't credit anything if text is too short/vague
    if (text.trim().length < 30) {
      return goodPoints; // No good points for very short submissions
    }

    // Check for clear position statement
    if (/I (think|believe|argue|contend)\b/.test(text)) {
      goodPoints.push('Clear assertion of main position');
    }

    // Check for any evidence attempt (words, not just pattern matching)
    if (/according to|study|data|research|survey|report|percent|%|\d{4}/.test(text)) {
      goodPoints.push('Attempts to provide evidence');
    }

    // Check for specific technical terms (only if actually present)
    if (/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)+\b/.test(text) && text.length > 100) {
      goodPoints.push('Mentions specific technical concepts');
    }

    return goodPoints;
  }

  private checkRelevance(text: string, context: string): Issue | null {
    // Common English stopwords to ignore
    const stopwords = new Set([
      'the', 'is', 'and', 'or', 'a', 'an', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'it', 'its', 'of', 'on', 'that', 'to', 'was', 'will',
      'with', 'you', 'your', 'this', 'but', 'as', 'if', 'not', 'so', 'can',
      'have', 'would', 'could', 'should', 'are', 'were', 'been', 'being'
    ]);

    // Extract keywords from context (post title/content) - excluding stopwords
    const contextWords = context
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4 && !stopwords.has(w)); // Longer words, skip stopwords

    // Get comment words - excluding stopwords  
    const commentWords = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4 && !stopwords.has(w));

    // Calculate keyword overlap
    const matchingWords = commentWords.filter((w) => contextWords.includes(w));
    const overlapRatio = commentWords.length > 0 ? matchingWords.length / commentWords.length : 0;

    console.log(`[Relevance Check] Comment: "${text}" | Context keywords: ${contextWords.length}, Comment keywords: ${commentWords.length}, Matches: ${matchingWords.length}/${commentWords.length} (${(overlapRatio * 100).toFixed(1)}%)`);

    // Check for zero overlap (completely off-topic) - HIGH SEVERITY flag
    if (matchingWords.length === 0 && commentWords.length > 0) {
      console.log(`[Relevance Check] OFF-TOPIC: No keyword overlap detected`);
      return {
        type: 'off_topic',
        position: { start: 0, end: Math.min(50, text.length) },
        lineNumber: 1,
        flaggedText: text.substring(0, 50),
        explanation:
          'Your comment does not appear to address the post topic. Try to reference key concepts from the post.',
        severity: 'high',
        confidence: 0.9,
      };
    }

    // For longer comments, check if < 20% overlap - MEDIUM severity
    if (overlapRatio < 0.2 && commentWords.length > 15) {
      console.log(`[Relevance Check] POSSIBLY OFF-TOPIC: Low keyword overlap (<20%)`);
      return {
        type: 'off_topic',
        position: { start: 0, end: Math.min(50, text.length) },
        lineNumber: 1,
        flaggedText: text.substring(0, 50),
        explanation:
          'Your comment may not be addressing the main topic. Try to reference key concepts from the post.',
        severity: 'medium',
        confidence: 0.6,
      };
    }

    return null;
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
