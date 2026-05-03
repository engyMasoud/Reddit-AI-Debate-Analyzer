import { createContext, useState, useCallback, useRef, useEffect, useContext } from 'react';
import {
  login as apiLogin,
  register as apiRegister,
  googleLogin as apiGoogleLogin,
  fetchMe as apiFetchMe,
  setToken,
  loadToken,
  clearToken,
  setOnAuthFailure,
  fetchPosts as apiFetchPosts,
  fetchPost as apiFetchPost,
  fetchSubreddits as apiFetchSubreddits,
  fetchComments as apiFetchComments,
  voteOnPost,
  voteOnComment,
  addCommentApi,
  createPost as apiCreatePost,
  joinSubredditApi,
  getComposerSocket,
  disconnectComposerSocket,
  analyzeDraftRest,
  fetchNotifications as apiFetchNotifications,
  fetchUnreadCount as apiFetchUnreadCount,
  markNotificationRead as apiMarkNotifRead,
  markAllNotificationsRead as apiMarkAllRead,
  addEmojiReaction as apiAddEmojiReaction,
  removeEmojiReaction as apiRemoveEmojiReaction,
  fetchEmojiReactions as apiFetchEmojiReactions,
  setDebateSide as apiSetDebateSide,
  removeDebateSide as apiRemoveDebateSide,
  getDebateSide as apiGetDebateSide,
  getDebateSideCounts as apiGetDebateSideCounts,
  fetchPoll as apiFetchPoll,
  votePoll as apiVotePoll,
} from '../api';

export const RedditContext = createContext();

export function useReddit() {
  return useContext(RedditContext);
}

export const RedditProvider = ({ children }) => {
  const [posts, setPosts] = useState([]);
  const [subreddits, setSubreddits] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedSubreddit, setSelectedSubreddit] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [userJoinedSubreddits, setUserJoinedSubreddits] = useState([]);
  const [comments, setComments] = useState([]);
  const [userVotes, setUserVotes] = useState({});
  const [expandedSummaries, setExpandedSummaries] = useState({});
  const [draftFeedback, setDraftFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Load theme preference from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [emojiReactions, setEmojiReactions] = useState({}); // { 'post-123': [{emoji, count, userIds}], ... }
  const [debateSides, setDebateSides] = useState({}); // { 'post-123': 'for'/'against', ... }
  const [polls, setPolls] = useState({}); // { 'post-123': {id, question, options, userVote}, ... }
  const socketRef = useRef(null);
  const initRef = useRef(false);

  // Toggle dark mode and save preference
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      localStorage.setItem('theme', newValue ? 'dark' : 'light');
      if (typeof document !== 'undefined') {
        if (newValue) {
          document.body.classList.add('dark');
          document.body.classList.remove('light');
        } else {
          document.body.classList.remove('dark');
          document.body.classList.add('light');
        }
      }
      return newValue;
    });
  }, []);

  // Apply dark mode on mount
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
  }, [isDarkMode]);

  // ── Emoji Reactions ──
  const addEmojiReaction = useCallback(async (targetType, targetId, emoji) => {
    try {
      await apiAddEmojiReaction(targetType, targetId, emoji);
      // Fetch updated reactions from backend
      const reactions = await apiFetchEmojiReactions(targetType, targetId);
      const key = `${targetType}-${targetId}`;
      setEmojiReactions(prev => ({
        ...prev,
        [key]: reactions
      }));
    } catch (err) {
      console.error('Failed to add emoji reaction:', err);
    }
  }, []);

  const removeEmojiReaction = useCallback(async (targetType, targetId, emoji) => {
    try {
      await apiRemoveEmojiReaction(targetType, targetId, emoji);
      // Fetch updated reactions from backend
      const reactions = await apiFetchEmojiReactions(targetType, targetId);
      const key = `${targetType}-${targetId}`;
      setEmojiReactions(prev => ({
        ...prev,
        [key]: reactions
      }));
    } catch (err) {
      console.error('Failed to remove emoji reaction:', err);
    }
  }, []);

  const fetchEmojisForTarget = useCallback(async (targetType, targetId) => {
    try {
      const reactions = await apiFetchEmojiReactions(targetType, targetId);
      const key = `${targetType}-${targetId}`;
      setEmojiReactions(prev => ({
        ...prev,
        [key]: reactions
      }));
    } catch (err) {
      console.error('Failed to fetch emoji reactions:', err);
    }
  }, []);

  // ── Debate Sides ──
  const handleDebateSide = useCallback(async (postId, side) => {
    try {
      const currentSide = debateSides[`post-${postId}`];
      
      // If clicking the same side again, remove the vote
      if (currentSide === side) {
        await apiRemoveDebateSide(postId);
        setDebateSides(prev => {
          const updated = { ...prev };
          delete updated[`post-${postId}`];
          return updated;
        });
      } else {
        // Otherwise, set the new vote
        await apiSetDebateSide(postId, side);
        setDebateSides(prev => ({
          ...prev,
          [`post-${postId}`]: side
        }));
      }
      
      // Fetch updated debate side counts
      const sidesCounts = await apiGetDebateSideCounts(postId);
      
      // Update selected post if it's the one being voted on
      if (selectedPost?.id === postId) {
        setSelectedPost(prev => ({
          ...prev,
          forCount: sidesCounts.for,
          againstCount: sidesCounts.against
        }));
      }
      
      // Update post in the posts array
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            forCount: sidesCounts.for,
            againstCount: sidesCounts.against
          };
        }
        return p;
      }));
    } catch (err) {
      console.error('Failed to set debate side:', err);
    }
  }, [debateSides, selectedPost?.id]);

  // ── Polls ──
  const handlePollVote = useCallback(async (postId, optionId) => {
    const key = `post-${postId}`;
    const currentPoll = polls[key] || selectedPost?.poll;

    // Optimistic update: adjust vote counts immediately
    if (currentPoll) {
      const prevVoteId = currentPoll.userVote;
      const updatedOptions = currentPoll.options.map(opt => {
        let count = opt.voteCount || 0;
        if (opt.id === prevVoteId) count = Math.max(0, count - 1);
        if (opt.id === optionId) count += 1;
        return { ...opt, voteCount: count };
      });
      const updatedPoll = { ...currentPoll, options: updatedOptions, userVote: optionId };
      setPolls(prev => ({ ...prev, [key]: updatedPoll }));
      setSelectedPost(prev => prev?.id === postId ? { ...prev, poll: updatedPoll } : prev);

      try {
        await apiVotePoll(optionId);
      } catch (err) {
        console.error('Failed to vote on poll:', err);
        // Revert on failure
        setPolls(prev => ({ ...prev, [key]: currentPoll }));
        setSelectedPost(prev => prev?.id === postId ? { ...prev, poll: currentPoll } : prev);
      }
    } else {
      // No local poll state yet — just call API
      try {
        await apiVotePoll(optionId);
      } catch (err) {
        console.error('Failed to vote on poll:', err);
      }
    }
  }, [polls, selectedPost]);

  function normalizeUser(u) {
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar || '👤',
      karma: u.karma,
      joinedDate: u.joinedDate ? new Date(u.joinedDate) : new Date(),
      joinedSubreddits: u.joinedSubreddits || [],
    };
  }

  async function fetchInitialData() {
    const [postsData, subsData] = await Promise.all([
      apiFetchPosts(),
      apiFetchSubreddits(),
    ]);
    setPosts(postsData.map(normalizePost));
    setUserVotes(extractVotesFromPosts(postsData));
    setDebateSides(extractDebateSidesFromPosts(postsData));
    setSubreddits(subsData);
  }

  // ── Bootstrap: check stored token, validate via /auth/me ──
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    setOnAuthFailure(() => {
      clearToken();
      setUser(null);
      setIsAuthenticated(false);
      initRef.current = false;
    });

    (async () => {
      try {
        const storedToken = loadToken();
        if (storedToken) {
          const { user: u } = await apiFetchMe();
          setUser(normalizeUser(u));
          setUserJoinedSubreddits(u.joinedSubreddits || []);
          setIsAuthenticated(true);
          await fetchInitialData();
        }
      } catch (err) {
        console.error('Session restore failed:', err);
        clearToken();
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  // ── Auth functions exposed to components ──
  const loginUser = async (username, password) => {
    const { token, user: u } = await apiLogin(username, password);
    setToken(token);
    setUser(normalizeUser(u));
    setUserJoinedSubreddits(u.joinedSubreddits || []);
    setIsAuthenticated(true);
    await fetchInitialData();
  };

  const registerUser = async (username, email, password) => {
    const { token, user: u } = await apiRegister(username, email, password);
    setToken(token);
    setUser(normalizeUser(u));
    setUserJoinedSubreddits(u.joinedSubreddits || []);
    setIsAuthenticated(true);
    await fetchInitialData();
  };

  const googleLoginUser = async (credential) => {
    const { token, user: u } = await apiGoogleLogin(credential);
    setToken(token);
    setUser(normalizeUser(u));
    setUserJoinedSubreddits(u.joinedSubreddits || []);
    setIsAuthenticated(true);
    await fetchInitialData();
  };

  function normalizePost(p) {
    return {
      ...p,
      timestamp: new Date(p.timestamp),
    };
  }

  /** Build userVotes entries from posts/comments that have userVote set. */
  function extractVotesFromPosts(postsData) {
    const votes = {};
    for (const p of postsData) {
      if (p.userVote) votes[`post-${p.id}`] = p.userVote;
    }
    return votes;
  }

  /** Build debateSides entries from posts that have userDebateSide set. */
  function extractDebateSidesFromPosts(postsData) {
    const sides = {};
    for (const p of postsData) {
      if (p.userDebateSide) sides[`post-${p.id}`] = p.userDebateSide;
    }
    return sides;
  }

  function extractVotesFromComments(commentsData) {
    const votes = {};
    for (const c of commentsData) {
      if (c.userVote) votes[`comment-${c.id}`] = c.userVote;
    }
    return votes;
  }

  // ── Refetch posts when subreddit or search changes ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await apiFetchPosts(
          showMyPosts ? undefined : (selectedSubreddit || undefined),
          searchQuery || undefined,
          showMyPosts ? user.id : undefined
        );
        setPosts(data.map(normalizePost));
        setUserVotes((prev) => ({ ...prev, ...extractVotesFromPosts(data) }));
        setDebateSides((prev) => ({ ...prev, ...extractDebateSidesFromPosts(data) }));
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      }
    })();
  }, [selectedSubreddit, searchQuery, showMyPosts, user]);

  // ── Fetch comments when a post is selected ──
  useEffect(() => {
    if (!selectedPost) return;
    (async () => {
      try {
        const data = await apiFetchComments(selectedPost.id);
        setComments(data.map((c) => ({ ...c, timestamp: new Date(c.timestamp) })));
        setUserVotes((prev) => ({ ...prev, ...extractVotesFromComments(data) }));
      } catch (err) {
        console.error('Failed to fetch comments:', err);
      }
    })();
  }, [selectedPost]);

  // ── Fetch debate side counts and poll when a post is selected ──
  useEffect(() => {
    if (!selectedPost) return;
    (async () => {
      try {
        // Fetch user's current debate side
        const userSide = await apiGetDebateSide(selectedPost.id);
        if (userSide.side) {
          setDebateSides(prev => ({
            ...prev,
            [`post-${selectedPost.id}`]: userSide.side
          }));
        } else {
          // Clear the side if not set
          setDebateSides(prev => {
            const updated = { ...prev };
            delete updated[`post-${selectedPost.id}`];
            return updated;
          });
        }
        
        // Fetch debate side counts
        const sidesCounts = await apiGetDebateSideCounts(selectedPost.id);
        
        // Fetch poll
        const poll = await apiFetchPoll(selectedPost.id);
        
        // Update selected post with new data
        setSelectedPost(prev => ({
          ...prev,
          forCount: sidesCounts.for,
          againstCount: sidesCounts.against,
          poll: poll || null
        }));
        
        // Also update the post in the posts array
        setPosts(prev => prev.map(p => {
          if (p.id === selectedPost.id) {
            return {
              ...p,
              forCount: sidesCounts.for,
              againstCount: sidesCounts.against,
              poll: poll || null
            };
          }
          return p;
        }));
      } catch (err) {
        console.warn('Failed to fetch debate sides or poll:', err);
      }
    })();
  }, [selectedPost?.id]);

  // ── Socket.IO for writing feedback ──
  useEffect(() => {
    if (!user) return;
    const socket = getComposerSocket();
    socketRef.current = socket;

    socket.on('feedback:result', (result) => {
      setDraftFeedback({
        issues: result.issues,
        score: result.score,
        suggestions: result.suggestions,
        goodPoints: result.goodPoints,
        confidence: result.confidence,
        generatedAt: new Date(result.generatedAt),
      });
      setFeedbackLoading(false);
    });

    socket.on('feedback:error', (err) => {
      console.error('Feedback error:', err);
      setFeedbackLoading(false);
    });

    return () => {
      socket.off('feedback:result');
      socket.off('feedback:error');
      disconnectComposerSocket();
    };
  }, [user]);

  // ── Notifications: fetch + poll every 30s ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadNotifications() {
      try {
        const [notifs, { count }] = await Promise.all([
          apiFetchNotifications(),
          apiFetchUnreadCount(),
        ]);
        if (!cancelled) {
          setNotifications(notifs);
          setUnreadCount(count);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    }

    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // ── Post Voting ──
  const handleVote = useCallback(async (postId, voteType) => {
    const voteKey = `post-${postId}`;

    try {
      const { upvotes, downvotes, userVote } = await voteOnPost(postId, voteType);
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId ? { ...post, upvotes, downvotes } : post
        )
      );
      setUserVotes((prev) => ({
        ...prev,
        [voteKey]: userVote || null,
      }));
    } catch (err) {
      console.error('Vote failed:', err);
    }
  }, []);

  // ── Comment Voting ──
  const handleCommentVote = useCallback(async (commentId, voteType) => {
    const voteKey = `comment-${commentId}`;

    try {
      const { upvotes, downvotes, userVote } = await voteOnComment(commentId, voteType);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, upvotes, downvotes } : c
        )
      );
      setUserVotes((prev) => ({
        ...prev,
        [voteKey]: userVote || null,
      }));
    } catch (err) {
      console.error('Comment vote failed:', err);
    }
  }, []);

  // ── Comment count bump (used after adding comment) ──
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

  // ── Join / Leave subreddit ──
  const joinSubreddit = useCallback(async (subredditId) => {
    try {
      const { joined } = await joinSubredditApi(subredditId);
      setUserJoinedSubreddits((prev) => {
        if (joined) return [...prev, subredditId];
        return prev.filter((id) => id !== subredditId);
      });
    } catch (err) {
      console.error('Join/leave failed:', err);
    }
  }, []);

  // ── Feed filtering (post-fetch, used for client-side display) ──
  const getFeedPosts = useCallback(() => {
    return posts;
  }, [posts]);

  // Load a specific post by ID (for direct URL access)
  const loadPostFromURL = useCallback(async (postId) => {
    try {
      const post = await apiFetchPost(postId);
      const normalized = normalizePost(post);
      setSelectedPost(normalized);
      
      // Also fetch comments for this post
      const commentsData = await apiFetchComments(postId);
      setComments(commentsData.map((c) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      })));
      
      // Fetch emoji reactions for post
      try {
        const emojiReactions = await apiFetchEmojiReactions('post', postId);
        setEmojiReactions(prev => ({
          ...prev,
          [`post-${postId}`]: emojiReactions
        }));
      } catch (err) {
        console.warn('Failed to fetch emoji reactions:', err);
      }

      // Fetch debate side counts
      try {
        const sidesCounts = await apiGetDebateSideCounts(postId);
        normalized.forCount = sidesCounts.for;
        normalized.againstCount = sidesCounts.against;
      } catch (err) {
        console.warn('Failed to fetch debate side counts:', err);
      }

      // Fetch poll for post
      try {
        const poll = await apiFetchPoll(postId);
        if (poll) {
          setPolls(prev => ({
            ...prev,
            [`post-${postId}`]: poll
          }));
          normalized.poll = poll;
        }
      } catch (err) {
        // No poll for this post, which is fine
      }
      
      return normalized;
    } catch (err) {
      console.error('Failed to load post from URL:', err);
      return null;
    }
  }, []);

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

  // DS3-US3: Analyze draft text via Socket.IO with REST fallback
  const analyzeDraft = useCallback(async (draftText, postId) => {
    if (!draftText || draftText.trim().length < 10) {
      setDraftFeedback(null);
      return;
    }

    setFeedbackLoading(true);

    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('draft:analyze', { draftText, contextId: postId });
      return;
    }

    // Socket not connected (e.g. serverless/Lambda deployment with no WebSocket support).
    // Fall back to the synchronous REST endpoint.
    try {
      const result = await analyzeDraftRest(draftText);
      setDraftFeedback(result);
    } catch (err) {
      console.error('Draft analysis failed:', err);
      throw err;
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  // Get comments for a specific post
  const getPostComments = useCallback((postId) => {
    return comments.filter((c) => c.postId === postId);
  }, [comments]);

  // Add a new comment to a post
  const addComment = useCallback(async (postId, text, parentCommentId) => {
    try {
      const newComment = await addCommentApi(postId, text, parentCommentId);
      setComments((prev) => [
        ...prev,
        { ...newComment, timestamp: new Date(newComment.timestamp) },
      ]);
      handleComment(postId);
      return { success: true };
    } catch (err) {
      console.error('Add comment failed:', err);
      return { success: false, error: err.message || 'Failed to post comment' };
    }
  }, [handleComment]);

  // Create a new post
  const createPost = useCallback(async (title, content, subreddit, image, poll) => {
    const newPost = await apiCreatePost(title, content, subreddit, image, poll);
    setPosts((prev) => [normalizePost(newPost), ...prev]);
    return newPost;
  }, []);

  // Logout
  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setPosts([]);
    setComments([]);
    setUserVotes({});
    setSubreddits([]);
    setUserJoinedSubreddits([]);
    setSelectedPost(null);
    setSelectedSubreddit(null);
    setIsAuthenticated(false);
    setNotifications([]);
    setUnreadCount(0);
    setShowMyPosts(false);
    initRef.current = false;
  }, []);

  // Mark a single notification as read
  const markNotifRead = useCallback(async (notifId) => {
    try {
      await apiMarkNotifRead(notifId);
      setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, isRead: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllNotifsRead = useCallback(async () => {
    try {
      await apiMarkAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  }, []);

  const value = {
    posts,
    subreddits,
    user,
    isAuthenticated,
    authLoading,
    loginUser,
    registerUser,
    googleLoginUser,
    selectedSubreddit,
    setSelectedSubreddit,
    selectedPost,
    setSelectedPost,
    searchQuery,
    setSearchQuery,
    showMyPosts,
    setShowMyPosts,
    userJoinedSubreddits,
    handleVote,
    handleCommentVote,
    handleComment,
    joinSubreddit,
    getFeedPosts,
    loadPostFromURL,
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
    createPost,
    logout,
    notifications,
    unreadCount,
    markNotifRead,
    markAllNotifsRead,
    // Theme
    isDarkMode,
    toggleDarkMode,
    // Emoji Reactions
    addEmojiReaction,
    removeEmojiReaction,
    fetchEmojisForTarget,
    emojiReactions,
    // Debate Sides
    handleDebateSide,
    debateSides,
    // Polls
    handlePollVote,
    polls,
    setPolls,
  };

  return (
    <RedditContext.Provider value={value}>
      {children}
    </RedditContext.Provider>
  );
};

export default RedditProvider;
