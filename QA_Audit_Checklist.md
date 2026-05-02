# QA Audit Checklist — Reddit AI Debate Analyzer

**Comprehensive Code Review & Business Logic Audit**  
**Date:** May 1, 2026  
**Application:** Reddit AI Debate Analyzer (React, Node.js/Express, PostgreSQL, AWS)

---

## Table of Contents

1. [Critical Issues (Severity: 🔴 CRITICAL)](#critical-issues)
2. [High Priority Issues (Severity: 🟠 HIGH)](#high-priority-issues)
3. [Medium Priority Issues (Severity: 🟡 MEDIUM)](#medium-priority-issues)
4. [Low Priority Issues (Severity: 🟢 LOW)](#low-priority-issues)

---

# CRITICAL ISSUES

## 🔴 Critical Issue #1: Race Condition in Vote Counting (Posts & Comments)

- [ ] **[CRITICAL - Race Condition]** [backend/src/routes/posts.routes.ts#L210-L280](backend/src/routes/posts.routes.ts#L210-L280): Non-atomic voting operations

**The Problem:**
The voting endpoints perform multiple sequential database operations without a transaction. When two users vote on the same post/comment simultaneously:

1. Check if vote exists (SELECT)
2. Delete/update vote (DELETE/UPDATE)
3. Update vote count (UPDATE posts/comments)

Between steps 2-3, another user's vote operation may read stale vote counts, causing lost updates. Example:

- Post A has 5 upvotes
- User 1 votes up at T1: SELECT finds no vote, proceeds to UPDATE
- User 2 votes up at T2: SELECT finds no vote (before User 1's UPDATE), proceeds to UPDATE
- Final result: 6 upvotes instead of 7

**The Fix:**
Wrap the entire voting logic in a PostgreSQL transaction with `SELECT...FOR UPDATE` to lock the row:

```typescript
// In backend/src/routes/posts.routes.ts - POST /:id/vote endpoint
try {
  // BEGIN TRANSACTION
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the post row to prevent concurrent updates
    const { rows: postRows } = await client.query(
      "SELECT upvotes, downvotes, author_id FROM posts WHERE id = $1 FOR UPDATE",
      [postId],
    );

    if (postRows.length === 0) {
      throw new Error("Post not found");
    }

    // Check existing vote
    const { rows: existingVotes } = await client.query(
      "SELECT * FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2 FOR UPDATE",
      [userId, postId],
    );

    if (existingVotes.length > 0) {
      const oldVote = existingVotes[0].vote_type;
      if (oldVote === voteType) {
        await client.query("DELETE FROM votes WHERE id = $1", [
          existingVotes[0].id,
        ]);
        const col = voteType === "up" ? "upvotes" : "downvotes";
        await client.query(
          `UPDATE posts SET ${col} = ${col} - 1 WHERE id = $1`,
          [postId],
        );
      } else {
        await client.query("UPDATE votes SET vote_type = $1 WHERE id = $2", [
          voteType,
          existingVotes[0].id,
        ]);
        if (voteType === "up") {
          await client.query(
            "UPDATE posts SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1",
            [postId],
          );
        } else {
          await client.query(
            "UPDATE posts SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1",
            [postId],
          );
        }
      }
    } else {
      await client.query(
        "INSERT INTO votes (user_id, target_type, target_id, vote_type) VALUES ($1, 'post', $2, $3)",
        [userId, postId, voteType],
      );
      const col = voteType === "up" ? "upvotes" : "downvotes";
      await client.query(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = $1`, [
        postId,
      ]);
    }

    // Fetch updated counts
    const { rows: updated } = await client.query(
      "SELECT upvotes, downvotes FROM posts WHERE id = $1",
      [postId],
    );

    await client.query("COMMIT");
    res.json({ upvotes: updated[0].upvotes, downvotes: updated[0].downvotes });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  // error handling
}
```

**Impact:** High-volume voting (popular posts) can lead to incorrect vote tallies, undermining the credibility of the sorting algorithm.

---

## 🔴 Critical Issue #2: Missing Parent Comment Author Notifications

- [ ] **[CRITICAL - Missing Feature]** [backend/src/routes/posts.routes.ts#L343-L356](backend/src/routes/posts.routes.ts#L343-L356): Parent comment author NOT notified on reply

**The Problem:**
When User A replies to User B's comment on a post, a notification is sent ONLY to the post author. User B (the parent comment author) is not notified that someone replied to their comment. This breaks the core threaded discussion feature—replies feel ignored.

**Expected Behavior:**

- Post author gets notified: "User C replied to a comment on your post"
- Parent comment author gets notified: "User C replied to your comment"

**Current Behavior:**

- Only post author is notified
- Parent comment author has no way to know someone replied to them

**The Fix:**
In [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts), update the POST `/:id/comments` endpoint:

```typescript
// After creating the comment (around line 343)
const comment = rows[0];

// Notify the post author (if not self-commenting)
const postRow = await pool.query(
  "SELECT author_id, title FROM posts WHERE id = $1",
  [postId],
);
if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
     VALUES ($1, 'comment', $2, $3, $4, $5)`,
    [
      postRow.rows[0].author_id,
      userId,
      postId,
      comment.id,
      `${req.username} commented on your post`,
    ],
  );
}

// NEW: Notify the parent comment author (if replying to a comment, not the post)
if (parentCommentId) {
  const parentCommentRow = await pool.query(
    "SELECT author_id FROM comments WHERE id = $1",
    [parentCommentId],
  );
  if (
    parentCommentRow.rows.length > 0 &&
    parentCommentRow.rows[0].author_id !== userId
  ) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, source_user_id, post_id, comment_id, message)
       VALUES ($1, 'comment', $2, $3, $4, $5)`,
      [
        parentCommentRow.rows[0].author_id,
        userId,
        postId,
        comment.id,
        `${req.username} replied to your comment`,
      ],
    );
  }
}
```

**Impact:** Core feature gap—users won't be aware of replies to their comments, destroying the discussion thread engagement model.

---

## 🔴 Critical Issue #3: Comment Submission Error Swallowed in Frontend

- [ ] **[CRITICAL - Silent Failures]** [frontend/src/context/RedditContext.jsx#L649-L660](frontend/src/context/RedditContext.jsx#L649-L660): Exception not re-thrown, UI can't detect failure

**The Problem:**
In `RedditContext.jsx`, the `addComment` function catches errors but doesn't re-throw them. The calling component (`PostDetail.jsx`) awaits the call but has no way to detect if it failed:

```javascript
// Current buggy code in RedditContext.jsx
const addComment = useCallback(
  async (postId, text, parentCommentId) => {
    try {
      const newComment = await addCommentApi(postId, text, parentCommentId);
      setComments((prev) => [
        ...prev,
        { ...newComment, timestamp: new Date(newComment.timestamp) },
      ]);
      handleComment(postId);
    } catch (err) {
      console.error("Add comment failed:", err); // ERROR SWALLOWED HERE
      // Missing: throw err; or return error state
    }
  },
  [handleComment],
);
```

**Impact:**

- User clicks "Submit Comment"
- Network fails or server returns 500
- User sees loading spinner disappear (UI clears)
- User thinks comment was posted
- Comment never sent
- User moves on without knowing

**The Fix:**
Return an error indicator or re-throw:

```javascript
const addComment = useCallback(
  async (postId, text, parentCommentId) => {
    try {
      const newComment = await addCommentApi(postId, text, parentCommentId);
      setComments((prev) => [
        ...prev,
        { ...newComment, timestamp: new Date(newComment.timestamp) },
      ]);
      handleComment(postId);
      return { success: true };
    } catch (err) {
      console.error("Add comment failed:", err);
      return { success: false, error: err.message }; // Return error to caller
    }
  },
  [handleComment],
);
```

Then in `PostDetail.jsx#L127-L139`, handle the error:

```javascript
const handleReplySubmit = async (parentId) => {
  if (!replyText.trim() || replySubmitting) return;
  setReplySubmitting(true);
  try {
    const result = await addComment(post.id, replyText.trim(), parentId);
    if (!result.success) {
      setError(result.error || "Failed to post comment. Please try again.");
      setReplySubmitting(false);
      return;
    }
    setReplyText("");
    setReplyingTo(null);
  } catch (err) {
    console.error("Reply failed:", err);
    setError("Failed to post comment. Please try again.");
  } finally {
    setReplySubmitting(false);
  }
};
```

**Impact:** CRITICAL—users cannot trust that their comments are posted. This destroys confidence in the application.

---

# HIGH PRIORITY ISSUES

## 🟠 High Issue #1: Unreachable Error State in Writing Feedback UI

- [ ] **[HIGH - Dead Code]** [frontend/src/components/ComposerWithFeedback.jsx#L14-L15](frontend/src/components/ComposerWithFeedback.jsx#L14-L15): `feedbackError` state never set to true

**The Problem:**
The component declares a `feedbackError` state and has logic to display an error UI, but the state is **never** set to `true` anywhere in the code:

```javascript
// ComposerWithFeedback.jsx line 14
const [feedbackError, setFeedbackError] = useState(false);

// Line 23
setFeedbackError(false);

// No other setFeedbackError(true) calls exist
```

The error UI is unreachable, so when the AI feedback analysis fails, the user sees nothing—no error message, no retry button, no feedback to the user.

**The Fix:**
In the `analyzeDraft` function call, catch errors and set the error state:

```javascript
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);

  if (draftText.trim().length >= 10) {
    setFeedbackError(false);
    debounceRef.current = setTimeout(async () => {
      try {
        await analyzeDraft(draftText, postId);
      } catch (err) {
        console.error("Failed to analyze draft:", err);
        setFeedbackError(true); // SET ERROR STATE
      }
    }, 500);
  } else {
    setDraftFeedback(null);
  }

  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
}, [draftText, analyzeDraft, setDraftFeedback, postId]);
```

**Impact:** Users won't know when AI analysis fails, leading to confusion about why feedback isn't appearing.

---

## 🟠 High Issue #2: Silent Emoji Reaction Failures in Frontend

- [ ] **[HIGH - Poor Error Handling]** [frontend/src/components/EmojiReactions.jsx#L12-L20](frontend/src/components/EmojiReactions.jsx#L12-L20): Network errors only logged to console

**The Problem:**
When fetching emoji reactions fails, the error is silently logged to console with no user notification:

```javascript
fetchEmojiReactions(targetType, targetId)
  .then((data) => setCurrentReactions(data))
  .catch((err) => console.error("Failed to fetch emoji reactions:", err)); // Silent failure
```

Users see an empty emoji reaction list and have no idea why. Is it loading? Did it fail? Is there no data?

**The Fix:**
Add a loading state and error state:

```javascript
const [reactionsLoading, setReactionsLoading] = useState(false);
const [reactionsError, setReactionsError] = useState(null);

useEffect(() => {
  const key = `${targetType}-${targetId}`;
  if (emojiReactions[key]) {
    setCurrentReactions(emojiReactions[key]);
    setReactionsError(null);
  } else {
    setReactionsLoading(true);
    setReactionsError(null);
    fetchEmojiReactions(targetType, targetId)
      .then((data) => {
        setCurrentReactions(data);
        setReactionsError(null);
      })
      .catch((err) => {
        console.error("Failed to fetch emoji reactions:", err);
        setReactionsError("Could not load reactions"); // Capture error
        setCurrentReactions([]); // Clear reactions on error
      })
      .finally(() => setReactionsLoading(false));
  }
}, [targetId, targetType, emojiReactions]);

// In render, add error/loading states:
return (
  <div className="flex items-center gap-1 flex-wrap">
    {reactionsError && (
      <div className="text-xs text-red-500">Failed to load reactions</div>
    )}
    {reactionsLoading && (
      <div className="text-xs text-gray-400">Loading...</div>
    )}
    {/* ... rest of component ... */}
  </div>
);
```

**Impact:** Users cannot distinguish between "no reactions yet" and "failed to load reactions," causing confusion.

---

## 🟠 High Issue #3: Database Connection Pool Not Released in Error Cases

- [ ] **[HIGH - Resource Leak]** [backend/src/routes/posts.routes.ts#L219-L250](backend/src/routes/posts.routes.ts#L219-L250): Pool connections not explicitly released

**The Problem:**
While the code uses parameterized queries (good), error handling doesn't explicitly catch database connection errors. If a query times out or the database is unavailable, connections may leak from the pool. The pool has a max of 20 connections, so this could exhaust the pool under sustained errors.

**The Fix:**
Add explicit error handling and ensure the pool connection is released:

```typescript
router.post(
  "/:id/vote",
  authMiddleware,
  rateLimiter,
  async (req: AuthRequest, res: Response) => {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      // ... voting logic ...

      await client.query("COMMIT");
      res.json({
        /* response */
      });
    } catch (err) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("Rollback error:", rollbackErr);
        }
      }
      console.error("Error voting on post:", err);
      res
        .status(500)
        .json({ error: "INTERNAL_ERROR", message: "Failed to vote" });
    } finally {
      if (client) {
        client.release(); // ALWAYS release the connection
      }
    }
  },
);
```

**Impact:** Under high error rates, the database connection pool could be exhausted, causing service degradation or outage.

---

# MEDIUM PRIORITY ISSUES

## 🟡 Medium Issue #1: Empty Comment Form Validation Missing

- [ ] **[MEDIUM - Validation Gap]** [frontend/src/components/PostDetail.jsx#L127-L139](frontend/src/components/PostDetail.jsx#L127-L139): No check for empty or whitespace-only replies

**The Problem:**
The reply submission in `PostDetail.jsx` checks `if (!replyText.trim() || replySubmitting)`, which is good. However, the backend endpoint [backend/src/routes/posts.routes.ts#L320-L330](backend/src/routes/posts.routes.ts#L320-L330) validates `text` but doesn't explicitly check for empty strings before trimming:

```typescript
// Backend validation is minimal
if (!text || typeof text !== "string" || text.trim().length === 0) {
  res
    .status(400)
    .json({ error: "VALIDATION_ERROR", message: "text is required" });
  return;
}
```

While this works, there's no validation for:

- Max length enforcement (comments could be 1MB of repetitive characters)
- Profanity filtering (no mention of content moderation)
- URL spam detection

**The Fix:**
Add comprehensive validation:

```typescript
router.post(
  "/:id/comments",
  authMiddleware,
  rateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { text, parentCommentId } = req.body;

      // Validate text
      if (!text || typeof text !== "string") {
        res
          .status(400)
          .json({ error: "VALIDATION_ERROR", message: "text is required" });
        return;
      }

      const trimmedText = text.trim();

      // Check minimum length
      if (trimmedText.length < 1) {
        res
          .status(400)
          .json({
            error: "VALIDATION_ERROR",
            message: "Comment cannot be empty",
          });
        return;
      }

      // Check maximum length
      const MAX_COMMENT_LENGTH = 10000; // Arbitrary but reasonable
      if (trimmedText.length > MAX_COMMENT_LENGTH) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: `Comment exceeds maximum length of ${MAX_COMMENT_LENGTH} characters`,
        });
        return;
      }

      // Proceed with insertion...
      const { rows } = await pool.query(
        `INSERT INTO comments (post_id, author_id, parent_comment_id, text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
        [postId, userId, parentCommentId || null, trimmedText],
      );
      // ...
    } catch (err) {
      // ...
    }
  },
);
```

**Impact:** Users could spam extremely long comments or malicious content without backend resistance.

---

## 🟡 Medium Issue #2: Missing Post Title Validation (Length & XSS)

- [ ] **[MEDIUM - Input Validation]** [backend/src/routes/posts.routes.ts#L153-L170](backend/src/routes/posts.routes.ts#L153-L170): Post title not validated for length or content

**The Problem:**
Post creation accepts a title without explicit validation:

```typescript
const { title, content, subreddit, image, poll } = req.body;

// No validation on title beyond checking it exists
// Title could be:
// - Empty string (frontend catches, but backend should too)
// - 100,000+ characters (DOS attack)
// - Contain script tags (unlikely with JSON, but still a vector)
```

**The Fix:**

```typescript
// Add validation schema with Zod
import { z } from "zod";

const createPostBody = z.object({
  title: z.string().min(1, "Title is required").max(300, "Title max 300 chars"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content max 10k chars"),
  subreddit: z.string().min(1, "Subreddit is required"),
  image: z.string().url().optional().or(z.literal("")),
  poll: z
    .object({
      question: z.string().max(500),
      options: z.array(z.string().max(200)).min(2).max(10),
    })
    .optional(),
});

router.post(
  "/",
  authMiddleware,
  rateLimiter,
  validate(createPostBody, "body"),
  async (req: AuthRequest, res: Response) => {
    // Already validated by middleware
    // ...
  },
);
```

**Impact:** Could allow DOS attacks through extremely long titles or content spam.

---

## 🟡 Medium Issue #3: Poll Votes Not Cascading Correctly If Poll Deleted

- [ ] **[MEDIUM - Data Integrity]** [backend/schema.sql#L239-L258](backend/schema.sql#L239-L258): Orphaned poll_votes if poll_options deleted

**The Problem:**
The schema has:

- `polls` → ON DELETE CASCADE → deletes `poll_options`
- `poll_options` → ON DELETE CASCADE → deletes `poll_votes`

However, there's a potential race condition:

1. Admin deletes a poll (cascades to poll_options)
2. Before CASCADE reaches poll_votes, new user votes
3. New vote is orphaned with null option_id

**The Fix:**
Add explicit cascading with transactions and verify referential integrity:

```sql
-- Verify current state
SELECT COUNT(*) FROM poll_votes WHERE option_id IS NULL;

-- If orphaned votes exist, clean them:
DELETE FROM poll_votes WHERE option_id NOT IN (SELECT id FROM poll_options);

-- Alternatively, use a FOREIGN KEY constraint to prevent orphans:
ALTER TABLE poll_votes
  DROP CONSTRAINT poll_votes_option_id_fkey,
  ADD CONSTRAINT poll_votes_option_id_fkey
    FOREIGN KEY (option_id)
    REFERENCES poll_options(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
```

Also update backend code to use transactions when deleting polls:

```typescript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM polls WHERE id = $1", [pollId]);
  // Cascade handles poll_options and poll_votes
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

**Impact:** Orphaned database records can corrupt reporting and analysis features.

---

## 🟡 Medium Issue #4: Notification Type Mismatch Between Migration & Usage

- [ ] **[MEDIUM - Schema Violation]** [backend/migrations/006_expand_notification_types.sql](backend/migrations/006_expand_notification_types.sql): Notification types don't match actual usage

**The Problem:**
Migration #6 expands notification types to include `'emoji_reaction'` and `'debate_side'`:

```sql
CHECK (type IN ('vote', 'comment', 'emoji_reaction', 'debate_side'))
```

But in the code, only `'vote'` and `'comment'` are used. Emoji reactions and debate side changes don't create notifications. This is either:

1. Dead code (planned feature, not implemented)
2. Bug (notifications should be sent but aren't)

**The Fix:**
If emoji reactions and debate sides should notify:

In [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts) when adding emoji reaction:

```typescript
router.post(
  "/:id/emoji-reaction",
  authMiddleware,
  rateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { emoji } = req.body;

      // ... validation ...

      const { rows } = await pool.query(
        `INSERT INTO emoji_reactions (user_id, target_type, target_id, emoji)
       VALUES ($1, 'post', $2, $3)
       ON CONFLICT (user_id, target_type, target_id, emoji) DO UPDATE SET created_at = CURRENT_TIMESTAMP
       RETURNING *`,
        [userId, postId, emoji],
      );

      // NEW: Notify post author
      const postRow = await pool.query(
        "SELECT author_id FROM posts WHERE id = $1",
        [postId],
      );
      if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
         VALUES ($1, 'emoji_reaction', $2, $3, $4)`,
          [
            postRow.rows[0].author_id,
            userId,
            postId,
            `${req.username} reacted with ${emoji} to your post`,
          ],
        );
      }

      res.status(201).json({
        /* ... */
      });
    } catch (err) {
      // ...
    }
  },
);
```

OR if notifications shouldn't be sent, remove these types from the CHECK constraint:

```sql
-- Revert to only vote/comment
ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('vote', 'comment'));
```

**Impact:** Database schema allows invalid states that the application code never creates, leading to confusion during debugging.

---

## 🟡 Medium Issue #5: Debate Side Change Doesn't Notify Post Author

- [ ] **[MEDIUM - Feature Inconsistency]** [backend/src/routes/posts.routes.ts#L485-L525](backend/src/routes/posts.routes.ts#L485-L525): Debate side votes not triggering notifications

**The Problem:**
When a user chooses "for", "against", or "neutral" on a debate, no notification is sent to the post author. This is inconsistent with upvotes, which DO send notifications. A post author might want to know that users are engaging with their debate.

**The Fix:**
Add notification creation in the debate side endpoint:

```typescript
router.post(
  "/:id/debate-side",
  authMiddleware,
  rateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;
      const { side } = req.body;

      if (!["for", "against", "neutral"].includes(side)) {
        res
          .status(400)
          .json({
            error: "INVALID_SIDE",
            message: "side must be 'for', 'against', or 'neutral'",
          });
        return;
      }

      // ... existing logic ...

      // NEW: Notify post author
      const postRow = await pool.query(
        "SELECT author_id FROM posts WHERE id = $1",
        [postId],
      );
      if (postRow.rows.length > 0 && postRow.rows[0].author_id !== userId) {
        // Only notify on first debate side choice, not updates
        const existingDebateSide = await pool.query(
          "SELECT id FROM debate_sides WHERE user_id = $1 AND post_id = $2",
          [userId, postId],
        );

        if (existingDebateSide.rows.length === 0) {
          // First time user is choosing a side
          await pool.query(
            `INSERT INTO notifications (user_id, type, source_user_id, post_id, message)
           VALUES ($1, 'debate_side', $2, $3, $4)`,
            [
              postRow.rows[0].author_id,
              userId,
              postId,
              `${req.username} took the ${side} side on your debate`,
            ],
          );
        }
      }

      res.json({
        /* ... */
      });
    } catch (err) {
      // ...
    }
  },
);
```

**Impact:** Post authors won't know that users are engaging with their debate topic, reducing engagement feedback.

---

## 🟡 Medium Issue #6: No Rate Limiting Per Endpoint (All Requests Treated Equally)

- [ ] **[MEDIUM - DOS Vulnerability]** [backend/src/middleware/rateLimiter.ts](backend/src/middleware/rateLimiter.ts): Rate limit applies uniformly to all endpoints

**The Problem:**
The rate limiter applies a flat 100 requests/minute limit to all authenticated users, regardless of endpoint. This means:

- A user voting 100 times/minute is treated the same as analyzing 100 drafts
- Voting is cheap (1 DB query), feedback analysis is expensive (AI API call)
- A malicious user can DOS the expensive endpoints (analytics, feedback)

**The Fix:**
Implement per-endpoint rate limiting:

```typescript
// middleware/rateLimiters.ts
const limits = {
  vote: { max: 60, window: 60000 }, // 60 votes per minute
  comment: { max: 20, window: 60000 }, // 20 comments per minute
  analysis: { max: 5, window: 60000 }, // 5 AI analyses per minute (expensive!)
  subredditJoin: { max: 30, window: 60000 }, // 30 joins per minute
};

export function createRateLimiter(endpoint) {
  return (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      next();
      return;
    }

    const config = limits[endpoint];
    if (!config) {
      next(); // No limit defined
      return;
    }

    const key = `${endpoint}:${userId}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > config.window) {
      store.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (entry.count >= config.max) {
      res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit of ${config.max} requests per minute exceeded for this action`,
      });
      return;
    }

    entry.count++;
    next();
  };
}
```

Then update routes:

```typescript
import { createRateLimiter } from "../middleware/rateLimiters";

router.post(
  "/:id/vote",
  authMiddleware,
  createRateLimiter("vote"),
  async (req, res) => {
    // ...
  },
);

router.post(
  "/draft-feedback",
  authMiddleware,
  createRateLimiter("analysis"),
  controller.analyzeDraft,
);
```

**Impact:** An attacker could exhaust AI API quota or database resources by targeting expensive operations.

---

# LOW PRIORITY ISSUES

## 🟢 Low Issue #1: No Edit/Delete Endpoints for User Content (Future Feature)

- [ ] **[LOW - Planned Feature]** [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts): No PUT/PATCH/DELETE endpoints for posts or comments

**The Problem:**
Users cannot edit or delete their own posts or comments. This is likely intentional for MVP, but will need implementation with proper authorization checks:

- Users should only be able to edit/delete their own content
- Deleting a post should cascade to delete all comments
- Deleting a comment should handle nested replies

**The Fix (for future implementation):**

```typescript
// DELETE /api/v1/posts/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id, 10);
      const userId = req.userId!;

      // Verify ownership
      const { rows } = await pool.query(
        "SELECT author_id FROM posts WHERE id = $1",
        [postId],
      );

      if (rows.length === 0) {
        res.status(404).json({ error: "NOT_FOUND", message: "Post not found" });
        return;
      }

      if (rows[0].author_id !== userId) {
        res
          .status(403)
          .json({
            error: "FORBIDDEN",
            message: "You can only delete your own posts",
          });
        return;
      }

      // Delete post (comments cascade due to ON DELETE CASCADE)
      await pool.query("DELETE FROM posts WHERE id = $1", [postId]);

      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting post:", err);
      res
        .status(500)
        .json({ error: "INTERNAL_ERROR", message: "Failed to delete post" });
    }
  },
);
```

**Impact:** Deferred to future sprint. Not critical for MVP.

---

## 🟢 Low Issue #2: Missing Loading States in Multiple UI Components

- [ ] **[LOW - UX Polish]** [frontend/src/components/EmojiReactions.jsx](frontend/src/components/EmojiReactions.jsx): No loading indicator while fetching reactions

**The Problem:**
Several components don't show loading states:

- Emoji reactions: Empty until loaded (users think there are no reactions)
- Debate sides: Counts may be stale while fetching
- Poll options: Could benefit from skeleton screens

**The Fix:**
Add loading spinners and skeleton states:

```javascript
export default function EmojiReactions({ targetType, targetId, reactions = [] }) {
  const [currentReactions, setCurrentReactions] = useState(reactions);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (reactions.length > 0) {
      setCurrentReactions(reactions);
    } else {
      setIsLoading(true);
      fetchEmojiReactions(targetType, targetId)
        .then(data => setCurrentReactions(data))
        .catch(() => setCurrentReactions([]))
        .finally(() => setIsLoading(false));
    }
  }, [targetId, targetType, reactions]);

  if (isLoading) return <div className="text-xs text-gray-400">Loading...</div>;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {currentReactions.map((reaction) => (/* ... */))}
      {/* ... */}
    </div>
  );
}
```

**Impact:** Low—improves UX but not a functional bug.

---

## 🟢 Low Issue #3: No Accessibility Features (WCAG Compliance)

- [ ] **[LOW - Accessibility]** [frontend/src/components/PostDetail.jsx](frontend/src/components/PostDetail.jsx): Missing ARIA labels and keyboard navigation

**The Problem:**
The application lacks:

- ARIA labels for icon buttons ("Vote", "Reply", "Share")
- Keyboard navigation for emoji picker
- Focus management when modals open
- Screen reader context for vote counts

**The Fix (sample):**

```javascript
// Add ARIA labels
<button
  onClick={() => handleVote(post.id, 'up')}
  aria-label={`Upvote ${post.title || 'post'} (${post.upvotes} votes)`}
  aria-pressed={userVote === 'up'}
  className="hover:bg-blue-100 p-2 rounded"
>
  <ChevronUp size={20} />
</button>

// Add skip to main content link (in App.jsx)
<a href="#main-content" className="skip-link">
  Skip to main content
</a>

// Add keyboard event handlers
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') handleClose();
  };
  if (selectedPost) {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }
}, [selectedPost, handleClose]);
```

**Impact:** Low for MVP but important for inclusivity. Should be addressed in next iteration.

---

## 🟢 Low Issue #4: Notification List Could Show Duplicate Notifications

- [ ] **[LOW - Data Quality]** [backend/src/routes/notifications.routes.ts#L6-L20](backend/src/routes/notifications.routes.ts#L6-L20): No deduplication of similar notifications

**The Problem:**
If multiple users upvote the same post within seconds, the user gets multiple "User X upvoted your post" notifications instead of a single aggregated notification. The API returns:

```json
[
  {
    "id": 1,
    "type": "vote",
    "sourceUsername": "Alice",
    "postId": 5,
    "message": "Alice upvoted your post"
  },
  {
    "id": 2,
    "type": "vote",
    "sourceUsername": "Bob",
    "postId": 5,
    "message": "Bob upvoted your post"
  }
]
```

This is correct behavior (each vote is a separate event), but the frontend could optionally aggregate them in the UI.

**The Fix (optional, frontend):**

```javascript
// In components, optionally group similar notifications
const groupNotifications = (notifications) => {
  const grouped = {};

  notifications.forEach((notif) => {
    const key = `${notif.type}_${notif.postId}`;
    if (!grouped[key]) {
      grouped[key] = { ...notif, count: 1, otherUsers: [] };
    } else {
      grouped[key].count++;
      grouped[key].otherUsers.push(notif.sourceUsername);
    }
  });

  return Object.values(grouped);
};
```

Display as: "Alice and 3 others upvoted your post"

**Impact:** Very low—grouping is cosmetic. Current behavior is correct.

---

## 🟢 Low Issue #5: No Soft Delete for Content (Permanent Deletion Only)

- [ ] **[LOW - Data Retention]** [backend/schema.sql](backend/schema.sql): Posts/comments permanently deleted without audit trail

**The Problem:**
When a post or comment is deleted (future feature), it's permanently removed from the database with no audit trail or recovery option. This is fine for MVP but could be problematic long-term for:

- Content moderation appeals
- Forensic analysis
- GDPR right-to-be-forgotten vs. audit trails

**The Fix (for future consideration):**
Add a `deleted_at` soft-delete column:

```sql
ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE comments ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL;

-- Soft delete instead of permanent delete
UPDATE posts SET deleted_at = NOW() WHERE id = $1; -- Instead of DELETE

-- Exclude deleted records from queries
SELECT * FROM posts WHERE deleted_at IS NULL;
```

**Impact:** Very low for MVP. Consider for mature product.

---

# Summary Table

| Severity    | Count | Examples                                                                                       |
| ----------- | ----- | ---------------------------------------------------------------------------------------------- |
| 🔴 CRITICAL | 3     | Race condition voting, missing parent comment notifications, silent comment failures           |
| 🟠 HIGH     | 3     | Unreachable error UI, silent emoji failures, pool leaks                                        |
| 🟡 MEDIUM   | 6     | Empty form validation, poll cascades, notification type mismatches, rate limiting per endpoint |
| 🟢 LOW      | 5     | No edit/delete endpoints, missing loading states, accessibility, duplicates, soft deletes      |

---

## Recommended Action Plan

### Phase 1: Critical (ASAP - Sprint This Week)

1. ✅ Fix race condition in voting with transactions
2. ✅ Add parent comment notifications
3. ✅ Fix comment submission error handling

### Phase 2: High (Next Sprint)

4. ✅ Set `feedbackError = true` on AI analysis failures
5. ✅ Add error UI to emoji reactions
6. ✅ Add explicit connection release in error paths

### Phase 3: Medium (Current Sprint + Backlog)

7. ✅ Add max length validation to comments & posts
8. ✅ Fix poll cascade logic
9. ✅ Add emoji_reaction & debate_side notifications
10. ✅ Implement per-endpoint rate limiting

### Phase 4: Low (Polish/Future)

11. ✅ Implement edit/delete endpoints with auth
12. ✅ Add loading states to all async operations
13. ✅ Add ARIA labels and keyboard navigation
14. ✅ Implement soft deletes for audit trail

---

## Testing Recommendations

### Critical Tests

- **Race condition test**: Simulate 10 concurrent votes on same post; verify count is 10, not 9
- **Parent comment notification test**: Reply to a comment; verify both post author AND parent comment author receive notifications
- **Error handling test**: Disable network; submit comment; verify error message appears

### High Priority Tests

- **Emoji reaction error test**: Mock API failure; verify error message displays
- **Feedback error test**: Mock AI service failure; verify retry button appears

### Integration Tests

- **Voting**: Verify vote counts, notifications, and state consistency
- **Comments**: Verify threading, notifications, and cascading deletes
- **Polls**: Verify poll votes don't orphan if poll deleted

---

## Database Integrity Checks

Run these queries regularly to detect inconsistencies:

```sql
-- Check for orphaned poll votes
SELECT COUNT(*) FROM poll_votes WHERE option_id NOT IN (SELECT id FROM poll_options);

-- Check for orphaned comments (post deleted but comment exists)
SELECT COUNT(*) FROM comments WHERE post_id NOT IN (SELECT id FROM posts);

-- Check for orphaned votes (target deleted)
SELECT COUNT(*) FROM votes WHERE
  (target_type = 'post' AND target_id NOT IN (SELECT id FROM posts))
  OR (target_type = 'comment' AND target_id NOT IN (SELECT id FROM comments));

-- Check for notification reference integrity
SELECT COUNT(*) FROM notifications WHERE post_id NOT IN (SELECT id FROM posts);
SELECT COUNT(*) FROM notifications WHERE comment_id NOT IN (SELECT id FROM comments);
```

---

**End of QA Audit Report**
