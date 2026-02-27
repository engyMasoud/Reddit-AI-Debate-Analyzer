import { useContext, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronUp, ChevronDown, MessageCircle, Share2, X, Flag } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';
import ReasoningSummaryPanel from './ReasoningSummaryPanel';
import ComposerWithFeedback from './ComposerWithFeedback';

export default function PostDetail() {
  const { selectedPost, setSelectedPost, handleVote, handleCommentVote, userVotes, getPostComments, addComment, posts } = useContext(RedditContext);

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

  if (!selectedPost) return null;

  const post = posts.find((p) => p.id === selectedPost.id) || selectedPost;

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

  const postUserVote = userVotes[`post-${post.id}`];
  const netScore = post.upvotes - post.downvotes;

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
              <button className="flex items-center gap-1 hover:text-gray-600 transition">
                <Share2 size={13} />
                <span>Share</span>
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

              {/* Comments List with AI Reasoning Summaries (DS1-US1) */}
              <div className="space-y-0">
                {getPostComments(post.id).map((comment) => {
                  const commentUserVote = userVotes[`comment-${comment.id}`];

                  return (
                    <div key={comment.id} className="py-4 border-b border-gray-50 last:border-b-0">
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

                      {/* Comment Action Bar — includes Show AI Summary button (US1) */}
                      <div className="flex items-center gap-3 text-xs pl-8 mb-1">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleCommentVote(comment.id, 'up')}
                            className={`p-0.5 rounded transition ${
                              commentUserVote === 'up' ? 'text-violet-600' : 'text-gray-300 hover:text-violet-500'
                            }`}
                            aria-label={`Upvote comment, ${comment.upvotes} upvotes`}
                            aria-pressed={commentUserVote === 'up'}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <span className={`font-semibold tabular-nums text-[11px] ${
                            commentUserVote === 'up' ? 'text-violet-600' : 'text-gray-400'
                          }`}>
                            {comment.upvotes - comment.downvotes}
                          </span>
                          <button
                            onClick={() => handleCommentVote(comment.id, 'down')}
                            className={`p-0.5 rounded transition ${
                              commentUserVote === 'down' ? 'text-red-400' : 'text-gray-300 hover:text-red-400'
                            }`}
                            aria-label={`Downvote comment, ${comment.downvotes} downvotes`}
                            aria-pressed={commentUserVote === 'down'}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <button className="text-gray-400 hover:text-violet-600 font-medium transition">Reply</button>
                        <button className="text-gray-400 hover:text-gray-600 font-medium transition flex items-center gap-0.5">
                          <Share2 size={11} /> Share
                        </button>
                        <button className="text-gray-400 hover:text-red-500 font-medium transition flex items-center gap-0.5">
                          <Flag size={11} /> Report
                        </button>
                      </div>

                      {/* DS1-US1: Expandable AI Reasoning Summary Panel */}
                      <div className="pl-8">
                        <ReasoningSummaryPanel comment={comment} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
