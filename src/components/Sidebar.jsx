import { useContext } from 'react';
import { Home, TrendingUp, Newspaper, Compass, Plus, Info, Zap, HelpCircle, BookOpen, Briefcase, FileText, Users, Award } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function Sidebar() {
  const { subreddits, selectedSubreddit, setSelectedSubreddit, userJoinedSubreddits, joinSubreddit } = useContext(RedditContext);

  const feedItems = [
    { id: 'home', name: 'Home', icon: Home },
    { id: 'popular', name: 'Popular', icon: TrendingUp },
    { id: 'news', name: 'News', icon: Newspaper },
    { id: 'explore', name: 'Explore', icon: Compass },
  ];

  const resourceItems = [
    { name: 'About Reddit', icon: Info },
    { name: 'Advertise', icon: Zap },
    { name: 'Developer Platform', icon: Briefcase },
    { name: 'Reddit Pro', label: 'BETA', icon: TrendingUp },
    { name: 'Help', icon: HelpCircle },
    { name: 'Blog', icon: BookOpen },
    { name: 'Careers', icon: Briefcase },
    { name: 'Press', icon: FileText },
  ];

  const footerItems = [
    'Reddit Rules',
    'Privacy Policy',
    'User Agreement',
    'Your Privacy Choices',
    'Accessibility',
  ];

  const handleFeedClick = (name) => {
    setSelectedSubreddit(null);
  };

  const handleSubredditClick = (name) => {
    setSelectedSubreddit(name);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Feeds Section */}
        <div className="mb-6">
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

        <div className="border-t border-reddit-border py-4"></div>

        {/* Communities Section */}
        <div className="mb-6">
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
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition min-h-[40px] ${
                    isSelected ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'
                  }`}
                  onClick={() => handleSubredditClick(subreddit.name)}
                  aria-label={`Community r/${subreddit.name}`}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="text-lg flex-shrink-0" aria-hidden="true">{subreddit.icon}</span>
                  <span className="text-sm flex-1 truncate">r/{subreddit.name}</span>
                </button>
              );
            })}
          </div>

          <button className="w-full border-2 border-gray-300 text-gray-700 py-2 rounded-full font-semibold hover:bg-gray-100 transition text-sm min-h-[44px] mt-3">
            View All Communities
          </button>
        </div>

        <div className="border-t border-reddit-border py-4"></div>

        {/* Resources Section */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-reddit-gray uppercase mb-3 px-1">Resources</h3>
          <div className="space-y-1">
            {resourceItems.map((item) => (
              <button
                key={item.name}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition min-h-[40px]"
              >
                <item.icon size={18} className="text-reddit-gray flex-shrink-0" />
                <span className="text-sm flex-1 text-left">{item.name}</span>
                {item.label && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-bold">
                    {item.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-reddit-border py-4"></div>

        {/* More Communities */}
        <div>
          <h3 className="text-xs font-bold text-reddit-gray uppercase mb-3 px-1">More</h3>
          <div className="space-y-1">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition min-h-[40px]">
              <Users size={18} className="text-reddit-gray" />
              <span className="text-sm">Communities</span>
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition min-h-[40px]">
              <Award size={18} className="text-reddit-gray" />
              <span className="text-sm">Best of Reddit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Links */}
      <div className="border-t border-reddit-border p-4 text-xs text-reddit-gray space-y-2">
        <div className="flex flex-wrap gap-2">
          {footerItems.map((item) => (
            <button
              key={item}
              className="hover:underline transition"
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs">Reddit, Inc © 2026. All rights reserved.</p>
      </div>
    </div>
  );
}
