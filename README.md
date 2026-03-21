# Backend — Reddit AI Debate Analyzer

Node.js / Express / TypeScript API server with PostgreSQL persistence and Socket.IO real-time messaging.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Dependencies](#dependencies)
3. [External Services](#external-services)
4. [Database](#database)
5. [Environment Variables](#environment-variables)
6. [Install](#install)
7. [Startup](#startup)
8. [Stop](#stop)
9. [Reset](#reset)
10. [API Surface](#api-surface)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌──────────────┐  HTTP/REST   ┌────────────────────────┐
│   Frontend   │─────────────▶│  Express (port 4000)   │
│  (Vite/React)│◀─────────────│                        │
│              │  WebSocket   │  Socket.IO /composer    │
└──────────────┘              └────────┬───────────────┘
                                       │
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                  ┌──────────┐  ┌───────────┐  ┌───────────────┐
                  │PostgreSQL│  │In-Memory  │  │Google OAuth   │
                  │  (pg)    │  │Cache (Map)│  │(optional)     │
                  └──────────┘  └───────────┘  └───────────────┘
```

The server is a single Node.js process running Express for REST endpoints and Socket.IO for real-time composer feedback over WebSockets. Caching is handled in-process with a TTL-based `Map` (no Redis required). AI analysis is provided by a pluggable interface (`IAIAnalysisService`); the default build ships a **deterministic mock** implementation (`MockAIAnalysisService`) that requires zero network calls. A real OpenAI-backed implementation can be swapped in by binding the interface.

---

## Dependencies

### Runtime (`dependencies`)

| Package | Version | Purpose |
|---|---|---|
| **express** | ^4.18.2 | HTTP framework — routing, middleware, JSON body parsing. |
| **cors** | ^2.8.5 | Cross-Origin Resource Sharing middleware. Allows the Vite dev server (`:5173`) and other origins to call the API. |
| **pg** | ^8.12.0 | PostgreSQL client. Uses a connection `Pool` (max 20 connections, 2 s connect timeout, 30 s idle timeout). |
| **dotenv** | ^16.4.5 | Loads `.env` file into `process.env` at startup. |
| **jsonwebtoken** | ^9.0.2 | Signs and verifies JWT tokens (HS256) for session authentication. Tokens contain `{ userId, username }`. |
| **bcrypt** | ^5.1.1 | Hashes and compares passwords (cost factor 10) for local auth registration/login. |
| **google-auth-library** | ^10.6.2 | Verifies Google ID tokens for OAuth sign-in. Only active when `GOOGLE_CLIENT_ID` is set. |
| **socket.io** | ^4.7.5 | WebSocket server. Hosts the `/composer` namespace for real-time writing-feedback sessions. |
| **zod** | ^3.23.8 | Schema validation for request bodies/params/query via the `validate` middleware. |

### Dev-Only (`devDependencies`)

| Package | Version | Purpose |
|---|---|---|
| **typescript** | ^5.4.5 | TypeScript compiler. Target: ES2022, module: CommonJS. |
| **ts-node-dev** | ^2.0.0 | Dev server with file-watching and transpile-only mode for fast restarts. |
| **@types/express** | ^4.17.21 | Type definitions for Express. |
| **@types/pg** | ^8.11.6 | Type definitions for the `pg` client. |
| **@types/jsonwebtoken** | ^9.0.6 | Type definitions for jsonwebtoken. |
| **@types/bcrypt** | ^5.0.2 | Type definitions for bcrypt. |
| **@types/cors** | ^2.8.17 | Type definitions for cors. |
| **@types/node** | ^20.14.0 | Type definitions for Node.js built-ins. |

### Node.js Built-in Modules Used

| Module | Where | Purpose |
|---|---|---|
| `http` | `src/index.ts` | Creates the HTTP server instance shared by Express and Socket.IO. |
| `crypto` | `WritingFeedbackService` | SHA-256 hashing of draft text for cache keys. |

---

## External Services

### PostgreSQL (required)

- **Version:** 14 or higher.
- **Connection:** TCP, default port `5432` (configurable via `DB_PORT`).
- **Driver:** `pg` (libpq protocol, no ORM).
- Must be running and reachable before the server starts; the pool will begin attempting connections immediately on import.

### Google OAuth (optional)

- **Library:** `google-auth-library` (`OAuth2Client`).
- Used to verify Google ID tokens sent by the frontend during social login.
- **Activation:** Only active when the `GOOGLE_CLIENT_ID` env var is set to a valid Google Cloud client ID. When unset, the Google login route is a no-op.
- **Network:** Makes an outbound HTTPS call to Google's token-info endpoint on each Google login request.

### OpenAI API (optional — not wired by default)

- The `env.ts` config exposes `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4`).
- The codebase ships with `MockAIAnalysisService`, a deterministic mock that requires **no network calls** and is used in dev/test.
- To enable real AI analysis, implement `IAIAnalysisService` with an OpenAI-backed class and swap it in at the wiring point in `src/index.ts`.

---

## Database

### Database Name

| Env Var | Default |
|---|---|
| `DB_NAME` | `reddit_ai_debate` |

The backend reads from and writes to a **single PostgreSQL database**. It does not create the database itself — you must create it manually before running the schema.

### Tables

Created by `schema.sql`:

| # | Table | Purpose | Key Relationships |
|---|---|---|---|
| 1 | `users` | User accounts (local + Google OAuth). | — |
| 2 | `subreddits` | Forum categories. | — |
| 3 | `user_subreddit_memberships` | Join table — users ↔ subreddits. | FK → `users`, `subreddits` |
| 4 | `posts` | User-submitted posts. | FK → `users`, `subreddits` |
| 5 | `comments` | Threaded comments on posts. Self-referencing `parent_comment_id`. | FK → `posts`, `users`, `comments` |
| 6 | `votes` | Up/down votes on posts or comments. Unique per (user, target_type, target_id). | FK → `users` |
| 7 | `reports` | Flagged comments with moderation workflow. | FK → `users`, `comments` |
| 8 | `reasoning_summaries` | AI-generated argument analysis of a comment (claims, evidence, coherence score). One per comment. JSONB `evidence_blocks`. | FK → `comments` |
| 9 | `drafts` | Saved in-progress reply drafts with optional last-feedback snapshot. JSONB `last_feedback`. | FK → `users`, `posts` |
| 10 | `feedback_logs` | Append-only log of every writing-feedback analysis run. JSONB `issues`, `suggestions`. | FK → `users`, `drafts` |

Created by migration `002_add_notifications.sql`:

| # | Table | Purpose |
|---|---|---|
| 11 | `notifications` | In-app notifications (vote, comment) per user. |

### Schema Seed Data

`schema.sql` includes `INSERT` statements that populate:
- 15 seed users (password: `password123`, bcrypt hash).
- 8 subreddits (Home, Popular, Tech, Health & Fitness, Games, Food, Music, Travel).
- Subreddit memberships for the first user.
- Sample posts and comments for development.

### Data Flow Summary

| Operation | Tables Read | Tables Written |
|---|---|---|
| Register / Login | `users` | `users` |
| Google OAuth | `users` | `users` |
| List / View posts | `posts`, `users`, `subreddits`, `votes` | — |
| Create post | — | `posts` |
| Vote | `votes`, `posts` or `comments` | `votes`, `posts` or `comments`, `notifications` |
| List / Create comments | `comments`, `users` | `comments`, `posts` (comment_count) |
| Reasoning summary | `comments`, `reasoning_summaries` | `reasoning_summaries` |
| Draft save/load | `drafts` | `drafts` |
| Analyze draft (feedback) | `feedback_logs` | `feedback_logs` |
| Notifications | `notifications`, `users` | `notifications` |

---

## Environment Variables

Create a `.env` file in `backend/` (never commit this file). All variables have defaults suitable for local development.

```dotenv
# ── Server ──
PORT=4000
NODE_ENV=development

# ── PostgreSQL ──
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reddit_ai_debate
DB_USER=postgres
DB_PASSWORD=postgres

# ── Auth ──
JWT_SECRET=dev-secret-change-in-production   # CHANGE IN PRODUCTION
JWT_EXPIRES_IN=7d

# ── Google OAuth (optional) ──
GOOGLE_CLIENT_ID=

# ── OpenAI (optional — unused with MockAIAnalysisService) ──
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4

# ── Cache TTLs (seconds) ──
CACHE_REASONING_TTL=86400    # 24 h — reasoning summary cache
CACHE_FEEDBACK_TTL=3600      # 1 h  — writing feedback cache

# ── Rate Limiting ──
RATE_LIMIT_WINDOW_MS=60000   # 1-minute window
RATE_LIMIT_MAX_REQUESTS=100  # max requests per window per user
```

---

## Install

### Prerequisites

| Requirement | Minimum Version | Check |
|---|---|---|
| Node.js | 18 LTS | `node -v` |
| npm | 9+ | `npm -v` |
| PostgreSQL | 14 | `psql --version` |

### Steps

```powershell
# 1. Clone the repo and enter the backend directory
cd backend

# 2. Install Node dependencies
npm install

# 3. Create the PostgreSQL database (run once)
#    Adjust -U and password to match your local setup.
psql -U postgres -c "CREATE DATABASE reddit_ai_debate;"

# 4. Apply the schema and seed data
psql -U postgres -d reddit_ai_debate -f schema.sql

# 5. Apply migrations in order
psql -U postgres -d reddit_ai_debate -f migrations/001_add_google_oauth.sql
psql -U postgres -d reddit_ai_debate -f migrations/002_add_notifications.sql

# 6. Copy and edit environment variables
cp .env.example .env   # or create .env manually — see section above
```

> **Note:** On Windows you may need to add the PostgreSQL `bin` directory to your `PATH` or invoke `psql` with its full path (e.g., `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`).

---

## Startup

### Development (hot-reload)

```powershell
cd backend
npm run dev
```

Runs `ts-node-dev --respawn --transpile-only src/index.ts`.  
The server starts on **http://localhost:4000** (or the port in your `.env`). File changes trigger an automatic restart.

### Production

```powershell
cd backend

# Compile TypeScript to JavaScript
npm run build        # outputs to dist/

# Start the compiled server
npm start            # runs node dist/index.js
```

Set `NODE_ENV=production` and a strong `JWT_SECRET` in the environment before starting a production build.

### Verify the Server Is Running

```powershell
curl http://localhost:4000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

On Windows PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:4000/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## Stop

### Graceful Shutdown

Send `SIGTERM` to the Node.js process. The server will:

1. Destroy the in-memory cache (clear sweep interval).
2. Close the HTTP/WebSocket server (stop accepting new connections).
3. Close the PostgreSQL connection pool.
4. Exit with code 0.

```powershell
# Linux / macOS
kill -SIGTERM <pid>

# Windows PowerShell — find and stop the process on port 4000
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

If running via `npm run dev` (`ts-node-dev`), pressing **Ctrl+C** in the terminal will stop the process.

---

## Reset

### Reset the Database (full wipe + re-seed)

This drops all tables, recreates them, and reloads seed data:

```powershell
# Drop and recreate the database
psql -U postgres -c "DROP DATABASE IF EXISTS reddit_ai_debate;"
psql -U postgres -c "CREATE DATABASE reddit_ai_debate;"

# Re-apply schema + seed data
psql -U postgres -d reddit_ai_debate -f schema.sql

# Re-apply migrations
psql -U postgres -d reddit_ai_debate -f migrations/001_add_google_oauth.sql
psql -U postgres -d reddit_ai_debate -f migrations/002_add_notifications.sql
```

### Reset Only In-Memory State

Restart the server. The in-memory cache (`InMemoryCacheService`) and all active WebSocket sessions (`WritingFeedbackSessionManager`) are cleared on exit.

### Reset Node Dependencies

```powershell
cd backend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

---

## API Surface

All REST routes are prefixed with `/api/v1/`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check. Returns `{ status, timestamp }`. |
| `POST` | `/api/v1/auth/register` | No | Register a new local user. |
| `POST` | `/api/v1/auth/login` | No | Login with username/email + password. |
| `POST` | `/api/v1/auth/google` | No | Login/register via Google ID token. |
| `GET` | `/api/v1/auth/me` | JWT | Get current authenticated user. |
| `GET` | `/api/v1/posts` | Optional | List posts (with filters). |
| `POST` | `/api/v1/posts` | JWT | Create a post. |
| `GET` | `/api/v1/posts/:id` | Optional | Get a single post. |
| `GET` | `/api/v1/comments` | Optional | List comments for a post. |
| `POST` | `/api/v1/comments` | JWT | Create a comment. |
| `GET` | `/api/v1/comments/:id/reasoning-summary` | Optional | Get AI reasoning summary for a comment. |
| `GET` | `/api/v1/subreddits` | No | List all subreddits. |
| `GET` | `/api/v1/users/:id` | Optional | Get user profile. |
| `GET` | `/api/v1/notifications` | JWT | Get notifications for current user. |
| `GET` | `/api/v1/notifications/unread-count` | JWT | Get unread notification count. |
| `PATCH` | `/api/v1/notifications/:id/read` | JWT | Mark a notification as read. |
| `POST` | `/api/v1/notifications/read-all` | JWT | Mark all notifications as read. |
| `POST` | `/api/v1/composer/analyze` | JWT | Analyze draft text (REST fallback). |
| `GET` | `/api/v1/composer/history` | JWT | Get feedback history for current user. |

### WebSocket Namespace

| Namespace | Auth | Events |
|---|---|---|
| `/composer` | JWT (handshake `auth.token`) | **Client → Server:** `draft:analyze { draftText, contextId? }` · **Server → Client:** `feedback:result { feedbackId, issues, score, suggestions, goodPoints, confidence }`, `feedback:error { message, code }` |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running. | Start the PostgreSQL service: `net start postgresql-x64-18` (Windows) or `sudo systemctl start postgresql` (Linux). |
| `database "reddit_ai_debate" does not exist` | Database not created. | Run `psql -U postgres -c "CREATE DATABASE reddit_ai_debate;"` then apply `schema.sql`. |
| `relation "users" does not exist` | Schema not applied. | Run `psql -U postgres -d reddit_ai_debate -f schema.sql`. |
| `EADDRINUSE :::4000` | Port 4000 is already in use. | Stop the other process or set a different `PORT` in `.env`. |
| `bcrypt` install fails | Missing native build tools. | Install `node-gyp` prerequisites: Python 3 and a C++ compiler (Visual Studio Build Tools on Windows). |
| Google login does nothing | `GOOGLE_CLIENT_ID` is empty or wrong. | Set a valid Google Cloud OAuth Client ID in `.env`. |
| JWT `invalid signature` | `JWT_SECRET` mismatch between restarts. | Ensure the same `JWT_SECRET` is set across all instances. Existing tokens are invalid if the secret changes. |
