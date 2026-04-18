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
  fetchSubreddits as apiFetchSubreddits,
  fetchComments as apiFetchComments,
  voteOnPost,
  voteOnComment,
  addCommentApi,
  createPost as apiCreatePost,
  joinSubredditApi,
  getComposerSocket,
  disconnectComposerSocket,
  fetchNotifications as apiFetchNotifications,
  fetchUnreadCount as apiFetchUnreadCount,
  markNotificationRead as apiMarkNotifRead,
  markAllNotificationsRead as apiMarkAllRead,
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
  const socketRef = useRef(null);
  const initRef = useRef(false);

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

  // DS3-US3: Analyze draft text via Socket.IO
  const analyzeDraft = useCallback((draftText) => {
    if (!draftText || draftText.trim().length < 10) {
      setDraftFeedback(null);
      return;
    }

    setFeedbackLoading(true);

    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('draft:analyze', { draftText });
    } else {
      // Fallback: try reconnecting
      const newSocket = getComposerSocket();
      socketRef.current = newSocket;
      newSocket.emit('draft:analyze', { draftText });
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
    } catch (err) {
      console.error('Add comment failed:', err);
    }
  }, [handleComment]);

  // Create a new post
  const createPost = useCallback(async (title, content, subreddit, image) => {
    const newPost = await apiCreatePost(title, content, subreddit, image);
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
  };

  return (
    <RedditContext.Provider value={value}>
      {children}
    </RedditContext.Provider>
  );
};
