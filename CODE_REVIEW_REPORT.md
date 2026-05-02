# Code Review Report — Reddit AI Debate Analyzer

**Date**: May 1, 2026  
**Focus Areas**: Notification logic, authorization checks, concurrency issues, frontend validation

---

## 1. NOTIFICATION LOGIC — Reply to Comment Notifications

### Finding: Parent Comment Author NOT Notified on Replies

**Severity**: 🟡 **MEDIUM** (Feature Completeness)

**File**: [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts#L343-L356)  
**Lines**: 343-356

**Current Implementation**:

```typescript
// Notify the post author about the new comment (if not self-commenting)
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
      rows[0].id,
      `${req.username} commented on your post`,
    ],
  );
}
```

**Issue**:

- When `parentCommentId` is provided (user is replying to a comment), **ONLY the post author receives a notification**
- The **parent comment author receives NO notification** about the reply to their comment
- This breaks Reddit's core notification model where both original author AND parent author should be notified

**Expected Behavior**:

```typescript
// Should notify BOTH post author AND parent comment author (if exists)
if (parentCommentId) {
  // Notify parent comment author
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
       VALUES ($1, 'reply', $2, $3, $4, $5)`,
      [
        parentCommentRow.rows[0].author_id,
        userId,
        postId,
        rows[0].id,
        `${req.username} replied to your comment`,
      ],
    );
  }
}
```

**Related Tests**: [backend/tests/P5/PostDetail.test.jsx](backend/tests/P5/PostDetail.test.jsx#L687-L720)

- Tests verify comment addition works but don't verify parent author notification

---

## 2. AUTHORIZATION CHECKS — Missing Delete/Edit Endpoints

### Finding: No Edit/Delete Endpoints for Posts or Comments

**Severity**: 🟢 **LOW** (Not MVP scope)

**Locations Checked**:

- [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts) — No PUT/PATCH routes
- [backend/src/routes/comments.routes.ts](backend/src/routes/comments.routes.ts) — No PUT/PATCH routes

**What EXISTS**:

- ✅ DELETE emoji reactions with auth check: [posts.routes.ts #435](backend/src/routes/posts.routes.ts#L435) & [comments.routes.ts #142](backend/src/routes/comments.routes.ts#L142)
- ✅ DELETE debate side with auth check: [posts.routes.ts #549](backend/src/routes/posts.routes.ts#L549)
- ✅ All protected with `authMiddleware`

**What DOESN'T EXIST**:

- ❌ No DELETE /api/v1/posts/:id endpoint
- ❌ No PUT/PATCH /api/v1/posts/:id endpoint (edit post)
- ❌ No DELETE /api/v1/comments/:id endpoint
- ❌ No PUT/PATCH /api/v1/comments/:id endpoint (edit comment)

**Assessment**:

- If delete/edit features are planned for future sprints, they will need:
  1. Authorization checks (verify `req.userId` == `authorId`)
  2. Soft-delete consideration (preserve history)
  3. Cascading updates (comments if post deleted)

**Status**: Not an issue if out of scope. Flagged for future implementation.

---

## 3. RACE CONDITIONS — Concurrency Issues in Voting

### Finding: Non-Atomic Vote Operations Vulnerable to Race Conditions

**Severity**: 🔴 **HIGH** (Data Integrity)

#### 3.1 Post Voting Race Condition

**File**: [backend/src/routes/posts.routes.ts](backend/src/routes/posts.routes.ts#L210-L280)  
**Lines**: 210-280  
**Route**: POST /api/v1/posts/:id/vote

**Problematic Code**:

```typescript
// 1. SELECT existing vote
const existing = await pool.query(
  "SELECT * FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2",
  [userId, postId],
);

if (existing.rows.length > 0) {
  const oldVote = existing.rows[0].vote_type;
  if (oldVote === voteType) {
    // 2. DELETE vote record
    await pool.query("DELETE FROM votes WHERE id = $1", [existing.rows[0].id]);
    // 3. UPDATE post count (SEPARATE QUERY - NOT ATOMIC)
    const col = voteType === "up" ? "upvotes" : "downvotes";
    await pool.query(`UPDATE posts SET ${col} = ${col} - 1 WHERE id = $1`, [
      postId,
    ]);
  } else {
    // 4. UPDATE vote type
    await pool.query("UPDATE votes SET vote_type = $1 WHERE id = $2", [
      voteType,
      existing.rows[0].id,
    ]);
    // 5. UPDATE post counts (SEPARATE QUERY - NOT ATOMIC)
    if (voteType === "up") {
      await pool.query(
        "UPDATE posts SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = $1",
        [postId],
      );
    } else {
      await pool.query(
        "UPDATE posts SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = $1",
        [postId],
      );
    }
  }
}
```

**Race Condition Scenario**:

```
Time T1: User A votes up on post (upvotes: 5)
Time T2: User B votes down on post (reads upvotes: 5)
Time T3: User A's query: UPDATE upvotes = 5 + 1 = 6
Time T4: User B's query: UPDATE downvotes = 0 + 1 = 1
         BUT User B also reads upvotes=5, increments its change

Result: Lost update - vote count may not reflect both votes accurately
```

#### 3.2 Comment Voting Race Condition

**File**: [backend/src/routes/comments.routes.ts](backend/src/routes/comments.routes.ts#L10-L80)  
**Lines**: 10-80  
**Route**: POST /api/v1/comments/:id/vote

**Same Issue**: Identical non-atomic operations

```typescript
const existing = await pool.query(...); // Read
if (existing.rows.length > 0) {
  await pool.query('DELETE FROM votes WHERE id = $1', ...); // Write 1
  await pool.query(`UPDATE comments SET ${col} = ${col} - 1 ...`); // Write 2 - NOT ATOMIC
}
```

**Root Cause**:

- Multiple sequential database queries without transaction wrapper
- Between queries, concurrent requests can interleave
- Vote count deltas based on last-read value, not current database value

**Impact**:

- Vote counts become inaccurate under high concurrency
- Example: In 100ms under load, post shows 50 upvotes but should show 51-52

**Recommended Fix**:
Use PostgreSQL transactions with row-level locking:

```typescript
// Wrap in transaction
const client = await pool.connect();
try {
  await client.query("BEGIN");

  // Use SELECT...FOR UPDATE to lock the row
  const vote = await client.query(
    "SELECT * FROM votes WHERE user_id = $1 AND target_type = 'post' AND target_id = $2 FOR UPDATE",
    [userId, postId],
  );

  // All updates happen atomically now
  if (vote.rows.length > 0) {
    // ... handle vote change
  } else {
    // ... handle new vote
  }

  // Update vote count in same transaction
  await client.query(
    `UPDATE posts SET upvotes = upvotes + 1 WHERE id = $1 FOR UPDATE`,
    [postId],
  );

  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

---

## 4. FRONTEND VALIDATION & ERROR HANDLING

### Issue 4.1: Comment Submission Errors Swallowed

**Severity**: 🔴 **HIGH** (UX/User Feedback)

**File**: [frontend/src/context/RedditContext.jsx](frontend/src/context/RedditContext.jsx#L648-L660)  
**Lines**: 648-660

**Code**:

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
    } catch (err) {
      console.error("Add comment failed:", err);
      // ⚠️ ERROR NOT RE-THROWN - caller cannot detect failure
    }
  },
  [handleComment],
);
```

**Consumer** ([PostDetail.jsx #127-139](frontend/src/components/PostDetail.jsx#L127-L139)):

```javascript
const handleReplySubmit = async (parentId) => {
  if (!replyText.trim() || replySubmitting) return;
  setReplySubmitting(true);
  try {
    await addComment(post.id, replyText.trim(), parentId);
    setReplyText("");
    setReplyingTo(null);
  } catch (err) {
    console.error("Reply failed:", err);
    // ⚠️ NEVER REACHED - error is already caught upstream
  } finally {
    setReplySubmitting(false);
  }
};
```

**Problem Scenario**:

1. User types reply: "Great point!"
2. User clicks Submit
3. UI shows: "Posting..."
4. Network error occurs (backend offline)
5. `addComment` catches error, logs to console only
6. `handleReplySubmit` never gets error → continues normally
7. UI shows: Reply submitted ✓
8. **Comment is NOT on server** ❌
9. **User gets NO error feedback** ❌

**Fix Required**:

```javascript
const addComment = useCallback(
  async (postId, text, parentCommentId) => {
    try {
      const newComment = await addCommentApi(postId, text, parentCommentId);
      setComments((prev) => [...prev, newComment]);
      handleComment(postId);
    } catch (err) {
      console.error("Add comment failed:", err);
      throw err; // ✅ Re-throw so caller can handle
    }
  },
  [handleComment],
);

// Consumer can now show error
const handleReplySubmit = async (parentId) => {
  setReplySubmitting(true);
  try {
    await addComment(post.id, replyText.trim(), parentId);
    setReplyText("");
  } catch (err) {
    setReplyError(err.message); // ✅ Show to user
  } finally {
    setReplySubmitting(false);
  }
};
```

### Issue 4.2: Feedback Error State Never Triggered

**Severity**: 🟡 **MEDIUM** (Feature Correctness)

**File**: [frontend/src/components/ComposerWithFeedback.jsx](frontend/src/components/ComposerWithFeedback.jsx#L14)  
**Lines**: 14-20

**Code**:

```javascript
const [feedbackError, setFeedbackError] = useState(false);
const debounceRef = useRef(null);
const textareaRef = useRef(null);
const backdropRef = useRef(null);

// ... rest of component
```

**UI State Handler** (Lines 268-280):

```javascript
{
  rightPanelState === "error" && (
    <div className="py-8 px-2">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
        <AlertTriangle size={28} className="text-red-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-red-800 mb-1">
          Analysis Failed
        </p>
        <p className="text-xs text-red-600 mb-4">
          Unable to analyze your reply. Please try again.
        </p>
        <button onClick={handleRetry}>Retry Analysis</button>
      </div>
    </div>
  );
}
```

**Problem**:

- `feedbackError` state is initialized to `false` but **never set to `true`** anywhere in the component
- Error UI exists but is unreachable code
- The error that happens in Socket.IO `feedback:error` handler (in RedditContext) is not propagated here

**Actual Error Flow** (from [RedditContext.jsx #448-449](frontend/src/context/RedditContext.jsx#L448-L449)):

```javascript
socket.on("feedback:error", (err) => {
  console.error("Feedback error:", err);
  setFeedbackLoading(false); // Only sets loading to false, doesn't communicate error
});
```

**Fix Required**:
Add error state to context and pass it to component, or set `setFeedbackError(true)` when feedback:error is received

### Issue 4.3: Emoji Reaction Errors Silently Fail

**Severity**: 🟡 **MEDIUM** (UX Consistency)

**File**: [frontend/src/components/EmojiReactions.jsx](frontend/src/components/EmojiReactions.jsx#L23)  
**Lines**: 18-25

**Code**:

```javascript
useEffect(() => {
  const key = `${targetType}-${targetId}`;
  if (emojiReactions[key]) {
    setCurrentReactions(emojiReactions[key]);
  } else {
    // Auto-fetch from API if not in context
    fetchEmojiReactions(targetType, targetId)
      .then((data) => setCurrentReactions(data))
      .catch((err) => console.error("Failed to fetch emoji reactions:", err));
    // ⚠️ No error state or user feedback
  }
}, [targetId, targetType, emojiReactions]);
```

**Problem**:

- If emoji reactions fail to load, user sees nothing (no spinner, no error message)
- User thinks emoji feature is not loading when it actually failed

**Better Pattern** (see [PollDisplay.jsx #26-30](frontend/src/components/PollDisplay.jsx#L26-L30) for reference):

```javascript
const handleVote = async (optionId) => {
  setVoting(true);
  try {
    await handlePollVote(postId, optionId);
  } catch (err) {
    console.error("Failed to vote:", err);
    setSelectedOption(polls[`post-${postId}`]?.userVote ?? null); // Revert optimistic update
  } finally {
    setVoting(false);
  }
};
```

### Issue 4.4: CreatePostModal Validation Feedback

**Severity**: 🟡 **MEDIUM** (UX Polish)

**File**: [frontend/src/components/CreatePostModal.jsx](frontend/src/components/CreatePostModal.jsx#L90-L105)  
**Lines**: 90-105

**Issue**:

- Poll validation errors shown, but form doesn't scroll to error or focus on first error field
- In a long form, user might not see validation error message

**Current Code**:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");

  if (!title.trim()) {
    setError("Title is required");
    return;
  }
  if (title.trim().length > 300) {
    setError("Title must be 300 characters or less");
    return;
  }
  if (!content.trim()) {
    setError("Content is required");
    return;
  }
  if (!subreddit) {
    setError("Please select a community");
    return;
  }

  // Poll validation
  if (includePoll) {
    if (!pollQuestion.trim()) {
      setError("Poll question is required");
      return;
    }
    const validOptions = pollOptions.filter((opt) => opt.trim());
    if (validOptions.length < 2) {
      setError("Poll must have at least 2 options");
      return;
    }
    if (validOptions.length > 10) {
      setError("Poll can have at most 10 options");
      return;
    }
  }
  // ...
};
```

**Better Approach**:

```javascript
// Scroll error container into view
useEffect(() => {
  if (error && errorRef.current) {
    errorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}, [error]);
```

---

## Summary Table

| #   | Issue                              | Severity  | Category       | File                                | Line(s) | Status            |
| --- | ---------------------------------- | --------- | -------------- | ----------------------------------- | ------- | ----------------- |
| 1   | Parent comment author not notified | 🟡 MEDIUM | Feature        | posts.routes.ts                     | 343-356 | Needs Fix         |
| 2   | Delete/Edit endpoints missing      | 🟢 LOW    | Future         | posts.routes.ts, comments.routes.ts | —       | Out of scope      |
| 3   | Vote race condition (posts)        | 🔴 HIGH   | Concurrency    | posts.routes.ts                     | 210-280 | Needs Fix         |
| 4   | Vote race condition (comments)     | 🔴 HIGH   | Concurrency    | comments.routes.ts                  | 10-80   | Needs Fix         |
| 5   | addComment swallows errors         | 🔴 HIGH   | Error Handling | RedditContext.jsx                   | 648-660 | Needs Fix         |
| 6   | Reply submission fails silently    | 🔴 HIGH   | UX             | PostDetail.jsx                      | 127-139 | Cascading from #5 |
| 7   | Feedback error state unreachable   | 🟡 MEDIUM | Logic Bug      | ComposerWithFeedback.jsx            | 14      | Needs Fix         |
| 8   | Emoji reactions fail silently      | 🟡 MEDIUM | UX             | EmojiReactions.jsx                  | 23      | Needs Fix         |
| 9   | Modal validation scroll            | 🟡 MEDIUM | UX             | CreatePostModal.jsx                 | 90-105  | Nice to have      |

---

## Recommendations

### Priority 1 (Critical - High Impact)

1. **Fix voting race conditions** — Add PostgreSQL transactions with row-level locking
2. **Fix comment error propagation** — Re-throw errors in `addComment` so UI can show feedback

### Priority 2 (Important - Medium Impact)

3. **Add parent comment notification** — Query parent comment author and send notification
4. **Fix feedback error state** — Pass error state from context to component

### Priority 3 (Polish - Nice to Have)

5. **Improve emoji reaction error handling** — Show loading state and error feedback
6. **Improve form validation UX** — Scroll errors into view, focus first error field

---

## Test Recommendations

Add tests for:

- ✅ Concurrent vote requests don't lose counts
- ✅ Reply to comment notifies both post and parent authors
- ✅ Comment submission error surfaces to UI
- ✅ Feedback errors display in UI
- ✅ Emoji reaction failures don't break component
