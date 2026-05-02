import { useContext } from 'react';
import { ChevronUp, ChevronDown, MessageCircle, Sparkles } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';
import EmojiReactions from './EmojiReactions';
import DebateSides from './DebateSides';

/**
 * PostRow — compact horizontal list row for the main feed.
 * Replaces the card-based PostCard layout.
 */
export default function PostRow({ post }) {
  const { handleVote, setSelectedPost, userVotes, getPostComments } = useContext(RedditContext);

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

  const handlePostClick = () => {
    setSelectedPost(post);
  };

  const userVote = userVotes[`post-${post.id}`];
  const netScore = post.upvotes - post.downvotes;
  const displayScore = Math.abs(netScore) > 999
    ? `${(netScore / 1000).toFixed(1)}k`
    : netScore;

  // Check if this post has comments with AI summaries
  const postComments = getPostComments(post.id);
  const aiAnalyzedCount = postComments.filter(c => c.aiSummary).length;

  return (
    <article
      className="flex items-start gap-4 py-4 px-5 group cursor-pointer bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md dark:hover:shadow-lg dark:shadow-black/20 transition"
      onClick={handlePostClick}
      aria-label={`Thread: ${post.title} by ${post.author}`}
    >
      {/* Left: Minimal Vote Column */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0 w-8">
        <button
          onClick={(e) => { e.stopPropagation(); handleVote(post.id, 'up'); }}
          className={`p-0.5 rounded transition ${
            userVote === 'up' ? 'text-violet-600' : 'text-gray-300 hover:text-violet-500'
          }`}
          aria-label={`Upvote, currently ${post.upvotes} upvotes`}
          aria-pressed={userVote === 'up'}
        >
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <span className={`text-xs font-semibold tabular-nums ${
          userVote === 'up' ? 'text-violet-600' : userVote === 'down' ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {displayScore}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleVote(post.id, 'down'); }}
          className={`p-0.5 rounded transition ${
            userVote === 'down' ? 'text-red-400' : 'text-gray-300 hover:text-red-400'
          }`}
          aria-label={`Downvote, currently ${post.downvotes} downvotes`}
          aria-pressed={userVote === 'down'}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Middle: Title + Metadata */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-snug group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors line-clamp-2">
          {post.title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
          <span className="font-medium text-gray-500 dark:text-gray-400">{post.author}</span>
          <span>·</span>
          <span>{formatDate(post.timestamp)}</span>
          <span>·</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[11px] font-medium">
            {post.subreddit}
          </span>
        </div>
        
        {/* Emoji Reactions & Debate Sides */}
        <div className="flex flex-col gap-2 mt-3">
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiReactions targetType="post" targetId={post.id} reactions={post.emojiReactions || []} />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <DebateSides postId={post.id} forCount={post.forCount || 0} againstCount={post.againstCount || 0} />
          </div>
        </div>
      </div>

      {/* Right: Comment Count + View Analysis */}
      <div className="flex items-center gap-3 flex-shrink-0 pt-1">
        <div className="flex items-center gap-1 text-gray-400 text-xs" aria-label={`${post.commentCount} comments`}>
          <MessageCircle size={14} aria-hidden="true" />
          <span>{post.commentCount}</span>
        </div>

        {aiAnalyzedCount > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); handlePostClick(); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-50 text-violet-600 text-xs font-medium hover:bg-violet-100 transition"
            aria-label={`View AI analysis — ${aiAnalyzedCount} analyzed comments`}
          >
            <Sparkles size={12} aria-hidden="true" />
            <span className="hidden sm:inline">View Analysis</span>
          </button>
        ) : (
          <span className="w-[100px] hidden sm:block" />
        )}
      </div>
    </article>
  );
}
