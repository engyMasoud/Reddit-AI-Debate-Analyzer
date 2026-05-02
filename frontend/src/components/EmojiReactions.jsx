import { useContext, useState, useEffect, useRef } from 'react';
import { RedditContext } from '../context/RedditContext';
import { Smile, AlertCircle } from 'lucide-react';
import { fetchEmojiReactions } from '../api';

const EMOJI_PICKER = ['👍', '😂', '😮', '❤️', '😢', '🔥', '👏', '💯'];

export default function EmojiReactions({ targetType, targetId, reactions = [] }) {
  const { addEmojiReaction, removeEmojiReaction, emojiReactions, user } = useContext(RedditContext);
  const [showPicker, setShowPicker] = useState(false);
  const [currentReactions, setCurrentReactions] = useState(reactions);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const pickerRef = useRef(null);

  // Fetch reactions when component mounts or targetId changes
  useEffect(() => {
    const key = `${targetType}-${targetId}`;
    if (emojiReactions[key]) {
      setCurrentReactions(emojiReactions[key]);
      setLoadError(null);
    } else if (!reactions.length) {
      // Only fetch if no reactions provided and not already in context
      setIsLoading(true);
      setLoadError(null);
      fetchEmojiReactions(targetType, targetId)
        .then(data => {
          setCurrentReactions(data);
          setLoadError(null);
        })
        .catch(err => {
          console.error('Failed to fetch emoji reactions:', err);
          setLoadError('Failed to load reactions');
          setCurrentReactions([]);
        })
        .finally(() => setIsLoading(false));
    }
  }, [targetId, targetType, emojiReactions, reactions]);

  // Close picker on click outside
  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  // Close picker on scroll or Escape key
  useEffect(() => {
    if (!showPicker) return;
    const handleScroll = () => setShowPicker(false);
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowPicker(false);
    };
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showPicker]);

  const handleEmojiClick = (emoji) => {
    // Check if the CURRENT USER has already reacted with this emoji
    const reaction = currentReactions.find(r => r.emoji === emoji);
    const alreadyReacted = reaction?.userIds?.includes(user?.id);
    if (alreadyReacted) {
      removeEmojiReaction(targetType, targetId, emoji);
    } else {
      addEmojiReaction(targetType, targetId, emoji);
    }
    setShowPicker(false);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Error state */}
      {loadError && (
        <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
          <AlertCircle size={12} />
          <span>{loadError}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-xs text-gray-500 px-2 py-1">Loading...</div>
      )}

      {/* Display reactions */}
      {currentReactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => handleEmojiClick(reaction.emoji)}
          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs font-medium flex items-center gap-1 transition"
          title={`${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 0 && <span className="text-gray-600 dark:text-gray-400">{reaction.count}</span>}
        </button>
      ))}

      {/* Emoji picker button */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-xs font-medium flex items-center gap-1 transition"
          title="Add reaction"
        >
          <Smile size={14} />
        </button>

        {/* Emoji picker dropdown */}
        {showPicker && (
          <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 z-50 flex gap-1 flex-wrap w-48 border border-gray-200 dark:border-gray-700">
            {EMOJI_PICKER.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
