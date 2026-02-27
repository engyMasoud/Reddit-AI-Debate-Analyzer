import { useContext } from 'react';
import { RedditContext } from '../context/RedditContext';
import PostRow from './PostCard';

export default function MainFeed() {
  const { getFeedPosts, selectedSubreddit } = useContext(RedditContext);

  const posts = getFeedPosts();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-8 pb-16">
      {/* Section Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {selectedSubreddit || 'All Discussions'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {posts.length} thread{posts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* List View */}
      {posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-400 text-base font-medium">No discussions found</p>
          <p className="text-gray-300 text-sm mt-1">Try adjusting your search or topic filter</p>
        </div>
      )}
    </div>
  );
}
