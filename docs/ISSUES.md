# Project Issue Tracker — Codebase Audit

> **Audit Date:** 2026-03-25  
> **Auditor Role:** Senior Full-Stack Engineer & Security Auditor  
> **Scope:** Full-stack codebase (backend + frontend)

---

## Issue 1 — Hardcoded Default JWT Secret

**Severity:** Critical  
**Category:** Security  
**File(s) Involved:** `backend/src/config/env.ts` (Line 14)

**Description:**  
The JWT secret falls back to `'dev-secret-change-in-production'` when the `JWT_SECRET` environment variable is not set. If this default is used in production, all tokens can be trivially forged by anyone who reads the source code.

**Suggested Fix:**  
Fail fast if `JWT_SECRET` is not set in production:

```ts
JWT_SECRET: (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return secret || 'dev-secret-change-in-production';
})(),
```

---

## Issue 2 — Hardcoded Default Database Credentials

**Severity:** Critical  
**Category:** Security  
**File(s) Involved:** `backend/src/config/env.ts` (Lines 11–12)

**Description:**  
`DB_USER` defaults to `'postgres'` and `DB_PASSWORD` defaults to `'postgres'`. If these defaults leak into production, the database is exposed with superuser credentials.

**Suggested Fix:**  
Require explicit DB credentials in production, similar to Issue 1. Remove default passwords.

---

## Issue 3 — Rate Limiter Memory Leak

**Severity:** Critical  
**Category:** Performance / Security  
**File(s) Involved:** `backend/src/middleware/rateLimiter.ts` (Line 10)

**Description:**  
The in-memory `store` Map grows indefinitely. Entries are never removed once their time window passes — they are just reset. Over time this will consume all available memory and crash the process. This is also a denial-of-service vector: attackers can generate requests with many distinct user IDs to exhaust memory.

**Suggested Fix:**  
Add a periodic sweep to remove expired entries:

```ts
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > env.RATE_LIMIT_WINDOW_MS) {
      store.delete(key);
    }
  }
}, 60_000);
```

Also add a `Retry-After` header on 429 responses.

---

## Issue 4 — XSS via dangerouslySetInnerHTML

**Severity:** High  
**Category:** Security (XSS)  
**File(s) Involved:** `frontend/src/components/ComposerWithFeedback.jsx` (Line 242)

**Description:**  
`dangerouslySetInnerHTML={{ __html: buildHighlightedMarkup() }}` renders user-provided `draftText` into the DOM. Although `escapeHtml()` is called, custom escape functions are notoriously incomplete. A single missed edge case allows script injection.

**Suggested Fix:**  
Use a battle-tested sanitization library like `DOMPurify`:

```jsx
import DOMPurify from 'dompurify';
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(buildHighlightedMarkup()) }}
```

---

## Issue 5 — No Rate Limiting on WebSocket Events

**Severity:** High  
**Category:** Security / Performance  
**File(s) Involved:** `backend/src/websocket/composerNamespace.ts` (Lines 42–107)

**Description:**  
The `draft:analyze` and `draft:save` Socket.IO events have no rate limiting. A malicious client can flood the server with analysis requests, causing CPU exhaustion and potentially expensive AI service calls.

**Suggested Fix:**  
Track per-user event counts and reject excess requests:

```ts
const lastAnalysis = new Map<number, number>();
socket.on("draft:analyze", async (payload) => {
  const now = Date.now();
  if (now - (lastAnalysis.get(userId) ?? 0) < 2000) {
    socket.emit("feedback:error", {
      message: "Rate limited",
      code: "RATE_LIMITED",
    });
    return;
  }
  lastAnalysis.set(userId, now);
  // ... proceed
});
```

---

## Issue 6 — No URL Validation on Image Input

**Severity:** High  
**Category:** Security (XSS / SSRF)  
**File(s) Involved:** `frontend/src/components/CreatePostModal.jsx` (Line 109)

**Description:**  
The URL input for post images accepts any string without validation. A user could submit `javascript:alert(1)` or an internal network URL, creating XSS or SSRF risks when the URL is rendered in `<img src>`.

**Suggested Fix:**  
Validate that the URL starts with `https://` or `http://`:

```js
const isValidUrl = (url) => /^https?:\/\/.+/i.test(url);
if (urlInput.trim() && isValidUrl(urlInput.trim())) {
  setImage(urlInput.trim());
}
```

---

## Issue 7 — Detectors Only Find First Regex Match

**Severity:** High  
**Category:** Logic  
**File(s) Involved:**

- `backend/src/services/CircularLogicDetector.ts` (Line 44)
- `backend/src/services/WeakEvidenceDetector.ts` (Line 32)
- `backend/src/services/UnsupportedClaimsDetector.ts` (Line 26)

**Description:**  
All three detectors use `pattern.exec(text)` which returns only the **first** match. If a draft contains multiple instances of the same weak-evidence pattern (e.g., "everyone knows … everyone knows …"), only the first is flagged.

**Suggested Fix:**  
Use a global regex flag and iterate with `matchAll()`:

```ts
for (const { pattern, explanation } of weakPatterns) {
  const globalPattern = new RegExp(pattern.source, pattern.flags + "g");
  for (const match of text.matchAll(globalPattern)) {
    issues.push({
      /* ... */
    });
  }
}
```

---

## Issue 8 — CircularLogicDetector Uses indexOf for Position

**Severity:** High  
**Category:** Logic  
**File(s) Involved:** `backend/src/services/CircularLogicDetector.ts` (Line 21)

**Description:**  
`text.indexOf(sentences[j])` returns the position of the **first** occurrence of that sentence in the text. If a sentence appears more than once, or if sentence `j` is identical to an earlier substring, the reported position will be wrong.

**Suggested Fix:**  
Track the original character offsets when splitting sentences instead of using `indexOf` to re-locate them:

```ts
const sentenceRegex = /[^.!?]+[.!?]*/g;
const sentences: { text: string; start: number }[] = [];
let m;
while ((m = sentenceRegex.exec(text)) !== null) {
  sentences.push({ text: m[0].trim(), start: m.index });
}
```

---

## Issue 9 — Race Conditions in Vote and Join Endpoints

**Severity:** High  
**Category:** Logic / Concurrency  
**File(s) Involved:**

- `backend/src/routes/comments.routes.ts` (Lines 22–68)
- `backend/src/routes/subreddits.routes.ts` (Lines 35–60)
- `backend/src/routes/posts.routes.ts` (vote handler)

**Description:**  
All vote and join/leave handlers follow a check-then-act pattern: SELECT to check existing state, then INSERT/UPDATE/DELETE. Under concurrent requests from the same user, the check can pass twice, leading to duplicate votes or membership rows and incorrect counters.

**Suggested Fix:**  
Use `INSERT ... ON CONFLICT` or wrap the entire operation in a database transaction with a serializable isolation level:

```sql
INSERT INTO votes (user_id, target_type, target_id, vote_type)
  VALUES ($1, 'comment', $2, $3)
  ON CONFLICT (user_id, target_type, target_id)
  DO UPDATE SET vote_type = EXCLUDED.vote_type;
```

---

## Issue 10 — Comment Count Update Not in Transaction

**Severity:** Medium  
**Category:** Logic  
**File(s) Involved:** `backend/src/repositories/CommentRepository.ts` (Lines 18–19)

**Description:**  
After inserting a comment, the post's `comment_count` is incremented in a separate query. If the UPDATE fails (e.g., post was deleted), the count becomes permanently inconsistent with reality.

**Suggested Fix:**  
Wrap both queries in a transaction or use a database trigger:

```ts
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query('INSERT INTO comments ...', [...]);
  await client.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
  await client.query('COMMIT');
  return rows[0];
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

---

## Issue 11 — CORS Origins Hardcoded and Inconsistent

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `backend/src/index.ts` (Lines 44–48 and Lines 52–55)

**Description:**  
CORS origins are hardcoded to `localhost` URLs and differ between Express and Socket.IO. Express allows `localhost:3001` but Socket.IO does not. In production, CORS origins should come from an environment variable.

**Suggested Fix:**

```ts
const CORS_ORIGINS = env.CORS_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:5173",
];
```

Use this single list for both Express CORS and Socket.IO.

---

## Issue 12 — No Security Headers (helmet)

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `backend/src/index.ts`, `backend/package.json`

**Description:**  
The Express app does not set security headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Content-Security-Policy, etc.). The `helmet` package is not installed or used.

**Suggested Fix:**

```bash
npm install helmet
```

```ts
import helmet from "helmet";
app.use(helmet());
```

---

## Issue 13 — Seed Credentials Displayed in Production UI

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `frontend/src/components/AuthPage.jsx` (Lines 339–351)

**Description:**  
The login page displays seed account credentials (`CodeNewbie` / `password123`) unconditionally. In a production build these are visible to all users.

**Suggested Fix:**  
Gate behind a dev-only check:

```jsx
{
  import.meta.env.DEV && (
    <p className="...">
      Seed accounts use password <code>password123</code>
    </p>
  );
}
```

---

## Issue 14 — JWT Token Stored in localStorage

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `frontend/src/api.js` (Lines 18–24)

**Description:**  
The JWT token is persisted in `localStorage`, which is accessible to any JavaScript running on the page. If an XSS vulnerability exists (see Issue 4), an attacker can steal the token and impersonate the user.

**Suggested Fix:**  
Prefer `httpOnly` cookies set by the backend, which are inaccessible to JavaScript. Alternatively, store the token in memory only and use a refresh-token flow with `httpOnly` cookies.

---

## Issue 15 — Duplicate /me Endpoints

**Severity:** Medium  
**Category:** Technical Debt  
**File(s) Involved:**

- `backend/src/routes/auth.routes.ts` (`GET /api/v1/auth/me`)
- `backend/src/routes/users.routes.ts` (`GET /api/v1/users/me`)

**Description:**  
Two routes serve identical functionality — fetching the authenticated user's profile with joined subreddits. The code is copy-pasted between files, leading to divergence risk when one is updated but not the other.

**Suggested Fix:**  
Remove one endpoint and redirect the other, or extract the logic into a shared controller method.

---

## Issue 16 — Duplicate Vote Logic Across Route Files

**Severity:** Medium  
**Category:** Technical Debt  
**File(s) Involved:**

- `backend/src/routes/comments.routes.ts` (Lines 22–68)
- `backend/src/routes/posts.routes.ts` (vote handler)

**Description:**  
The vote toggle logic (check existing vote → delete/update/insert → update counters → create notification) is duplicated between comments and posts routes with only `target_type` differing. Any bug fix must be applied in two places.

**Suggested Fix:**  
Extract into a shared `VoteService` or utility function parameterized by target type.

---

## Issue 17 — Unused Import: reasoningSummaryRoutes

**Severity:** Medium  
**Category:** Technical Debt  
**File(s) Involved:** `backend/src/index.ts` (Line 16)

**Description:**  
`reasoningSummaryRoutes` is imported but never mounted on the Express app. The same route is already registered via `commentRoutes`. This is dead code.

**Suggested Fix:**  
Remove the unused import:

```ts
// Delete this line:
import { reasoningSummaryRoutes } from "./routes/reasoningSummary.routes";
```

---

## Issue 18 — No Database SSL Configuration

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `backend/src/config/database.ts` (Lines 4–13)

**Description:**  
The PostgreSQL pool does not configure SSL. In production or cloud deployments, database connections should use TLS to prevent credential sniffing.

**Suggested Fix:**

```ts
export const pool = new Pool({
  // ...existing config
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
});
```

---

## Issue 19 — Error Handler Treats All Errors as 500

**Severity:** Medium  
**Category:** Logic  
**File(s) Involved:** `backend/src/middleware/errorHandler.ts` (Lines 4–12)

**Description:**  
The global error handler always returns HTTP 500 regardless of the error type. Custom errors with `statusCode` properties (e.g., the 404 thrown by `ReasoningSummaryService`) are not handled here, relying on controllers to catch them first.

**Suggested Fix:**  
Check for a `statusCode` property on the error:

```ts
const statusCode = (err as any).statusCode || 500;
res.status(statusCode).json({ ... });
```

---

## Issue 20 — No Env Var Validation at Startup

**Severity:** Medium  
**Category:** Security / Configuration  
**File(s) Involved:** `backend/src/config/env.ts`

**Description:**  
Environment variables are parsed with fallback defaults and no validation. Malformed values (e.g., `PORT=abc`) silently become `NaN`. Missing critical variables (like `JWT_SECRET`, `DB_PASSWORD`) silently use insecure defaults.

**Suggested Fix:**  
Use a schema validator (e.g., Zod) at startup:

```ts
import { z } from "zod";
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16),
  // ...
});
export const env = envSchema.parse(process.env);
```

---

## Issue 21 — Timing Attack in Login Endpoint

**Severity:** Medium  
**Category:** Security  
**File(s) Involved:** `backend/src/routes/auth.routes.ts` (login handler)

**Description:**  
When a username does not exist, the server returns 401 immediately. When it does exist but the password is wrong, the server first runs `bcrypt.compare()`, which takes measurable time. An attacker can enumerate valid usernames by measuring response times.

**Suggested Fix:**  
Always run `bcrypt.compare()` against a dummy hash when the user is not found:

```ts
const DUMMY_HASH = await bcrypt.hash('dummy', 10);
// ...
if (rows.length === 0) {
  await bcrypt.compare(password, DUMMY_HASH); // constant time
  res.status(401).json({ ... });
  return;
}
```

---

## Issue 22 — Type Assertion Abuse: `as unknown as object`

**Severity:** Medium  
**Category:** Technical Debt / Type Safety  
**File(s) Involved:**

- `backend/src/services/ReasoningSummaryService.ts` (Lines 31, 69)
- `backend/src/services/WritingFeedbackService.ts` (Line 48)

**Description:**  
The `ICacheService.set()` method accepts `object`, but DTOs and `FeedbackResult` types don't satisfy this constraint. The workaround `as unknown as object` defeats TypeScript's type system entirely.

**Suggested Fix:**  
Change the `ICacheService` interface to accept a generic:

```ts
set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
```

---

## Issue 23 — Custom Error Classes Not Used

**Severity:** Medium  
**Category:** Technical Debt  
**File(s) Involved:** `backend/src/services/ReasoningSummaryService.ts` (Lines 38–40)

**Description:**  
Errors are created with `new Error()` and then have `statusCode`/`errorCode` patched onto them via `any` cast. This pattern is fragile, untypeable, and easily broken.

**Suggested Fix:**  
Create a custom `AppError` class:

```ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
  ) {
    super(message);
  }
}
```

---

## Issue 24 — No Pagination on Notifications

**Severity:** Medium  
**Category:** Performance  
**File(s) Involved:** `backend/src/routes/notifications.routes.ts` (Line 18)

**Description:**  
The GET notifications endpoint has a hardcoded `LIMIT 50` with no pagination parameters. Users with many notifications cannot load older ones, and the limit value is not configurable via query params.

**Suggested Fix:**  
Accept `limit` and `offset` query parameters, similar to the feedback history endpoint.

---

## Issue 25 — Missing `comments.created_at` Database Index

**Severity:** Low  
**Category:** Performance  
**File(s) Involved:** `backend/schema.sql`

**Description:**  
An index exists on `posts.created_at` but not on `comments.created_at`. Queries that sort or filter comments by creation time (e.g., displaying newest comments) will perform full table scans.

**Suggested Fix:**

```sql
CREATE INDEX idx_comments_created ON comments(created_at DESC);
```

---

## Issue 26 — No Max Length Validation on WebSocket `draft:save`

**Severity:** Low  
**Category:** Input Validation  
**File(s) Involved:** `backend/src/websocket/composerNamespace.ts` (Lines 83–89)

**Description:**  
The `draft:analyze` event validates text length (max 10,000 chars) but `draft:save` does not enforce any maximum. A malicious client can send arbitrarily large payloads and fill the database.

**Suggested Fix:**  
Add the same length check:

```ts
if (!text || typeof text !== 'string' || text.length === 0 || text.length > 10000) { ... }
```

---

## Issue 27 — Auth Route Email Validation Missing

**Severity:** Low  
**Category:** Input Validation  
**File(s) Involved:** `backend/src/routes/auth.routes.ts` (register handler)

**Description:**  
The register endpoint checks for presence of `email` but does not validate its format. Invalid emails (e.g., `not-an-email`) are accepted and stored in the database.

**Suggested Fix:**  
Use Zod validation middleware (already available in the project) or add a regex check:

```ts
const emailSchema = z.object({
  username: z.string().min(3).max(40),
  email: z.string().email(),
  password: z.string().min(8),
});
```

---

## Issue 28 — Bcrypt Cost Factor Hardcoded

**Severity:** Low  
**Category:** Security  
**File(s) Involved:** `backend/src/routes/auth.routes.ts` (Line 65)

**Description:**  
`bcrypt.hash(password, 10)` uses a cost factor of 10. OWASP recommends at least 12 for production. This value should be configurable via environment variable.

**Suggested Fix:**

```ts
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```

---

## Issue 29 — Google OAuth Username Collision Uses Math.random()

**Severity:** Low  
**Category:** Security  
**File(s) Involved:** `backend/src/routes/auth.routes.ts` (Line 169)

**Description:**  
When generating a unique username for a Google OAuth user, `Math.floor(Math.random() * 10000)` is used for deduplication. `Math.random()` is not cryptographically secure, and 10,000 possible suffixes means collisions are likely at scale.

**Suggested Fix:**  
Use `crypto.randomUUID()` or `crypto.randomInt()` and handle the resulting conflict with a retry loop or `ON CONFLICT` clause.

---

## Issue 30 — No Graceful Shutdown Timeout

**Severity:** Low  
**Category:** Logic  
**File(s) Involved:** `backend/src/index.ts` (SIGTERM handler)

**Description:**  
The SIGTERM handler calls `server.close()` with a callback but has no timeout. If in-flight requests never complete, the process hangs indefinitely and is never killed.

**Suggested Fix:**  
Add a forced exit after a timeout:

```ts
process.on("SIGTERM", () => {
  cacheService.destroy();
  server.close(() => {
    pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
});
```

---

## Issue 31 — FileReader Error Not Handled

**Severity:** Low  
**Category:** Logic  
**File(s) Involved:** `frontend/src/components/CreatePostModal.jsx` (Line 53)

**Description:**  
`reader.onload` is set but `reader.onerror` is not handled. If the file cannot be read (corrupt file, permission denied), the error is silently swallowed and the image just never appears.

**Suggested Fix:**

```js
reader.onerror = () => setError("Failed to read image file");
```

---

## Issue 32 — Body Scroll Lock Not Restored on Unmount Edge Case

**Severity:** Low  
**Category:** Logic  
**File(s) Involved:** `frontend/src/components/PostDetail.jsx` (Line 45)

**Description:**  
`document.body.style.overflow = 'hidden'` is set when the component mounts but relies on the cleanup function running. If React's strict mode double-mounts or an error boundary catches during render, scroll can remain locked.

**Suggested Fix:**  
Use a more robust mechanism like the `body-scroll-lock` library, or verify restoration in a global error boundary.

---

## Issue 33 — Expensive `structuredClone` on Every Cache Get/Set

**Severity:** Low  
**Category:** Performance  
**File(s) Involved:** `backend/src/services/InMemoryCacheService.ts` (Lines 28, 46)

**Description:**  
Every `get()` and `set()` call performs a deep clone via `structuredClone()`. For large or complex objects this is expensive and may negate the performance benefit of caching.

**Suggested Fix:**  
Consider using reference semantics with an immutability contract (e.g., `Object.freeze()`), or only clone on `get()` to protect against external mutation.

---

## Issue 34 — `checkRep()` Disabled in Production

**Severity:** Low  
**Category:** Logic  
**File(s) Involved:**

- `backend/src/services/InMemoryCacheService.ts` (Line 78)
- `backend/src/services/WritingFeedbackSessionManager.ts` (Line 120)

**Description:**  
`checkRep()` exits immediately in production (`NODE_ENV === 'production'`). This means invariant violations (e.g., store exceeding `maxEntries`) will go undetected in the environment where they matter most.

**Suggested Fix:**  
At minimum, log violations instead of using `console.assert`. Consider a lightweight invariant check that throws on critical violations.

---

## Issue 35 — No Request Logging Middleware

**Severity:** Low  
**Category:** Documentation / Observability  
**File(s) Involved:** `backend/src/index.ts`

**Description:**  
No request logging middleware (e.g., `morgan` or `pino-http`) is configured. In production, there is no audit trail of API requests for debugging or security incident response.

**Suggested Fix:**

```ts
import morgan from "morgan";
app.use(morgan("combined"));
```

---

## Summary

| Severity  | Count  |
| --------- | ------ |
| Critical  | 3      |
| High      | 6      |
| Medium    | 14     |
| Low       | 12     |
| **Total** | **35** |
