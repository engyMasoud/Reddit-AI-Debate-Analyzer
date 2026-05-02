import { useContext, useState, useEffect } from 'react';
import { RedditContext } from '../context/RedditContext';
import { BarChart3 } from 'lucide-react';

export default function PollDisplay({ postId, poll = null, loading = false }) {
  const { handlePollVote, polls } = useContext(RedditContext);
  const [selectedOption, setSelectedOption] = useState(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (polls[`post-${postId}`]) {
      setSelectedOption(polls[`post-${postId}`].userVote);
    }
  }, [postId, polls]);

  if (!poll) return null;

  // Prefer the live poll from context (updated optimistically) over the prop
  const livePoll = polls[`post-${postId}`] || poll;
  const totalVotes = livePoll.options.reduce((sum, opt) => sum + (opt.voteCount || 0), 0);

  const handleVote = async (optionId) => {
    setVoting(true);
    setSelectedOption(optionId);
    try {
      await handlePollVote(postId, optionId);
    } catch (err) {
      console.error('Failed to vote:', err);
      // Revert optimistic selection on failure
      setSelectedOption(polls[`post-${postId}`]?.userVote ?? null);
    } finally {
      setVoting(false);
    }
  };

  const getPercentage = (votes) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <BarChart3 size={16} className="text-blue-500" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{livePoll.question}</h3>
      </div>

      <div className="space-y-2">
        {livePoll.options.map((option) => {
          const percentage = getPercentage(option.voteCount || 0);
          const isSelected = selectedOption === option.id;
          const isVoted = selectedOption !== null && isSelected;

          return (
            <button
              key={option.id}
              onClick={() => !isVoted && handleVote(option.id)}
              disabled={voting || isVoted}
              className={`w-full text-left transition relative overflow-hidden rounded-lg ${
                isVoted
                  ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                  : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              } ${voting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {/* Background bar for percentage */}
              <div
                className={`absolute inset-y-0 left-0 transition-all ${
                  isVoted ? 'bg-blue-300 dark:bg-blue-500/40' : 'bg-blue-100 dark:bg-blue-900/20'
                }`}
                style={{ width: `${percentage}%` }}
              />

              {/* Content */}
              <div className="relative p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`poll-${postId}`}
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4"
                    disabled={voting || isVoted}
                  />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{option.text}</span>
                </div>
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                  {percentage}% ({option.voteCount || 0})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Total votes: <span className="font-semibold">{totalVotes}</span>
        {livePoll.endsAt && ` • Ends: ${new Date(livePoll.endsAt).toLocaleDateString()}`}
      </p>
    </div>
  );
}
