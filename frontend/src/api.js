


import { io } from 'socket.io-client';
import { getViteApiUrl } from './viteEnv.js';

// Robust API base URL selection for all environments (Vite, Node, Jest).
// IMPORTANT: must be resolved synchronously at module load — an async dynamic
// import here causes the very first request after page reload (auth/me) to
// hit the default '/api/v1' before the real URL arrives, which appeared as
// "logged out on refresh".
let API_BASE = '/api/v1';
if (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) {
  API_BASE = process.env.VITE_API_URL;
} else {
  const viteUrl = getViteApiUrl();
  if (viteUrl) {
    API_BASE = viteUrl;
  }
}

// ── Token management ──
let authToken = null;

export function getToken() {
  return authToken;
}

export function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function loadToken() {
  authToken = localStorage.getItem('auth_token');
  return authToken;
}

export function clearToken() {
  authToken = null;
  localStorage.removeItem('auth_token');
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

// Global 401 handler — re-login callback set by the context
let onAuthFailure = null;
export function setOnAuthFailure(callback) {
  onAuthFailure = callback;
}

/** Wrapper that checks for 401 and triggers re-auth if needed. */
async function handleResponse(res) {
  if (res.status === 401 && onAuthFailure) {
    onAuthFailure();
    throw new Error('Session expired');
  }
  return res;
}

// ── Auth ──

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Login failed');
  }
  return res.json(); // { token, user }
}

export async function register(username, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Registration failed');
  }
  return res.json(); // { token, user }
}

export async function googleLogin(credential) {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Google login failed');
  }
  return res.json(); // { token, user }
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Session expired');
  return res.json(); // { user }
}

// ── Posts ──

export async function fetchPosts(subreddit, searchQuery, authorId) {
  const params = new URLSearchParams();
  if (subreddit) params.set('subreddit', subreddit);
  if (searchQuery) params.set('q', searchQuery);
  if (authorId) params.set('authorId', String(authorId));
  const qs = params.toString();
  let res = await fetch(`${API_BASE}/posts${qs ? '?' + qs : ''}`, {
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export async function fetchPost(postId) {
  let res = await fetch(`${API_BASE}/posts/${postId}`, {
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to fetch post');
  return res.json();
}

export async function voteOnPost(postId, voteType) {
  let res = await fetch(`${API_BASE}/posts/${postId}/vote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ voteType }),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to vote');
  return res.json(); // { upvotes, downvotes, userVote }
}

export async function createPost(title, content, subreddit, image, poll) {
  let res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, content, subreddit, image, poll }),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to create post');
  return res.json();
}

// ── Comments ──

export async function fetchComments(postId) {
  let res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to fetch comments');
  return res.json();
}

export async function addCommentApi(postId, text, parentCommentId) {
  let res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, parentCommentId: parentCommentId || null }),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to add comment');
  return res.json();
}

export async function voteOnComment(commentId, voteType) {
  const res = await fetch(`${API_BASE}/comments/${commentId}/vote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ voteType }),
  });
  if (!res.ok) throw new Error('Failed to vote on comment');
  return res.json(); // { upvotes, downvotes, userVote }
}

export async function reportComment(commentId, reason) {
  const res = await fetch(`${API_BASE}/comments/${commentId}/report`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to report comment');
  return res.json();
}

// ── Emoji Reactions ──
export async function addEmojiReaction(targetType, targetId, emoji) {
  const res = await fetch(`${API_BASE}/${targetType === 'post' ? 'posts' : 'comments'}/${targetId}/emoji-reaction`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error('Failed to add emoji reaction');
  return res.json();
}

export async function removeEmojiReaction(targetType, targetId, emoji) {
  const res = await fetch(`${API_BASE}/${targetType === 'post' ? 'posts' : 'comments'}/${targetId}/emoji-reaction/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove emoji reaction');
  return res.json();
}

export async function fetchEmojiReactions(targetType, targetId) {
  const res = await fetch(`${API_BASE}/${targetType === 'post' ? 'posts' : 'comments'}/${targetId}/emoji-reactions`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch emoji reactions');
  return res.json();
}

// ── Debate Sides ──
export async function setDebateSide(postId, side) {
  const res = await fetch(`${API_BASE}/posts/${postId}/debate-side`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ side }),
  });
  if (!res.ok) throw new Error('Failed to set debate side');
  return res.json();
}

export async function removeDebateSide(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/debate-side`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove debate side');
  return res.json();
}

export async function getDebateSide(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/debate-side`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch debate side');
  return res.json();
}

export async function getDebateSideCounts(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/debate-sides`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch debate side counts');
  return res.json();
}

// ── Polls ──
export async function fetchPoll(postId) {
  const res = await fetch(`${API_BASE}/polls/${postId}/poll`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch poll');
  return res.json();
}

export async function votePoll(optionId) {
  const res = await fetch(`${API_BASE}/polls/${optionId}/vote`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to vote on poll');
  return res.json();
}

// ── Subreddits ──

export async function fetchSubreddits() {
  const res = await fetch(`${API_BASE}/subreddits`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch subreddits');
  return res.json();
}

export async function joinSubredditApi(subredditId) {
  const res = await fetch(`${API_BASE}/subreddits/${subredditId}/join`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to join/leave subreddit');
  return res.json(); // { joined: boolean }
}

// ── US1: Reasoning Summary ──

export async function fetchNotifications() {
  let res = await fetch(`${API_BASE}/notifications`, {
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function fetchUnreadCount() {
  let res = await fetch(`${API_BASE}/notifications/unread-count`, {
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to fetch unread count');
  return res.json();
}

export async function markNotificationRead(notifId) {
  let res = await fetch(`${API_BASE}/notifications/${notifId}/read`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to mark notification read');
  return res.json();
}

export async function markAllNotificationsRead() {
  let res = await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'POST',
    headers: authHeaders(),
  });
  res = await handleResponse(res);
  if (!res.ok) throw new Error('Failed to mark all notifications read');
  return res.json();
}

export async function fetchReasoningSummary(commentId) {
  const res = await fetch(`${API_BASE}/comments/${commentId}/reasoning-summary`, {
    headers: authHeaders(),
  });
  if (res.status === 202) return { status: 'pending' };
  if (!res.ok) throw new Error('Failed to fetch reasoning summary');
  const data = await res.json();
  return { status: 'done', ...data };
}

// ── US3: Writing Feedback (REST fallback) ──

export async function analyzeDraftRest(draftText) {
  const res = await fetch(`${API_BASE}/composer/draft-feedback`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ draftText }),
  });
  if (!res.ok) throw new Error('Failed to analyze draft');
  return res.json();
}

// ── Socket.IO: Composer namespace ──

let composerSocket = null;

export function getComposerSocket() {
  if (composerSocket && composerSocket.connected) return composerSocket;

  composerSocket = io('/composer', {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
  });

  return composerSocket;
}

export function disconnectComposerSocket() {
  if (composerSocket) {
    composerSocket.disconnect();
    composerSocket = null;
  }
}
