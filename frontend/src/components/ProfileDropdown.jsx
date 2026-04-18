import { useState, useContext, useEffect, useRef } from 'react';
import { LogOut, User, Star } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function ProfileDropdown() {
  const { user, userJoinedSubreddits, subreddits, logout, setSelectedSubreddit, setShowMyPosts } = useContext(RedditContext);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!user) return null;

  const joinedSubs = subreddits.filter((s) =>
    userJoinedSubreddits.includes(s.id) && s.name !== 'Home' && s.name !== 'Popular'
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center transition"
        aria-label={`User profile: ${user.username}`}
        aria-expanded={isOpen}
      >
        <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-white font-semibold text-xs" aria-hidden="true">
          {user.avatar || '👤'}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user.avatar || '👤'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{user.username}</p>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Star size={11} className="text-yellow-500" />
                  <span>{(user.karma || 0).toLocaleString()} karma</span>
                </div>
              </div>
            </div>
          </div>

          {/* My Posts */}
          <button
            onClick={() => { setShowMyPosts(true); setSelectedSubreddit(null); setIsOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
          >
            <User size={14} className="text-gray-400" />
            My Posts
          </button>

          {/* Joined Communities */}
          {joinedSubs.length > 0 && (
            <div className="border-t border-gray-100">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Joined Communities</p>
              {joinedSubs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSubreddit(s.name); setIsOpen(false); }}
                  className="w-full text-left px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition flex items-center gap-2"
                >
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Logout */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => { logout(); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2"
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
