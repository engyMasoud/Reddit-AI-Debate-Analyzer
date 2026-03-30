/**
 * Unit tests for ComposerWithFeedback.jsx
 * Based on: backend/tests/P5/test-specs/ComposerWithFeedback.test-spec.md
 *
 * US3 — Real-Time Writing Feedback
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ComposerWithFeedback from '../../../frontend/src/components/ComposerWithFeedback';
import { RedditContext } from '../../../frontend/src/context/RedditContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock RedditContext value with sensible defaults.
 * Any property can be overridden via `overrides`.
 */
function buildContext(overrides = {}) {
  return {
    analyzeDraft: jest.fn(),
    draftFeedback: null,
    feedbackLoading: false,
    setDraftFeedback: jest.fn(),
    ...overrides,
  };
}

/**
 * Render ComposerWithFeedback wrapped in a RedditContext provider.
 */
function renderWithContext(contextOverrides = {}, props = {}) {
  const ctx = buildContext(contextOverrides);
  const defaultProps = {
    postId: 1,
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    ...props,
  };

  const utils = render(
    <RedditContext.Provider value={ctx}>
      <ComposerWithFeedback {...defaultProps} />
    </RedditContext.Provider>,
  );

  return { ...utils, ctx, props: defaultProps };
}

// ── Factory: mock feedback data ──────────────────────────────────────────────

function createMockIssue(overrides = {}) {
  return {
    id: 1,
    type: 'weak_evidence',
    position: { start: 0, end: 5 },
    lineNumber: 1,
    flaggedText: 'sample flagged text',
    explanation: 'This needs more evidence.',
    severity: 'medium',
    confidence: 0.7,
    ...overrides,
  };
}

function createMockSuggestion(overrides = {}) {
  return {
    id: 1,
    text: 'Add a citation',
    type: 'reference',
    priority: 'high',
    exampleFix: 'According to [source]...',
    ...overrides,
  };
}

function createMockFeedback(overrides = {}) {
  return {
    score: 0.75,
    issues: [],
    goodPoints: [],
    suggestions: [],
    confidence: 0.8,
    generatedAt: new Date(),
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('ComposerWithFeedback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── T-01: Render the empty / initial state ──
  test('T-01 renders empty/initial state with placeholder, empty panel message, and disabled submit', () => {
    renderWithContext();

    // Textarea with placeholder
    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute(
      'placeholder',
      expect.stringContaining('What are your thoughts?'),
    );

    // Right panel shows empty state message
    expect(screen.getByText('Start typing to receive feedback')).toBeInTheDocument();

    // Submit button is disabled
    const submitBtn = screen.getByRole('button', { name: /submit reply/i });
    expect(submitBtn).toBeDisabled();
  });

  // ── T-02: Render loading state ──
  test('T-02 renders loading state with spinner text in panel and header indicator', () => {
    renderWithContext({ feedbackLoading: true });

    // Right panel shows loading message
    expect(screen.getByText('Analyzing your reply...')).toBeInTheDocument();

    // Header shows "Analyzing..." indicator
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  // ── T-03: Render error state ──
  test('T-03 renders error state with failure message and retry button', () => {
    // feedbackError is internal state (useState index 1).
    // Intercept useState to seed feedbackError = true.
    const originalUseState = React.useState;
    let stateCallIndex = 0;
    jest.spyOn(React, 'useState').mockImplementation((init) => {
      stateCallIndex++;
      // 1st call: draftText='', 2nd call: feedbackError
      if (stateCallIndex === 2) {
        return originalUseState(true); // feedbackError = true
      }
      return originalUseState(init);
    });

    renderWithContext();

    // Right panel shows error message
    expect(screen.getByText('Analysis Failed')).toBeInTheDocument();

    // Retry button is present
    expect(screen.getByRole('button', { name: /retry analysis/i })).toBeInTheDocument();
  });

  // ── T-04: Render success state with high score (≥ 70) ──
  test('T-04 renders success state with score gauge, Excellent label, success banner, good points, suggestions, and issues', () => {
    const feedback = createMockFeedback({
      score: 0.85,
      issues: [createMockIssue({ id: 1, type: 'weak_evidence' })],
      goodPoints: ['Clear assertion of main position'],
      suggestions: [createMockSuggestion({ id: 1 })],
      confidence: 0.9,
    });

    renderWithContext({ draftFeedback: feedback });

    // Score gauge shows 85
    expect(screen.getByText('85')).toBeInTheDocument();

    // Excellent label
    expect(screen.getByText('Excellent')).toBeInTheDocument();

    // Success banner
    expect(screen.getByText(/great work/i)).toBeInTheDocument();

    // Good Points section
    expect(screen.getByText('Clear assertion of main position')).toBeInTheDocument();

    // Suggestions section
    expect(screen.getByText('Add a citation')).toBeInTheDocument();
    expect(screen.getByText('According to [source]...')).toBeInTheDocument();

    // Issues section with count
    expect(screen.getByText('Issues (1)')).toBeInTheDocument();
    expect(screen.getByText('Weak Evidence')).toBeInTheDocument();
  });

  // ── T-05: Render success state with low score (< 40) ──
  test('T-05 renders low score with Weak label, no success banner, no good points section', () => {
    const feedback = createMockFeedback({
      score: 0.25,
      issues: [
        createMockIssue({ id: 1, type: 'circular_logic' }),
        createMockIssue({ id: 2, type: 'unsupported_claim' }),
      ],
      goodPoints: [],
      suggestions: [createMockSuggestion({ id: 1 })],
    });

    renderWithContext({ draftFeedback: feedback });

    // Score gauge shows 25
    expect(screen.getByText('25')).toBeInTheDocument();

    // Weak label in red
    expect(screen.getByText('Weak')).toBeInTheDocument();

    // No success banner
    expect(screen.queryByText(/great work/i)).not.toBeInTheDocument();

    // No Good Points section header
    expect(screen.queryByText('Good Points')).not.toBeInTheDocument();
  });

  // ── T-06: Render success state with mid score (40–69) ──
  test('T-06 renders mid score with Needs Work label, good points shown, no success banner, no suggestions section when empty', () => {
    const feedback = createMockFeedback({
      score: 0.55,
      issues: [createMockIssue({ id: 1, type: 'weak_evidence' })],
      goodPoints: ['Something'],
      suggestions: [],
    });

    renderWithContext({ draftFeedback: feedback });

    // Score gauge shows 55
    expect(screen.getByText('55')).toBeInTheDocument();

    // Needs Work label
    expect(screen.getByText('Needs Work')).toBeInTheDocument();

    // No success banner (only shown for score ≥ 70)
    expect(screen.queryByText(/great work/i)).not.toBeInTheDocument();

    // Good points are rendered
    expect(screen.getByText('Something')).toBeInTheDocument();

    // No Suggestions section when suggestions array is empty
    expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
  });

  // ── T-07: Issue cards display flaggedText when present ──
  test('T-07 renders a blockquote with flaggedText inside an issue card', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({
          id: 1,
          type: 'circular_logic',
          flaggedText: 'because I said so',
        }),
      ],
    });

    renderWithContext({ draftFeedback: feedback });

    // The flagged text appears wrapped in smart quotes
    expect(screen.getByText(/because I said so/)).toBeInTheDocument();
  });

  // ── T-08: Issue cards omit flaggedText block when empty ──
  test('T-08 does not render a flaggedText quote when flaggedText is empty', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({
          id: 1,
          type: 'weak_evidence',
          flaggedText: '',
        }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    // The issue card itself is rendered (label visible)
    expect(screen.getByText('Weak Evidence')).toBeInTheDocument();

    // No italic quote paragraph inside the issue card
    // The component only renders the quote div when issue.flaggedText is truthy
    const italicQuotes = container.querySelectorAll('p.italic');
    expect(italicQuotes).toHaveLength(0);
  });

  // ── T-09: Trigger analyzeDraft after 500 ms debounce when draft ≥ 10 chars ──
  test('T-09 calls analyzeDraft after 500 ms debounce when draft has ≥ 10 trimmed characters', () => {
    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type a draft with ≥ 10 characters
    fireEvent.change(textarea, { target: { value: 'A long enough draft text for testing' } });

    // analyzeDraft should NOT have been called yet (debounce pending)
    expect(ctx.analyzeDraft).not.toHaveBeenCalled();

    // Advance timers by 500 ms to trigger the debounce
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Now analyzeDraft should have been called with the draft text
    expect(ctx.analyzeDraft).toHaveBeenCalledTimes(1);
    expect(ctx.analyzeDraft).toHaveBeenCalledWith('A long enough draft text for testing');
  });

  // ── T-10: Clear feedback when draft shrinks below 10 characters ──
  test('T-10 clears feedback and does not call analyzeDraft when draft < 10 trimmed chars', () => {
    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type a short draft (< 10 trimmed characters)
    fireEvent.change(textarea, { target: { value: 'short' } });

    // Advance timers well past debounce
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // analyzeDraft should NOT have been called
    expect(ctx.analyzeDraft).not.toHaveBeenCalled();

    // setDraftFeedback(null) should have been called to clear feedback
    expect(ctx.setDraftFeedback).toHaveBeenCalledWith(null);
  });

  // ── T-11: Reset debounce timer on rapid successive typing ──
  test('T-11 only fires one analyzeDraft call when user types rapidly within 500 ms', () => {
    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // First input (≥ 10 chars)
    fireEvent.change(textarea, { target: { value: 'First draft text here' } });

    // Advance only 200 ms (less than debounce threshold)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Second input before debounce fires
    fireEvent.change(textarea, { target: { value: 'Second draft replacing the first one' } });

    // Now advance full 500 ms from second input
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // analyzeDraft should have been called only once with the FINAL text
    expect(ctx.analyzeDraft).toHaveBeenCalledTimes(1);
    expect(ctx.analyzeDraft).toHaveBeenCalledWith('Second draft replacing the first one');
  });

  // ── T-12: Clears the timeout on cleanup (dependency change) ──
  test('T-12 clears pending timeout when component re-renders before debounce fires', () => {
    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type ≥ 10 chars to start debounce
    fireEvent.change(textarea, { target: { value: 'A long enough first draft' } });

    // Advance only 200 ms (debounce NOT yet fired)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Now type a new value (triggers re-render and cleanup of previous timeout)
    fireEvent.change(textarea, { target: { value: 'A brand new second draft text' } });

    // Advance past the ORIGINAL 500 ms window (200 + 400 = 600 ms total)
    // If cleanup worked, the first draft's timeout was cleared
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // The first draft should NOT have triggered analyzeDraft
    // Only after the second draft's full 500 ms should it fire
    // At this point only 400 ms passed since second draft — should not have fired yet
    expect(ctx.analyzeDraft).not.toHaveBeenCalled();

    // Now advance the remaining 100 ms for the second draft's debounce
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(ctx.analyzeDraft).toHaveBeenCalledTimes(1);
    expect(ctx.analyzeDraft).toHaveBeenCalledWith('A brand new second draft text');
  });

  // ── T-13: Reset draftFeedback on unmount ──
  test('T-13 calls setDraftFeedback(null) when the component unmounts', () => {
    const { ctx, unmount } = renderWithContext();

    // Clear any calls from initial render
    ctx.setDraftFeedback.mockClear();

    // Unmount the component
    unmount();

    // The cleanup effect should have called setDraftFeedback(null)
    expect(ctx.setDraftFeedback).toHaveBeenCalledWith(null);
  });

  // ── T-14: Sync backdrop scroll position to textarea ──
  test('T-14 syncs backdrop scrollTop/scrollLeft to textarea on scroll event', () => {
    const { container } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    // The backdrop is the aria-hidden div with dangerouslySetInnerHTML
    const backdrop = container.querySelector('[aria-hidden="true"]');

    // Simulate setting scrollTop/scrollLeft on the textarea
    Object.defineProperty(textarea, 'scrollTop', { value: 100, writable: true });
    Object.defineProperty(textarea, 'scrollLeft', { value: 20, writable: true });

    // Fire scroll event on textarea
    fireEvent.scroll(textarea);

    // Backdrop should now mirror the textarea's scroll position
    expect(backdrop.scrollTop).toBe(100);
    expect(backdrop.scrollLeft).toBe(20);
  });

  // ── T-15: handleScroll no-op when refs are null ──
  test('T-15 does not throw when scroll fires and backdrop ref is absent', () => {
    // Render with feedback to get the backdrop overlay visible, then remove it
    const { container } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    const backdrop = container.querySelector('[aria-hidden="true"]');

    // Remove the backdrop from the DOM to simulate a null ref scenario
    if (backdrop) backdrop.remove();

    // Firing scroll should not throw — handleScroll guards against null refs
    expect(() => {
      fireEvent.scroll(textarea);
    }).not.toThrow();
  });

  // ── T-16: handleSubmit — submit trimmed draft and reset state ──
  test('T-16 submits trimmed draft, resets textarea, and clears feedback', () => {
    const { ctx, props } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type a draft with leading/trailing whitespace
    fireEvent.change(textarea, { target: { value: '  Hello world  ' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /submit reply/i });
    fireEvent.click(submitBtn);

    // onSubmit should be called with trimmed text
    expect(props.onSubmit).toHaveBeenCalledWith('Hello world');

    // Textarea should be reset to empty
    expect(textarea).toHaveValue('');

    // setDraftFeedback(null) should have been called
    expect(ctx.setDraftFeedback).toHaveBeenCalledWith(null);
  });

  // ── T-17: handleSubmit no-op for whitespace-only draft ──
  test('T-17 does not call onSubmit when draft is whitespace-only', () => {
    const { props } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type whitespace-only text
    fireEvent.change(textarea, { target: { value: '   ' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /submit reply/i });
    fireEvent.click(submitBtn);

    // onSubmit should NOT have been called
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  // ── T-19: handleCancel resets state and calls onCancel ──
  test('T-19 resets textarea, clears feedback, and invokes onCancel callback', () => {
    const { ctx, props } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type some text
    fireEvent.change(textarea, { target: { value: 'some text' } });

    // Click cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Textarea should be reset
    expect(textarea).toHaveValue('');

    // setDraftFeedback(null) should have been called
    expect(ctx.setDraftFeedback).toHaveBeenCalledWith(null);

    // onCancel should have been invoked
    expect(props.onCancel).toHaveBeenCalled();
  });

  // ── T-20: handleCancel when onCancel is undefined ──
  test('T-20 resets state without error when onCancel prop is not provided', () => {
    const { ctx } = renderWithContext({}, { onCancel: undefined });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type some text
    fireEvent.change(textarea, { target: { value: 'some text' } });

    // Click cancel — should not throw even though onCancel is undefined
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(() => fireEvent.click(cancelBtn)).not.toThrow();

    // Textarea should be reset
    expect(textarea).toHaveValue('');

    // setDraftFeedback(null) should have been called
    expect(ctx.setDraftFeedback).toHaveBeenCalledWith(null);
  });

  // ── T-21: handleRetry re-triggers analysis when draft ≥ 10 characters ──
  test('T-21 clears error and calls analyzeDraft when retry clicked with ≥ 10 char draft', () => {
    // Seed feedbackError = true via useState spy
    const originalUseState = React.useState;
    let stateCallIndex = 0;
    jest.spyOn(React, 'useState').mockImplementation((init) => {
      stateCallIndex++;
      if (stateCallIndex === 2) {
        return originalUseState(true); // feedbackError = true
      }
      return originalUseState(init);
    });

    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type ≥ 10 characters
    fireEvent.change(textarea, { target: { value: 'A long enough draft' } });

    // Click Retry Analysis button
    const retryBtn = screen.getByRole('button', { name: /retry analysis/i });
    fireEvent.click(retryBtn);

    // analyzeDraft should have been called with the current draft text
    expect(ctx.analyzeDraft).toHaveBeenCalledWith('A long enough draft');
  });

  // ── T-22: handleRetry skips analysis when draft < 10 characters ──
  test('T-22 clears error but does NOT call analyzeDraft when draft < 10 chars', () => {
    // Seed feedbackError = true via useState spy
    const originalUseState = React.useState;
    let stateCallIndex = 0;
    jest.spyOn(React, 'useState').mockImplementation((init) => {
      stateCallIndex++;
      if (stateCallIndex === 2) {
        return originalUseState(true); // feedbackError = true
      }
      return originalUseState(init);
    });

    const { ctx } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Type < 10 characters
    fireEvent.change(textarea, { target: { value: 'short' } });

    // Clear mock to isolate retry-specific calls
    ctx.analyzeDraft.mockClear();

    // Click Retry Analysis button
    const retryBtn = screen.getByRole('button', { name: /retry analysis/i });
    fireEvent.click(retryBtn);

    // analyzeDraft should NOT have been called
    expect(ctx.analyzeDraft).not.toHaveBeenCalled();
  });

  // ── T-23: buildHighlightedMarkup — plain escaped text when no feedback ──
  test('T-23 backdrop contains escaped text with no <mark> tags when draftFeedback is null', () => {
    const { container } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Hello <world>' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    // Should contain escaped HTML — no mark tags
    expect(backdrop.innerHTML).toContain('Hello &lt;world&gt;');
    expect(backdrop.innerHTML).not.toContain('<mark');
  });

  // ── T-24: buildHighlightedMarkup — plain text when feedback has empty issues ──
  test('T-24 backdrop contains plain text with no <mark> tags when issues array is empty', () => {
    const feedback = createMockFeedback({
      score: 0.8,
      issues: [],
      goodPoints: ['Good'],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Test' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).not.toContain('<mark');
  });

  // ── T-25: buildHighlightedMarkup — wrap single issue in <mark> tag ──
  test('T-25 backdrop wraps a single issue position in a <mark> tag with correct classes', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({
          id: 1,
          type: 'circular_logic',
          position: { start: 8, end: 17 },
        }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'This is bad logic here' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toContain('<mark');
    expect(backdrop.innerHTML).toContain('border-orange-400 bg-orange-50');
    expect(backdrop.innerHTML).toContain('bad logic');
  });

  // ── T-26: buildHighlightedMarkup — weak_evidence → yellow classes ──
  test('T-26 backdrop uses yellow classes for weak_evidence issue type', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({
          id: 1,
          type: 'weak_evidence',
          position: { start: 0, end: 5 },
        }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Hello world testing here' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toContain('border-yellow-400 bg-yellow-50');
  });

  // ── T-27: buildHighlightedMarkup — unsupported_claim → red classes ──
  test('T-27 backdrop uses red classes for unsupported_claim issue type', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({
          id: 1,
          type: 'unsupported_claim',
          position: { start: 0, end: 5 },
        }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Hello world testing here' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toContain('border-red-400 bg-red-50');
  });

  // ── T-28: buildHighlightedMarkup — skip overlapping issues ──
  test('T-28 backdrop skips overlapping issues (only first produces a <mark>)', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        createMockIssue({ id: 1, type: 'weak_evidence', position: { start: 0, end: 10 } }),
        createMockIssue({ id: 2, type: 'circular_logic', position: { start: 5, end: 15 } }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'This is overlapping text here' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    const marks = backdrop.querySelectorAll('mark');
    // Only one mark — second issue overlaps and is skipped
    expect(marks).toHaveLength(1);
    expect(backdrop.innerHTML).toContain('border-yellow-400');
  });

  // ── T-29: buildHighlightedMarkup — multiple non-overlapping issues sorted ──
  test('T-29 backdrop renders two <mark> tags for non-overlapping issues regardless of input order', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [
        // Provided out of position order
        createMockIssue({ id: 2, type: 'circular_logic', position: { start: 20, end: 25 } }),
        createMockIssue({ id: 1, type: 'weak_evidence', position: { start: 0, end: 5 } }),
      ],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Hello world -- here is more text' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    const marks = backdrop.querySelectorAll('mark');
    // Both issues should produce mark tags (sorted by position.start)
    expect(marks).toHaveLength(2);
  });

  // ── T-30: escapeHtml — escape all five special characters ──
  test('T-30 backdrop escapes &, <, >, ", and \' in draft text', () => {
    const { container } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: '<div class="a&b">It\'s</div>' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toContain('&lt;div class=&quot;a&amp;b&quot;&gt;It&#039;s&lt;/div&gt;');
  });

  // ── T-31: escapeHtml — return unchanged text when no special chars ──
  test('T-31 backdrop returns unchanged text when no special characters', () => {
    const { container } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });
    fireEvent.change(textarea, { target: { value: 'Hello world' } });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toContain('Hello world');
  });

  // ── T-32: escapeHtml — handle empty string ──
  test('T-32 backdrop handles empty draft text without error', () => {
    const { container } = renderWithContext();

    // Textarea starts empty — backdrop should just have a newline
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop.innerHTML).toBe('\n');
  });

  // ── T-33: getScoreColor — Excellent tier (score ≥ 70) ──
  test('T-33 score of 70 renders Excellent label with green stroke class', () => {
    const feedback = createMockFeedback({ score: 0.70, issues: [createMockIssue()] });
    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    // Check green stroke class on SVG circle
    const circles = container.querySelectorAll('circle');
    const strokeCircle = Array.from(circles).find(c => c.classList.contains('stroke-green-500'));
    expect(strokeCircle).toBeTruthy();
  });

  // ── T-35: getScoreColor — Needs Work tier (40 ≤ score < 70) ──
  test('T-35 score of 40 renders Needs Work label with orange stroke class', () => {
    const feedback = createMockFeedback({ score: 0.40, issues: [createMockIssue()] });
    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Needs Work')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    const circles = container.querySelectorAll('circle');
    const strokeCircle = Array.from(circles).find(c => c.classList.contains('stroke-orange-400'));
    expect(strokeCircle).toBeTruthy();
  });

  // ── T-37: getScoreColor — Weak tier (score < 40) ──
  test('T-37 score of 39 renders Weak label with red stroke class', () => {
    const feedback = createMockFeedback({ score: 0.39, issues: [createMockIssue()] });
    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(screen.getByText('39')).toBeInTheDocument();
    const circles = container.querySelectorAll('circle');
    const strokeCircle = Array.from(circles).find(c => c.classList.contains('stroke-red-500'));
    expect(strokeCircle).toBeTruthy();
  });

  // ── T-40: getRightPanelState — error takes priority over loading ──
  test('T-40 renders error panel even when feedbackLoading is also true', () => {
    const originalUseState = React.useState;
    let stateCallIndex = 0;
    jest.spyOn(React, 'useState').mockImplementation((init) => {
      stateCallIndex++;
      if (stateCallIndex === 2) return originalUseState(true);
      return originalUseState(init);
    });

    renderWithContext({ feedbackLoading: true });

    // Error takes priority over loading
    expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
    expect(screen.queryByText('Analyzing your reply...')).not.toBeInTheDocument();
  });

  // ── T-44: getIssueTheme — weak_evidence ──
  test('T-44 renders Weak Evidence label with yellow border for weak_evidence issue', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [createMockIssue({ id: 1, type: 'weak_evidence' })],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Weak Evidence')).toBeInTheDocument();
    // Issue card has yellow border class
    const issueCard = container.querySelector('.border-yellow-300');
    expect(issueCard).toBeTruthy();
  });

  // ── T-45: getIssueTheme — circular_logic ──
  test('T-45 renders Circular Logic label with orange border for circular_logic issue', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [createMockIssue({ id: 1, type: 'circular_logic' })],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Circular Logic')).toBeInTheDocument();
    const issueCard = container.querySelector('.border-orange-300');
    expect(issueCard).toBeTruthy();
  });

  // ── T-46: getIssueTheme — unsupported_claim ──
  test('T-46 renders Unsupported Claim label with red border for unsupported_claim issue', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [createMockIssue({ id: 1, type: 'unsupported_claim' })],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Unsupported Claim')).toBeInTheDocument();
    const issueCard = container.querySelector('.border-red-300');
    expect(issueCard).toBeTruthy();
  });

  // ── T-47: getIssueTheme — default theme for unrecognised type ──
  test('T-47 renders generic Issue label with slate border for unknown issue type', () => {
    const feedback = createMockFeedback({
      score: 0.5,
      issues: [createMockIssue({ id: 1, type: 'something_else' })],
    });

    const { container } = renderWithContext({ draftFeedback: feedback });

    expect(screen.getByText('Issue')).toBeInTheDocument();
    const issueCard = container.querySelector('.border-slate-300');
    expect(issueCard).toBeTruthy();
  });

  // ── T-48: Integration — full flow: type → debounce → feedback → render issues ──
  test('T-48 full flow: type text, debounce fires analyzeDraft, then feedback renders score and issues', () => {
    const draftText = 'A sufficiently long draft to trigger analysis';

    // Create feedback that will be "returned" after analysis
    const feedbackResult = createMockFeedback({
      score: 0.6,
      issues: [
        createMockIssue({ id: 1, type: 'weak_evidence', position: { start: 0, end: 14 } }),
        createMockIssue({ id: 2, type: 'circular_logic', position: { start: 20, end: 30 } }),
      ],
      goodPoints: ['Clear writing'],
    });

    // Start with no feedback
    const { ctx, container, rerender } = renderWithContext();

    const textarea = screen.getByRole('textbox', { name: /write your reply/i });

    // Step 1: Type the draft text
    fireEvent.change(textarea, { target: { value: draftText } });
    expect(textarea).toHaveValue(draftText);

    // Step 2: Before debounce, panel should still be empty
    expect(screen.getByText('Start typing to receive feedback')).toBeInTheDocument();

    // Step 3: Advance timer to trigger debounce
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // analyzeDraft should have been called
    expect(ctx.analyzeDraft).toHaveBeenCalledWith(draftText);

    // Step 4: Re-render with feedback to simulate context update
    const updatedCtx = buildContext({ draftFeedback: feedbackResult });
    rerender(
      <RedditContext.Provider value={updatedCtx}>
        <ComposerWithFeedback postId={1} onSubmit={jest.fn()} onCancel={jest.fn()} />
      </RedditContext.Provider>,
    );

    // Step 5: Score gauge shows 60
    expect(screen.getByText('60')).toBeInTheDocument();

    // Needs Work label
    expect(screen.getByText('Needs Work')).toBeInTheDocument();

    // Two issue cards rendered
    expect(screen.getByText('Weak Evidence')).toBeInTheDocument();
    expect(screen.getByText('Circular Logic')).toBeInTheDocument();

    // Backdrop contains two <mark> elements
    const backdrop = container.querySelector('[aria-hidden="true"]');
    const marks = backdrop.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
  });
});
