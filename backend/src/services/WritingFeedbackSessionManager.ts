import { FeedbackResult } from '../models/FeedbackResult';

interface SessionEntry {
  socketId: string;
  currentDraft: string;
  lastFeedback: FeedbackResult | null;
  analysisInFlight: boolean;
  lastActivityAt: number;
}

/**
 * Tracks active WebSocket composer sessions (one per user, max 10).
 * MIT 6.005 ADT with checkRep().
 */
export class WritingFeedbackSessionManager {
  private sessions: Map<number, SessionEntry>;
  private readonly maxSessions: number;
  private readonly sessionTimeoutMs: number;

  constructor(maxSessions = 10, sessionTimeoutMs = 1_800_000) {
    this.sessions = new Map();
    this.maxSessions = maxSessions;
    this.sessionTimeoutMs = sessionTimeoutMs;
    this.checkRep();
  }

  registerSession(userId: number, socketId: string): boolean {
    if (this.sessions.size >= this.maxSessions && !this.sessions.has(userId)) {
      this.sweepExpiredSessions();
      if (this.sessions.size >= this.maxSessions) {
        return false;
      }
    }
    this.sessions.set(userId, {
      socketId,
      currentDraft: '',
      lastFeedback: null,
      analysisInFlight: false,
      lastActivityAt: Date.now(),
    });
    this.checkRep();
    return true;
  }

  removeSession(userId: number): void {
    this.sessions.delete(userId);
    this.checkRep();
  }

  updateDraft(userId: number, draftText: string): boolean {
    const entry = this.sessions.get(userId);
    if (!entry) return false;
    entry.currentDraft = draftText;
    entry.lastActivityAt = Date.now();
    this.checkRep();
    return true;
  }

  updateFeedback(userId: number, feedback: FeedbackResult): boolean {
    const entry = this.sessions.get(userId);
    if (!entry) return false;
    entry.lastFeedback = structuredClone(feedback);
    entry.analysisInFlight = false;
    entry.lastActivityAt = Date.now();
    this.checkRep();
    return true;
  }

  markAnalysisInFlight(userId: number): boolean {
    const entry = this.sessions.get(userId);
    if (!entry) return false;
    entry.analysisInFlight = true;
    entry.lastActivityAt = Date.now();
    this.checkRep();
    return true;
  }

  isAnalysisInFlight(userId: number): boolean {
    const entry = this.sessions.get(userId);
    if (!entry) return false;
    if (Date.now() - entry.lastActivityAt >= this.sessionTimeoutMs) return false;
    return entry.analysisInFlight;
  }

  getSession(userId: number): SessionEntry | null {
    const entry = this.sessions.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.lastActivityAt >= this.sessionTimeoutMs) {
      this.sessions.delete(userId);
      return null;
    }
    return structuredClone(entry);
  }

  getActiveUserIds(): number[] {
    const now = Date.now();
    const active: number[] = [];
    for (const [userId, entry] of this.sessions) {
      if (now - entry.lastActivityAt < this.sessionTimeoutMs) {
        active.push(userId);
      }
    }
    return active;
  }

  sweepExpiredSessions(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [userId, entry] of this.sessions) {
      if (now - entry.lastActivityAt >= this.sessionTimeoutMs) {
        this.sessions.delete(userId);
        evicted++;
      }
    }
    this.checkRep();
    return evicted;
  }

  clearAnalysisInFlight(userId: number): void {
    const entry = this.sessions.get(userId);
    if (entry) {
      entry.analysisInFlight = false;
      entry.lastActivityAt = Date.now();
    }
  }

  private checkRep(): void {
    if (process.env.NODE_ENV === 'production') return;
    console.assert(this.sessions.size <= this.maxSessions);
    console.assert(this.maxSessions > 0);
    console.assert(this.sessionTimeoutMs > 0);
    for (const [userId, entry] of this.sessions) {
      console.assert(userId > 0);
      console.assert(entry.socketId.length > 0);
      console.assert(entry.lastActivityAt > 0);
      if (entry.lastFeedback !== null) {
        console.assert(entry.lastFeedback.score >= 0 && entry.lastFeedback.score <= 1);
        console.assert(entry.lastFeedback.confidence >= 0 && entry.lastFeedback.confidence <= 1);
        console.assert(Array.isArray(entry.lastFeedback.issues));
      }
    }
  }
}
