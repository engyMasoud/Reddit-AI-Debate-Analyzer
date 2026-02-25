import { useContext } from 'react';
import { X, Home, TrendingUp, Newspaper, Compass, Plus } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function MobileDrawer({ onClose }) {
  const { subreddits, selectedSubreddit, setSelectedSubreddit, userJoinedSubreddits } = useContext(RedditContext);

  const feedItems = [
    { id: 'home', name: 'Home', icon: Home },
    { id: 'popular', name: 'Popular', icon: TrendingUp },
    { id: 'news', name: 'News', icon: Newspaper },
    { id: 'explore', name: 'Explore', icon: Compass },
  ];

  const handleFeedClick = (name) => {
    setSelectedSubreddit(null);
    onClose();
  };

  const handleSubredditClick = (name) => {
    setSelectedSubreddit(name);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-30"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* Drawer */}
      <nav className="fixed left-0 top-[56px] bottom-0 w-64 bg-reddit-light shadow-lg z-40 overflow-y-auto" aria-label="Mobile navigation">
        <div className="p-4 space-y-4">
          {/* Feeds Section */}
          <div>
            <h3 className="text-xs font-bold text-reddit-gray uppercase mb-3 px-1">Feeds</h3>
            <div className="space-y-1">
              {feedItems.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleFeedClick(name)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition min-h-[40px] ${
                    selectedSubreddit === null && name === 'Home'
                      ? 'bg-gray-200 font-semibold'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-sm">{name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-reddit-border py-2"></div>

          {/* Communities Section */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold text-reddit-gray uppercase">Communities</h3>
              <button className="p-1 hover:bg-gray-200 rounded-full min-h-[40px] min-w-[40px] flex items-center justify-center" aria-label="Add community">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-1">
              {subreddits.slice(2).map((subreddit) => {
                const isSelected = selectedSubreddit === subreddit.name;

                return (
                  <button
                    key={subreddit.id}
                    onClick={() => handleSubredditClick(subreddit.name)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition min-h-[40px] ${
                      isSelected ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{subreddit.icon}</span>
                    <span className="text-sm flex-1 truncate">r/{subreddit.name}</span>
                  </button>
                );
              })}
            </div>

            <button className="w-full border-2 border-gray-300 text-gray-700 py-2 rounded-full font-semibold hover:bg-gray-100 transition text-sm min-h-[44px] mt-3">
              View All Communities
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
