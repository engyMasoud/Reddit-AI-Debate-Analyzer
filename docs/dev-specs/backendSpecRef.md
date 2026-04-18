# Backend Dev Spec Reference — Alignment Guide

This document captures all details from the existing frontend codebase and dev specs (DS1–DS3) that must be kept consistent when creating the backend development specification.

---

## 1. Frontend Data Models (from `frontend/src/mockData.js`)

The frontend already consumes these **exact shapes** — the backend must serve them as-is.

### Post Object

```js
{
  id: number,
  title: string,
  content: string,
  author: string,
  subreddit: string,
  upvotes: number,
  downvotes: number,
  commentCount: number,
  timestamp: Date,
  image: string | null
}
```

### Comment Object (with inline AI summary)

```js
{
  id: number,
  postId: number,
  author: string,
  text: string,
  upvotes: number,
  downvotes: number,
  timestamp: Date,
  userVote: null | 'up' | 'down',
  aiSummary: null | {
    summary: string,
    primaryClaim: string,
    evidenceBlocks: [
      { type: string, content: string, strength: string }
    ],
    coherenceScore: number,   // 0–1
    generatedAt: Date
  }
}
```

### Subreddit Object

```js
{ id: number, name: string, icon: string, memberCount: number, color: string }
```

### User Object

```js
{ id: number, username: string, avatar: string, karma: number, joinedDate: Date, joinedSubreddits: number[] }
```

### Writing Feedback Result (DS3)

```js
{
  issues: [
    {
      id: number,
      type: 'weak_evidence' | 'circular_logic' | 'unsupported_claim' | 'logical_fallacy',
      position: { start: number, end: number },
      lineNumber: number,
      flaggedText: string,
      explanation: string,
      severity: 'low' | 'medium' | 'high',
      confidence: number
    }
  ],
  score: number,            // 0–1
  suggestions: [
    { id: number, text: string, type: string, priority: string, exampleFix: string }
  ],
  goodPoints: string[],
  confidence: number,       // 0–1
  generatedAt: Date
}
```

---

## 2. API Endpoints Already Defined in Dev Specs

| Dev Spec | Endpoint                                               | Method | Purpose                                |
| -------- | ------------------------------------------------------ | ------ | -------------------------------------- |
| DS1      | `/api/v1/comments/{commentId}/reasoning-summary`       | GET    | Get AI reasoning summary for a comment |
| DS2      | `/api/v1/threads/{threadId}/debate-summary`            | GET    | Get thread-level debate summary        |
| DS2      | `/api/v1/threads/{threadId}/debate-summary/regenerate` | POST   | Regenerate thread summary              |
| DS2      | `/api/v1/threads/{threadId}/debate-summary`            | DELETE | Delete cached thread summary           |
| DS3      | `/api/v1/composer/draft-feedback`                      | POST   | Analyze draft text for feedback        |
| DS3      | `/api/v1/composer/draft-feedback/history`              | GET    | Get user's feedback history            |
| DS3      | `/api/v1/composer/drafts`                              | POST   | Save a draft                           |
| DS3      | WebSocket: `/socket.io/` namespace `/composer`         | WS     | Real-time draft feedback               |

### Missing Endpoints — Must Be Defined in Backend Spec

The frontend currently uses mock data directly for basic CRUD. The backend spec must also define REST endpoints for:

| Endpoint                            | Method | Purpose                                     |
| ----------------------------------- | ------ | ------------------------------------------- |
| `/api/v1/posts`                     | GET    | Feed (with subreddit filter + search query) |
| `/api/v1/posts/{postId}`            | GET    | Post detail                                 |
| `/api/v1/posts/{postId}/vote`       | POST   | Upvote / downvote / remove vote             |
| `/api/v1/posts/{postId}/comments`   | GET    | List comments for a post                    |
| `/api/v1/posts/{postId}/comments`   | POST   | Add a comment                               |
| `/api/v1/comments/{commentId}/vote` | POST   | Vote on a comment                           |
| `/api/v1/subreddits`                | GET    | List all subreddits                         |
| `/api/v1/subreddits/{id}/join`      | POST   | Join / leave a subreddit                    |
| `/api/v1/users/me`                  | GET    | Current authenticated user                  |
| `/api/v1/auth/login`                | POST   | Login (returns JWT)                         |
| `/api/v1/auth/register`             | POST   | Register new user                           |

---

## 3. Tech Stack Commitments (from DS1, DS2, DS3)

| Aspect       | Committed Technology |
| ------------ | -------------------- |
| Runtime      | Node.js 18.x LTS     |
| Framework    | Express.js 4.x       |
| Language     | TypeScript 5.x       |
| Database     | PostgreSQL 14+       |
| Cache        | Redis 7.x            |
| AI           | OpenAI API (GPT-4)   |
| WebSocket    | Socket.IO 4.x        |
| Job Queue    | Bull 4.x             |
| NLP Fallback | natural / compromise |
| Testing      | Jest 29.x            |
| Auth         | JWT                  |

> **Note:** The frontend is plain JavaScript (React 18 + Vite + Tailwind CSS), NOT TypeScript. The backend is specified as TypeScript. This asymmetry is intentional.

---

## 4. Database Tables Already Specified

Across DS1 / DS2 / DS3, these tables are referenced or fully defined:

| Table                        | Defined In                    | FK Dependencies                | Notes                                           |
| ---------------------------- | ----------------------------- | ------------------------------ | ----------------------------------------------- |
| `users`                      | DS3 (referenced only)         | —                              | **Needs full CREATE TABLE in backend spec**     |
| `comments`                   | DS1 (referenced only)         | `users`, `posts`               | **Needs full CREATE TABLE in backend spec**     |
| `posts` / `threads`          | DS2 (referenced as `threads`) | `users`, `subreddits`          | **Needs full CREATE TABLE in backend spec**     |
| `subreddits`                 | Not specified                 | —                              | **Needs full CREATE TABLE in backend spec**     |
| `user_subreddit_memberships` | Not specified                 | `users`, `subreddits`          | **Needs full CREATE TABLE in backend spec**     |
| `votes`                      | Not specified                 | `users`, `posts`, `comments`   | **Needs full CREATE TABLE in backend spec**     |
| `reasoning_summaries`        | DS1 (fully defined)           | FK → `comments(id)`            | UUID PK, JSONB `evidence_blocks`                |
| `evidence_blocks`            | DS1 (fully defined)           | FK → `reasoning_summaries(id)` | Optional normalized alt                         |
| `debate_summaries`           | DS2 (fully defined)           | FK → `threads(id)`             | UUID PK, JSONB positions/evidence/disagreements |
| `positions`                  | DS2 (fully defined)           | FK → `debate_summaries(id)`    | Normalized alternative                          |
| `position_opponents`         | DS2 (fully defined)           | FK → `positions(id)` × 2       | Many-to-many join table                         |
| `drafts`                     | DS3 (fully defined)           | FK → `users(id)`               | Auto-expires 30 days                            |
| `feedback_logs`              | DS3 (fully defined)           | FK → `users(id)`, `drafts(id)` | Audit trail                                     |

---

## 5. Shared Services Architecture

All three specs reference these **shared** backend services:

### AIAnalysisService (single OpenAI integration point)

```typescript
interface IAIAnalysisService {
  extractClaims(text: string): Promise<Claim[]>;
  extractEvidence(text: string): Promise<EvidenceBlock[]>;
  evaluateCoherence(
    claims: Claim[],
    evidence: EvidenceBlock[],
  ): Promise<number>;
  generateSummary(analysis: AnalysisResult): Promise<string>;
}
```

Used by: `ReasoningSummaryService` (DS1), `ThreadAnalysisService` (DS2), `WritingFeedbackService` (DS3)

### CacheService (Redis wrapper)

```typescript
interface ICacheService {
  get(key: string): Promise<object | null>;
  set(key: string, value: object, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

### Redis Key Patterns

| Pattern                         | TTL                | Used By |
| ------------------------------- | ------------------ | ------- |
| `reasoning_summary:{commentId}` | 86400s (24 hours)  | DS1     |
| `debate_summary:{threadId}`     | 172800s (48 hours) | DS2     |
| `draft_feedback:{draftHash}`    | 3600s (1 hour)     | DS3     |

### CommentRepository (shared across DS1 and DS2)

```typescript
interface ICommentRepository {
  getById(id: string): Promise<Comment>;
  getByThreadId(threadId: string): Promise<Comment[]>;
  save(comment: Comment): Promise<void>;
}
```

---

## 6. Frontend Component → Backend Route Mapping

| Component                   | Current Data Source               | Required Backend Route                       |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `MainFeed.jsx`              | `mockPosts` via Context           | `GET /api/v1/posts`                          |
| `PostCard.jsx`              | Context `handleVote`              | `POST /api/v1/posts/:id/vote`                |
| `PostDetail.jsx`            | `mockComments` via Context        | `GET /api/v1/posts/:id/comments`             |
| `ReasoningSummaryPanel.jsx` | `comment.aiSummary` (inline mock) | `GET /api/v1/comments/:id/reasoning-summary` |
| `ComposerWithFeedback.jsx`  | `analyzeDraft()` (local regex)    | `POST /api/v1/composer/draft-feedback` + WS  |
| `Sidebar.jsx`               | `mockSubreddits`                  | `GET /api/v1/subreddits`                     |
| `Navbar.jsx`                | `currentUser`                     | `GET /api/v1/users/me`                       |
| `RightSidebar.jsx`          | `mockPosts` (trending)            | `GET /api/v1/posts?sort=trending`            |
| `MobileDrawer.jsx`          | `mockSubreddits` + nav            | `GET /api/v1/subreddits` (same)              |

---

## 7. Context API Functions → Backend Endpoint Mapping

From `frontend/src/context/RedditContext.jsx`, these mock functions must map to backend endpoints:

| Context Function                         | Current Behavior                            | Backend Equivalent                                                                      |
| ---------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `handleVote(postId, voteType)`           | Local state toggle                          | `POST /api/v1/posts/:id/vote`                                                           |
| `handleCommentVote(commentId, voteType)` | Local state toggle                          | `POST /api/v1/comments/:id/vote`                                                        |
| `addComment(postId, text)`               | Prepends to local array                     | `POST /api/v1/posts/:id/comments`                                                       |
| `joinSubreddit(subredditId)`             | Toggle in local array                       | `POST /api/v1/subreddits/:id/join`                                                      |
| `getFeedPosts()`                         | Filters by subreddit + search locally       | `GET /api/v1/posts?subreddit=X&q=Y`                                                     |
| `getPostComments(postId)`                | `comments.filter(c => c.postId === postId)` | `GET /api/v1/posts/:id/comments`                                                        |
| `toggleSummary(commentId)`               | UI-only expand toggle                       | UI-only (keep client-side), lazy-loads via `GET /api/v1/comments/:id/reasoning-summary` |
| `analyzeDraft(draftText)`                | Local regex-based analysis (600ms delay)    | `POST /api/v1/composer/draft-feedback`                                                  |

---

## 8. Auth & Security Requirements (from dev specs)

- **Authentication**: JWT-based token required on all `/api/v1/` endpoints
- **Rate Limiting**:
  - 100 requests/min/user (DS1, DS3)
  - 20 regenerate requests/thread/hour (DS2)
- **Transport**: HTTPS / TLS 1.3 in transit
- **Infrastructure**: Redis in private VPC, no public access
- **Compliance**: GDPR / CCPA (right-to-deletion with cascade deletes)
- **Authorization**: Moderator role required for DS2 endpoints
- **WebSocket Security**: Verify JWT on Socket.IO upgrade handshake

---

## 9. Key Discrepancy Risks to Resolve

These are inconsistencies between the existing frontend and dev specs that **must** be resolved in the backend spec:

### 9.1 — "threads" vs "posts" naming

- The **frontend** uses `posts` (with `id`, `subreddit`), and comments reference `postId`.
- **DS2** references `threads` and `threadId` throughout.
- **Decision needed**: Use `posts` table in DB (matching the frontend) and alias `threadId` = `postId` in the DS2 API routes, OR rename frontend to use `threads`.

### 9.2 — Frontend is JS, backend is TS

- The frontend is plain JSX with no TypeScript (React 18 + Vite + Tailwind).
- All three dev specs commit to TypeScript 5.x for the backend.
- This asymmetry should be explicitly acknowledged.

### 9.3 — No Vite proxy configured

- `frontend/vite.config.js` has no `server.proxy` setting.
- The backend spec should define the expected backend port (e.g., `:4000`).
- The frontend will need a proxy entry added: `/api` → `http://localhost:4000`.

### 9.4 — Comment / Post ID format mismatch

- **Frontend** uses numeric auto-incrementing IDs (`id: 1, 2, 3…`).
- **Dev specs** mention `VARCHAR(255)` comment IDs like `"c12345"` and UUID primary keys in SQL tables.
- **Decision needed**: Standardize on one format. Recommend numeric IDs (matching existing frontend) or UUIDs (matching spec SQL). If UUIDs, the frontend mock data must be updated.

### 9.5 — Missing base table schemas

- DS1 references `comments(id)`, DS2 references `threads(id)`, DS3 references `users(id)` — but **none** of the specs include CREATE TABLE statements for these base entities.
- The backend spec **must** define: `users`, `posts`, `comments`, `subreddits`, `user_subreddit_memberships`, `votes`.

### 9.6 — `aiSummary` inline vs separate endpoint

- The frontend reads `comment.aiSummary` directly from the comment object.
- DS1 defines a **separate** endpoint: `GET /api/v1/comments/{commentId}/reasoning-summary`.
- **Decision needed**: Either (a) embed `aiSummary` in the comment response from `GET /api/v1/posts/:id/comments`, or (b) keep it separate and lazy-load it in `ReasoningSummaryPanel.jsx` when the user clicks "Show AI Summary". Option (b) matches the DS1 architecture.

### 9.7 — Material-UI in DS2 vs Tailwind in frontend

- DS2 lists Material-UI 5.x in its tech stack.
- The frontend uses Tailwind CSS only with `lucide-react` icons — no Material-UI installed.
- **Resolution**: Remove Material-UI from DS2 tech stack or add it as a dependency. Recommend keeping Tailwind + lucide-react for consistency.

### 9.8 — Package naming

- `frontend/package.json` is named `"reddit-clone"`.
- The backend package should use a distinct name, e.g., `"reddit-ai-debate-analyzer-api"`.

### 9.9 — Port allocation

- Vite dev server runs on `:3000`.
- Backend should use a different port (recommend `:4000`).

### 9.10 — Directory structure

- There is **no `backend/` directory yet** in the project.
- The backend spec should define the directory at `backend/` at the project root, parallel to `frontend/`.
- Suggested structure:

```
backend/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Express + Socket.IO entry point
│   ├── config/
│   │   ├── database.ts          # PostgreSQL connection
│   │   ├── redis.ts             # Redis connection
│   │   └── openai.ts            # OpenAI client config
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── posts.routes.ts
│   │   ├── comments.routes.ts
│   │   ├── subreddits.routes.ts
│   │   ├── reasoningSummary.routes.ts   # DS1
│   │   ├── debateSummary.routes.ts      # DS2
│   │   └── composer.routes.ts           # DS3
│   ├── controllers/
│   │   ├── AuthController.ts
│   │   ├── PostController.ts
│   │   ├── CommentController.ts
│   │   ├── SubredditController.ts
│   │   ├── ReasoningSummaryController.ts
│   │   ├── DebateSummaryController.ts
│   │   └── WritingFeedbackController.ts
│   ├── services/
│   │   ├── AIAnalysisService.ts         # Shared (DS1/DS2/DS3)
│   │   ├── CacheService.ts             # Shared (DS1/DS2/DS3)
│   │   ├── ReasoningSummaryService.ts   # DS1
│   │   ├── ThreadAnalysisService.ts     # DS2
│   │   ├── WritingFeedbackService.ts    # DS3
│   │   ├── PositionClusterer.ts         # DS2
│   │   ├── EvidenceExtractor.ts         # DS2
│   │   ├── DisagreementAnalyzer.ts      # DS2
│   │   ├── DebateQualityScorer.ts       # DS2
│   │   ├── PositionMapper.ts            # DS2
│   │   ├── CircularLogicDetector.ts     # DS3
│   │   ├── WeakEvidenceDetector.ts      # DS3
│   │   └── UnsupportedClaimsDetector.ts # DS3
│   ├── repositories/
│   │   ├── CommentRepository.ts
│   │   ├── PostRepository.ts
│   │   ├── ThreadRepository.ts
│   │   ├── SubredditRepository.ts
│   │   ├── UserRepository.ts
│   │   ├── ReasoningSummaryRepository.ts
│   │   ├── DebateSummaryRepository.ts
│   │   ├── DraftRepository.ts
│   │   └── FeedbackLogRepository.ts
│   ├── models/
│   │   ├── User.ts
│   │   ├── Post.ts
│   │   ├── Comment.ts
│   │   ├── Subreddit.ts
│   │   ├── Vote.ts
│   │   ├── ReasoningSummary.ts
│   │   ├── DebateSummary.ts
│   │   ├── Position.ts
│   │   ├── EvidenceBlock.ts
│   │   ├── FeedbackResult.ts
│   │   ├── Issue.ts
│   │   ├── Suggestion.ts
│   │   └── Draft.ts
│   ├── middleware/
│   │   ├── auth.ts              # JWT verification
│   │   ├── rateLimiter.ts       # Per-user rate limiting
│   │   ├── validate.ts          # Request validation
│   │   └── errorHandler.ts      # Global error handler
│   ├── utils/
│   │   ├── NLPProcessor.ts
│   │   ├── CommentValidator.ts
│   │   ├── CitationParser.ts
│   │   ├── SentenceGraphBuilder.ts
│   │   └── NgramAnalyzer.ts
│   └── websocket/
│       └── composerNamespace.ts  # Socket.IO /composer namespace
├── tests/
│   ├── unit/
│   └── integration/
├── migrations/                   # PostgreSQL migrations
└── seeds/                        # Seed data (matching frontend mockData.js)
```

---

## 10. Full UI Interactive Elements Inventory

**Every button, link, and interactive element on screen must have functional backend support.** The following is a complete audit of all 34 interactive elements in the frontend, their current state, and what the backend must provide.

### Navbar (`Navbar.jsx`)

| #    | Element                    | Current State                                    | Backend Requirement                                     |
| ---- | -------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| 1    | Search input               | Filters `mockPosts` locally via `setSearchQuery` | `GET /api/v1/posts?q=` — server-side search             |
| 2    | User avatar/profile button | **Stub — no handler**                            | `GET /api/v1/users/me` + profile/auth flow              |
| 3    | "New Thread" button        | **Stub — no handler**                            | `POST /api/v1/posts` — create new post                  |
| 4–10 | Topic filter pills (×7)    | Filters locally via `setSelectedSubreddit`       | `GET /api/v1/posts?subreddit=X` — server-side filtering |

### PostCard / PostRow (`PostCard.jsx`)

| #   | Element                       | Current State                              | Backend Requirement                                                                  |
| --- | ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| 11  | Click post row to open detail | Sets `selectedPost` from local state       | `GET /api/v1/posts/:id` — fetch full post                                            |
| 12  | Upvote button (post)          | Local state toggle via `handleVote`        | `POST /api/v1/posts/:id/vote` body: `{ voteType: 'up' }`                             |
| 13  | Downvote button (post)        | Local state toggle via `handleVote`        | `POST /api/v1/posts/:id/vote` body: `{ voteType: 'down' }`                           |
| 14  | "View Analysis" button        | Opens post detail (AI summaries from mock) | `GET /api/v1/posts/:id/comments` + lazy `GET /api/v1/comments/:id/reasoning-summary` |

### PostDetail (`PostDetail.jsx`)

| #   | Element                         | Current State             | Backend Requirement                                                                                |
| --- | ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| 15  | Backdrop overlay (close)        | `setSelectedPost(null)`   | None (UI-only)                                                                                     |
| 16  | Back arrow button               | `setSelectedPost(null)`   | None (UI-only)                                                                                     |
| 17  | Close (X) button                | `setSelectedPost(null)`   | None (UI-only)                                                                                     |
| 18  | Escape key handler              | `setSelectedPost(null)`   | None (UI-only)                                                                                     |
| 19  | Post upvote button              | Local `handleVote`        | `POST /api/v1/posts/:id/vote`                                                                      |
| 20  | Post downvote button            | Local `handleVote`        | `POST /api/v1/posts/:id/vote`                                                                      |
| 21  | **Share button (post)**         | **Stub — no handler**     | Needs implementation: copy permalink / `GET /api/v1/posts/:id/share-link` or client-side clipboard |
| 22  | Comment upvote button           | Local `handleCommentVote` | `POST /api/v1/comments/:id/vote` body: `{ voteType: 'up' }`                                        |
| 23  | Comment downvote button         | Local `handleCommentVote` | `POST /api/v1/comments/:id/vote` body: `{ voteType: 'down' }`                                      |
| 24  | **Reply button (per comment)**  | **Stub — no handler**     | Needs: nested comment UI + `POST /api/v1/posts/:postId/comments` with `parentCommentId`            |
| 25  | **Share button (per comment)**  | **Stub — no handler**     | Needs implementation: copy comment permalink or client-side clipboard                              |
| 26  | **Report button (per comment)** | **Stub — no handler**     | `POST /api/v1/comments/:id/report` body: `{ reason: string }`                                      |

### ComposerWithFeedback (`ComposerWithFeedback.jsx`)

| #   | Element                             | Current State                                      | Backend Requirement                                         |
| --- | ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| 27  | Textarea (draft input)              | Triggers `analyzeDraft()` — local regex heuristics | `POST /api/v1/composer/draft-feedback` + WS `draft:analyze` |
| 28  | Cancel button                       | Resets local state                                 | None (UI-only state reset)                                  |
| 29  | Submit button                       | Calls `addComment(post.id, text)` — local prepend  | `POST /api/v1/posts/:id/comments`                           |
| 30  | Retry Analysis button (error state) | Re-runs local `analyzeDraft`                       | `POST /api/v1/composer/draft-feedback`                      |

### ReasoningSummaryPanel (`ReasoningSummaryPanel.jsx`)

| #   | Element                             | Current State                                                                         | Backend Requirement                          |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| 31  | "Show/Hide AI Summary" toggle       | Reads `comment.aiSummary` from mock data; simulates loading with `setTimeout(1500ms)` | `GET /api/v1/comments/:id/reasoning-summary` |
| 32  | Retry Analysis button (error state) | Simulates retry with `setTimeout`                                                     | `GET /api/v1/comments/:id/reasoning-summary` |

### Accessibility

| #   | Element                          | Current State          | Backend Requirement           |
| --- | -------------------------------- | ---------------------- | ----------------------------- |
| 33  | Skip-to-content link (`App.jsx`) | `href="#main-content"` | None (accessibility, UI-only) |

### Summary by Status

| Status                                                 | Count  | Details                                                                                              |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| **Stub — no handler (needs implementation + backend)** | **6**  | User profile (#2), New Thread (#3), Share post (#21), Reply (#24), Share comment (#25), Report (#26) |
| **Mock/local (needs backend replacement)**             | **19** | Search, topic filters, voting, comment submission, AI analysis, AI summaries                         |
| **UI-only (no backend needed)**                        | **8**  | Close/back/escape, cancel, skip-link                                                                 |

### Critical: Stub Buttons Requiring New Endpoints

These buttons currently exist in the UI but do **nothing** when clicked. The backend spec **must** include endpoints for them:

1. **User Profile** — `GET /api/v1/users/me` (auth) + profile page routing
2. **New Thread / Create Post** — `POST /api/v1/posts` with body `{ title, content, subreddit }`
3. **Share (post)** — At minimum, generate a shareable permalink; can be client-side clipboard copy of `GET /api/v1/posts/:id`
4. **Reply to Comment** — `POST /api/v1/posts/:postId/comments` with `{ text, parentCommentId }` for nested replies
5. **Share (comment)** — Generate comment permalink; can be client-side clipboard copy
6. **Report Comment** — `POST /api/v1/comments/:id/report` with `{ reason }` + a `reports` table in the database

### Additional Endpoints Needed for Stub Buttons

| Endpoint                           | Method | Purpose                  | New DB Table Required?           |
| ---------------------------------- | ------ | ------------------------ | -------------------------------- |
| `POST /api/v1/posts`               | POST   | Create new post/thread   | No (uses `posts` table)          |
| `POST /api/v1/comments/:id/report` | POST   | Report a comment         | **Yes** — `reports` table needed |
| `GET /api/v1/users/me`             | GET    | Get current user profile | No (uses `users` table)          |

### New Database Table Required

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id VARCHAR(255) NOT NULL,
  comment_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',  -- pending, reviewed, dismissed, actioned
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_reports_comment_id ON reports(comment_id);
CREATE INDEX idx_reports_status ON reports(status);
```

---

## 11. Summary Checklist for Backend Spec Author

- [ ] Define all missing base table schemas (`users`, `posts`, `comments`, `subreddits`, `user_subreddit_memberships`, `votes`, `reports`)
- [ ] Define all CRUD REST endpoints for posts, comments, subreddits, users, auth
- [ ] **Ensure every UI button has a functional backend endpoint** (see Section 10 — 6 stub buttons currently do nothing)
- [ ] Add `POST /api/v1/posts` for the "New Thread" button
- [ ] Add `POST /api/v1/comments/:id/report` + `reports` table for the "Report" button
- [ ] Add nested reply support (`parentCommentId`) to `POST /api/v1/posts/:postId/comments` for the "Reply" button
- [ ] Define share/permalink strategy for "Share" buttons (post and comment level)
- [ ] Resolve "threads" vs "posts" naming (recommend `posts` in DB, alias in DS2 routes)
- [ ] Resolve ID format: numeric vs UUID vs string (recommend numeric to match current frontend)
- [ ] Decide `aiSummary` delivery: inline on comment response vs separate lazy-load endpoint
- [ ] Remove Material-UI from DS2 tech stack (use Tailwind + lucide-react)
- [ ] Define backend port (recommend `:4000`) and document Vite proxy config
- [ ] Define `backend/` directory structure at project root
- [ ] Reuse shared services: `AIAnalysisService`, `CacheService`, `CommentRepository`
- [ ] Document seed data strategy (mirror `frontend/src/mockData.js` for dev parity)
- [ ] Include WebSocket auth (JWT verification on Socket.IO handshake)
- [ ] Include all rate-limiting rules from DS1/DS2/DS3
- [ ] Define environment variables (DB connection, Redis URL, OpenAI API key, JWT secret, ports)
