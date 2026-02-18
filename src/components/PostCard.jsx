import { useContext } from 'react';
import { ThumbsUp, ThumbsDown, MessageCircle, Share, MoreVertical } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function PostCard({ post }) {
  const { handleVote, handleComment, setSelectedPost, userVotes } = useContext(RedditContext);

  const formatDate = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const handlePostClick = () => {
    setSelectedPost(post);
  };

  const userVote = userVotes[`post-${post.id}`];
  const upvoteScore = post.upvotes > 1000 ? `${(post.upvotes / 1000).toFixed(1)}k` : post.upvotes;

  return (
    <div className="bg-reddit-light border border-reddit-border rounded-lg hover:border-gray-400 transition overflow-hidden cursor-pointer group mb-3 hover:shadow-md">
      <div className="flex flex-col sm:flex-row min-h-[180px]">
        {/* Vote Section - Desktop */}
        <div className="hidden sm:flex flex-col items-center gap-2 bg-gray-50 px-3 py-4 min-w-[56px] flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleVote(post.id, 'up');
            }}
            className={`p-1.5 rounded transition min-h-[40px] min-w-[40px] flex items-center justify-center ${
              userVote === 'up'
                ? 'bg-orange-200 text-orange-500'
                : 'hover:bg-orange-100 text-reddit-gray hover:text-orange-500'
            }`}
            title="Upvote"
          >
            <ThumbsUp size={18} fill={userVote === 'up' ? 'currentColor' : 'none'} />
          </button>
          <span className={`text-xs font-bold text-center min-h-[24px] ${
            userVote === 'up' ? 'text-orange-500' : userVote === 'down' ? 'text-blue-500' : 'text-reddit-gray'
          }`}>
            {upvoteScore}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleVote(post.id, 'down');
            }}
            className={`p-1.5 rounded transition min-h-[40px] min-w-[40px] flex items-center justify-center ${
              userVote === 'down'
                ? 'bg-blue-200 text-blue-500'
                : 'hover:bg-blue-100 text-reddit-gray hover:text-blue-500'
            }`}
            title="Downvote"
          >
            <ThumbsDown size={18} fill={userVote === 'down' ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                r
              </div>
              <span className="font-bold text-reddit-dark hover:text-blue-600">r/{post.subreddit}</span>
            </div>
            <span className="text-reddit-gray">•</span>
            <span className="text-reddit-gray">Posted by u/{post.author}</span>
            <span className="text-reddit-gray">•</span>
            <span className="text-reddit-gray">{formatDate(post.timestamp)} ago</span>
          </div>

          {/* Title */}
          <h3
            onClick={handlePostClick}
            className="text-base font-bold text-reddit-dark mb-3 group-hover:text-blue-600 line-clamp-2 leading-snug"
          >
            {post.title}
          </h3>

          {/* Preview Image */}
          {post.image && (
            <img
              src={post.image}
              alt="Post preview"
              onClick={handlePostClick}
              className="w-full h-auto max-h-72 object-cover rounded mb-3 group-hover:opacity-90 transition"
            />
          )}

          {/* Content Preview - Text only if no image */}
          {!post.image && (
            <p
              onClick={handlePostClick}
              className="text-sm text-reddit-gray mb-3 line-clamp-2 leading-relaxed"
            >
              {post.content}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex gap-1 mt-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePostClick();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-blue-600 transition text-xs min-h-[36px] flex-1 sm:flex-none"
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline">{post.commentCount}</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-gray-700 transition text-xs min-h-[36px] flex-1 sm:flex-none">
              <Share size={16} />
              <span className="hidden sm:inline">Share</span>
            </button>
            <button className="flex items-center justify-center p-2 rounded hover:bg-gray-100 text-reddit-gray hover:text-gray-700 transition min-h-[36px] min-w-[36px]">
              <MoreVertical size={16} />
            </button>
          </div>
        </div>

        {/* Mobile Vote Section */}
        <div className="sm:hidden flex items-center gap-1.5 px-3 py-2 bg-gray-50 border-t border-gray-200 justify-end flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleVote(post.id, 'up');
            }}
            className={`p-1 transition ${
              userVote === 'up'
                ? 'text-orange-500'
                : 'text-reddit-gray hover:text-orange-500'
            }`}
            title="Upvote"
          >
            <ThumbsUp size={16} fill={userVote === 'up' ? 'currentColor' : 'none'} />
          </button>
          <span className={`text-xs font-semibold min-w-[32px] text-center ${
            userVote === 'up' ? 'text-orange-500' : userVote === 'down' ? 'text-blue-500' : 'text-reddit-gray'
          }`}>
            {upvoteScore}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleVote(post.id, 'down');
            }}
            className={`p-1 transition ${
              userVote === 'down'
                ? 'text-blue-500'
                : 'text-reddit-gray hover:text-blue-500'
            }`}
            title="Downvote"
          >
            <ThumbsDown size={16} fill={userVote === 'down' ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
