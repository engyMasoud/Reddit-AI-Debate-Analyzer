import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

export function authRoutes(pool: Pool): Router {
  const router = Router();
  const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

  // GET /api/v1/auth/me — validate token & return current user
  router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, username, email, avatar, karma, joined_date FROM users WHERE id = $1',
        [req.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
        return;
      }
      const user = rows[0];
      const memberships = await pool.query(
        'SELECT subreddit_id FROM user_subreddit_memberships WHERE user_id = $1',
        [user.id]
      );
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          karma: user.karma,
          joinedDate: user.joined_date,
          joinedSubreddits: memberships.rows.map((r: any) => r.subreddit_id),
        },
      });
    } catch (err) {
      console.error('Auth/me error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch user' });
    }
  });

  // POST /api/v1/auth/register
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'username, email, and password are required' });
        return;
      }

      // Check existing user
      const existing = await pool.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'USER_EXISTS', message: 'Username or email already taken' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, avatar, karma, joined_date, created_at`,
        [username, email, passwordHash]
      );

      const user = rows[0];
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
      );

      res.status(201).json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          karma: user.karma,
          joinedDate: user.joined_date,
        },
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Registration failed' });
    }
  });

  // POST /api/v1/auth/login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'username and password are required' });
        return;
      }

      const { rows } = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      if (rows.length === 0) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        return;
      }

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        return;
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
      );

      // Fetch joined subreddits
      const memberships = await pool.query(
        'SELECT subreddit_id FROM user_subreddit_memberships WHERE user_id = $1',
        [user.id]
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          karma: user.karma,
          joinedDate: user.joined_date,
          joinedSubreddits: memberships.rows.map((r: any) => r.subreddit_id),
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
    }
  });

  // POST /api/v1/auth/google
  router.post('/google', async (req: Request, res: Response) => {
    try {
      if (!googleClient || !env.GOOGLE_CLIENT_ID) {
        res.status(501).json({ error: 'NOT_CONFIGURED', message: 'Google Sign-In is not configured' });
        return;
      }

      const { credential } = req.body;
      if (!credential) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'credential is required' });
        return;
      }

      // Verify Google ID token
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid Google token' });
        return;
      }

      const googleId = payload.sub;
      const email = payload.email || `${googleId}@google.user`;
      const name = payload.name || email.split('@')[0];
      const picture = payload.picture || '👤';

      // Look up by google_id first
      let userResult = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      let user = userResult.rows[0];

      if (!user) {
        // Check by email
        userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        user = userResult.rows[0];

        if (user) {
          // Link existing account
          await pool.query('UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2', [googleId, user.id]);
        } else {
          // Create new user — generate unique username
          let username = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
          const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
          if (existing.rows.length > 0) {
            username = `${username}_${Math.floor(Math.random() * 10000)}`;
          }

          const insertResult = await pool.query(
            `INSERT INTO users (username, email, google_id, auth_provider, avatar)
             VALUES ($1, $2, $3, 'google', $4)
             RETURNING *`,
            [username, email, googleId, picture]
          );
          user = insertResult.rows[0];
        }
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
      );

      const memberships = await pool.query(
        'SELECT subreddit_id FROM user_subreddit_memberships WHERE user_id = $1',
        [user.id]
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          karma: user.karma,
          joinedDate: user.joined_date,
          joinedSubreddits: memberships.rows.map((r: any) => r.subreddit_id),
        },
      });
    } catch (err: any) {
      console.error('Google auth error:', err);
      if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired Google token' });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Google authentication failed' });
    }
  });

  return router;
}
