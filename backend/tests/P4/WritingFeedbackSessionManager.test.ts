import { WritingFeedbackSessionManager } from '../src/services/WritingFeedbackSessionManager';

describe('WritingFeedbackSessionManager', () => {
  let manager: WritingFeedbackSessionManager;

  beforeEach(() => {
    manager = new WritingFeedbackSessionManager(10, 1_800_000);
  });

  // ── registerSession ──

  it('should register a session and return true', () => {
    expect(manager.registerSession(1, 'socket_1')).toBe(true);
  });

  it('should register up to maxSessions users', () => {
    for (let i = 1; i <= 10; i++) {
      expect(manager.registerSession(i, `socket_${i}`)).toBe(true);
    }
  });

  it('should reject the 11th session when at capacity', () => {
    for (let i = 1; i <= 10; i++) {
      manager.registerSession(i, `socket_${i}`);
    }
    expect(manager.registerSession(11, 'socket_11')).toBe(false);
  });

  it('should allow re-registering an existing user (reconnect)', () => {
    manager.registerSession(1, 'socket_old');
    expect(manager.registerSession(1, 'socket_new')).toBe(true);
    const session = manager.getSession(1);
    expect(session!.socketId).toBe('socket_new');
  });

  // ── removeSession ──

  it('should remove a session', () => {
    manager.registerSession(1, 'socket_1');
    manager.removeSession(1);
    expect(manager.getSession(1)).toBeNull();
  });

  // ── updateDraft ──

  it('should update draft text for an existing user', () => {
    manager.registerSession(1, 'socket_1');
    expect(manager.updateDraft(1, 'hello world')).toBe(true);
    expect(manager.getSession(1)!.currentDraft).toBe('hello world');
  });

  it('should return false when updating draft for non-existent user', () => {
    expect(manager.updateDraft(999, 'text')).toBe(false);
  });

  // ── getSession returns a clone ──

  it('should return a clone, not the internal entry', () => {
    manager.registerSession(1, 'socket_1');
    manager.updateDraft(1, 'original');

    const session = manager.getSession(1);
    session!.currentDraft = 'MODIFIED';

    expect(manager.getSession(1)!.currentDraft).toBe('original');
  });

  // ── analysisInFlight ──

  it('should mark analysis in-flight and check status', () => {
    manager.registerSession(1, 'socket_1');
    expect(manager.isAnalysisInFlight(1)).toBe(false);

    expect(manager.markAnalysisInFlight(1)).toBe(true);
    expect(manager.isAnalysisInFlight(1)).toBe(true);
  });

  it('should return false for isAnalysisInFlight on non-existent user', () => {
    expect(manager.isAnalysisInFlight(999)).toBe(false);
  });

  it('should return false for markAnalysisInFlight on non-existent user', () => {
    expect(manager.markAnalysisInFlight(999)).toBe(false);
  });

  it('should clear analysisInFlight flag', () => {
    manager.registerSession(1, 'socket_1');
    manager.markAnalysisInFlight(1);
    manager.clearAnalysisInFlight(1);
    expect(manager.isAnalysisInFlight(1)).toBe(false);
  });

  // ── updateFeedback ──

  it('should store feedback and clear analysisInFlight', () => {
    manager.registerSession(1, 'socket_1');
    manager.markAnalysisInFlight(1);

    const feedback = {
      issues: [],
      score: 0.9,
      suggestions: [],
      goodPoints: ['Good argument'],
      confidence: 0.8,
      generatedAt: new Date(),
    };

    expect(manager.updateFeedback(1, feedback)).toBe(true);
    const session = manager.getSession(1);
    expect(session!.lastFeedback!.score).toBe(0.9);
    expect(session!.analysisInFlight).toBe(false);
  });

  it('should clone feedback on input (no rep exposure)', () => {
    manager.registerSession(1, 'socket_1');
    const feedback = {
      issues: [],
      score: 0.9,
      suggestions: [],
      goodPoints: ['test'],
      confidence: 0.8,
      generatedAt: new Date(),
    };
    manager.updateFeedback(1, feedback);
    feedback.score = 0.1; // mutate original

    expect(manager.getSession(1)!.lastFeedback!.score).toBe(0.9); // unaffected
  });

  // ── getActiveUserIds ──

  it('should return active user IDs', () => {
    manager.registerSession(1, 'socket_1');
    manager.registerSession(2, 'socket_2');
    const ids = manager.getActiveUserIds();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids.length).toBe(2);
  });

  it('should return a new array, not a live reference', () => {
    manager.registerSession(1, 'socket_1');
    const ids1 = manager.getActiveUserIds();
    const ids2 = manager.getActiveUserIds();
    expect(ids1).not.toBe(ids2); // different array instances
  });

  // ── sweepExpiredSessions ──

  it('should evict expired sessions', () => {
    // Use a 1ms timeout so sessions expire immediately
    const shortManager = new WritingFeedbackSessionManager(10, 1);
    shortManager.registerSession(1, 'socket_1');

    // Wait for the session to expire
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    const evicted = shortManager.sweepExpiredSessions();
    expect(evicted).toBe(1);
    expect(shortManager.getSession(1)).toBeNull();
  });

  // ── getSession returns null for expired session ──

  it('should return null for an expired session on getSession', () => {
    const shortManager = new WritingFeedbackSessionManager(10, 1);
    shortManager.registerSession(1, 'socket_1');

    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    expect(shortManager.getSession(1)).toBeNull();
  });
});
