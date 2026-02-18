import { useContext } from 'react';
import { Flame, TrendingUp, Mail, PieChart } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function RightSidebar() {
  const { posts, userJoinedSubreddits, joinSubreddit, subreddits } = useContext(RedditContext);

  const topPosts = posts.sort((a, b) => b.upvotes - a.upvotes).slice(0, 5);

  const suggestedCommunities = subreddits
    .filter((sub) => !userJoinedSubreddits.includes(sub.id) && sub.id > 2)
    .slice(0, 5);

  return (
    <div className="p-4 space-y-6">
      {/* Sign Up Panel */}
      <div className="bg-reddit-light rounded-lg border border-reddit-border p-4">
        <h3 className="font-bold text-reddit-dark text-lg mb-2">New to Reddit?</h3>
        <p className="text-sm text-reddit-gray mb-4">
          Create your account and connect with a world of communities.
        </p>
        
        <div className="space-y-3">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50 transition min-h-[44px] font-semibold text-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">
                G
              </text>
            </svg>
            Continue with Google
          </button>

          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50 transition min-h-[44px] font-semibold text-sm">
            <Mail size={18} />
            Continue with Email
          </button>

          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50 transition min-h-[44px] font-semibold text-sm">
            📱
            Continue with Phone
          </button>
        </div>

        <p className="text-xs text-reddit-gray mt-4 text-center leading-relaxed">
          By continuing, you agree to our{' '}
          <button className="text-blue-600 hover:underline">User Agreement</button> and{' '}
          <button className="text-blue-600 hover:underline">Privacy Policy</button>.
        </p>
      </div>

      {/* Trending Section */}
      <div className="bg-reddit-light rounded-lg border border-reddit-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Flame size={20} className="text-orange-500" />
          <h3 className="font-bold text-reddit-dark">Trending</h3>
        </div>

        <div className="space-y-3">
          {topPosts.map((post, idx) => (
            <div
              key={post.id}
              className="pb-3 border-b border-gray-200 last:border-b-0"
            >
              <div className="flex gap-3">
                <span className="text-lg font-bold text-reddit-gray flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-reddit-dark line-clamp-2 hover:text-blue-600 cursor-pointer">
                    {post.title}
                  </p>
                  <p className="text-xs text-reddit-gray mt-1">
                    {post.upvotes > 1000
                      ? `${(post.upvotes / 1000).toFixed(1)}k`
                      : post.upvotes}{' '}
                    upvotes
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Communities */}
      <div className="bg-reddit-light rounded-lg border border-reddit-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-blue-500" />
          <h3 className="font-bold text-reddit-dark">Popular Communities</h3>
        </div>

        <div className="space-y-3">
          {suggestedCommunities.map((subreddit) => (
            <div
              key={subreddit.id}
              className="flex items-center justify-between pb-3 border-b border-gray-200 last:border-b-0 gap-2"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg flex-shrink-0">{subreddit.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-reddit-dark truncate hover:text-blue-600 cursor-pointer">
                    r/{subreddit.name}
                  </p>
                  <p className="text-xs text-reddit-gray">
                    {subreddit.memberCount.toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => joinSubreddit(subreddit.id)}
                className="bg-blue-200 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold hover:bg-blue-300 transition whitespace-nowrap flex-shrink-0 min-h-[36px] flex items-center"
              >
                Join
              </button>
            </div>
          ))}
        </div>

        <button className="w-full border-2 border-gray-300 text-gray-700 py-2 rounded-full font-semibold hover:bg-gray-50 transition text-sm min-h-[44px] mt-4">
          View All Communities
        </button>
      </div>

      {/* Reddit Pro Section */}
      <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg border-2 border-orange-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <PieChart size={20} className="text-orange-600" />
          <h3 className="font-bold text-orange-700">Reddit Pro</h3>
          <span className="text-xs bg-yellow-200 text-orange-700 px-2 py-0.5 rounded-full font-bold">
            BETA
          </span>
        </div>
        <p className="text-xs text-orange-600 leading-relaxed">
          Get premium features and exclusive content with Reddit Pro.
        </p>
        <button className="w-full bg-orange-600 text-white py-2 rounded-full font-semibold hover:bg-orange-700 transition text-sm min-h-[44px] mt-3">
          Try Pro Today
        </button>
      </div>
    </div>
  );
}
