import { useContext, useState, useEffect } from 'react';
import { RedditContext } from '../context/RedditContext';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

export default function DebateSides({ postId, forCount = 0, againstCount = 0 }) {
  const { handleDebateSide, debateSides } = useContext(RedditContext);
  const [userSide, setUserSide] = useState(null);

  useEffect(() => {
    const side = debateSides[`post-${postId}`];
    setUserSide(side || null);
  }, [postId, debateSides]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Stance:</span>
      <div className="flex gap-1">
        {/* For button */}
        <button
          onClick={() => handleDebateSide(postId, 'for')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition ${
            userSide === 'for'
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/30'
          }`}
          title={`For: ${forCount} user${forCount !== 1 ? 's' : ''}`}
        >
          <ThumbsUp size={14} />
          <span>{forCount}</span>
        </button>

        {/* Against button */}
        <button
          onClick={() => handleDebateSide(postId, 'against')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition ${
            userSide === 'against'
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30'
          }`}
          title={`Against: ${againstCount} user${againstCount !== 1 ? 's' : ''}`}
        >
          <ThumbsDown size={14} />
          <span>{againstCount}</span>
        </button>
      </div>
    </div>
  );
}
