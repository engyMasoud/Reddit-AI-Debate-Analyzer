# Development Specification: US3 - Real-Time Writing Feedback

## Overview

This document specifies the development of the Real-Time Writing Feedback feature, enabling registered users to receive immediate assistance while composing a reply, with detection and flagging of circular logic, weak evidence, and unsupported assertions.

**User Story**: As a registered user, I want real-time writing feedback that flags circular logic and weak evidence in my draft reply so that I can improve my argument before posting.

**T-Shirt Size**: Medium

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│              Browser / Client (React)                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Comment Composer Component                        │  │
│  │  - Text Editor (Draft)                             │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ "Your Reply:"                                 │ │  │
│  │  │ [Text input area]                             │ │  │
│  │  │                                               │ │  │
│  │  │ Real-Time Feedback Panel (Right side):        │ │  │
│  │  │ ┌──────────────────────────────────────────┐ │ │  │
│  │  │ │ ⚠ Weak Evidence (Line 2)                 │ │ │  │
│  │  │ │   "No sources cited for this claim"      │ │ │  │
│  │  │ │                                           │ │ │  │
│  │  │ │ 🔄 Possible Circular Reasoning (Line 5)  │ │ │  │
│  │  │ │   "This repeats point from line 1"       │ │ │  │
│  │  │ │                                           │ │ │  │
│  │  │ │ ✓ Good: Cites a source                   │ │ │  │
│  │  │ └──────────────────────────────────────────┘ │ │  │
│  │  │ [Submit] [Cancel]                            │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket + HTTP
                       │ (Debounced, ~500ms)
                       │ POST /api/v1/composer/draft-feedback
                       │ { draftText: "...", position: 5 }
                       │ Response: { feedback: [...] }
                       ▼
┌────────────────────────────────────────────────────────┐
│            Backend Server (Node.js + WebSocket)        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  API Routes & WebSocket Handlers                │  │
│  │  - POST /api/v1/composer/draft-feedback         │  │
│  │  - WS /ws/composer/{userId}                     │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │  Writing Feedback Service                       │  │
│  │  - analyzeDraft()                               │  │
│  │  - detectCircularLogic()                        │  │
│  │  - detectWeakEvidence()                         │  │
│  │  - detectUnsupportedClaims()                    │  │
│  │  - aggregateFeedback()                          │  │
│  │  - calculateFeedbackScore()                     │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │ Uses: AIAnalysisService (shared)   │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │  Data Access Layer                              │  │
│  │  - draftRepository.save()                       │  │
│  │  - feedbackCache.get/set()                      │  │
│  │  - circularLogicDetector.check()                │  │
│  └────────────────┬──────────┬──────────────────────┘  │
└─────────────────┼──────────┼──────────────────────────┘
                  │          │
    ┌─────────────▼────┐     │
    │  PostgreSQL DB   │     │
    │  - drafts table  │     │
    │  - feedback_log  │     │
    └──────────────────┘     │
                      ┌──────▼──────────────┐
                      │  Redis Cache        │
                      │  - draft_feedback   │
                      │  - key: userId:id   │
                      │  - TTL: 1 hour      │
                      └─────────────────────┘
```

**Component Locations**:

- **Client**: React-based browser composer with real-time UI updates
- **WebSocket Server**: Node.js backend with Socket.IO (same EC2 instance)
- **API Server**: Express.js endpoints for POST feedback requests
- **Database**: PostgreSQL stores draft history and feedback logs
- **Cache**: Redis caches recent feedback for rapid re-display

**Information Flows**:

1. User types in composer (text input event)
2. Debounced request (500ms) sent to backend with draft text
3. Backend analyzes draft using Writing Feedback Service
4. Circular logic and weak evidence detection run in parallel
5. Results aggregated and cached in Redis
6. Response sent back via WebSocket or HTTP response
7. Client highlights problematic areas inline with explanations
8. User can modify draft and trigger new feedback analysis

---

## Class Diagram

```
┌─────────────────────────────────────────────────────────┐
│              WritingFeedbackService                      │
├─────────────────────────────────────────────────────────┤
│ - aiAnalysisService: AIAnalysisService (shared)         │
│ - circularLogicDetector: CircularLogicDetector          │
│ - cacheService: CacheService (shared)                   │
│ - draftRepository: DraftRepository                      │
├─────────────────────────────────────────────────────────┤
│ + analyzeDraft(text: string): Promise<FeedbackResult>   │
│ + detectCircularLogic(draft: string): Promise<Issue[]>  │
│ + detectWeakEvidence(draft: string): Promise<Issue[]>   │
│ + detectUnsupportedClaims(draft: string): Promise<...>  │
│ + aggregateFeedback(issues: Issue[]): FeedbackResult    │
└──────────────┬──────────────────────────────────────────┘
               │
     ┌─────────┴────────┬──────────────┐
     │                  │              │
┌────▼────────────┐   ┌─▼──────────────────┐   ┌┴──────────────────┐
│CircularLogic    │   │WeakEvidenceDetector│   │UnsupportedClaims  │
│Detector         │   │                    │   │Detector           │
├─────────────────┤   ├────────────────────┤   ├───────────────────┤
│- ngramStore     │   │- keywordPatterns   │   │- logicalFallacies │
│- sentenceGraph  │   │- citationParser    │   │- claimAnalyzer    │
├─────────────────┤   ├────────────────────┤   ├───────────────────┤
│+ detect(text):  │   │+ detect(text):     │   │+ detect(text):    │
│  Issue[]        │   │  Issue[]           │   │  Issue[]          │
│+ buildGraph():  │   │+ extractCitations()│   │+ validateClaims() │
│  Graph          │   │+ scoreCitation()   │   │+ checkLogic()     │
└─────────────────┘   └────────────────────┘   └───────────────────┘
     │                  │                             │
     └──────────────────┴─────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   FeedbackResult      │
            ├───────────────────────┤
            │- issues: Issue[]      │
            │- score: number (0-1)  │
            │- suggestions: string[]│
            │- goodPoints: string[] │
            │- confidence: number   │
            └───────────────────────┘
                        │
       ┌────────────────┴────────────────┐
       │                                 │
    ┌──▼─────────────┐          ┌─────────▼──────┐
    │  Issue         │          │  Suggestion    │
    ├────────────────┤          ├────────────────┤
    │- type          │          │- text          │
    │- position      │          │- type          │
    │- lineNumber    │          │- priority      │
    │- flaggedText   │          │- exampleFix    │
    │- explanation   │          │- docLink       │
    │- severity      │          └────────────────┘
    │- confidence    │
    └────────────────┘
```

---

## List of Classes

| Class Name                  | Package      | Responsibility                                   |
| --------------------------- | ------------ | ------------------------------------------------ |
| `WritingFeedbackService`    | services     | Orchestrates all real-time feedback analysis     |
| `WritingFeedbackController` | controllers  | HTTP/WebSocket handler for feedback requests     |
| `CircularLogicDetector`     | services     | Detects self-referential or repeated arguments   |
| `WeakEvidenceDetector`      | services     | Identifies unsupported claims and weak citations |
| `UnsupportedClaimsDetector` | services     | Flags assertions lacking evidence                |
| `AIAnalysisService`         | services     | Shared AI service for claims/evidence extraction |
| `CacheService`              | services     | Redis cache for feedback results                 |
| `DraftRepository`           | repositories | Database access for draft storage                |
| `FeedbackLogRepository`     | repositories | Database access for feedback history             |
| `FeedbackResult`            | models/dtos  | Container for feedback analysis output           |
| `Issue`                     | models       | Represents a single problem detected in draft    |
| `WritingFeedbackCache`      | utils        | Efficient cache key management                   |
| `CitationParser`            | utils        | Extracts citations and source references         |
| `SentenceGraphBuilder`      | utils        | Constructs argument dependency graph             |
| `NgramAnalyzer`             | utils        | N-gram analysis for repetition detection         |

---

## State Diagrams

### Real-Time Feedback Generation State Machine

```
┌─────────────────────┐
│   User Typing       │
└──────────┬──────────┘
           │ Text input event
           │
           ▼
┌─────────────────────┐
│  Debounce Timer     │ (500ms)
│  (Wait for user     │
│   to stop typing)   │
└──────────┬──────────┘
           │ Timer expires
           │
           ▼
┌─────────────────────────────────┐
│  Submit Draft for Analysis      │
│  - POST /api/v1/composer/...    │
│  - Or WS message                │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Check Cache (Redis)            │
│  Key: "draft_feedback:{hash}"   │
└─────────┬──────────────────────┘
          │
          ├─ [Cache Hit] ────────────┐
          │                          │
          └─ [Cache Miss & Analyze]  │
                                     │
                ┌────────────────────┘
                │
     ┌──────────▼─────────────────┐
     │  Parallel Analysis:         │
     │  1. Circular Logic Detection│
     │  2. Weak Evidence Detection │
     │  3. Unsupported Claims Detect
     └──────────┬──────────────────┘
                │
     ┌──────────▼──────────────────┐
     │  Aggregate Issues            │
     │  - Sort by severity/position │
     │  - Calculate total score     │
     │  - Generate suggestions      │
     └──────────┬───────────────────┘
                │
     ┌──────────▼──────────────────┐
     │  Cache Result (Redis)        │
     │  TTL: 1 hour                 │
     └──────────┬───────────────────┘
                │
     ┌──────────▼──────────────────┐
     │  Build FeedbackResult JSON   │
     └──────────┬───────────────────┘
                │
     ┌──────────▼──────────────────┐
     │  Return to Client            │
     │  (HTTP 200 or WS message)    │
     └──────────┬───────────────────┘
                │
     ┌──────────▼──────────────────┐
     │  Client Renders Inline       │
     │  Feedback Highlights         │
     └──────────────────────────────┘
```

---

## Flow Chart

```
START
  │
  ▼
User Types in Comment Composer
  │
  ▼
┌──────────────────────────────┐
│ Text Change Event Triggered  │
└──────────────┬───────────────┘
               │
    ┌──────────▼──────────┐
    │ Debounce (500ms)    │
    │ - Cancel previous   │
    │   timers            │
    │ - Set new timer     │
    └──────────┬──────────┘
               │ Timer expires
               ▼
    ┌──────────────────────────┐
    │ Submit Draft to Backend  │
    │ POST /api/v1/composer/   │
    │      draft-feedback      │
    │ Body: {                  │
    │   draftText: "...",      │
    │   contextId: threadId    │
    │ }                        │
    └──────────┬───────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │ Check Redis Cache        │
    │ Key: "draft_feedback:    │
    │        {draftHash}"      │
    └──────────┬───────────────┘
               │
        ┌──────┴──────┐
        │             │
   [Hit]│             │[Miss]
        │             │
    ┌───▼──┐      ┌───▼──────────────────┐
    │Return│      │ Parse Draft Text     │
    │cached│      │ - Extract sentences  │
    │result│      │ - Extract claims     │
    │      │      │ - Identify context   │
    │      │      └───────┬──────────────┘
    │      │              │
    │      │    ┌─────────▼──────────────────┐
    │      │    │ Parallel Tasks:            │
    │      │    │                            │
    │      │    │ TASK 1: Circular Logic     │
    │      │    │ - Build argument graph    │
    │      │    │ - Check for self-refs     │
    │      │    │ - Check for repetitions   │
    │      │    │ - Output: Issue[]         │
    │      │    │                            │
    │      │    │ TASK 2: Weak Evidence     │
    │      │    │ - Extract citations       │
    │      │    │ - Score evidence strength │
    │      │    │ - Verify sources          │
    │      │    │ - Output: Issue[]         │
    │      │    │                            │
    │      │    │ TASK 3: Unsupported Claims│
    │      │    │ - Extract all claims      │
    │      │    │ - Check support status    │
    │      │    │ - Detect logical fallacies│
    │      │    │ - Output: Issue[]         │
    │      │    │                            │
    │      │    └─────────┬──────────────────┘
    │      │              │ All tasks complete
    │      │    ┌─────────▼──────────────────┐
    │      │    │ Aggregate Results:         │
    │      │    │ - Collect all issues       │
    │      │    │ - Sort by position        │
    │      │    │ - Sort by severity        │
    │      │    │ - Calculate score (0-1)   │
    │      │    │ - Generate suggestions    │
    │      │    │ - Identify good points    │
    │      │    └─────────┬──────────────────┘
    │      │              │
    │      │    ┌─────────▼──────────────────┐
    │      │    │ Cache Result (Redis)       │
    │      │    │ TTL: 1 hour                │
    │      │    └─────────┬──────────────────┘
    │      │              │
    └──────┬──────────────┘
           │
    ┌──────▼─────────────────────┐
    │ Build FeedbackResult JSON   │
    │ {                           │
    │   issues: [...],            │
    │   score: 0.72,              │
    │   suggestions: [...],       │
    │   goodPoints: [...],        │
    │   confidence: 0.85          │
    │ }                           │
    └──────┬─────────────────────┘
           │
           ▼
    Return HTTP 200 Response
    OR send via WebSocket
           │
           ▼
    Client Displays Feedback
    - Highlight issues inline
    - Show tips for improvement
    - Display good points
           │
           ▼
    User Continues Editing
           │
           ▼ (Loop back to "User Types")

    User Clicks [Submit/Post]
           │
           ▼
    Submit Finalized Comment
           │
           ▼
         END
```

---

## Development Risks and Failures

| Risk                           | Likelihood | Impact                                                     | Mitigation                                                      |
| ------------------------------ | ---------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| **Latency Performance**        | High       | Slow feedback frustrates users with real-time expectations | Aggressive caching, debounce, async analysis, optimize AI calls |
| **False Positives**            | Medium     | Incorrect flags damage user confidence in system           | Conservative thresholds, user override UI, feedback loop        |
| **WebSocket Reliability**      | Medium     | Connection drops lose user feedback in progress            | Implement reconnection logic, fallback to HTTP polling          |
| **Cache Coherence**            | Low        | Different analysis results due to bad caching              | Use deterministic hash of draft text, short TTL (1h)            |
| **Circular Logic Complexity**  | Medium     | Difficult to detect all circular reasoning types           | Focus on obvious patterns first, allow false negatives          |
| **AI Service Overload**        | Medium     | High frequency requests overwhelm OpenAI API               | Queue requests, batch when possible, longer debounce            |
| **Evidence Validation Errors** | Medium     | Non-existent or weak sources marked as good                | Manual validation of citation extraction, user feedback         |
| **User Privacy**               | Low        | Draft text sent to 3rd-party AI service                    | Use OpenAI enterprise DPA, offer local analysis option          |
| **Usability Overload**         | Medium     | Too many feedback items make panel unreadable              | Limit to top 3-5 critical issues, group by type                 |
| **Draft Data Leakage**         | Low        | Unfinished draft comments stored permanently               | Clear drafts after 30 days, allow manual deletion               |

---

## Technology Stack

| Layer              | Technology         | Version  | Purpose                                        |
| ------------------ | ------------------ | -------- | ---------------------------------------------- |
| **Frontend**       | React              | 18.x     | Composer UI with real-time feedback panel      |
| **Frontend**       | TypeScript         | 5.x      | Type safety in UI code                         |
| **Frontend**       | Socket.IO Client   | 4.x      | WebSocket connection to backend                |
| **Backend**        | Node.js            | 18.x LTS | Runtime                                        |
| **Backend**        | Express.js         | 4.x      | HTTP API framework                             |
| **Backend**        | Socket.IO          | 4.x      | WebSocket server for real-time updates         |
| **Backend**        | TypeScript         | 5.x      | Type safety in server code                     |
| **AI Service**     | OpenAI API         | GPT-4    | Claims and evidence extraction                 |
| **Database**       | PostgreSQL         | 14+      | Draft storage and feedback logs                |
| **Cache**          | Redis              | 7.x      | Feedback result caching (1h TTL)               |
| **NLP**            | natural/compromise | Latest   | Local sentence parsing, n-gram analysis        |
| **Graph Analysis** | dependency-graph   | Latest   | Build argument relationship graph              |
| **Testing**        | Jest               | 29.x     | Unit and integration tests                     |
| **Async Tasks**    | Bull               | 4.x      | Background job processing for offline analysis |

---

## APIs

### Public REST Endpoints

#### 1. Analyze Draft for Feedback

```http
POST /api/v1/composer/draft-feedback
Authorization: Bearer {jwt_token}
```

**Request Body**:

```json
{
  "draftText": "I think climate change is real because all scientists agree on it. Plus, I already said this before, so this is another point you're missing.",
  "contextId": "t98765",
  "contextType": "thread"
}
```

**Response** (200 OK):

```json
{
  "issues": [
    {
      "type": "circular_logic",
      "position": {
        "start": 95,
        "end": 120
      },
      "lineNumber": 2,
      "flaggedText": "I already said this before",
      "explanation": "This argument repeats a point made earlier in the draft (see line 1).",
      "severity": "medium",
      "confidence": 0.82
    },
    {
      "type": "weak_evidence",
      "position": {
        "start": 30,
        "end": 55
      },
      "lineNumber": 1,
      "flaggedText": "all scientists agree on it",
      "explanation": "While commonly stated, be specific: cite IPCC reports, specific studies, or add 'consensus figure (97%)'.",
      "severity": "low",
      "confidence": 0.76
    }
  ],
  "score": 0.62,
  "suggestions": [
    "Add a specific citation (e.g., 'IPCC 6th Assessment' or link to meta-analysis)",
    "Remove repeated argument or expand it with new evidence",
    "Consider addressing the strongest counterargument in the opposing thread"
  ],
  "goodPoints": [
    "Clear assertion of main position",
    "Attempts to provide evidence (even if general)"
  ],
  "confidence": 0.79,
  "generatedAt": "2026-02-11T15:45:00Z"
}
```

**Error Responses**:

- `400 Bad Request`: Empty or invalid draftText
- `401 Unauthorized`: Missing or invalid JWT token
- `429 Too Many Requests`: Rate limit exceeded (100 req/min per user)
- `500 Internal Server Error`: Analysis failure

#### 2. Get Feedback History for User

```http
GET /api/v1/composer/draft-feedback/history
Authorization: Bearer {jwt_token}
```

**Query Parameters**:

- `limit` (optional, integer): Max results to return (default 20)
- `offset` (optional, integer): Pagination offset (default 0)

**Response** (200 OK):

```json
{
  "feedbacks": [
    {
      "id": "fb_abc123",
      "draftText": "...",
      "score": 0.72,
      "issues": [...],
      "createdAt": "2026-02-11T15:45:00Z"
    }
  ],
  "total": 147,
  "limit": 20,
  "offset": 0
}
```

#### 3. Save Draft (Optional)

```http
POST /api/v1/composer/drafts
Authorization: Bearer {jwt_token}
```

**Request Body**:

```json
{
  "text": "Draft comment text...",
  "contextId": "t98765",
  "contextType": "thread"
}
```

**Response** (201 Created):

```json
{
  "id": "draft_xyz789",
  "text": "Draft comment text...",
  "contextId": "t98765",
  "createdAt": "2026-02-11T15:45:00Z",
  "expiresAt": "2026-03-13T15:45:00Z"
}
```

---

## WebSocket Events

### Client → Server

```typescript
// Analyze draft in real-time
socket.emit('draft:analyze', {
  draftText: string,
  contextId: string,
  contextType: 'thread' | 'comment'
});

// Save draft to server
socket.emit('draft:save', {
  id?: string,
  text: string,
  contextId: string
});
```

### Server → Client

```typescript
// Feedback results
socket.on('feedback:result', (data: {
  feedbackId: string,
  issues: Issue[],
  score: number,
  suggestions: string[],
  goodPoints: string[]
}));

// Feedback error
socket.on('feedback:error', (data: {
  message: string,
  code: string
}));

// Draft saved
socket.on('draft:saved', (data: {
  id: string,
  createdAt: string,
  expiresAt: string
}));
```

---

## Public Interfaces

### Frontend Component Interfaces

```typescript
// ComposerWithFeedback Component
interface ComposerWithFeedbackProps {
  contextId: string;
  contextType: "thread" | "comment";
  onCommentSubmit: (text: string) => Promise<void>;
  onDraftSaved?: (draftId: string) => void;
  theme?: "light" | "dark";
}

// FeedbackResult DTO
interface FeedbackResult {
  issues: WritingIssue[];
  score: number; // 0 to 1
  suggestions: string[];
  goodPoints: string[];
  confidence: number; // 0 to 1
  generatedAt: Date;
}

interface WritingIssue {
  type:
    | "circular_logic"
    | "weak_evidence"
    | "unsupported_claim"
    | "logical_fallacy";
  position: { start: number; end: number };
  lineNumber: number;
  flaggedText: string;
  explanation: string;
  severity: "low" | "medium" | "high";
  confidence: number; // 0 to 1
}
```

### Backend Service Interfaces

```typescript
interface IWritingFeedbackService {
  analyzeDraft(text: string, context: AnalysisContext): Promise<FeedbackResult>;
  detectCircularLogic(text: string): Promise<WritingIssue[]>;
  detectWeakEvidence(text: string): Promise<WritingIssue[]>;
  detectUnsupportedClaims(text: string): Promise<WritingIssue[]>;
}

interface ICircularLogicDetector {
  detect(text: string): Promise<WritingIssue[]>;
  buildArgumentGraph(text: string): Promise<Graph>;
  findRepeatedArguments(sentences: string[]): Promise<Repetition[]>;
}

interface IWeakEvidenceDetector {
  detect(text: string): Promise<WritingIssue[]>;
  extractCitations(text: string): Promise<Citation[]>;
  scoreCitation(citation: Citation): Promise<number>;
}

interface IUnsupportedClaimsDetector {
  detect(text: string): Promise<WritingIssue[]>;
  validateClaims(claims: Claim[]): Promise<ClaimValidation[]>;
  checkLogicalFallacies(text: string): Promise<Fallacy[]>;
}
```

---

## Data Schemas

### PostgreSQL Tables

#### `drafts` Table

```sql
CREATE TABLE drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  context_id VARCHAR(255) NOT NULL,
  context_type VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  last_analyzed_at TIMESTAMP,
  last_feedback JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_drafts_user_id ON drafts(user_id);
CREATE INDEX idx_drafts_expires_at ON drafts(expires_at);
CREATE INDEX idx_drafts_context ON drafts(context_id, context_type);
```

#### `feedback_logs` Table

```sql
CREATE TABLE feedback_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  draft_id UUID,
  draft_text TEXT NOT NULL,
  issues JSONB NOT NULL,
  score NUMERIC(3, 2) CHECK (score >= 0 AND score <= 1),
  suggestions TEXT[],
  confidence NUMERIC(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
);

CREATE INDEX idx_feedback_user_id ON feedback_logs(user_id);
CREATE INDEX idx_feedback_draft_id ON feedback_logs(draft_id);
CREATE INDEX idx_feedback_created_at ON feedback_logs(created_at);
```

### Redis Key Structure

```
draft_feedback:{draftHash} -> FeedbackResult JSON object
TTL: 3600 seconds (1 hour)

Example key: draft_feedback:abc123def456
{
  "issues": [...],
  "score": 0.72,
  "suggestions": [...],
  "goodPoints": [...],
  "confidence": 0.85,
  "generatedAt": "2026-02-11T15:45:00Z"
}
```

---

## Security and Privacy

### Data Protection

- **In Transit**: All connections use HTTPS/TLS 1.3 and secure WebSocket (WSS)
- **At Rest**: PostgreSQL data encrypted at storage level
- **AI Service**: Draft text sent to OpenAI under enterprise DPA
- **Cache**: Redis instance in private VPC, no public access

### Authentication & Authorization

- **Authentication**: JWT token required for all endpoints
- **Authorization**: Users can only analyze their own drafts
- **Rate Limiting**: 100 analysis requests per minute per user
- **Session Validation**: Verify token on WebSocket upgrade

### Privacy Considerations

1. **Draft Data**: Stored temporarily, auto-deleted after 30 days
2. **Feedback History**: Kept for 90 days for user reference
3. **AI Processing**: Anonymize user identity before sending to OpenAI if possible
4. **Opt-out**: Users can disable real-time feedback via settings
5. **User Consent**: Display notice that drafts are processed by 3rd-party AI

### Access Control

- **Data Isolation**: Each user can only see their own drafts/feedback
- **Moderator Access**: Moderators cannot view user drafts
- **User Deletion**: Implement GDPR right-to-be-forgotten for drafts

### Compliance

- **GDPR**: Support deletion of draft history on request
- **CCPA**: Minimal retention (30 days), user control over data
- **AI Transparency**: Clearly indicate feedback is "AI-generated" in UI
- **Security**: Regular security audits, dependency scanning

---

## Risks to Completion

1. **Real-Time Latency Requirements**: Users expect <1 second feedback
   - _Mitigation_: Aggressive caching, pre-compute on frequent patterns, debounce at 500ms

2. **WebSocket Scalability**: Maintaining thousands of concurrent connections
   - _Mitigation_: Use Socket.IO with Redis adapter, horizontal scaling

3. **AI Inference Cost**: Analyzing every keystroke is expensive
   - _Mitigation_: Debounce, cache results, background analysis for long drafts

4. **Circular Logic Detection Accuracy**: Complex task for LLM
   - _Mitigation_: Focus on obvious n-gram repetition first, use heuristics, iterate

5. **False Positive Feedback**: Incorrect flags reduce user trust
   - _Mitigation_: Conservative thresholds, allow user override, collect feedback

6. **Integration with Existing UI**: Composer widget already exists
   - _Mitigation_: Design as wrapper component, minimal changes to existing code

7. **Privacy Concerns**: Sending draft text to OpenAI
   - _Mitigation_: Clear user consent, enterprise DPA, offer local analysis option

8. **Dependency on AIAnalysisService**: Shared with US1/US2
   - _Mitigation_: Test integration thoroughly, design fallback for service failure

9. **User Cognitive Overload**: Too much feedback overwhelming
   - _Mitigation_: Limit to top 3 issues, group by category, progressive disclosure

10. **Draft Storage Complexity**: Managing draft lifecycle and cleanup
    - _Mitigation_: Database triggers for auto-delete, cache invalidation on edit
