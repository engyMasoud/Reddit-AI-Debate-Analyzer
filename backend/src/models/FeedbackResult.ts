import { Issue } from './Issue';
import { Suggestion } from './Suggestion';

/** Immutable DTO returned to the frontend via REST or WebSocket. */
export interface FeedbackResult {
  issues: Issue[];
  score: number; // 0–1
  suggestions: Suggestion[];
  goodPoints: string[];
  confidence: number; // 0–1
  generatedAt: Date;
}
