import { useContext } from 'react';
import { Search, Plus, Sparkles, Moon, Sun } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';
import ProfileDropdown from './ProfileDropdown';
import NotificationBell from './NotificationBell';

export default function Navbar({ onNewThread }) {
  const { setSearchQuery, searchQuery, user, selectedSubreddit, setSelectedSubreddit, showMyPosts, setShowMyPosts, isDarkMode, toggleDarkMode, subreddits } = useContext(RedditContext);

  // Build topics list with "All Discussions" first, then all subreddits
  const topics = [
    { name: null, displayName: 'All Discussions' },
    ...subreddits.map(s => ({ ...s, displayName: s.name }))
  ];

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
      {/* ── Top Bar ── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white hidden sm:inline">DebateAI</span>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-lg" role="search">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" aria-hidden="true" />
              <label htmlFor="search-input" className="sr-only">Search discussions</label>
              <input
                id="search-input"
                type="search"
                value={searchQuery}
                placeholder="Search discussions..."
                onChange={handleSearchChange}
                aria-label="Search discussions"
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 focus:border-violet-500 focus:outline-none focus:bg-white dark:focus:bg-gray-700 text-base dark:text-white transition placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Right: User + New Thread */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <NotificationBell />
            
            <button
              onClick={toggleDarkMode}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDarkMode ? 'Light mode' : 'Dark mode'}
            >
              {isDarkMode ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} className="text-gray-600" />}
            </button>

            <ProfileDropdown />

            <button
              onClick={onNewThread}
              className="flex items-center gap-1.5 bg-violet-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-violet-700 transition text-sm"
              aria-label="Create new thread"
            >
              <Plus size={16} aria-hidden="true" />
              <span className="hidden sm:inline">New Thread</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Horizontal Topic Nav ── */}
      <nav className="border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900" aria-label="Topic navigation">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {topics.map((topic) => {
            const isActive = selectedSubreddit === topic.name;
            return (
              <button
                key={topic.name || 'all'}
                onClick={() => { setShowMyPosts(false); setSelectedSubreddit(topic.name); }}
                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  !showMyPosts && isActive
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {topic.displayName}
                {!showMyPosts && isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

    </header>
  );
}
