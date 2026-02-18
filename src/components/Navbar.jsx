import { useContext } from 'react';
import { Search, Menu, Plus, Settings } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function Navbar({ onMenuClick }) {
  const { setSearchQuery, user } = useContext(RedditContext);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  return (
    <nav className="bg-reddit-light border-b border-reddit-border sticky top-0 z-40 shadow-sm">
      <div className="px-4 py-3 max-w-7xl mx-auto 2xl:px-0 flex items-center justify-between gap-4">
        {/* Left: Mobile Menu + Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center transition"
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-2 font-bold">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              r
            </div>
            <span className="hidden sm:inline text-lg text-reddit-dark">Reddit</span>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="hidden sm:block flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-reddit-gray pointer-events-none" />
            <input
              type="text"
              placeholder="Search Reddit"
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-3xl border border-transparent focus:border-blue-500 focus:outline-none focus:bg-white text-sm transition"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Mobile: Search icon */}
          <button className="sm:hidden p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center transition">
            <Search size={20} className="text-reddit-gray" />
          </button>

          {/* Create Post */}
          <button className="hidden sm:flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-3xl font-semibold hover:bg-blue-700 transition min-h-[44px] text-sm">
            <Plus size={18} />
            <span className="hidden lg:inline">Create</span>
          </button>

          {/* Settings */}
          <button className="hidden lg:flex p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center transition">
            <Settings size={20} className="text-reddit-gray" />
          </button>

          {/* User Profile */}
          <button className="p-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center transition">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full text-white font-bold text-sm">
              {user.avatar}
            </div>
          </button>
        </div>
      </div>
    </nav>
  );
}
