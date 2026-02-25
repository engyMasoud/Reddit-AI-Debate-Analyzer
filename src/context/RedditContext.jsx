import { createContext, useState, useCallback, useRef } from 'react';
import { mockPosts, mockSubreddits, currentUser, mockComments, mockWritingFeedback } from '../mockData';

export const RedditContext = createContext();

export const RedditProvider = ({ children }) => {
  const [posts, setPosts] = useState(mockPosts);
  const [subreddits] = useState(mockSubreddits);
  const [user, setUser] = useState(currentUser);
  const [selectedSubreddit, setSelectedSubreddit] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userJoinedSubreddits, setUserJoinedSubreddits] = useState(user.joinedSubreddits);
  const [comments, setComments] = useState(mockComments);
  const [userVotes, setUserVotes] = useState({}); // Track user's votes: { 'post-id': 'up'|'down'|null, ... }
  const [expandedSummaries, setExpandedSummaries] = useState({}); // Track which AI summaries are expanded
  const [draftFeedback, setDraftFeedback] = useState(null); // Current writing feedback
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const analyzeTimeoutRef = useRef(null); // Track pending analyzeDraft timeout to cancel stale calls

  const handleVote = useCallback((postId, voteType) => {
    const voteKey = `post-${postId}`;
    const currentVote = userVotes[voteKey];

    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          const newPost = { ...post };
          
          // If clicking the same vote type again, remove the vote
          if (currentVote === voteType) {
            if (voteType === 'up') {
              newPost.upvotes = Math.max(0, newPost.upvotes - 1);
            } else {
              newPost.downvotes = Math.max(0, newPost.downvotes - 1);
            }
            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: null,
            }));
          } else {
            // If changing vote or voting for the first time
            if (currentVote === 'up') {
              newPost.upvotes = Math.max(0, newPost.upvotes - 1);
            } else if (currentVote === 'down') {
              newPost.downvotes = Math.max(0, newPost.downvotes - 1);
            }

            if (voteType === 'up') {
              newPost.upvotes += 1;
            } else {
              newPost.downvotes += 1;
            }

            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: voteType,
            }));
          }
          return newPost;
        }
        return post;
      })
    );
  }, [userVotes]);

  const handleCommentVote = useCallback((commentId, voteType) => {
    const voteKey = `comment-${commentId}`;
    const currentVote = userVotes[voteKey];

    setComments((prevComments) =>
      prevComments.map((comment) => {
        if (comment.id === commentId) {
          const newComment = { ...comment };

          // If clicking the same vote type again, remove the vote
          if (currentVote === voteType) {
            if (voteType === 'up') {
              newComment.upvotes = Math.max(0, newComment.upvotes - 1);
            } else {
              newComment.downvotes = Math.max(0, newComment.downvotes - 1);
            }
            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: null,
            }));
          } else {
            // If changing vote or voting for the first time
            if (currentVote === 'up') {
              newComment.upvotes = Math.max(0, newComment.upvotes - 1);
            } else if (currentVote === 'down') {
              newComment.downvotes = Math.max(0, newComment.downvotes - 1);
            }

            if (voteType === 'up') {
              newComment.upvotes += 1;
            } else {
              newComment.downvotes += 1;
            }

            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: voteType,
            }));
          }
          return newComment;
        }
        return comment;
      })
    );
  }, [userVotes]);

  const handleComment = useCallback((postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          return { ...post, commentCount: post.commentCount + 1 };
        }
        return post;
      })
    );
  }, []);

  const joinSubreddit = useCallback((subredditId) => {
    setUserJoinedSubreddits((prev) => {
      if (prev.includes(subredditId)) {
        return prev.filter((id) => id !== subredditId);
      }
      return [...prev, subredditId];
    });
  }, []);

  const getFeedPosts = useCallback(() => {
    let filtered = posts;

    if (selectedSubreddit) {
      filtered = filtered.filter((post) => post.subreddit === selectedSubreddit);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query) ||
          post.author.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [posts, selectedSubreddit, searchQuery]);

  // DS1-US1: Toggle AI reasoning summary for a comment
  const toggleSummary = useCallback((commentId) => {
    setExpandedSummaries((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  }, []);

  // DS1-US1: Check if a summary is expanded
  const isSummaryExpanded = useCallback((commentId) => {
    return !!expandedSummaries[commentId];
  }, [expandedSummaries]);

  // DS3-US3: Analyze draft text for writing feedback (simulated)
  const analyzeDraft = useCallback((draftText) => {
    if (!draftText || draftText.trim().length < 10) {
      setDraftFeedback(null);
      return;
    }

    // Cancel any pending stale timeout from a previous call
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }

    setFeedbackLoading(true);

    // Simulate API call with debounce-like delay
    analyzeTimeoutRef.current = setTimeout(() => {
      analyzeTimeoutRef.current = null;
      const issues = [];
      const suggestions = [];
      const goodPoints = [];
      const lowerText = draftText.toLowerCase();

      // Detect weak evidence patterns
      const weakPatterns = [
        { pattern: /everyone (knows|says|agrees|uses|thinks)/gi, msg: "Appeal to popularity — provide specific evidence instead of 'everyone'" },
        { pattern: /obviously|clearly|of course/gi, msg: "Assumed conclusion — what seems obvious to you may need evidence for others" },
        { pattern: /I (think|believe|feel) .* because .* (just|simply)/gi, msg: "Weak justification — strengthen with data or sources" },
        { pattern: /always|never|all .*(agree|prefer|think)/gi, msg: "Absolute claim — qualify with specific data or percentages" },
      ];

      weakPatterns.forEach((wp, idx) => {
        const match = wp.pattern.exec(draftText);
        if (match) {
          issues.push({
            id: issues.length + 1,
            type: "weak_evidence",
            position: { start: match.index, end: match.index + match[0].length },
            lineNumber: draftText.substring(0, match.index).split('\n').length,
            flaggedText: match[0],
            explanation: wp.msg,
            severity: "medium",
            confidence: 0.8,
          });
        }
      });

      // Detect circular logic (repeated phrases)
      const sentences = draftText.split(/[.!?]+/).filter(s => s.trim().length > 10);
      for (let i = 0; i < sentences.length; i++) {
        for (let j = i + 1; j < sentences.length; j++) {
          const words1 = sentences[i].toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const words2 = sentences[j].toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const overlap = words1.filter(w => words2.includes(w));
          if (overlap.length > 3) {
            const start = draftText.indexOf(sentences[j].trim());
            issues.push({
              id: issues.length + 1,
              type: "circular_logic",
              position: { start, end: start + sentences[j].trim().length },
              lineNumber: draftText.substring(0, start).split('\n').length,
              flaggedText: sentences[j].trim().substring(0, 40) + "...",
              explanation: `This appears to repeat ideas from an earlier sentence. Consider adding new evidence or removing the repetition.`,
              severity: "medium",
              confidence: 0.75,
            });
            break;
          }
        }
      }

      // Detect unsupported claims
      const unsupportedPatterns = [
        { pattern: /studies (show|prove|demonstrate)/gi, msg: "Cite the specific study — which researchers, what year, what journal?" },
        { pattern: /research (shows|proves|indicates)/gi, msg: "Specify the research — vague references to 'research' weaken your argument" },
        { pattern: /it('s| is) (a fact|proven|well.known)/gi, msg: "Provide the source for this claim — stating something is a fact requires evidence" },
      ];

      unsupportedPatterns.forEach((up) => {
        const match = up.pattern.exec(draftText);
        if (match) {
          issues.push({
            id: issues.length + 1,
            type: "unsupported_claim",
            position: { start: match.index, end: match.index + match[0].length },
            lineNumber: draftText.substring(0, match.index).split('\n').length,
            flaggedText: match[0],
            explanation: up.msg,
            severity: "high",
            confidence: 0.88,
          });
        }
      });

      // Detect good points
      if (draftText.match(/https?:\/\/|according to|source:|citation:/i)) {
        goodPoints.push("Includes a source or citation");
      }
      if (draftText.match(/however|on the other hand|while .* argue|counterpoint/i)) {
        goodPoints.push("Acknowledges opposing viewpoints");
      }
      if (draftText.match(/\d+%|\d+ percent|data shows/i)) {
        goodPoints.push("Uses specific data or statistics");
      }
      if (sentences.length >= 2) {
        goodPoints.push("Structured argument with multiple points");
      }
      if (goodPoints.length === 0 && draftText.trim().length >= 10) {
        goodPoints.push("Clear assertion of position");
      }

      // Build suggestions
      if (issues.some(i => i.type === "weak_evidence")) {
        suggestions.push({
          id: 1,
          text: "Add specific citations or data to support your claims",
          type: "reference",
          priority: "high",
          exampleFix: "'According to [specific source/study]...'",
        });
      }
      if (issues.some(i => i.type === "circular_logic")) {
        suggestions.push({
          id: 2,
          text: "Remove repeated arguments or expand them with new evidence",
          type: "structure",
          priority: "medium",
          exampleFix: "Replace the repeated point with a new supporting argument",
        });
      }
      if (issues.some(i => i.type === "unsupported_claim")) {
        suggestions.push({
          id: 3,
          text: "Qualify absolute statements and add evidence",
          type: "clarity",
          priority: "high",
          exampleFix: "'Many experts suggest...' instead of absolute claims",
        });
      }
      if (!draftText.match(/however|but|although|while/i)) {
        suggestions.push({
          id: 4,
          text: "Consider addressing counterarguments to strengthen your position",
          type: "clarity",
          priority: "medium",
          exampleFix: "'While some may argue X, the evidence shows Y because...'",
        });
      }

      // Calculate score
      const maxIssues = 5;
      const score = Math.max(0, Math.min(1, 1 - (issues.length / maxIssues)));

      setDraftFeedback({
        issues,
        score,
        suggestions,
        goodPoints,
        confidence: 0.79,
        generatedAt: new Date(),
      });
      setFeedbackLoading(false);
    }, 600);
  }, []);

  // Get comments for a specific post
  const getPostComments = useCallback((postId) => {
    return comments.filter(c => c.postId === postId);
  }, [comments]);

  // Add a new comment to a post
  const addComment = useCallback((postId, text) => {
    const newComment = {
      id: Date.now(),
      postId,
      author: user.username,
      text,
      upvotes: 1,
      downvotes: 0,
      timestamp: new Date(),
      userVote: null,
      aiSummary: null,
    };
    setComments(prev => [newComment, ...prev]);
    handleComment(postId);
  }, [user.username, handleComment]);

  const value = {
    posts,
    subreddits,
    user,
    selectedSubreddit,
    setSelectedSubreddit,
    selectedPost,
    setSelectedPost,
    searchQuery,
    setSearchQuery,
    userJoinedSubreddits,
    handleVote,
    handleCommentVote,
    handleComment,
    joinSubreddit,
    getFeedPosts,
    comments,
    userVotes,
    // DS1-US1: AI Reasoning Summary
    toggleSummary,
    isSummaryExpanded,
    // DS3-US3: Writing Feedback
    analyzeDraft,
    draftFeedback,
    feedbackLoading,
    setDraftFeedback,
    // Comment helpers
    getPostComments,
    addComment,
  };

  return (
    <RedditContext.Provider value={value}>
      {children}
    </RedditContext.Provider>
  );
};
