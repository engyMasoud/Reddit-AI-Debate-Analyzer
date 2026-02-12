# Development Specification: US1 - Inline AI Reasoning Summary

## Overview
This document specifies the development of the Inline AI Reasoning Summary feature for new users, enabling quick understanding of comment quality through AI-generated reasoning summaries displayed inline next to each comment.

**User Story**: As a new user, I want an inline AI summary of a comment's reasoning so that I can quickly understand its main claims and supporting evidence.

**T-Shirt Size**: Small

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Reddit Clone UI - Comment Display Component            │   │
│  │  - Comment Text                                          │   │
│  │  - ▼ [Show AI Summary] (Expandable)                     │   │
│  │  - AI Summary Panel (1-2 sentences)                     │   │
│  └────────────────┬─────────────────────────────────────────┘   │
└─────────────────┼──────────────────────────────────────────────┘
                  │ HTTP/REST
                  │ GET /api/v1/comments/{commentId}/reasoning-summary
                  │ Response: { summary, claim, evidence, coherence }
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Backend Server (Node.js)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  API Routes Layer                                          │  │
│  │  - GET /api/v1/comments/{commentId}/reasoning-summary     │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │                                               │
│  ┌────────────────▼───────────────────────────────────────────┐  │
│  │  AI Analysis Service                                       │  │
│  │  - parseCommentText()                                      │  │
│  │  - extractClaims()                                         │  │
│  │  - extractEvidence()                                       │  │
│  │  - evaluateCoherence()                                     │  │
│  │  - generateSummary()                                       │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │                                               │
│  ┌────────────────┼──────────────────────────────────────────┐   │
│  │  Data Access Layer                                         │   │
│  │  - commentRepository.getById()                             │   │
│  │  - reasoningSummaryCache.get/set()                         │   │
│  └────────────────┬──────────────┬────────────────────────────┘   │
└─────────────────┼──────────────┼─────────────────────────────────┘
                  │              │
    ┌─────────────▼────────┐     │
    │  PostgreSQL DB       │     │
    │  - comments table    │     │
    │  - summaries table   │     │
    └──────────────────────┘     │
                          ┌──────▼──────────────┐
                          │  Redis Cache        │
                          │  - summary_cache    │
                          │  - key: commentId   │
                          └─────────────────────┘
```

**Component Locations**:
- **Client**: Browser-based React component
- **API Server**: Node.js/Express backend (AWS EC2 or similar)
- **Database**: PostgreSQL (primary data store)
- **Cache**: Redis (in-memory summaries cache)

**Information Flows**:
1. User clicks "Show AI Summary" on comment
2. Client sends GET request to API with `commentId`
3. API checks Redis cache first
4. If cache miss, API retrieves comment from PostgreSQL
5. AI Analysis Service processes comment text
6. Summary is cached in Redis for subsequent requests
7. Response returned to client and displayed

---

## Class Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ReasoningSummaryService                       │
├─────────────────────────────────────────────────────────────────┤
│ - aiAnalysisService: AIAnalysisService                          │
│ - cacheService: CacheService                                    │
│ - commentRepository: CommentRepository                          │
├─────────────────────────────────────────────────────────────────┤
│ + getSummary(commentId: string): Promise<ReasoningSummary>      │
│ + generateAndCacheSummary(comment: Comment): Promise<void>      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                 ┌─────────┴────────┐
                 │                  │
┌────────────────▼──────────────┐  ┌▼──────────────────────────────┐
│    AIAnalysisService          │  │   CacheService               │
├───────────────────────────────┤  ├──────────────────────────────┤
│ - openaiClient: OpenAI        │  │ - redisClient: Redis         │
│ - nlpProcessor: NLPProcessor  │  ├──────────────────────────────┤
├───────────────────────────────┤  │ + get(key: string): object   │
│ + extractClaims(text): Claim[]│  │ + set(key: string, value):   │
│ + extractEvidence(text):      │  │   Promise<void>              │
│   EvidenceBlock[]             │  │ + delete(key: string):       │
│ + evaluateCoherence(claims,   │  │   Promise<void>              │
│   evidence): number           │  │ + exists(key: string): bool  │
│ + generateSummary(analysis):  │  └──────────────────────────────┘
│   string                      │
└────────────────┬─────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                  ReasoningSummary (DTO)                          │
├─────────────────────────────────────────────────────────────────┤
│ - commentId: string                                              │
│ - summary: string                                                │
│ - primaryClaim: string                                           │
│ - evidenceBlocks: EvidenceBlock[]                               │
│ - coherenceScore: number (0-1)                                  │
│ - generatedAt: Date                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## List of Classes

| Class Name | Package | Responsibility |
|-----------|---------|-----------------|
| `ReasoningSummaryService` | services | Orchestrates summary generation and retrieval |
| `ReasoningSummaryController` | controllers | HTTP request handler for summary endpoints |
| `AIAnalysisService` | services | AI-powered text analysis (claims, evidence, coherence) |
| `CacheService` | services | Redis cache management |
| `CommentRepository` | repositories | Database access for comments |
| `ReasoningSummaryRepository` | repositories | Database access for cached summaries |
| `ReasoningSummary` | models/dtos | Data Transfer Object for summary response |
| `Claim` | models | Represents extracted claim from text |
| `EvidenceBlock` | models | Represents piece of evidence supporting a claim |
| `NLPProcessor` | utils | Natural Language Processing utilities |
| `CommentValidator` | utils | Validation for comment text input |

---

## State Diagrams

### Summary Generation State Machine

```
┌─────────────┐
│   Idle      │
└──────┬──────┘
       │ GET /comments/{id}/reasoning-summary
       ▼
┌──────────────────┐
│  Checking Cache  │
└──────┬───────────┘
       │
       ├─ (Cache Hit) ──────────────────────────┐
       │                                         │
       └─ (Cache Miss) ──────────────┐          │
                                     │          │
                         ┌───────────▼──────┐   │
                         │ Fetching Comment │   │
                         └───────────┬──────┘   │
                                     │          │
                         ┌───────────▼──────┐   │
                         │  Analyzing Text  │   │
                         │  - Extract Claims│   │
                         │  - Extract Evid. │   │
                         │  - Score Cohere. │   │
                         └───────────┬──────┘   │
                                     │          │
                         ┌───────────▼──────┐   │
                         │ Generating Summary   │
                         └───────────┬──────┘   │
                                     │          │
                         ┌───────────▼──────┐   │
                         │  Caching Summary │   │
                         └───────────┬──────┘   │
                                     │          │
       ┌─────────────────────────────┘          │
       │                                         │
       └────────────┬──────────────────────────┘
                    │
       ┌────────────▼──────────┐
       │ Returning Response    │
       └────────────┬──────────┘
                    │
       ┌────────────▼──────────┐
       │ Idle                  │
       └───────────────────────┘
```

---

## Flow Chart

```
START
  │
  ▼
User Clicks "Show AI Summary"
  │
  ▼
Client Sends: GET /api/v1/comments/{commentId}/reasoning-summary
  │
  ▼
┌─────────────────────────────┐
│ Check Redis Cache           │
│ Key: "summary:{commentId}"  │
└──────┬──────────────────────┘
       │
       ├─ [Cache Hit] ─────────────────────────────┐
       │                                            │
       └─ [Cache Miss] ──────────┐                 │
                                 │                 │
                      ┌──────────▼─────────────┐   │
                      │ Query PostgreSQL       │   │
                      │ Get comment by ID      │   │
                      └──────────┬─────────────┘   │
                                 │                 │
                      ┌──────────▼─────────────┐   │
                      │ Call OpenAI API*       │   │
                      │ Prompt: Analyze        │   │
                      │ - main claim           │   │
                      │ - evidence             │   │
                      │ - reasoning quality    │   │
                      └──────────┬─────────────┘   │
                                 │                 │
                      ┌──────────▼─────────────┐   │
                      │ Structure Response     │   │
                      │ as ReasoningSummary DTO   │
                      └──────────┬─────────────┘   │
                                 │                 │
                      ┌──────────▼─────────────┐   │
                      │ Cache Result in Redis  │   │
                      │ TTL: 24 hours          │   │
                      └──────────┬─────────────┘   │
                                 │                 │
       ┌─────────────────────────┘                 │
       │                                            │
       ├──────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Return JSON Response:        │
│ {                            │
│   summary: string,           │
│   primaryClaim: string,      │
│   evidenceBlocks: [...],     │
│   coherenceScore: 0.85       │
│ }                            │
└──────────┬───────────────────┘
           │
           ▼
Client Displays Summary
Panel Below Comment
           │
           ▼
         END

* Note: Initial implementation uses OpenAI API;
  can be replaced with on-premise model later
```

---

## Development Risks and Failures

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **API Rate Limiting** | High | Service delays if OpenAI API limits hit | Implement request queuing, cache aggressively, monitor usage |
| **AI Summary Quality** | Medium | Poor summaries confuse users | Extensive prompt engineering, user feedback loop, A/B testing |
| **Cache Staleness** | Low | Edited comments show old summaries | Set reasonable TTL (24h), invalidate on comment edit |
| **Latency on First Load** | High | Slow response time impacts UX | Cache warming, background job processing, optimize AI prompts |
| **Data Privacy** | Medium | Comments sent to 3rd-party AI service | Use OpenAI enterprise agreement, anonymize if possible, encryption in transit |
| **Dependency on OpenAI** | Medium | Service unavailable if OpenAI down | Graceful degradation, fallback handler, monitoring/alerting |
| **Scalability** | Medium | High traffic overwhelms Redis/DB | Horizontal scaling plan, read replicas, consider distributed cache |
| **Coherence Score Accuracy** | Medium | Misleading quality scores | Validate with domain experts, collect user feedback, iterate |

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.x | UI component for summary display |
| **Frontend** | TypeScript | 5.x | Type safety in client code |
| **Backend** | Node.js | 18.x LTS | Runtime environment |
| **Backend** | Express.js | 4.x | HTTP API framework |
| **Backend** | TypeScript | 5.x | Type safety in server code |
| **AI Service** | OpenAI API | GPT-4 | Text analysis and summary generation |
| **Database** | PostgreSQL | 14+ | Primary data store for comments/summaries |
| **Cache** | Redis | 7.x | In-memory cache for summaries |
| **NLP** | natural/compromise | Latest | Optional local NLP fallback |
| **Testing** | Jest | 29.x | Unit and integration testing |
| **Async** | Bull | 4.x | Job queue for background summary generation |

---

## APIs

### Public REST Endpoints

#### 1. Get Reasoning Summary
```http
GET /api/v1/comments/{commentId}/reasoning-summary
Authorization: Bearer {jwt_token}
```

**Query Parameters**:
- None

**Response** (200 OK):
```json
{
  "commentId": "c12345",
  "summary": "User claims climate change is driven by human activity, citing peer-reviewed studies on CO2 emission trends.",
  "primaryClaim": "Human activity is the primary driver of climate change",
  "evidenceBlocks": [
    {
      "type": "study",
      "content": "peer-reviewed studies on CO2 emission trends",
      "strength": "high"
    }
  ],
  "coherenceScore": 0.87,
  "generatedAt": "2026-02-11T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid commentId format
- `404 Not Found`: Comment does not exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing error

---

## Public Interfaces

### Frontend Component Interfaces

```typescript
// ReasoningSummaryPanel Component
interface ReasoningSummaryPanelProps {
  commentId: string;
  isExpanded?: boolean;
  onSummaryLoaded?: (summary: ReasoningSummary) => void;
  theme?: 'light' | 'dark';
}

// ReasoningSummary DTO
interface ReasoningSummary {
  commentId: string;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: EvidenceBlock[];
  coherenceScore: number; // 0 to 1
  generatedAt: Date;
}

interface EvidenceBlock {
  type: 'study' | 'data' | 'anecdote' | 'authority' | 'other';
  content: string;
  strength: 'high' | 'medium' | 'low';
}
```

### Backend Service Interfaces

```typescript
interface IReasoningSummaryService {
  getSummary(commentId: string): Promise<ReasoningSummary>;
  generateAndCacheSummary(comment: Comment): Promise<void>;
  invalidateCache(commentId: string): Promise<void>;
}

interface IAIAnalysisService {
  extractClaims(text: string): Promise<Claim[]>;
  extractEvidence(text: string): Promise<EvidenceBlock[]>;
  evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise<number>;
  generateSummary(analysis: AnalysisResult): Promise<string>;
}
```

---

## Data Schemas

### PostgreSQL Tables

#### `reasoning_summaries` Table
```sql
CREATE TABLE reasoning_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id VARCHAR(255) NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  primary_claim TEXT NOT NULL,
  evidence_blocks JSONB NOT NULL,
  coherence_score NUMERIC(3, 2) CHECK (coherence_score >= 0 AND coherence_score <= 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_reasoning_comment_id ON reasoning_summaries(comment_id);
CREATE INDEX idx_reasoning_expires_at ON reasoning_summaries(expires_at);
```

#### `evidence_blocks` Table (Denormalized in JSONB for this feature; alternative normalized structure)
```sql
CREATE TABLE evidence_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  strength VARCHAR(20) NOT NULL,
  FOREIGN KEY (summary_id) REFERENCES reasoning_summaries(id) ON DELETE CASCADE
);
```

### Redis Key Structure
```
reasoning_summary:{commentId} -> ReasoningSummary JSON object
TTL: 86400 seconds (24 hours)

Example key: reasoning_summary:c12345
{
  "commentId": "c12345",
  "summary": "...",
  "primaryClaim": "...",
  "evidenceBlocks": [...],
  "coherenceScore": 0.87,
  "generatedAt": "2026-02-11T10:30:00Z"
}
```

---

## Security and Privacy

### Data Protection
- **In Transit**: All API calls use HTTPS/TLS 1.3
- **At Rest**: PostgreSQL data encrypted at storage level
- **AI Service**: Comments sent to OpenAI under enterprise agreement with data processing addendum (DPA)
- **Cache**: Redis instance runs in private VPC, no public access

### Privacy Considerations
1. **Anonymization**: Remove personally identifiable information (PII) before sending to OpenAI if possible
2. **User Consent**: Display notice that comment text is processed by AI third-party service
3. **Data Retention**: Delete cached summaries after 24-hour TTL, purge from DB after 30 days if unused
4. **Access Control**: API endpoints require valid user session (JWT token validation)

### Authentication & Authorization
- **Authentication**: JWT token required for API access
- **Authorization**: Only comment author or moderator can request summary (optional restriction based on product decision)
- **Rate Limiting**: 100 requests per minute per user to prevent abuse

### Compliance
- **GDPR**: Support right-to-be-forgotten with comment deletion
- **CCPA**: Data retention policy complies with minimum necessary principle
- **AI Transparency**: Clear disclosure that summaries are AI-generated

---

## Risks to Completion

1. **OpenAI API Costs**: Scaling to millions of comments could be expensive
   - *Mitigation*: Implement aggressive caching (24h TTL), batch process during off-peak hours

2. **Prompt Engineering Quality**: LLM may need many iterations to produce useful summaries
   - *Mitigation*: Allocate time for A/B testing, collect user feedback early

3. **Integration with Existing Comment System**: May require DB schema changes
   - *Mitigation*: Plan schema migration carefully, test with data backup

4. **Real-time Performance**: Summary generation adds latency to comment loading
   - *Mitigation*: Background job processing, show "loading" state, pre-generate for popular comments

5. **Maintaining Consistency**: Cache invalidation is complex
   - *Mitigation*: Clear TTL strategy, event-driven invalidation on comment edit

6. **Evaluation Metrics**: Difficult to measure summary quality objectively
   - *Mitigation*: User satisfaction surveys, benchmark against human reviewers
