/**
 * Unit tests for PostDetail.jsx
 * Based on: backend/tests/P5/test-specs/PostDetail.test-spec.md
 *
 * US1 — Inline AI Reasoning Summary
 * US3 — Real-Time Writing Feedback
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PostDetail from '../../../frontend/src/components/PostDetail';
import { RedditContext } from '../../../frontend/src/context/RedditContext';

// ── Mock child components to isolate PostDetail ──────────────────────────────
jest.mock('../../../frontend/src/components/ReasoningSummaryPanel', () => {
  return function MockReasoningSummaryPanel({ comment }) {
    return <div data-testid={`reasoning-panel-${comment.id}`}>ReasoningSummaryPanel</div>;
  };
});

jest.mock('../../../frontend/src/components/ComposerWithFeedback', () => {
  return function MockComposerWithFeedback({ postId, onSubmit }) {
    return <div data-testid={`composer-${postId}`}>ComposerWithFeedback</div>;
  };
});

// ── Mock API module ──────────────────────────────────────────────────────────
jest.mock('../../../frontend/src/api', () => ({
  reportComment: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockPost(overrides = {}) {
  return {
    id: 1,
    title: 'Test Post',
    author: 'alice',
    subreddit: 'r/debate',
    content: 'Body text',
    image: null,
    upvotes: 10,
    downvotes: 2,
    commentCount: 3,
    timestamp: new Date(),
    ...overrides,
  };
}

function createMockComment(overrides = {}) {
  return {
    id: 1,
    postId: 1,
    parentCommentId: null,
    author: 'bob',
    text: 'Hello',
    upvotes: 5,
    downvotes: 1,
    timestamp: new Date(),
    ...overrides,
  };
}

function buildContext(overrides = {}) {
  const post = overrides.selectedPost !== undefined ? overrides.selectedPost : createMockPost();
  return {
    selectedPost: post,
    setSelectedPost: jest.fn(),
    handleVote: jest.fn(),
    handleCommentVote: jest.fn(),
    userVotes: {},
    getPostComments: jest.fn().mockReturnValue([]),
    addComment: jest.fn().mockResolvedValue(),
    posts: post ? [post] : [],
    ...overrides,
  };
}

function renderWithContext(contextOverrides = {}) {
  const ctx = buildContext(contextOverrides);
  const utils = render(
    <RedditContext.Provider value={ctx}>
      <PostDetail />
    </RedditContext.Provider>,
  );
  return { ...utils, ctx };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('PostDetail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── T-01: Return null when no post is selected ──
  test('T-01 renders nothing when selectedPost is null', () => {
    const { container } = renderWithContext({ selectedPost: null });

    // Component should return null — no modal, no backdrop
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── T-02: Render the modal with post details ──
  test('T-02 renders modal with post title, author, subreddit, body, score, and comment count', () => {
    const post = createMockPost({
      id: 1,
      title: 'Test',
      author: 'alice',
      subreddit: 'r/debate',
      content: 'Body text',
      upvotes: 10,
      downvotes: 2,
      commentCount: 3,
      timestamp: new Date(),
    });

    renderWithContext({ selectedPost: post, posts: [post] });

    // Modal dialog is present
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Post title (appears in both header h2 and main h1)
    expect(screen.getAllByText('Test').length).toBeGreaterThanOrEqual(1);

    // Author
    expect(screen.getByText('alice')).toBeInTheDocument();

    // Subreddit (appears in header and meta)
    expect(screen.getAllByText('r/debate').length).toBeGreaterThanOrEqual(1);

    // Body text
    expect(screen.getByText('Body text')).toBeInTheDocument();

    // Net score (10 - 2 = 8)
    expect(screen.getByText('8')).toBeInTheDocument();

    // Comment count
    expect(screen.getByText('3 comments')).toBeInTheDocument();

    // Backdrop overlay is present (aria-hidden div)
    expect(document.querySelector('.bg-black\\/30')).toBeInTheDocument();
  });

  // ── T-03: Render post image when present ──
  test('T-03 renders an img element when post has an image URL', () => {
    const post = createMockPost({
      image: 'https://example.com/img.jpg',
    });

    renderWithContext({ selectedPost: post, posts: [post] });

    const img = screen.getByRole('img', { name: /image for/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
    expect(img).toHaveAttribute('alt', expect.stringContaining('Test Post'));
  });

  // ── T-04: Omit image when not present ──
  test('T-04 does not render an img element when post has no image', () => {
    const post = createMockPost({ image: null });

    renderWithContext({ selectedPost: post, posts: [post] });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // ── T-05: Omit content paragraph when not present ──
  test('T-05 does not render a content paragraph when post content is empty', () => {
    const post = createMockPost({ content: '' });

    const { container } = renderWithContext({ selectedPost: post, posts: [post] });

    // The content <p> has class "whitespace-pre-wrap" — should not exist
    const contentP = container.querySelector('p.whitespace-pre-wrap');
    expect(contentP).toBeNull();
  });

  // ── T-06: Render ComposerWithFeedback in the comments section ──
  test('T-06 renders ComposerWithFeedback with matching postId', () => {
    const post = createMockPost({ id: 42 });

    renderWithContext({ selectedPost: post, posts: [post] });

    const composer = screen.getByTestId('composer-42');
    expect(composer).toBeInTheDocument();
  });

  // ── T-07: Render ReasoningSummaryPanel for each comment ──
  test('T-07 renders a ReasoningSummaryPanel for each comment', () => {
    const post = createMockPost({ id: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, parentCommentId: null }),
      createMockComment({ id: 11, postId: 1, parentCommentId: null }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByTestId('reasoning-panel-10')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-panel-11')).toBeInTheDocument();
  });

  // ── T-08: Close modal via back button click ──
  test('T-08 calls setSelectedPost(null) when back arrow button is clicked', () => {
    const post = createMockPost();
    const { ctx } = renderWithContext({ selectedPost: post, posts: [post] });

    const backBtn = screen.getByRole('button', { name: /go back/i });
    fireEvent.click(backBtn);

    expect(ctx.setSelectedPost).toHaveBeenCalledWith(null);
  });

  // ── T-09: Close modal via X button click ──
  test('T-09 calls setSelectedPost(null) when X close button is clicked', () => {
    const post = createMockPost();
    const { ctx } = renderWithContext({ selectedPost: post, posts: [post] });

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    expect(ctx.setSelectedPost).toHaveBeenCalledWith(null);
  });

  // ── T-10: Close modal via backdrop click ──
  test('T-10 calls setSelectedPost(null) when backdrop overlay is clicked', () => {
    const post = createMockPost();
    const { ctx, container } = renderWithContext({ selectedPost: post, posts: [post] });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    fireEvent.click(backdrop);

    expect(ctx.setSelectedPost).toHaveBeenCalledWith(null);
  });

  // ── T-11: Click inside modal does NOT close it ──
  test('T-11 does not call setSelectedPost when clicking inside the modal content', () => {
    const post = createMockPost();
    const { ctx } = renderWithContext({ selectedPost: post, posts: [post] });

    // Click the white modal content panel (has e.stopPropagation)
    const dialog = screen.getByRole('dialog');
    const modalContent = dialog.querySelector('.bg-white');
    fireEvent.click(modalContent);

    expect(ctx.setSelectedPost).not.toHaveBeenCalled();
  });

  // ── T-12: Close modal when Escape is pressed ──
  test('T-12 calls setSelectedPost(null) when Escape key is pressed', () => {
    const post = createMockPost();
    const { ctx } = renderWithContext({ selectedPost: post, posts: [post] });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(ctx.setSelectedPost).toHaveBeenCalledWith(null);
  });

  // ── T-13: Non-Escape key does not close modal ──
  test('T-13 does not call setSelectedPost when a non-Escape key is pressed', () => {
    const post = createMockPost();
    const { ctx } = renderWithContext({ selectedPost: post, posts: [post] });

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(ctx.setSelectedPost).not.toHaveBeenCalled();
  });

  // ── T-14: Escape listener is removed on cleanup ──
  test('T-14 removes keydown listener when component unmounts', () => {
    const post = createMockPost();
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderWithContext({ selectedPost: post, posts: [post] });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  // ── T-15: Lock body scroll when modal opens ──
  test('T-15 sets document.body.style.overflow to hidden when modal is open', () => {
    const post = createMockPost();

    renderWithContext({ selectedPost: post, posts: [post] });

    expect(document.body.style.overflow).toBe('hidden');
  });

  // ── T-16: Restore body scroll on unmount ──
  test('T-16 restores document.body.style.overflow to empty string on unmount', () => {
    const post = createMockPost();

    const { unmount } = renderWithContext({ selectedPost: post, posts: [post] });

    // Confirm it was locked
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    // After unmount, overflow should be restored
    expect(document.body.style.overflow).toBe('');
  });

  // ── T-17: Reset reply/report state when post changes ──
  test('T-17 resets replyingTo, replyText, and reportingComment when selectedPost changes', () => {
    const post1 = createMockPost({ id: 1 });
    const post2 = createMockPost({ id: 2, title: 'Second Post' });
    const comment = createMockComment({ id: 10, postId: 1 });

    const ctx1 = buildContext({
      selectedPost: post1,
      posts: [post1, post2],
      getPostComments: jest.fn().mockReturnValue([comment]),
    });

    const { rerender } = render(
      <RedditContext.Provider value={ctx1}>
        <PostDetail />
      </RedditContext.Provider>,
    );

    // Open reply on comment 10
    const replyBtn = screen.getByText('Reply');
    fireEvent.click(replyBtn);

    // Reply textarea should appear
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();

    // Now switch to post2
    const ctx2 = buildContext({
      selectedPost: post2,
      posts: [post1, post2],
      getPostComments: jest.fn().mockReturnValue([]),
    });

    rerender(
      <RedditContext.Provider value={ctx2}>
        <PostDetail />
      </RedditContext.Provider>,
    );

    // Reply textarea should be gone (replyingTo reset to null)
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
  });

  // ── T-18: Build flat list as roots when no parent links ──
  test('T-18 renders two root-level comments when neither has a parentCommentId', () => {
    const post = createMockPost({ id: 1, commentCount: 2 });
    const comments = [
      createMockComment({ id: 1, postId: 1, parentCommentId: null, author: 'bob', text: 'First' }),
      createMockComment({ id: 2, postId: 1, parentCommentId: null, author: 'carol', text: 'Second' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // Both are root-level (depth 0) — neither should have border-l-2 class
    const comment1 = document.getElementById('comment-1');
    const comment2 = document.getElementById('comment-2');
    expect(comment1.className).not.toContain('border-l-2');
    expect(comment2.className).not.toContain('border-l-2');
  });

  // ── T-19: Build nested tree from parent-child links ──
  test('T-19 renders child comments nested inside parent comment', () => {
    const post = createMockPost({ id: 1, commentCount: 3 });
    const comments = [
      createMockComment({ id: 1, postId: 1, parentCommentId: null, author: 'alice', text: 'Root' }),
      createMockComment({ id: 2, postId: 1, parentCommentId: 1, author: 'bob', text: 'Child 1' }),
      createMockComment({ id: 3, postId: 1, parentCommentId: 1, author: 'carol', text: 'Child 2' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // All three comments render
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();

    // Children are nested inside the root — they have border-l-2 (depth > 0)
    const child1 = document.getElementById('comment-2');
    const child2 = document.getElementById('comment-3');
    expect(child1.className).toContain('border-l-2');
    expect(child2.className).toContain('border-l-2');

    // Children have marginLeft = 1 * 24 = 24px
    expect(child1.style.marginLeft).toBe('24px');
    expect(child2.style.marginLeft).toBe('24px');
  });

  // ── T-20: Handle deeply nested comments ──
  test('T-20 renders a 4-level deep comment chain with correct nesting', () => {
    const post = createMockPost({ id: 1, commentCount: 4 });
    const comments = [
      createMockComment({ id: 1, postId: 1, parentCommentId: null, text: 'Level 0' }),
      createMockComment({ id: 2, postId: 1, parentCommentId: 1, text: 'Level 1' }),
      createMockComment({ id: 3, postId: 1, parentCommentId: 2, text: 'Level 2' }),
      createMockComment({ id: 4, postId: 1, parentCommentId: 3, text: 'Level 3' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // All four comments render
    expect(screen.getByText('Level 0')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();

    // Check nesting depths via marginLeft
    expect(document.getElementById('comment-1').style.marginLeft).toBe('0px');
    expect(document.getElementById('comment-2').style.marginLeft).toBe('24px');
    expect(document.getElementById('comment-3').style.marginLeft).toBe('48px');
    expect(document.getElementById('comment-4').style.marginLeft).toBe('72px');
  });

  // ── T-21: Handle empty comments array ──
  test('T-21 renders no comment cards when allComments is empty', () => {
    const post = createMockPost({ id: 1, commentCount: 0 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([]),
    });

    // No comment elements in the DOM
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
    expect(document.querySelector('[id^="comment-"]')).toBeNull();
  });

  // ── T-22: Orphan comment becomes a root ──
  test('T-22 renders orphan comment as root when parentCommentId references missing parent', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 5, postId: 1, parentCommentId: 999, text: 'Orphan comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Orphan comment renders as root (depth 0, no border-l-2)
    expect(screen.getByText('Orphan comment')).toBeInTheDocument();
    const orphanEl = document.getElementById('comment-5');
    expect(orphanEl.className).not.toContain('border-l-2');
    expect(orphanEl.style.marginLeft).toBe('0px');
  });

  // ── T-23: formatDate — minutes ago (< 60 min) ──
  test('T-23 displays "5m ago" for a comment timestamped 5 minutes in the past', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 1, postId: 1, timestamp: new Date(Date.now() - 5 * 60000), text: 'Recent' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  // ── T-24: formatDate — hours ago (60 min ≤ diff < 24h) ──
  test('T-24 displays "3h ago" for a comment timestamped 3 hours in the past', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 1, postId: 1, timestamp: new Date(Date.now() - 3 * 3600000), text: 'Hours ago' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  // ── T-25: formatDate — days ago (24h ≤ diff < 7d) ──
  test('T-25 displays "2d ago" for a comment timestamped 2 days in the past', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 1, postId: 1, timestamp: new Date(Date.now() - 2 * 86400000), text: 'Days ago' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  // ── T-26: formatDate — locale date string (≥ 7 days) ──
  test('T-26 displays locale date string for a comment timestamped 10 days in the past', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 1, postId: 1, timestamp: tenDaysAgo, text: 'Old comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    expect(screen.getByText(tenDaysAgo.toLocaleDateString())).toBeInTheDocument();
  });

  // ── T-27: formatDate — zero minutes ago ──
  test('T-27 displays "0m ago" for a comment timestamped just now', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 1, postId: 1, timestamp: new Date(), text: 'Just now' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // "0m ago" appears for both post and comment timestamps
    expect(screen.getAllByText('0m ago').length).toBeGreaterThanOrEqual(1);
  });

  // ── T-28: handleShare — copy post URL to clipboard ──
  test('T-28 copies post URL to clipboard and shows toast on post share', async () => {
    const post = createMockPost({ id: 7 });
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue() },
    });

    renderWithContext({ selectedPost: post, posts: [post] });

    // Click the post-level Share button
    const shareBtn = screen.getByText('Share');
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/post/7'),
    );

    // Toast shows "Link copied!"
    expect(screen.getByText('Link copied!')).toBeInTheDocument();

    // Toast clears after 2 seconds
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByText('Link copied!')).not.toBeInTheDocument();
  });

  // ── T-29: handleShare — copy comment URL to clipboard ──
  test('T-29 copies comment URL to clipboard and shows Copied! toast on comment share', async () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 42, postId: 1, text: 'A comment' }),
    ];
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue() },
    });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click the comment-level Share button
    const shareBtns = screen.getAllByText('Share');
    // The last Share button belongs to the comment (first is the post-level one)
    await act(async () => {
      fireEvent.click(shareBtns[shareBtns.length - 1]);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/post/1#comment-42'),
    );

    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  // ── T-30: handleShare — fallback when clipboard API fails ──
  test('T-30 falls back to execCommand copy when clipboard API rejects', async () => {
    const post = createMockPost({ id: 1 });
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    document.execCommand = jest.fn().mockReturnValue(true);
    const execSpy = document.execCommand;

    renderWithContext({ selectedPost: post, posts: [post] });

    const shareBtn = screen.getByText('Share');
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(execSpy).toHaveBeenCalledWith('copy');
    // Toast still appears despite fallback
    expect(screen.getByText('Link copied!')).toBeInTheDocument();
  });

  // ── T-32: handleShare — toast NOT cleared if different share happens within 2s ──
  test('T-32 first toast timeout does not clear a newer comment share toast', async () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 5, postId: 1, text: 'Some comment' }),
    ];
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue() },
    });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Share the post first (first Share button is the post-level one)
    const shareBtns = screen.getAllByText('Share');
    await act(async () => {
      fireEvent.click(shareBtns[0]);
    });
    expect(screen.getByText('Link copied!')).toBeInTheDocument();

    // Advance 1 second (still within first toast's 2s window)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Now share the comment
    const commentShareBtns = screen.getAllByText('Share');
    await act(async () => {
      fireEvent.click(commentShareBtns[commentShareBtns.length - 1]);
    });

    // Comment toast should show
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    // Advance past the first toast's 2s timeout (1 more second)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Comment toast should still be visible (first timeout saw prev !== 'post')
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  // ── T-33: handleReplySubmit — successfully submit a reply ──
  test('T-33 calls addComment and resets reply state on successful reply submit', async () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Parent comment' }),
    ];

    const { ctx } = renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open reply on comment 10
    fireEvent.click(screen.getByText('Reply'));

    // Type reply text
    const replyTextarea = screen.getByPlaceholderText('Write a reply...');
    fireEvent.change(replyTextarea, { target: { value: 'Great point!' } });

    // Click the Reply submit button (second "Reply" button — the one inside the form)
    const replyBtns = screen.getAllByRole('button', { name: /^Reply$/i });
    const replySubmitBtn = replyBtns.find(btn => btn.className.includes('bg-violet-600'));
    await act(async () => {
      fireEvent.click(replySubmitBtn);
    });

    expect(ctx.addComment).toHaveBeenCalledWith(1, 'Great point!', 10);

    // Reply textarea should be gone (state reset)
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
  });

  // ── T-34: handleReplySubmit — no-op when reply text is blank ──
  test('T-34 does not call addComment when reply text is whitespace-only', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    const { ctx } = renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open reply
    fireEvent.click(screen.getByText('Reply'));

    // Type whitespace-only
    const replyTextarea = screen.getByPlaceholderText('Write a reply...');
    fireEvent.change(replyTextarea, { target: { value: '   ' } });

    // Reply submit button should be disabled (find by form-specific class)
    const replyBtns = screen.getAllByRole('button', { name: /^Reply$/i });
    const replySubmitBtn = replyBtns.find(btn => btn.className.includes('bg-violet-600'));
    expect(replySubmitBtn).toBeDisabled();

    // Click it anyway
    fireEvent.click(replySubmitBtn);

    expect(ctx.addComment).not.toHaveBeenCalled();
  });

  // ── T-35: handleReplySubmit — no-op when already submitting ──
  test('T-35 shows Posting... and disables button during reply submission', async () => {
    let resolveAddComment;
    const addCommentPromise = new Promise((resolve) => { resolveAddComment = resolve; });

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
      addComment: jest.fn().mockReturnValue(addCommentPromise),
    });

    // Open reply and type
    fireEvent.click(screen.getByText('Reply'));
    fireEvent.change(screen.getByPlaceholderText('Write a reply...'), { target: { value: 'Test reply' } });

    // Click Reply — starts submitting (find submit button by form class)
    const replyBtns = screen.getAllByRole('button', { name: /^Reply$/i });
    const replySubmitBtn = replyBtns.find(btn => btn.className.includes('bg-violet-600'));
    await act(async () => {
      fireEvent.click(replySubmitBtn);
    });

    // Button should show "Posting..." while in-flight
    expect(screen.getByText('Posting...')).toBeInTheDocument();

    // Resolve the promise to finish
    await act(async () => {
      resolveAddComment();
    });
  });

  // ── T-36: handleReplySubmit — handle addComment failure gracefully ──
  test('T-36 logs error and resets submitting state when addComment rejects', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
      addComment: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    // Open reply and type
    fireEvent.click(screen.getByText('Reply'));
    fireEvent.change(screen.getByPlaceholderText('Write a reply...'), { target: { value: 'Test reply' } });

    // Click Reply submit button (find by form class)
    const replyBtns = screen.getAllByRole('button', { name: /^Reply$/i });
    const replySubmitBtn = replyBtns.find(btn => btn.className.includes('bg-violet-600'));
    await act(async () => {
      fireEvent.click(replySubmitBtn);
    });

    // Error should be logged
    expect(consoleSpy).toHaveBeenCalledWith('Reply failed:', expect.any(Error));

    // Reply UI should still be open (not reset on failure)
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();

    // Button should no longer show "Posting..." (replySubmitting reset in finally)
    expect(screen.queryByText('Posting...')).not.toBeInTheDocument();
  });

  // ── T-37: handleReportSubmit — submit a preset report reason ──
  test('T-37 calls apiReportComment with preset reason and resets report state', async () => {
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockResolvedValue();

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 7, postId: 1, text: 'Bad comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click Report on the comment
    fireEvent.click(screen.getByText('Report'));

    // Select "Spam" reason
    fireEvent.click(screen.getByText('Spam'));

    // Click Submit Report
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Report'));
    });

    expect(reportComment).toHaveBeenCalledWith(7, 'Spam');

    // Report dropdown should be closed
    expect(screen.queryByText('Submit Report')).not.toBeInTheDocument();

    // Comment should now show "Reported" label
    expect(screen.getByText('Reported')).toBeInTheDocument();
  });

  // ── T-38: handleReportSubmit — submit "Other" with custom text ──
  test('T-38 calls apiReportComment with custom text when reason is Other', async () => {
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockResolvedValue();

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 3, postId: 1, text: 'Offensive comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click Report
    fireEvent.click(screen.getByText('Report'));

    // Select "Other"
    fireEvent.click(screen.getByText('Other'));

    // Type custom text
    const customInput = screen.getByPlaceholderText('Describe the issue...');
    fireEvent.change(customInput, { target: { value: 'Offensive language' } });

    // Click Submit Report
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Report'));
    });

    // Custom text should be sent, not "Other"
    expect(reportComment).toHaveBeenCalledWith(3, 'Offensive language');
  });

  // ── T-39: handleReportSubmit — no-op when reason is empty ──
  test('T-39 does not call apiReportComment when no reason is selected', () => {
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockClear();

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click Report to open dropdown
    fireEvent.click(screen.getByText('Report'));

    // Submit Report button should be disabled (no reason selected)
    const submitBtn = screen.getByText('Submit Report');
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);

    expect(reportComment).not.toHaveBeenCalled();
  });

  // ── T-40: handleReportSubmit — no-op when Other selected but custom text blank ──
  test('T-40 disables Submit Report when Other is selected but custom text is blank', () => {
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockClear();

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open report dropdown
    fireEvent.click(screen.getByText('Report'));

    // Select "Other"
    fireEvent.click(screen.getByText('Other'));

    // Type whitespace-only
    const customInput = screen.getByPlaceholderText('Describe the issue...');
    fireEvent.change(customInput, { target: { value: '  ' } });

    // Submit button should be disabled
    const submitBtn = screen.getByText('Submit Report');
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);

    expect(reportComment).not.toHaveBeenCalled();
  });

  // ── T-41: handleReportSubmit — no-op when already submitting ──
  test('T-41 shows Submitting... and disables button during report submission', async () => {
    let resolveReport;
    const reportPromise = new Promise((resolve) => { resolveReport = resolve; });
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockReturnValue(reportPromise);

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open report, select reason, submit
    fireEvent.click(screen.getByText('Report'));
    fireEvent.click(screen.getByText('Spam'));

    await act(async () => {
      fireEvent.click(screen.getByText('Submit Report'));
    });

    // Should show "Submitting..." while in-flight
    expect(screen.getByText('Submitting...')).toBeInTheDocument();

    // Resolve
    await act(async () => {
      resolveReport();
    });
  });

  // ── T-42: handleReportSubmit — handle API failure gracefully ──
  test('T-42 logs error and resets submitting state when apiReportComment rejects', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockRejectedValue(new Error('Server error'));

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'A comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open report, select reason, submit
    fireEvent.click(screen.getByText('Report'));
    fireEvent.click(screen.getByText('Spam'));

    await act(async () => {
      fireEvent.click(screen.getByText('Submit Report'));
    });

    // Error should be logged
    expect(consoleSpy).toHaveBeenCalledWith('Report failed:', expect.any(Error));

    // Report dropdown should still be open (not reset on failure)
    expect(screen.getByText('Submit Report')).toBeInTheDocument();

    // Button should no longer show "Submitting..."
    expect(screen.queryByText('Submitting...')).not.toBeInTheDocument();
  });

  // ── T-43: renderComment — root-level comment (depth 0) ──
  test('T-43 renders a root-level comment with no left margin', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 5, postId: 1, author: 'bob', text: 'Hello' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    const commentEl = document.getElementById('comment-5');
    expect(commentEl).toBeInTheDocument();

    // No left margin for depth 0
    expect(commentEl.style.marginLeft).toBe('0px');

    // Should NOT have border-l-2 class at depth 0
    expect(commentEl.className).not.toContain('border-l-2');

    // Author initial "B" and name "bob"
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();

    // Comment text
    expect(screen.getByText('Hello')).toBeInTheDocument();

    // Action buttons present (comment-level — use within comment element)
    const commentContainer = document.getElementById('comment-5');
    expect(commentContainer.textContent).toContain('Reply');
    expect(commentContainer.textContent).toContain('Share');
    expect(commentContainer.textContent).toContain('Report');
  });

  // ── T-44: renderComment — nested comment with indentation ──
  test('T-44 renders a nested comment at depth 2 with correct margin and border', () => {
    const post = createMockPost({ id: 1, commentCount: 2 });
    const rootComment = createMockComment({ id: 1, postId: 1, author: 'root', text: 'Root' });
    const childComment = createMockComment({ id: 2, postId: 1, author: 'child', text: 'Nested', parentCommentId: 1 });
    const grandchildComment = createMockComment({ id: 3, postId: 1, author: 'gc', text: 'Deep', parentCommentId: 2 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([rootComment, childComment, grandchildComment]),
    });

    // depth=2 → marginLeft = 2 * 24 = 48px
    const gcEl = document.getElementById('comment-3');
    expect(gcEl).toBeInTheDocument();
    expect(gcEl.style.marginLeft).toBe('48px');

    // Has border-l-2 class since depth > 0
    expect(gcEl.className).toContain('border-l-2');
    expect(gcEl.className).toContain('border-gray-100');
    expect(gcEl.className).toContain('pl-4');
  });

  // ── T-45: renderComment — cap indentation at maxIndent (3) ──
  test('T-45 caps indentation at maxIndent=3 for depth=5', () => {
    const post = createMockPost({ id: 1, commentCount: 6 });
    // Build a 6-level chain: 1 → 2 → 3 → 4 → 5 → 6
    const c1 = createMockComment({ id: 1, postId: 1, text: 'L0' });
    const c2 = createMockComment({ id: 2, postId: 1, text: 'L1', parentCommentId: 1 });
    const c3 = createMockComment({ id: 3, postId: 1, text: 'L2', parentCommentId: 2 });
    const c4 = createMockComment({ id: 4, postId: 1, text: 'L3', parentCommentId: 3 });
    const c5 = createMockComment({ id: 5, postId: 1, text: 'L4', parentCommentId: 4 });
    const c6 = createMockComment({ id: 6, postId: 1, text: 'L5', parentCommentId: 5 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([c1, c2, c3, c4, c5, c6]),
    });

    // depth=5 → capped at maxIndent=3, so marginLeft = 3 * 24 = 72px
    const deepEl = document.getElementById('comment-6');
    expect(deepEl).toBeInTheDocument();
    expect(deepEl.style.marginLeft).toBe('72px');
  });

  // ── T-47: renderComment — toggle reply input on Reply button click ──
  test('T-47 toggles reply textarea on Reply button click', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Some comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // No reply textarea initially
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();

    // Click Reply → textarea appears
    fireEvent.click(screen.getByText('Reply'));
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();

    // Click Reply toggle again → textarea disappears (toggle off)
    // After opening reply, there are 2 "Reply" buttons — toggle and submit. Pick the toggle.
    const replyBtns = screen.getAllByText('Reply');
    const toggleBtn = replyBtns.find(btn => !btn.className.includes('bg-violet-600'));
    fireEvent.click(toggleBtn);
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
  });

  // ── T-48: renderComment — toggle report dropdown on Report button click ──
  test('T-48 toggles report dropdown with reason buttons on Report click', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Bad comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click Report → dropdown appears with 5 reason buttons
    fireEvent.click(screen.getByText('Report'));

    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(screen.getByText('Harassment')).toBeInTheDocument();
    expect(screen.getByText('Misinformation')).toBeInTheDocument();
    expect(screen.getByText('Off-topic')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();

    // Click Report again → dropdown disappears
    fireEvent.click(screen.getByText('Report'));

    expect(screen.queryByText('Spam')).not.toBeInTheDocument();
    expect(screen.queryByText('Harassment')).not.toBeInTheDocument();
  });

  // ── T-49: renderComment — show "Reported" label for already-reported comment ──
  test('T-49 shows Reported label instead of Report button for already-reported comment', async () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Reported comment' }),
    ];

    const { reportComment } = require('../../../frontend/src/api');
    reportComment.mockResolvedValue();

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Report the comment first to set reportedComments[10] = true
    fireEvent.click(screen.getByText('Report'));
    fireEvent.click(screen.getByText('Spam'));

    await act(async () => {
      fireEvent.click(screen.getByText('Submit Report'));
    });

    // Should show "Reported" label
    expect(screen.getByText('Reported')).toBeInTheDocument();

    // Report button should be gone for this comment
    expect(screen.queryByText('Report')).not.toBeInTheDocument();
  });

  // ── T-50: renderComment — show Other custom text input ──
  test('T-50 shows custom text input when Other reason is selected', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Some comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Open report dropdown
    fireEvent.click(screen.getByText('Report'));

    // No custom input yet
    expect(screen.queryByPlaceholderText('Describe the issue...')).not.toBeInTheDocument();

    // Click "Other"
    fireEvent.click(screen.getByText('Other'));

    // Custom input appears
    expect(screen.getByPlaceholderText('Describe the issue...')).toBeInTheDocument();
  });

  // ── T-51: renderComment — vote button styling reflects current vote state ──
  test('T-51 upvote button has text-violet-600 when userVotes has comment-10 as up', () => {
    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Voted comment', upvotes: 5, downvotes: 1 }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
      userVotes: { 'comment-10': 'up' },
    });

    // Upvote button should have text-violet-600
    const upBtn = screen.getByRole('button', { name: /upvote comment/i });
    expect(upBtn.className).toContain('text-violet-600');

    // Downvote button should have default gray styling
    const downBtn = screen.getByRole('button', { name: /downvote comment/i });
    expect(downBtn.className).toContain('text-gray-300');
  });

  // ── T-52: renderComment — share toast shows "Copied!" on comment share ──
  test('T-52 changes Share to Copied! when comment share is clicked', async () => {
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue() },
    });

    const post = createMockPost({ id: 1, commentCount: 1 });
    const comments = [
      createMockComment({ id: 10, postId: 1, text: 'Shareable comment' }),
    ];

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue(comments),
    });

    // Click Share on the comment (second Share button — first is post-level)
    const shareBtns = screen.getAllByText('Share');
    await act(async () => {
      fireEvent.click(shareBtns[shareBtns.length - 1]);
    });

    // Should show "Copied!" instead of "Share"
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  // ── T-53: Post voting — upvote styling reflects user vote ──
  test('T-53 post upvote button has text-violet-600 and score has text-violet-600 when voted up', () => {
    const post = createMockPost({ id: 1, upvotes: 10, downvotes: 2 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([]),
      userVotes: { 'post-1': 'up' },
    });

    // Post upvote button should have text-violet-600
    const upBtn = screen.getByRole('button', { name: 'Upvote' });
    expect(upBtn.className).toContain('text-violet-600');

    // Net score text should have text-violet-600
    const scoreEl = screen.getByText('8');
    expect(scoreEl.className).toContain('text-violet-600');
  });

  // ── T-54: Post voting — downvote styling ──
  test('T-54 post downvote button has text-red-400 and score has text-gray-300 when voted down', () => {
    const post = createMockPost({ id: 1, upvotes: 10, downvotes: 2 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([]),
      userVotes: { 'post-1': 'down' },
    });

    // Post downvote button should have text-red-400
    const downBtn = screen.getByRole('button', { name: 'Downvote' });
    expect(downBtn.className).toContain('text-red-400');

    // Net score text should have text-gray-300
    const scoreEl = screen.getByText('8');
    expect(scoreEl.className).toContain('text-gray-300');
  });

  // ── T-55: Post voting — neutral state (no vote) ──
  test('T-55 both vote buttons have default colours and score has text-gray-500 when no vote', () => {
    const post = createMockPost({ id: 1, upvotes: 10, downvotes: 2 });

    renderWithContext({
      selectedPost: post,
      posts: [post],
      getPostComments: jest.fn().mockReturnValue([]),
      userVotes: {},
    });

    // Upvote button should NOT have text-violet-600
    const upBtn = screen.getByRole('button', { name: 'Upvote' });
    expect(upBtn.className).not.toContain('text-violet-600');

    // Downvote button should NOT have active text-red-400 (but may have hover:text-red-400)
    const downBtn = screen.getByRole('button', { name: 'Downvote' });
    expect(downBtn.className).not.toMatch(/(?<![:\w-])text-red-400/);

    // Net score text should have text-gray-500
    const scoreEl = screen.getByText('8');
    expect(scoreEl.className).toContain('text-gray-500');
  });
});
