import { useState, useContext, useEffect, useRef } from 'react';
import { Bell, MessageSquare, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markNotifRead,
    markAllNotifsRead,
    setSelectedPost,
    posts,
  } = useContext(RedditContext);

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

  const handleNotifClick = (notif) => {
    if (!notif.isRead) {
      markNotifRead(notif.id);
    }
    // Navigate to the post
    if (notif.postId) {
      const post = posts.find((p) => p.id === notif.postId);
      if (post) {
        setSelectedPost(post);
      }
    }
    setIsOpen(false);
  };

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function getIcon(notif) {
    if (notif.type === 'comment') return <MessageSquare size={14} className="text-blue-500" />;
    if (notif.message.includes('upvoted')) return <ArrowUp size={14} className="text-green-500" />;
    return <ArrowDown size={14} className="text-red-500" />;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center transition relative"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllNotifsRead()}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
              >
                <Check size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex items-start gap-3 ${
                    !notif.isRead ? 'bg-violet-50/50' : ''
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {getIcon(notif)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.isRead ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.createdAt)}</p>
                  </div>
                  {!notif.isRead && (
                    <span className="w-2 h-2 bg-violet-500 rounded-full mt-1.5 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
