import { useContext } from 'react';
import { Search, Plus, Sparkles } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

const TOPICS = [
  { key: null, label: 'All Discussions' },
  { key: 'Technology', label: 'Technology' },
  { key: 'Programming', label: 'Programming' },
  { key: 'React', label: 'React' },
  { key: 'Web Development', label: 'Web Dev' },
  { key: 'Design', label: 'Design' },
  { key: 'Startups', label: 'Startups' },
];

export default function Navbar() {
  const { setSearchQuery, user, selectedSubreddit, setSelectedSubreddit } = useContext(RedditContext);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md">
      {/* ── Top Bar ── */}
      <div className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <span className="text-lg font-bold text-gray-900 hidden sm:inline">DebateAI</span>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-lg" role="search">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
              <label htmlFor="search-input" className="sr-only">Search discussions</label>
              <input
                id="search-input"
                type="search"
                placeholder="Search discussions..."
                onChange={handleSearchChange}
                aria-label="Search discussions"
                className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-lg border border-gray-200 focus:border-violet-500 focus:outline-none focus:bg-white text-sm transition placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Right: User + New Thread */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              className="p-2 hover:bg-gray-100 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center transition"
              aria-label={`User profile: ${user.username}`}
            >
              <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-white font-semibold text-xs" aria-hidden="true">
                {user.avatar}
              </div>
            </button>

            <button
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
      <nav className="border-b border-gray-100 bg-white" aria-label="Topic navigation">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {TOPICS.map((topic) => {
            const isActive = selectedSubreddit === topic.key;
            return (
              <button
                key={topic.label}
                onClick={() => setSelectedSubreddit(topic.key)}
                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-violet-700'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {topic.label}
                {isActive && (
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
