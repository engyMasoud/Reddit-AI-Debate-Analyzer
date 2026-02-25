import { useContext } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Shield, BookOpen, Check } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

/**
 * DS1-US1: Inline AI Reasoning Summary Panel
 *
 * Displays an expandable AI-generated summary of a comment's reasoning,
 * including primary claim, evidence blocks with badges, and a circular
 * coherence score indicator.
 */
export default function ReasoningSummaryPanel({ comment }) {
  const { toggleSummary, isSummaryExpanded } = useContext(RedditContext);

  if (!comment.aiSummary) return null;

  const expanded = isSummaryExpanded(comment.id);
  const { aiSummary } = comment;

  const scoreInt = Math.round(aiSummary.coherenceScore * 100);

  const getStrengthBadge = (strength) => {
    switch (strength) {
      case 'high':
        return { label: 'High Strength', cls: 'bg-green-100 text-green-700 border border-green-300' };
      case 'medium':
        return { label: 'Medium Strength', cls: 'bg-yellow-100 text-yellow-700 border border-yellow-300' };
      case 'low':
        return { label: 'Low Strength', cls: 'bg-red-100 text-red-700 border border-red-300' };
      default:
        return { label: 'Unknown', cls: 'bg-gray-100 text-gray-600 border border-gray-300' };
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'study':
        return { label: 'Study', icon: <BookOpen size={10} className="inline mr-0.5" /> };
      case 'data':
        return { label: 'Data', icon: <BookOpen size={10} className="inline mr-0.5" /> };
      case 'anecdote':
        return { label: 'Anecdote', icon: null };
      case 'authority':
        return { label: 'Authority', icon: <BookOpen size={10} className="inline mr-0.5" /> };
      default:
        return { label: 'Other', icon: null };
    }
  };

  const getCoherenceLabel = (score) => {
    if (score >= 80) return 'High Coherence';
    if (score >= 60) return 'Moderate Coherence';
    return 'Low Coherence';
  };

  const getCoherenceColor = (score) => {
    if (score >= 80) return { stroke: 'stroke-purple-600', text: 'text-purple-700', bar: 'bg-purple-500', check: 'text-green-600' };
    if (score >= 60) return { stroke: 'stroke-yellow-500', text: 'text-yellow-700', bar: 'bg-yellow-500', check: 'text-yellow-600' };
    return { stroke: 'stroke-red-500', text: 'text-red-700', bar: 'bg-red-500', check: 'text-red-600' };
  };

  const colors = getCoherenceColor(scoreInt);

  // SVG circular progress params
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (scoreInt / 100) * circumference;

  return (
    <div className="mt-2">
      {/* Toggle Button - sits in the action bar area */}
      <button
        onClick={() => toggleSummary(comment.id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
          expanded
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            : 'bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-600'
        }`}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Show'} AI reasoning summary`}
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>{expanded ? 'Hide AI Summary' : 'Show AI Summary'}</span>
        {expanded ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </button>

      {/* Expanded Summary Panel */}
      {expanded && (
        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-5 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-purple-600" />
            <h4 className="text-sm font-bold text-purple-800">AI Reasoning Summary</h4>
            <span className="text-[10px] text-purple-400 ml-auto">
              AI-generated • {aiSummary.generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Summary paragraph */}
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            {aiSummary.summary}
          </p>

          {/* PRIMARY CLAIM */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={14} className="text-purple-600" />
              <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">Primary Claim</span>
            </div>
            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <p className="text-sm text-gray-800 leading-relaxed italic">
                &ldquo;{aiSummary.primaryClaim}&rdquo;
              </p>
            </div>
          </div>

          {/* EVIDENCE */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen size={14} className="text-purple-600" />
              <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">Evidence</span>
            </div>
            <div className="space-y-2">
              {aiSummary.evidenceBlocks.map((evidence, idx) => {
                const strength = getStrengthBadge(evidence.strength);
                const typeBadge = getTypeBadge(evidence.type);
                return (
                  <div
                    key={idx}
                    className="bg-white rounded-lg p-3 border border-purple-200"
                  >
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      &ldquo;{evidence.content}&rdquo;
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Type badge */}
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {typeBadge.icon}
                        {typeBadge.label}
                      </span>
                      {/* Strength badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${strength.cls}`}>
                        {strength.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COHERENCE SCORE */}
          <div className="mb-1">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">Coherence Score</span>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-4">
                {/* Circular progress indicator */}
                <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
                  <svg width="68" height="68" className="transform -rotate-90">
                    <circle
                      cx="34" cy="34" r={radius}
                      fill="none"
                      stroke="#e9d5ff"
                      strokeWidth="6"
                    />
                    <circle
                      cx="34" cy="34" r={radius}
                      fill="none"
                      className={colors.stroke}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-base font-bold ${colors.text}`}>{scoreInt}</span>
                  </div>
                </div>

                {/* Score details */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${colors.text} mb-1`}>{getCoherenceLabel(scoreInt)}</p>
                  {/* Horizontal progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${colors.bar}`}
                      style={{ width: `${scoreInt}%` }}
                      role="progressbar"
                      aria-valuenow={scoreInt}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Coherence score"
                    />
                  </div>
                  {/* Checkmark description */}
                  <div className="flex items-center gap-1">
                    <Check size={13} className={colors.check} />
                    <span className="text-[11px] text-green-600">
                      Argument structure is well-organized and logically consistent
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
