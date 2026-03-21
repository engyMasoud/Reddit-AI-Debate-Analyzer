import { io } from 'socket.io-client';

const API_BASE = '/api/v1';

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

export async function createPost(title, content, subreddit, image) {
  let res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, content, subreddit, image }),
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
  if (!res.ok) throw new Error('Failed to fetch reasoning summary');
  return res.json();
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
