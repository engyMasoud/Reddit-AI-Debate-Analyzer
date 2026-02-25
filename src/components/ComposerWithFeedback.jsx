import { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, RefreshCcw, CheckCircle, Lightbulb, Send, X, Loader2, Sparkles, Check } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

/**
 * DS3-US3: Comment Composer with Real-Time Writing Feedback
 *
 * Two-column layout: left = editor with highlighted issues via overlay,
 * right = real-time AI feedback panel with circular gauge and themed cards.
 */
export default function ComposerWithFeedback({ postId, onSubmit, onCancel }) {
  const { analyzeDraft, draftFeedback, feedbackLoading, setDraftFeedback } = useContext(RedditContext);
  const [draftText, setDraftText] = useState('');
  const debounceRef = useRef(null);
  const textareaRef = useRef(null);
  const backdropRef = useRef(null);

  // Debounced analysis
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (draftText.trim().length >= 10) {
      debounceRef.current = setTimeout(() => {
        analyzeDraft(draftText);
      }, 500);
    } else {
      setDraftFeedback(null);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draftText, analyzeDraft, setDraftFeedback]);

  // Clean up on unmount
  useEffect(() => {
    return () => setDraftFeedback(null);
  }, [setDraftFeedback]);

  // Sync scroll between textarea and highlight backdrop
  const handleScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleSubmit = () => {
    if (draftText.trim()) {
      onSubmit(draftText.trim());
      setDraftText('');
      setDraftFeedback(null);
    }
  };

  const handleCancel = () => {
    setDraftText('');
    setDraftFeedback(null);
    if (onCancel) onCancel();
  };

  // Build highlighted HTML for the backdrop overlay
  const buildHighlightedMarkup = () => {
    if (!draftFeedback || !draftFeedback.issues.length) {
      // Return plain text with an invisible trailing char so sizing matches
      return escapeHtml(draftText) + '\n';
    }

    const issues = [...draftFeedback.issues].sort((a, b) => a.position.start - b.position.start);
    let result = '';
    let lastIndex = 0;

    issues.forEach((issue) => {
      const start = issue.position.start;
      const end = issue.position.end;

      if (start < lastIndex) return; // overlapping, skip

      // Text before the highlight
      result += escapeHtml(draftText.slice(lastIndex, start));

      // Highlighted text with colored underline
      const underlineColor = issue.type === 'weak_evidence'
        ? 'border-yellow-400 bg-yellow-50'
        : issue.type === 'circular_logic'
          ? 'border-orange-400 bg-orange-50'
          : 'border-red-400 bg-red-50';

      result += `<mark class="border-b-2 ${underlineColor} rounded-sm">${escapeHtml(draftText.slice(start, end))}</mark>`;
      lastIndex = end;
    });

    result += escapeHtml(draftText.slice(lastIndex));
    return result + '\n';
  };

  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Score helpers
  const score = draftFeedback ? Math.round(draftFeedback.score * 100) : 0;
  const getScoreColor = (s) => {
    if (s >= 70) return { stroke: 'stroke-green-500', text: 'text-green-600', label: 'Good', labelCls: 'text-green-600' };
    if (s >= 40) return { stroke: 'stroke-orange-400', text: 'text-orange-500', label: 'Medium', labelCls: 'text-orange-500' };
    return { stroke: 'stroke-red-500', text: 'text-red-600', label: 'Weak', labelCls: 'text-red-600' };
  };

  const scoreColors = getScoreColor(score);

  // Circular gauge SVG
  const gaugeRadius = 32;
  const gaugeCircum = 2 * Math.PI * gaugeRadius;
  const gaugeDash = gaugeCircum - (score / 100) * gaugeCircum;

  const hasFeedback = draftFeedback && (draftFeedback.issues.length > 0 || draftFeedback.goodPoints.length > 0);

  const getIssueTheme = (type) => {
    switch (type) {
      case 'weak_evidence':
        return {
          border: 'border-yellow-300',
          bg: 'bg-yellow-50',
          icon: <AlertTriangle size={15} className="text-yellow-600" />,
          label: 'Weak Evidence',
          labelCls: 'text-yellow-700',
          quoteBg: 'bg-yellow-100',
        };
      case 'circular_logic':
        return {
          border: 'border-orange-300',
          bg: 'bg-orange-50',
          icon: <RefreshCcw size={15} className="text-orange-600" />,
          label: 'Circular Logic',
          labelCls: 'text-orange-700',
          quoteBg: 'bg-orange-100',
        };
      case 'unsupported_claim':
        return {
          border: 'border-red-300',
          bg: 'bg-red-50',
          icon: <AlertTriangle size={15} className="text-red-600" />,
          label: 'Unsupported Claim',
          labelCls: 'text-red-700',
          quoteBg: 'bg-red-100',
        };
      default:
        return {
          border: 'border-gray-300',
          bg: 'bg-gray-50',
          icon: <AlertTriangle size={15} className="text-gray-600" />,
          label: 'Issue',
          labelCls: 'text-gray-700',
          quoteBg: 'bg-gray-100',
        };
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`flex flex-col ${hasFeedback ? 'md:flex-row' : ''}`}>
        {/* ─── Left Column: Editor ─── */}
        <div className={`flex-1 flex flex-col ${hasFeedback ? 'md:border-r md:border-gray-200' : ''}`}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">Your Reply:</span>
            {feedbackLoading && (
              <span className="flex items-center gap-1 text-xs text-purple-500">
                <Loader2 size={12} className="animate-spin" />
                Analyzing...
              </span>
            )}
          </div>

          {/* Editor with highlight overlay */}
          <div className="relative flex-1 min-h-[160px]">
            {/* Backdrop layer – renders highlighted text behind the textarea */}
            <div
              ref={backdropRef}
              className="absolute inset-0 p-4 text-sm leading-relaxed whitespace-pre-wrap break-words overflow-hidden pointer-events-none text-transparent"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: buildHighlightedMarkup() }}
              style={{ fontFamily: 'inherit', wordBreak: 'break-word' }}
            />
            {/* Actual textarea – transparent bg so highlights show through */}
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onScroll={handleScroll}
              placeholder="What are your thoughts? Start typing to get AI writing feedback..."
              className="relative w-full h-full p-4 resize-none focus:outline-none text-sm text-gray-800 leading-relaxed bg-transparent min-h-[160px]"
              rows="6"
              aria-label="Write your reply"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition min-h-[36px]"
              aria-label="Cancel reply"
            >
              <X size={14} aria-hidden="true" />
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!draftText.trim()}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition min-h-[36px] ${
                draftText.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              aria-label="Submit reply"
            >
              <Send size={14} aria-hidden="true" />
              Submit
            </button>
          </div>
        </div>

        {/* ─── Right Column: Feedback Panel ─── */}
        {hasFeedback && (
          <div className="md:w-96 bg-gray-50 border-t md:border-t-0 border-gray-200 max-h-[500px] overflow-y-auto" aria-live="polite" aria-label="AI writing feedback">
            <div className="p-4">
              {/* Feedback Header */}
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-purple-500" />
                <span className="text-sm font-bold text-purple-800">Real-Time Feedback</span>
              </div>

              {/* Score Header with circular gauge */}
              <div className="flex items-center gap-4 mb-5 bg-white rounded-lg p-3 border border-gray-200">
                {/* Circular gauge */}
                <div className="relative flex-shrink-0" style={{ width: 76, height: 76 }}>
                  <svg width="76" height="76" className="transform -rotate-90">
                    <circle
                      cx="38" cy="38" r={gaugeRadius}
                      fill="none" stroke="#e5e7eb" strokeWidth="6"
                    />
                    <circle
                      cx="38" cy="38" r={gaugeRadius}
                      fill="none"
                      className={scoreColors.stroke}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={gaugeCircum}
                      strokeDashoffset={gaugeDash}
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-lg font-bold ${scoreColors.text}`}>{score}</span>
                    <span className="text-[9px] text-gray-400">/100</span>
                  </div>
                </div>
                <div>
                  <p className={`text-base font-bold ${scoreColors.labelCls}`}>{scoreColors.label}</p>
                  <p className="text-xs text-gray-500">Argument Quality</p>
                </div>
              </div>

              {/* Issue Cards */}
              {draftFeedback.issues.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                    Issues ({draftFeedback.issues.length})
                  </span>
                  <div className="space-y-2">
                    {draftFeedback.issues.map((issue) => {
                      const theme = getIssueTheme(issue.type);
                      return (
                        <div
                          key={issue.id}
                          className={`rounded-lg border ${theme.border} ${theme.bg} p-3`}
                        >
                          {/* Card header */}
                          <div className="flex items-center gap-1.5 mb-2">
                            {theme.icon}
                            <span className={`text-xs font-bold ${theme.labelCls}`}>
                              {theme.label}
                            </span>
                          </div>
                          {/* Quoted text */}
                          {issue.flaggedText && (
                            <div className={`${theme.quoteBg} rounded-md px-2.5 py-1.5 mb-2`}>
                              <p className="text-xs text-gray-700 italic">
                                &ldquo;{issue.flaggedText}&rdquo;
                              </p>
                            </div>
                          )}
                          {/* Explanation */}
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {issue.explanation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {draftFeedback.suggestions.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                    Suggestions
                  </span>
                  <div className="space-y-1.5">
                    {draftFeedback.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-blue-200">
                        <Lightbulb size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 font-medium">{suggestion.text}</p>
                          {suggestion.exampleFix && (
                            <p className="text-[11px] text-blue-500 italic mt-1">
                              {suggestion.exampleFix}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Good Points */}
              {draftFeedback.goodPoints.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                    Good Points
                  </span>
                  <div className="space-y-1.5">
                    {draftFeedback.goodPoints.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-green-50 rounded-lg p-2.5 border border-green-200">
                        <Check size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-green-700">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
