import { useContext, useEffect, useCallback, useState, useMemo } from 'react';
import { ArrowLeft, ChevronUp, ChevronDown, MessageCircle, Share2, X, Flag } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';
import ReasoningSummaryPanel from './ReasoningSummaryPanel';
import ComposerWithFeedback from './ComposerWithFeedback';
import { reportComment as apiReportComment } from '../api';

export default function PostDetail() {
  const { selectedPost, setSelectedPost, handleVote, handleCommentVote, userVotes, getPostComments, addComment, posts } = useContext(RedditContext);

  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [shareToast, setShareToast] = useState(null); // 'post' | commentId | null
  const [reportingComment, setReportingComment] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportCustomText, setReportCustomText] = useState('');
  const [reportedComments, setReportedComments] = useState({});
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Close on Escape key
  const handleClose = useCallback(() => setSelectedPost(null), [setSelectedPost]);
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') handleClose(); };
    if (selectedPost) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [selectedPost, handleClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedPost) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [selectedPost]);

  // Reset state when post changes
  useEffect(() => {
    setReplyingTo(null);
    setReplyText('');
    setReportingComment(null);
  }, [selectedPost?.id]);

  // ── Build comment tree (must be before early return to satisfy rules of hooks) ──
  const post = selectedPost ? (posts.find((p) => p.id === selectedPost.id) || selectedPost) : null;
  const allComments = post ? getPostComments(post.id) : [];

  const commentTree = useMemo(() => {
    const map = {};
    const roots = [];
    for (const c of allComments) {
      map[c.id] = { ...c, children: [] };
    }
    for (const c of allComments) {
      const node = map[c.id];
      if (c.parentCommentId && map[c.parentCommentId]) {
        map[c.parentCommentId].children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [allComments]);

  if (!selectedPost || !post) return null;

  const formatDate = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // ── Share handler ──
  const handleShare = async (type, id) => {
    const url = type === 'post'
      ? `${window.location.origin}/post/${post.id}`
      : `${window.location.origin}/post/${post.id}#comment-${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const toastKey = type === 'post' ? 'post' : id;
    setShareToast(toastKey);
    setTimeout(() => setShareToast((prev) => (prev === toastKey ? null : prev)), 2000);
  };

  // ── Reply handler ──
  const handleReplySubmit = async (parentId) => {
    if (!replyText.trim() || replySubmitting) return;
    setReplySubmitting(true);
    try {
      await addComment(post.id, replyText.trim(), parentId);
      setReplyText('');
      setReplyingTo(null);
    } catch (err) {
      console.error('Reply failed:', err);
    } finally {
      setReplySubmitting(false);
    }
  };

  // ── Report handler ──
  const handleReportSubmit = async (commentId) => {
    const reason = reportReason === 'Other' ? reportCustomText.trim() : reportReason;
    if (!reason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await apiReportComment(commentId, reason);
      setReportedComments((prev) => ({ ...prev, [commentId]: true }));
      setReportingComment(null);
      setReportReason('');
      setReportCustomText('');
    } catch (err) {
      console.error('Report failed:', err);
    } finally {
      setReportSubmitting(false);
    }
  };

  const REPORT_REASONS = ['Spam', 'Harassment', 'Misinformation', 'Off-topic', 'Other'];

  const postUserVote = userVotes[`post-${post.id}`];
  const netScore = post.upvotes - post.downvotes;

  // ── Render a comment and its children recursively ──
  const renderComment = (comment, depth = 0) => {
    const commentUserVote = userVotes[`comment-${comment.id}`];
    const maxIndent = 3;
    const indentLevel = Math.min(depth, maxIndent);

    return (
      <div key={comment.id} id={`comment-${comment.id}`} style={{ marginLeft: indentLevel * 24 }} className={depth > 0 ? 'border-l-2 border-gray-100 pl-4' : ''}>
        <div className="py-4 border-b border-gray-50 last:border-b-0">
          {/* Comment Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {comment.author.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-gray-600">{comment.author}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{formatDate(comment.timestamp)}</span>
          </div>

          {/* Comment Body */}
          <p className="text-sm text-gray-700 leading-relaxed mb-2 pl-8">
            {comment.text}
          </p>

          {/* Comment Action Bar */}
          <div className="flex items-center gap-3 text-xs pl-8 mb-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleCommentVote(comment.id, 'up')}
                className={`p-0.5 rounded transition ${commentUserVote === 'up' ? 'text-violet-600' : 'text-gray-300 hover:text-violet-500'}`}
                aria-label={`Upvote comment, ${comment.upvotes} upvotes`}
                aria-pressed={commentUserVote === 'up'}
              >
                <ChevronUp size={14} />
              </button>
              <span className={`font-semibold tabular-nums text-[11px] ${commentUserVote === 'up' ? 'text-violet-600' : 'text-gray-400'}`}>
                {comment.upvotes - comment.downvotes}
              </span>
              <button
                onClick={() => handleCommentVote(comment.id, 'down')}
                className={`p-0.5 rounded transition ${commentUserVote === 'down' ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}
                aria-label={`Downvote comment, ${comment.downvotes} downvotes`}
                aria-pressed={commentUserVote === 'down'}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button
              onClick={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText(''); }}
              className={`font-medium transition ${replyingTo === comment.id ? 'text-violet-600' : 'text-gray-400 hover:text-violet-600'}`}
            >
              Reply
            </button>
            <button
              onClick={() => handleShare('comment', comment.id)}
              className="text-gray-400 hover:text-gray-600 font-medium transition flex items-center gap-0.5"
            >
              <Share2 size={11} />
              {shareToast === comment.id ? 'Copied!' : 'Share'}
            </button>
            {reportedComments[comment.id] ? (
              <span className="text-green-500 font-medium flex items-center gap-0.5">
                <Flag size={11} /> Reported
              </span>
            ) : (
              <button
                onClick={() => { setReportingComment(reportingComment === comment.id ? null : comment.id); setReportReason(''); setReportCustomText(''); }}
                className="text-gray-400 hover:text-red-500 font-medium transition flex items-center gap-0.5"
              >
                <Flag size={11} /> Report
              </button>
            )}
          </div>

          {/* Reply Input */}
          {replyingTo === comment.id && (
            <div className="pl-8 mt-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleReplySubmit(comment.id)}
                  disabled={!replyText.trim() || replySubmitting}
                  className="px-3 py-1 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {replySubmitting ? 'Posting...' : 'Reply'}
                </button>
                <button
                  onClick={() => { setReplyingTo(null); setReplyText(''); }}
                  className="px-3 py-1 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Report Dropdown */}
          {reportingComment === comment.id && (
            <div className="pl-8 mt-2 p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs font-semibold text-red-700 mb-2">Report this comment:</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReportReason(r)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition ${reportReason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-100'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reportReason === 'Other' && (
                <input
                  type="text"
                  value={reportCustomText}
                  onChange={(e) => setReportCustomText(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full p-2 border border-red-200 rounded-lg text-sm mb-2 focus:outline-none focus:border-red-400"
                  autoFocus
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleReportSubmit(comment.id)}
                  disabled={!reportReason || (reportReason === 'Other' && !reportCustomText.trim()) || reportSubmitting}
                  className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                </button>
                <button
                  onClick={() => { setReportingComment(null); setReportReason(''); setReportCustomText(''); }}
                  className="px-3 py-1 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* DS1-US1: Expandable AI Reasoning Summary Panel */}
          <div className="pl-8">
            <ReasoningSummaryPanel comment={comment} />
          </div>
        </div>

        {/* Render children */}
        {comment.children && comment.children.length > 0 && (
          <div>{comment.children.map((child) => renderComment(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 cursor-pointer"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={`Thread: ${post.title}`}
      >
        <div
          className="bg-white w-full max-w-3xl min-h-screen sm:min-h-0 sm:my-8 sm:rounded-xl sm:shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header Bar ── */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3 z-10 sm:rounded-t-xl">
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition"
              aria-label="Go back"
            >
              <ArrowLeft size={20} className="text-gray-500" aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-medium">{post.subreddit}</p>
              <h2 className="text-sm font-semibold text-gray-900 truncate">{post.title}</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* ── Thread Content ── */}
          <div className="px-4 sm:px-6 py-6 sm:max-h-[85vh] sm:overflow-y-auto">
            {/* Author & Meta */}
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
              <div className="w-6 h-6 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                {post.author.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-gray-600">{post.author}</span>
              <span>·</span>
              <span>{formatDate(post.timestamp)}</span>
              <span>·</span>
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded text-[10px] font-medium">{post.subreddit}</span>
            </div>

            {/* Title */}
            <h1 className="text-xl font-bold text-gray-900 leading-snug mb-4">
              {post.title}
            </h1>

            {/* Image */}
            {post.image && (
              <img
                src={post.image}
                alt={`Image for: ${post.title}`}
                className="w-full h-auto max-h-80 object-cover rounded-lg mb-5"
              />
            )}

            {/* Text Content */}
            {post.content && (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mb-5">
                {post.content}
              </p>
            )}

            {/* Inline Stats & Actions */}
            <div className="flex items-center gap-4 py-3 border-y border-gray-100 mb-6 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleVote(post.id, 'up')}
                  className={`p-0.5 rounded transition ${postUserVote === 'up' ? 'text-violet-600' : 'hover:text-violet-500'}`}
                  aria-label="Upvote"
                  aria-pressed={postUserVote === 'up'}
                >
                  <ChevronUp size={16} />
                </button>
                <span className={`font-semibold tabular-nums ${postUserVote === 'up' ? 'text-violet-600' : postUserVote === 'down' ? 'text-gray-300' : 'text-gray-500'}`}>
                  {netScore.toLocaleString()}
                </span>
                <button
                  onClick={() => handleVote(post.id, 'down')}
                  className={`p-0.5 rounded transition ${postUserVote === 'down' ? 'text-red-400' : 'hover:text-red-400'}`}
                  aria-label="Downvote"
                  aria-pressed={postUserVote === 'down'}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <MessageCircle size={13} />
                <span>{post.commentCount} comments</span>
              </div>
              <button
                onClick={() => handleShare('post', post.id)}
                className="flex items-center gap-1 hover:text-gray-600 transition"
              >
                <Share2 size={13} />
                <span>{shareToast === 'post' ? 'Link copied!' : 'Share'}</span>
              </button>
            </div>

            {/* ── Comments Section ── */}
            <section aria-label="Comments">
              <h3 className="text-base font-bold text-gray-900 mb-4">
                Comments <span className="text-gray-300 font-normal">({post.commentCount})</span>
              </h3>

              {/* DS3-US3: Comment Composer with Real-Time Writing Feedback */}
              <div className="mb-6">
                <ComposerWithFeedback
                  postId={post.id}
                  onSubmit={(text) => addComment(post.id, text)}
                />
              </div>

              {/* Comments List with AI Reasoning Summaries (DS1-US1) — threaded */}
              <div className="space-y-0">
                {commentTree.map((comment) => renderComment(comment, 0))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
