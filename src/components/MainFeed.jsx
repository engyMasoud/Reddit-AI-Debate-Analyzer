import { useContext } from 'react';
import { RedditContext } from '../context/RedditContext';
import PostCard from './PostCard';

export default function MainFeed() {
  const { getFeedPosts, selectedSubreddit } = useContext(RedditContext);

  const posts = getFeedPosts();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:p-6">
      {/* Header */}
      <div className="mb-6">
        {selectedSubreddit ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
                r
              </div>
              <div>
                <h1 className="text-2xl font-bold text-reddit-dark">r/{selectedSubreddit}</h1>
              </div>
            </div>
            <p className="text-reddit-gray text-sm">Community</p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-reddit-dark mb-1">Home</h1>
            <p className="text-reddit-gray text-sm">Your personalized Reddit feed</p>
          </div>
        )}
      </div>

      {/* Posts List */}
      {posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-reddit-light border border-reddit-border rounded-lg">
          <p className="text-reddit-gray text-lg font-semibold">No posts found</p>
          <p className="text-reddit-gray text-sm mt-2">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}
