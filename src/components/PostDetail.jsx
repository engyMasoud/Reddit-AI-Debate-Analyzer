import { useContext, useEffect, useCallback } from 'react';
import { ChevronLeft, ThumbsUp, ThumbsDown, MessageCircle, Share, MoreVertical, X, Flag } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';
import ReasoningSummaryPanel from './ReasoningSummaryPanel';
import ComposerWithFeedback from './ComposerWithFeedback';

export default function PostDetail() {
  const { selectedPost, setSelectedPost, handleVote, handleCommentVote, getFeedPosts, userVotes, getPostComments, addComment, posts } = useContext(RedditContext);

  // Close on Escape key
  const handleClose = useCallback(() => setSelectedPost(null), [setSelectedPost]);
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') handleClose(); };
    if (selectedPost) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [selectedPost, handleClose]);

  if (!selectedPost) return null;

  // Always read fresh post data from the posts array so vote counts stay current
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

  // Get related posts from same subreddit
  const relatedPosts = getFeedPosts().filter(
    (p) => p.subreddit === post.subreddit && p.id !== post.id
  ).slice(0, 5);

  const postUserVote = userVotes[`post-${post.id}`];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 cursor-pointer"
        onClick={handleClose}
        aria-hidden="true"
      ></div>

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto sm:pt-8"
        role="dialog"
        aria-modal="true"
        aria-label={`Post: ${post.title}`}
      >
        <div
          className="bg-reddit-light sm:rounded-lg shadow-2xl max-w-4xl w-full flex min-h-screen sm:min-h-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Content */}
          <div className="flex-1 max-h-screen sm:max-h-[90vh] overflow-y-auto">
            {/* Back Button & Header */}
            <div className="sticky top-0 bg-reddit-light border-b border-reddit-border p-3 sm:p-4 flex items-center gap-2 sm:gap-3 z-10">
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Go back"
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-reddit-gray">r/{post.subreddit}</p>
                <h2 className="text-sm font-bold text-reddit-dark truncate">{post.title}</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-red-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-red-600 transition"
                aria-label="Close post"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            {/* Post Content */}
            <div className="p-4 sm:p-6">
              {/* Meta Info */}
              <div className="flex items-center gap-2 text-xs mb-4 text-reddit-gray">
                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  r
                </div>
                <span className="font-semibold">r/{post.subreddit}</span>
                <span>•</span>
                <span>Posted by u/{post.author}</span>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-reddit-dark mb-4 leading-tight">
                {post.title}
              </h1>

              {/* Image */}
              {post.image && (
                <img
                  src={post.image}
                  alt={`Image for: ${post.title}`}
                  className="w-full h-auto max-h-96 object-cover rounded-lg mb-6"
                />
              )}

              {/* Text Content */}
              {post.content && (
                <p className="text-sm text-reddit-dark leading-relaxed whitespace-pre-wrap mb-6">
                  {post.content}
                </p>
              )}

              {/* Stats */}
              <div className="flex gap-4 text-xs text-reddit-gray mb-4 pb-4 border-b border-gray-200">
                <button className="hover:text-orange-500 font-semibold">
                  {post.upvotes.toLocaleString()} upvotes
                </button>
                <button className="hover:text-blue-500 font-semibold">
                  {post.downvotes.toLocaleString()} downvotes
                </button>
                <span>{formatDate(post.timestamp)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => handleVote(post.id, 'up')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded transition min-h-[44px] ${
                    postUserVote === 'up'
                      ? 'bg-orange-200 text-orange-500'
                      : 'hover:bg-orange-100 text-reddit-gray hover:text-orange-500'
                  }`}
                  aria-label={`Upvote, currently ${post.upvotes.toLocaleString()} upvotes`}
                  aria-pressed={postUserVote === 'up'}
                >
                  <ThumbsUp size={18} fill={postUserVote === 'up' ? 'currentColor' : 'none'} aria-hidden="true" />
                  <span className="text-sm">{post.upvotes.toLocaleString()}</span>
                </button>

                <button
                  onClick={() => handleVote(post.id, 'down')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded transition min-h-[44px] ${
                    postUserVote === 'down'
                      ? 'bg-blue-200 text-blue-500'
                      : 'hover:bg-blue-100 text-reddit-gray hover:text-blue-500'
                  }`}
                  aria-label={`Downvote, currently ${post.downvotes.toLocaleString()} downvotes`}
                  aria-pressed={postUserVote === 'down'}
                >
                  <ThumbsDown size={18} fill={postUserVote === 'down' ? 'currentColor' : 'none'} aria-hidden="true" />
                  <span className="text-sm">{post.downvotes.toLocaleString()}</span>
                </button>

                <button
                  className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-blue-600 transition min-h-[44px]"
                  aria-label={`${post.commentCount} comments`}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  <span className="text-sm">{post.commentCount}</span>
                </button>

                <button
                  className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-gray-700 transition min-h-[44px]"
                  aria-label="Share post"
                >
                  <Share size={18} aria-hidden="true" />
                  <span className="hidden sm:inline text-sm">Share</span>
                </button>
              </div>

              {/* Comments Section */}
              <section className="space-y-4" aria-label="Comments">
                <h3 className="font-bold text-reddit-dark text-lg">Comments ({post.commentCount})</h3>
                
                {/* DS3-US3: Comment Composer with Real-Time Writing Feedback */}
                <ComposerWithFeedback
                  postId={post.id}
                  onSubmit={(text) => addComment(post.id, text)}
                />

                {/* Comments List with AI Reasoning Summaries (DS1-US1) */}
                {getPostComments(post.id).map((comment) => {
                  const commentUserVote = userVotes[`comment-${comment.id}`];
                  
                  return (
                    <div key={comment.id} className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {comment.author.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-reddit-gray">
                            {comment.author} • {formatDate(comment.timestamp)}
                          </p>
                          <p className="text-sm text-reddit-dark mt-1 mb-2">
                            {comment.text}
                          </p>
                          
                          {/* DS1-US1: Inline AI Reasoning Summary */}
                          <ReasoningSummaryPanel comment={comment} />
                          
                          <div className="flex flex-wrap items-center gap-3 text-xs mt-2">
                            <button
                              onClick={() => handleCommentVote(comment.id, 'up')}
                              className={`font-semibold transition ${
                                commentUserVote === 'up'
                                  ? 'text-orange-500'
                                  : 'text-reddit-gray hover:text-orange-500'
                              }`}
                              aria-label={`Upvote comment, currently ${comment.upvotes} upvotes`}
                              aria-pressed={commentUserVote === 'up'}
                            >
                              👍 {comment.upvotes}
                            </button>
                            <button
                              onClick={() => handleCommentVote(comment.id, 'down')}
                              className={`transition ${
                                commentUserVote === 'down'
                                  ? 'text-blue-500'
                                  : 'text-reddit-gray hover:text-blue-500'
                              }`}
                              aria-label={`Downvote comment, currently ${comment.downvotes} downvotes`}
                              aria-pressed={commentUserVote === 'down'}
                            >
                              👎 {comment.downvotes}
                            </button>
                            <button
                              className="text-reddit-gray hover:text-blue-600 font-semibold transition"
                              aria-label="Reply to comment"
                            >
                              Reply
                            </button>
                            <button
                              className="text-reddit-gray hover:text-blue-600 font-semibold transition flex items-center gap-1"
                              aria-label="Share comment"
                            >
                              <Share size={12} aria-hidden="true" />
                              Share
                            </button>
                            <button
                              className="text-reddit-gray hover:text-red-500 font-semibold transition flex items-center gap-1"
                              aria-label="Report comment"
                            >
                              <Flag size={12} aria-hidden="true" />
                              Report
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>

          {/* Related Posts Sidebar */}
          {relatedPosts.length > 0 && (
            <aside className="hidden lg:block w-72 border-l border-reddit-border p-4 bg-gray-50 max-h-[90vh] overflow-y-auto" aria-label="Related posts">
              <h3 className="font-bold text-reddit-dark mb-4">More from r/{post.subreddit}</h3>
              <div className="space-y-3">
                {relatedPosts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="w-full text-left p-3 bg-white rounded border border-gray-200 hover:border-gray-400 transition group"
                  >
                    <p className="text-xs text-reddit-gray mb-1 group-hover:text-blue-600">
                      {formatDate(post.timestamp)}
                    </p>
                    <p className="text-sm font-semibold text-reddit-dark line-clamp-2 group-hover:text-blue-600 mb-2">
                      {post.title}
                    </p>
                    <p className="text-xs text-reddit-gray">
                      {post.upvotes > 1000 ? `${(post.upvotes / 1000).toFixed(1)}k` : post.upvotes} upvotes
                    </p>
                  </button>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
