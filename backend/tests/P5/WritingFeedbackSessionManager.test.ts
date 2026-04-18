/**
 * Unit tests for WritingFeedbackSessionManager.ts
 * Based on: backend/tests/P5/test-specs/WritingFeedbackSessionManager.test-spec.md
 *
 * US3 — Real-Time Writing Feedback
 */
import { WritingFeedbackSessionManager } from '../../src/services/WritingFeedbackSessionManager';
import { FeedbackResult } from '../../src/models/FeedbackResult';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createFeedback(overrides: Partial<FeedbackResult> = {}): FeedbackResult {
  return {
    issues: [],
    score: 0.9,
    suggestions: [],
    goodPoints: ['Good argument'],
    confidence: 0.8,
    generatedAt: new Date(),
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('WritingFeedbackSessionManager', () => {

  // ══════════════════════════════════════════════════════════════════════════
  // constructor
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-01: Default parameters produce a valid manager ──
  test('T-01 default parameters produce a valid manager', () => {
    const mgr = new WritingFeedbackSessionManager();

    expect(mgr.getActiveUserIds()).toEqual([]);
    expect((mgr as any).maxSessions).toBe(10);
    expect((mgr as any).sessionTimeoutMs).toBe(1_800_000);
  });

  // ── T-02: Custom parameters are accepted and enforced ──
  test('T-02 custom parameters are accepted and enforced', () => {
    const mgr = new WritingFeedbackSessionManager(3, 5000);

    expect((mgr as any).maxSessions).toBe(3);
    expect((mgr as any).sessionTimeoutMs).toBe(5000);

    // Verify the 3-session cap is enforced
    mgr.registerSession(1, 's1');
    mgr.registerSession(2, 's2');
    mgr.registerSession(3, 's3');
    expect(mgr.registerSession(4, 's4')).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // registerSession
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-03: Register a session when capacity is available ──
  test('T-03 registers session and initializes all fields correctly', () => {
    const mgr = new WritingFeedbackSessionManager(10, 1_800_000);

    expect(mgr.registerSession(1, 'sock-1')).toBe(true);

    const s = mgr.getSession(1);
    expect(s).not.toBeNull();
    expect(s!.socketId).toBe('sock-1');
    expect(s!.currentDraft).toBe('');
    expect(s!.lastFeedback).toBeNull();
    expect(s!.analysisInFlight).toBe(false);
    expect(s!.lastActivityAt).toBeGreaterThan(0);
  });

  // ── T-04: Re-register an existing user replaces their session ──
  test('T-04 re-register replaces session and keeps count at 1', () => {
    const mgr = new WritingFeedbackSessionManager(10, 1_800_000);

    expect(mgr.registerSession(1, 'old')).toBe(true);
    expect(mgr.registerSession(1, 'new')).toBe(true);

    expect(mgr.getSession(1)!.socketId).toBe('new');
    expect(mgr.getActiveUserIds()).toHaveLength(1);
  });

  // ── T-05: Reject when at capacity and no expired sessions ──
  test('T-05 rejects 3rd user when maxSessions is 2 and none expired', () => {
    const mgr = new WritingFeedbackSessionManager(2, 1_800_000);

    expect(mgr.registerSession(1, 's1')).toBe(true);
    expect(mgr.registerSession(2, 's2')).toBe(true);
    expect(mgr.registerSession(3, 's3')).toBe(false);
    expect(mgr.getSession(3)).toBeNull();
  });

  // ── T-06: Sweep frees an expired slot at capacity ──
  test('T-06 sweep evicts expired sessions to make room for new user', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager(2, 50);
      mgr.registerSession(1, 's1');
      mgr.registerSession(2, 's2');

      jest.advanceTimersByTime(60);

      // Sweep triggered inside registerSession should evict expired entries
      expect(mgr.registerSession(3, 's3')).toBe(true);
      expect(mgr.getSession(3)).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── T-07: At capacity but user already exists — updates in place ──
  test('T-07 re-registration bypasses capacity check', () => {
    const mgr = new WritingFeedbackSessionManager(2, 1_800_000);
    mgr.registerSession(1, 's1');
    mgr.registerSession(2, 's2');

    // Re-register existing user 2 — should not trigger capacity rejection
    expect(mgr.registerSession(2, 's2-new')).toBe(true);
    expect(mgr.getSession(2)!.socketId).toBe('s2-new');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // removeSession
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-08: Remove an existing session ──
  test('T-08 removes session so getSession returns null', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(5, 's5');
    mgr.removeSession(5);

    expect(mgr.getSession(5)).toBeNull();
    expect(mgr.getActiveUserIds()).not.toContain(5);
  });

  // ── T-09: Remove a non-existent session (no-op) ──
  test('T-09 removing non-existent session does not throw', () => {
    const mgr = new WritingFeedbackSessionManager();

    expect(() => mgr.removeSession(999)).not.toThrow();
    expect(mgr.getActiveUserIds()).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateDraft
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-10: Update draft for an existing session ──
  test('T-10 updates draft text for an existing session', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');

    expect(mgr.updateDraft(1, 'new draft text')).toBe(true);
    expect(mgr.getSession(1)!.currentDraft).toBe('new draft text');
  });

  // ── T-11: Fail for a non-existent session ──
  test('T-11 returns false when updating draft for non-existent user', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.updateDraft(99, 'text')).toBe(false);
  });

  // ── T-12: Refreshes lastActivityAt timestamp ──
  test('T-12 updateDraft refreshes lastActivityAt', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager();
      mgr.registerSession(1, 's1');
      const initial = mgr.getSession(1)!.lastActivityAt;

      jest.advanceTimersByTime(100);
      mgr.updateDraft(1, 'x');

      expect(mgr.getSession(1)!.lastActivityAt).toBeGreaterThan(initial);
    } finally {
      jest.useRealTimers();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateFeedback
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-13: Store feedback for an existing session ──
  test('T-13 stores feedback, clears in-flight, deep-equals the input', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');
    mgr.markAnalysisInFlight(1);

    const fb = createFeedback({ score: 0.75 });
    expect(mgr.updateFeedback(1, fb)).toBe(true);

    const s = mgr.getSession(1)!;
    expect(s.lastFeedback).not.toBeNull();
    expect(s.lastFeedback!.score).toBe(0.75);
    expect(s.lastFeedback!.confidence).toBe(0.8);
    expect(s.lastFeedback!.issues).toEqual([]);
    expect(s.analysisInFlight).toBe(false);
  });

  // ── T-14: Fail for a non-existent session ──
  test('T-14 returns false for non-existent session', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.updateFeedback(99, createFeedback())).toBe(false);
  });

  // ── T-15: Stored feedback is a deep clone (mutation isolation) ──
  test('T-15 mutating original feedback does not affect stored copy', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');

    const fb = createFeedback({ score: 0.9 });
    mgr.updateFeedback(1, fb);

    fb.score = 0.1; // mutate original
    expect(mgr.getSession(1)!.lastFeedback!.score).toBe(0.9);
  });

  // ── T-16: Clears analysisInFlight flag ──
  test('T-16 updateFeedback clears analysisInFlight', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');
    mgr.markAnalysisInFlight(1);
    expect(mgr.isAnalysisInFlight(1)).toBe(true);

    mgr.updateFeedback(1, createFeedback());
    expect(mgr.isAnalysisInFlight(1)).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // markAnalysisInFlight
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-17: Mark flight for an existing session ──
  test('T-17 marks analysis in-flight and returns true', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');

    expect(mgr.markAnalysisInFlight(1)).toBe(true);
    expect(mgr.isAnalysisInFlight(1)).toBe(true);
  });

  // ── T-18: Fail for a non-existent session ──
  test('T-18 returns false for non-existent session', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.markAnalysisInFlight(99)).toBe(false);
  });

  // ── T-19: Refreshes lastActivityAt ──
  test('T-19 markAnalysisInFlight refreshes lastActivityAt', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager();
      mgr.registerSession(1, 's1');
      const initial = mgr.getSession(1)!.lastActivityAt;

      jest.advanceTimersByTime(100);
      mgr.markAnalysisInFlight(1);

      expect(mgr.getSession(1)!.lastActivityAt).toBeGreaterThan(initial);
    } finally {
      jest.useRealTimers();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // isAnalysisInFlight
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-20: Return true when analysis is in flight ──
  test('T-20 returns true after markAnalysisInFlight', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');
    mgr.markAnalysisInFlight(1);

    expect(mgr.isAnalysisInFlight(1)).toBe(true);
  });

  // ── T-21: Return false when analysis is not in flight ──
  test('T-21 returns false when in-flight was never set', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');

    expect(mgr.isAnalysisInFlight(1)).toBe(false);
  });

  // ── T-22: Return false for non-existent session ──
  test('T-22 returns false for non-existent session', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.isAnalysisInFlight(42)).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // clearAnalysisInFlight
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-23: Clear the in-flight flag ──
  // BUG: clearAnalysisInFlight does NOT refresh lastActivityAt unlike
  //      markAnalysisInFlight, updateDraft, and updateFeedback
  test('T-23 clears in-flight flag and refreshes lastActivityAt', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager();
      mgr.registerSession(1, 's1');
      mgr.markAnalysisInFlight(1);

      const afterMark = mgr.getSession(1)!.lastActivityAt;

      jest.advanceTimersByTime(100);
      mgr.clearAnalysisInFlight(1);

      expect(mgr.isAnalysisInFlight(1)).toBe(false);

      // Every other mutating method refreshes lastActivityAt — this should too
      const afterClear = mgr.getSession(1)!.lastActivityAt;
      expect(afterClear).toBeGreaterThan(afterMark);
    } finally {
      jest.useRealTimers();
    }
  });

  // ── T-24: No-op for non-existent session ──
  test('T-24 clearAnalysisInFlight on non-existent session does not throw', () => {
    const mgr = new WritingFeedbackSessionManager();

    expect(() => mgr.clearAnalysisInFlight(99)).not.toThrow();
    expect(mgr.getActiveUserIds()).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getSession
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-25: Return a deep clone of an active session ──
  test('T-25 returns deep clone; mutating it does not affect internal state', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');
    mgr.updateDraft(1, 'original');

    const clone = mgr.getSession(1)!;
    expect(clone).toHaveProperty('socketId', 's1');
    expect(clone).toHaveProperty('currentDraft', 'original');
    expect(clone).toHaveProperty('lastFeedback', null);
    expect(clone).toHaveProperty('analysisInFlight', false);
    expect(clone).toHaveProperty('lastActivityAt');

    // Mutating the clone must not affect internal state
    clone.currentDraft = 'TAMPERED';
    expect(mgr.getSession(1)!.currentDraft).toBe('original');
  });

  // ── T-26: Return null for non-existent user ──
  test('T-26 returns null for non-existent user', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.getSession(77)).toBeNull();
  });

  // ── T-27: Auto-evict and return null for an expired session ──
  // BUG: isAnalysisInFlight doesn't check session expiry — it returns true
  //      for an expired session that hasn't been garbage-collected yet
  test('T-27 auto-evicts expired session and all accessors agree it is gone', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager(10, 50);
      mgr.registerSession(1, 's1');
      mgr.markAnalysisInFlight(1);

      jest.advanceTimersByTime(60);

      // Session is expired — isAnalysisInFlight should respect expiry
      expect(mgr.isAnalysisInFlight(1)).toBe(false);

      // getSession auto-evicts the expired entry
      expect(mgr.getSession(1)).toBeNull();
      expect(mgr.getActiveUserIds()).not.toContain(1);
    } finally {
      jest.useRealTimers();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getActiveUserIds
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-28: Return empty array when no sessions exist ──
  test('T-28 returns empty array for a fresh manager', () => {
    const mgr = new WritingFeedbackSessionManager();
    expect(mgr.getActiveUserIds()).toEqual([]);
  });

  // ── T-29: Return only non-expired user IDs ──
  test('T-29 returns only non-expired user IDs', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager(10, 50);
      mgr.registerSession(1, 's1');
      mgr.registerSession(2, 's2');
      mgr.registerSession(3, 's3');

      jest.advanceTimersByTime(60);

      // Register user 4 — active
      mgr.registerSession(4, 's4');

      expect(mgr.getActiveUserIds()).toEqual([4]);
    } finally {
      jest.useRealTimers();
    }
  });

  // ── T-30: Return all user IDs when none are expired ──
  test('T-30 returns all user IDs in insertion order', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(10, 's10');
    mgr.registerSession(20, 's20');
    mgr.registerSession(30, 's30');

    expect(mgr.getActiveUserIds()).toEqual([10, 20, 30]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // sweepExpiredSessions
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-31: Evict all expired sessions and return count ──
  test('T-31 evicts all 3 expired sessions and returns 3', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager(10, 50);
      mgr.registerSession(1, 's1');
      mgr.registerSession(2, 's2');
      mgr.registerSession(3, 's3');

      jest.advanceTimersByTime(60);

      expect(mgr.sweepExpiredSessions()).toBe(3);
      expect(mgr.getActiveUserIds()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  // ── T-32: Return 0 when nothing is expired ──
  test('T-32 returns 0 when all sessions are still active', () => {
    const mgr = new WritingFeedbackSessionManager();
    mgr.registerSession(1, 's1');
    mgr.registerSession(2, 's2');

    expect(mgr.sweepExpiredSessions()).toBe(0);
    expect(mgr.getActiveUserIds()).toHaveLength(2);
  });

  // ── T-33: Evict only expired sessions in a mixed set ──
  test('T-33 evicts only expired sessions, keeps active ones', () => {
    jest.useFakeTimers();
    try {
      const mgr = new WritingFeedbackSessionManager(10, 50);
      mgr.registerSession(1, 's1');

      jest.advanceTimersByTime(60);

      // User 1 is now expired; register user 2 (active)
      mgr.registerSession(2, 's2');

      expect(mgr.sweepExpiredSessions()).toBe(1);
      expect(mgr.getActiveUserIds()).toEqual([2]);
    } finally {
      jest.useRealTimers();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // checkRep
  // ══════════════════════════════════════════════════════════════════════════

  // ── T-34: Skipped in production environment ──
  test('T-34 checkRep skipped in production — console.assert never called', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spy = jest.spyOn(console, 'assert');
    try {
      const mgr = new WritingFeedbackSessionManager();
      mgr.registerSession(1, 's1');

      expect(spy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
      spy.mockRestore();
    }
  });

  // ── T-35: Runs assertions in non-production environment ──
  test('T-35 checkRep runs console.assert in test environment', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const spy = jest.spyOn(console, 'assert');
    try {
      const mgr = new WritingFeedbackSessionManager();
      mgr.registerSession(1, 's1');

      // checkRep called by constructor + registerSession
      expect(spy).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
      spy.mockRestore();
    }
  });
});
