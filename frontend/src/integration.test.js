// integration.test.js
// Integration tests for Reddit-AI-Debate-Analyzer (frontend-to-backend via AWS API Gateway)
// Run with: VITE_API_URL=http://localhost:4000/api/v1 npm test -- src/integration.test.js

const fetch = require('node-fetch');

const API_BASE = process.env.VITE_API_URL || 'http://localhost:4000/api/v1';

// Utility to generate random user data for isolation
function randomUser() {
  const rand = Math.random().toString(36).substring(2, 10);
  return {
    username: `testuser_${rand}`,
    email: `test_${rand}@example.com`,
    password: `TestPass!${rand}`
  };
}


describe('Integration: Reddit-AI-Debate-Analyzer', () => {
  let user, token, postId, commentId, notificationId;
  const testSubreddit = {
    name: 'test',
    icon: '🧪',
    color: 'bg-blue-500'
  };

  beforeAll(async () => {
    user = randomUser();
    // Ensure the test subreddit exists
    const res = await fetch(`${API_BASE}/subreddits`);
    const subs = await res.json();
    if (!subs.find((s) => s.name === testSubreddit.name)) {
      // Create subreddit (direct DB insert or admin endpoint needed)
      // If no public endpoint, skip and instruct user to create manually
      console.warn('Test subreddit does not exist. Please create a subreddit named "test" in your database.');
    }
  });

  test('1. User registration', async () => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('token');
    token = data.token;
  });

  test('2. User login', async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, password: user.password })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('token');
    token = data.token;
  });

  test('3. Fetch user profile (authenticated)', async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toHaveProperty('username', user.username);
  });

  test('4. Create a post', async () => {
    const res = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Integration Test Post', content: 'Test content', subreddit: 'test' })
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    postId = data.id;
  });

  test('5. Fetch posts (public)', async () => {
    const res = await fetch(`${API_BASE}/posts?subreddit=test`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('6. Add a comment to a post', async () => {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: 'Integration test comment' })
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    commentId = data.id;
  });

  test('7. Fetch comments for a post', async () => {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('8. Upvote a post', async () => {
    const res = await fetch(`${API_BASE}/posts/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ voteType: 'up' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('upvotes');
  });

  test('9. Upvote a comment', async () => {
    const res = await fetch(`${API_BASE}/comments/${commentId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ voteType: 'up' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('upvotes');
  });

  test('10. Fetch notifications (authenticated)', async () => {
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) notificationId = data[0].id;
  });

  test('11. Mark notification as read', async () => {
    if (!notificationId) {
      console.log('No notifications to mark as read — skipping assertion.');
      return;
    }
    const res = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
  });

  // 12. Google OAuth login: Skipped (requires real Google credential)

  const isCloud = API_BASE.includes('amazonaws.com');

  // In-memory rate limiter doesn't work on Lambda (each invocation may hit a
  // different container), so this test only runs against a single local server.
  (isCloud ? test.skip : test)('13. Rate limiting (abuse prevention)', async () => {
    // The rate limiter allows 100 requests per window on authenticated POST endpoints.
    // Send 105 parallel POST requests to a rate-limited endpoint to trigger 429.
    const requests = [];
    for (let i = 0; i < 105; i++) {
      requests.push(
        fetch(`${API_BASE}/posts/${postId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ voteType: 'up' })
        })
      );
    }
    const responses = await Promise.all(requests);
    const statuses = responses.map(r => r.status);
    expect(statuses).toContain(429);
  }, 30000);

  test('14. Invalid token access', async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: 'Bearer invalidtoken' }
    });
    expect(res.status).toBe(401);
  });

  test('15. Access protected route without token', async () => {
    const res = await fetch(`${API_BASE}/auth/me`);
    expect(res.status).toBe(401);
  });
});
