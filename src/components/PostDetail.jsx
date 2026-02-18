import { useContext } from 'react';
import { ChevronLeft, ThumbsUp, ThumbsDown, MessageCircle, Share, MoreVertical } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function PostDetail() {
  const { selectedPost, setSelectedPost, handleVote, handleComment, handleCommentVote, getFeedPosts, comments, userVotes } = useContext(RedditContext);

  if (!selectedPost) return null;

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
    (post) => post.subreddit === selectedPost.subreddit && post.id !== selectedPost.id
  ).slice(0, 5);

  const postUserVote = userVotes[`post-${selectedPost.id}`];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={() => setSelectedPost(null)}
      ></div>

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pt-8">
        <div
          className="bg-reddit-light rounded-lg shadow-2xl max-w-4xl w-full flex"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main Content */}
          <div className="flex-1 max-h-[90vh] overflow-y-auto">
            {/* Back Button & Header */}
            <div className="sticky top-0 bg-reddit-light border-b border-reddit-border p-4 flex items-center gap-3 z-10">
              <button
                onClick={() => setSelectedPost(null)}
                className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Go back"
              >
                <ChevronLeft size={24} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-reddit-gray">r/{selectedPost.subreddit}</p>
                <h2 className="text-sm font-bold text-reddit-dark truncate">{selectedPost.title}</h2>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center">
                <MoreVertical size={20} />
              </button>
            </div>

            {/* Post Content */}
            <div className="p-6">
              {/* Meta Info */}
              <div className="flex items-center gap-2 text-xs mb-4 text-reddit-gray">
                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  r
                </div>
                <span className="font-semibold">r/{selectedPost.subreddit}</span>
                <span>•</span>
                <span>Posted by u/{selectedPost.author}</span>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-reddit-dark mb-4 leading-tight">
                {selectedPost.title}
              </h1>

              {/* Image */}
              {selectedPost.image && (
                <img
                  src={selectedPost.image}
                  alt="Post"
                  className="w-full h-auto max-h-96 object-cover rounded-lg mb-6"
                />
              )}

              {/* Text Content */}
              {selectedPost.content && (
                <p className="text-sm text-reddit-dark leading-relaxed whitespace-pre-wrap mb-6">
                  {selectedPost.content}
                </p>
              )}

              {/* Stats */}
              <div className="flex gap-4 text-xs text-reddit-gray mb-4 pb-4 border-b border-gray-200">
                <button className="hover:text-orange-500 font-semibold">
                  {selectedPost.upvotes.toLocaleString()} upvotes
                </button>
                <button className="hover:text-blue-500 font-semibold">
                  {selectedPost.downvotes.toLocaleString()} downvotes
                </button>
                <span>{formatDate(selectedPost.timestamp)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => handleVote(selectedPost.id, 'up')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded transition min-h-[44px] ${
                    postUserVote === 'up'
                      ? 'bg-orange-200 text-orange-500'
                      : 'hover:bg-orange-100 text-reddit-gray hover:text-orange-500'
                  }`}
                >
                  <ThumbsUp size={18} fill={postUserVote === 'up' ? 'currentColor' : 'none'} />
                  <span className="hidden sm:inline text-sm">Upvote</span>
                </button>

                <button
                  onClick={() => handleVote(selectedPost.id, 'down')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded transition min-h-[44px] ${
                    postUserVote === 'down'
                      ? 'bg-blue-200 text-blue-500'
                      : 'hover:bg-blue-100 text-reddit-gray hover:text-blue-500'
                  }`}
                >
                  <ThumbsDown size={18} fill={postUserVote === 'down' ? 'currentColor' : 'none'} />
                  <span className="hidden sm:inline text-sm">Downvote</span>
                </button>

                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-blue-600 transition min-h-[44px]">
                  <MessageCircle size={18} />
                  <span className="hidden sm:inline text-sm">{selectedPost.commentCount}</span>
                </button>

                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-gray-700 transition min-h-[44px]">
                  <Share size={18} />
                  <span className="hidden sm:inline text-sm">Share</span>
                </button>
              </div>

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-reddit-dark text-lg">Comments ({selectedPost.commentCount})</h3>
                
                <div className="bg-gray-50 p-4 rounded border border-gray-200">
                  <textarea
                    placeholder="What are your thoughts?"
                    className="w-full p-3 border border-gray-300 rounded resize-none mb-3 focus:outline-none focus:border-blue-500 text-sm"
                    rows="3"
                  ></textarea>
                  <button
                    onClick={() => handleComment(selectedPost.id)}
                    className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition min-h-[44px] text-sm"
                  >
                    Comment
                  </button>
                </div>

                {/* Comments List */}
                {comments.map((comment) => {
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
                          <div className="flex gap-3 text-xs">
                            <button
                              onClick={() => handleCommentVote(comment.id, 'up')}
                              className={`font-semibold transition ${
                                commentUserVote === 'up'
                                  ? 'text-orange-500'
                                  : 'text-reddit-gray hover:text-orange-500'
                              }`}
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
                            >
                              👎 {comment.downvotes}
                            </button>
                            <button className="text-reddit-gray hover:text-blue-600 font-semibold transition">
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Related Posts Sidebar */}
          {relatedPosts.length > 0 && (
            <div className="hidden lg:block w-72 border-l border-reddit-border p-4 bg-gray-50 max-h-[90vh] overflow-y-auto">
              <h3 className="font-bold text-reddit-dark mb-4">More from r/{selectedPost.subreddit}</h3>
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
