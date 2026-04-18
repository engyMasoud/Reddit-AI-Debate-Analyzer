# Development Specification: US2 - Moderator Debate Summaries

## Overview

This document specifies the development of the Moderator Debate Summaries feature, enabling moderators to review thread-level debate quality and key positions at a glance for content triage and promotion decisions.

**User Story**: As a moderator, I want thread-level debate summaries that outline main positions and the strongest reasoning on each side so that I can triage discussions for quality and policy concerns.

**T-Shirt Size**: Medium

Rationale: This option is devoted to the moderators that require the systematized understanding of the quality of the discussion on several threads. Although User Story 1 enhances the personal user experience, the functional aspect promotes governance and monitoring at the platform level. It assists the moderators in discovering patterns of reasoning quality and repetition as well as the general patterns of engagement.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Moderator Dashboard (Browser)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Thread View - Moderator Panel                           │   │
│  │  ┌─ Thread Debate Summary Widget                         │   │
│  │  │ - Main Positions (Key perspectives)                   │   │
│  │  │ - Evidence Anchors (Top evidence per position)        │   │
│  │  │ - Quality Score (Debate quality metric)               │   │
│  │  │ - Disagreement Areas (Where positions diverge)        │   │
│  │  │ ▼ [Regenerate Summary] [Export Summary] [View Full]   │   │
│  │  └──────────────────────────────────────────────────────┘   │
│  └────────────────┬─────────────────────────────────────────────┘
└─────────────────┼──────────────────────────────────────────────┘
                  │ HTTP/REST
                  │ GET /api/v1/threads/{threadId}/debate-summary
                  │ POST /api/v1/threads/{threadId}/debate-summary/regenerate
                  │ Response: { positions, evidenceAnchors, qualityScore, ... }
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Backend Server (Node.js)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  API Routes Layer                                          │  │
│  │  - GET /api/v1/threads/{threadId}/debate-summary         │  │
│  │  - POST /api/v1/threads/{threadId}/debate-summary/reg.   │  │
│  │  - DELETE /api/v1/threads/{threadId}/debate-summary      │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │                                               │
│  ┌────────────────▼───────────────────────────────────────────┐  │
│  │  Thread Analysis Service                                   │  │
│  │  - fetchThreadComments()                                   │  │
│  │  - clusterPositions()                                      │  │
│  │  - extractKeyEvidence()                                    │  │
│  │  - identifyDisagreements()                                 │  │
│  │  - scoreDebateQuality()                                    │  │
│  │  - generateThreadSummary()                                 │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │ Uses: AIAnalysisService (shared with US1)    │
│  ┌────────────────▼───────────────────────────────────────────┐  │
│  │  Data Access Layer                                         │  │
│  │  - threadRepository.getById()                              │  │
│  │  - commentRepository.getByThreadId()                       │  │
│  │  - debateSummaryCache.get/set()                            │  │
│  │  - debateSummaryRepository.save/update()                   │  │
│  └────────────────┬──────────────┬────────────────────────────┘  │
└─────────────────┼──────────────┼─────────────────────────────────┘
                  │              │
    ┌─────────────▼────────┐     │
    │  PostgreSQL DB       │     │
    │  - threads table     │     │
    │  - comments table    │     │
    │  - debate_summaries  │     │
    │  - positions table   │     │
    └──────────────────────┘     │
                          ┌──────▼──────────────┐
                          │  Redis Cache        │
                          │  - debate_summary   │
                          │  - key: threadId    │
                          │  - TTL: 48 hours    │
                          └─────────────────────┘
```

**Component Locations**:

- **Client**: Browser-based React dashboard for moderators
- **API Server**: Node.js/Express backend (AWS EC2 or similar)
- **Database**: PostgreSQL (primary data store for threads, comments, summaries)
- **Cache**: Redis (in-memory thread summaries cache, longer TTL than US1)

**Information Flows**:

1. Moderator navigates to thread and clicks "View Debate Summary"
2. Client sends GET request to API with `threadId`
3. API checks Redis cache first
4. If cache miss, API retrieves all comments for thread from PostgreSQL
5. Thread Analysis Service processes all comments together
6. Positions are clustered, evidence extracted, quality scored
7. PositionMapper transforms database relations (many-to-many position_opponents table) into flat DTO arrays (opponents: ["p1", "p2"])
8. Summary is cached in Redis for 48 hours
9. Response returned to client and displayed in moderator panel

Rationale: This architecture is based on the backend and database of Development Specification 1. An independent Analytics Service will make certain that the logic of aggregation is independent of the logic of AI generation.

---

## Class Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  DebateSummaryController                          │
├──────────────────────────────────────────────────────────────────┤
│ - threadAnalysisService: ThreadAnalysisService                  │
├──────────────────────────────────────────────────────────────────┤
│ + GET /threads/{id}/debate-summary(req): Promise<Response>       │
│ + POST /threads/{id}/debate-summary/regenerate(req): Prom<Resp> │
└────────────────┬─────────────────────────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│                    ThreadAnalysisService                       │
├──────────────────────────────────────────────────────────────┤
│ - commentRepository: CommentRepository                        │
│ - threadRepository: ThreadRepository                          │
│ - debateSummaryRepository: DebateSummaryRepository            │
│ - aiAnalysisService: AIAnalysisService (shared)              │
│ - cacheService: CacheService (shared)                        │
│ - positionClusterer: PositionClusterer                       │
│ - evidenceExtractor: EvidenceExtractor                       │
│ - disagreementAnalyzer: DisagreementAnalyzer                 │
│ - debateQualityScorer: DebateQualityScorer                   │
│ - positionMapper: PositionMapper                             │
├──────────────────────────────────────────────────────────────┤
│ + getDebateSummary(threadId): Promise<DebateSummary>         │
│ + generateThreadSummary(thread): Promise<void>               │
│ + invalidateCache(threadId): Promise<void>                   │
└──────────┬──────────┬──────────┬──────────┬──────────────────┘
           │          │          │          │
      ┌────▼───┐  ┌───▼────┐ ┌──▼────┐ ┌──▼─────────┐  ┌─────────────┐
      │Position│  │Evidence│ │Disagr.│ │DebateQuali│  │PositionMapp│
      │Cluster.│  │Extract.│ │Analyzer│ │Scorer     │  │er           │
      ├────────┤  ├────────┤ ├───────┤ ├───────────┤  ├─────────────┤
      │-simThr │  │-aiAnal │ │-aiAnal│ │-avgCohere.│  │+ mapPositio│
      ├────────┤  │Service │ │Service│ ├───────────┤  │  nsToDTO():│
      │+cluster│  ├────────┤ ├───────┤ │+scoreQuali│  │  DTO[]      │
      │Positns │  │+extract│ │+identif│ │ty()       │  │+ mapEviden│
      │+calcSim│  │KeyEvid.│ │Disagr.│ │           │  │ceToDTO():  │
      │ilarity │  │+rankEvd│ │+findKey│ │           │  │DTO[]       │
      └────┬───┘  └────┬───┘ │Conflicts│ └────┬──────┘  └────┬──────┘
           │           │     └───┬─────┘      │             │
           │           │         │            └─────┬───────┘
           └─────────┬─┴─────────┘                  │
                     │
    ┌────────────────▼──────────────────────────┐
    │        DebateSummary (DTO)                 │
    ├──────────────────────────────────────────┤
    │ - threadId: string                        │
    │ - title: string                           │
    │ - positions: Position[]                   │
    │ - evidenceAnchors: EvidenceAnchor[]       │
    │ - disagreementAreas: DisagreementArea[]   │
    │ - qualityScore: number (0-1)              │
    │ - topCommentIds: string[]                 │
    │ - generatedAt: Date                       │
    └────────┬──────────┬───────────┬──────────┘
             │          │           │
       ┌─────▼──┐  ┌────▼──────┐ ┌─▼──────────────┐
       │Position │  │EvidAnchor │ │DisagreementArea│
       ├────────┤  ├───────────┤ ├────────────────┤
       │-id     │  │-id        │ │-position1Id    │
       │-label  │  │-positionId│ │-position2Id    │
       │-claim  │  │-content   │ │-topic          │
       │-support│  │-strength  │ │-description    │
       │-opponents│ │-sources   │ │-importanceScore│
       └────┬───┘  │-comtCount │ └────────────────┘
            │      └───────────┘
            │
    ┌───────┴──────────┬──────────────┬──────────────┐
    │ThreadRepository  │CommentRepos. │DebateSummRepo│
    ├─────────────────┤──────────────┤──────────────┤
    │+ getById(id):   │+ getById(id):│+ save(summ):│
    │  Promise<Thread>│  Prom<Comment>│ Prom<void> │
    │+ save(thread):  │+ getByThread │+ update(sum)│
    │  Promise<void>  │  Id(id): Prom│: Prom<void> │
    └─────────────────┴──────────────┴──────────────┘
```
Rationale: The MetricsCalculator separates the logic of computation of averages and level of engagement. This is a separation which enhances maintainability and lessens coupling.

---

## List of Classes

| Class Name                | Package      | Responsibility                                                   |
| ------------------------- | ------------ | ---------------------------------------------------------------- |
| `ThreadAnalysisService`   | services     | Orchestrates thread-level debate analysis and summary generation |
| `DebateSummaryController` | controllers  | HTTP endpoint handler for debate summary requests                |
| `PositionClusterer`       | services     | Groups similar claims/arguments into distinct positions          |
| `EvidenceExtractor`       | services     | Identifies and ranks supporting evidence per position            |
| `DisagreementAnalyzer`    | services     | Identifies where positions fundamentally disagree                |
| `DebateQualityScorer`     | services     | Computes overall debate quality metric                           |
| `PositionMapper`          | services     | Transforms database relations to DTOs (many-to-many to arrays)   |
| `AIAnalysisService`       | services     | Shared AI service for claims/evidence extraction (from US1)      |
| `CacheService`            | services     | Shared Redis cache management (from US1)                         |
| `DebateSummary`           | models/dtos  | Data Transfer Object for thread summary response                 |
| `Position`                | models       | Represents a distinct perspective in the debate                  |
| `EvidenceAnchor`          | models       | Linked evidence supporting a specific position                   |
| `DisagreementArea`        | models       | Identifies key points of disagreement between positions          |
| `ThreadRepository`        | repositories | Database access for thread metadata                              |
| `CommentRepository`       | repositories | Database access for thread comments                              |
| `DebateSummaryRepository` | repositories | Database access for cached debate summaries                      |

Rationale: Stated classes eliminate diagram-implementation discrepancies.

---

## State Diagrams

### Thread Summary Generation State Machine

```
┌────────────────┐
│   Fetching     │
│   Comments     │
└────────┬───────┘
         │
         ▼
┌────────────────────────────────┐
│  Analyzing All Comments        │
│  - Extract claims from each    │
│  - Extract evidence from each  │
│  - Score reasoning quality     │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Clustering Positions          │
│  - Group similar claims        │
│  - Calculate cluster centers   │
│  - Identify outlier arguments  │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Extracting Evidence Anchors   │
│  - Per position:               │
│    * Identify strongest        │
│      evidence pieces           │
│    * Link to comments          │
│    * Rank by strength/count    │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Identifying Disagreements     │
│  - Compare position clusters   │
│  - Find fundamental conflicts  │
│  - Classify agreement types    │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Scoring Debate Quality        │
│  - Evidence availability       │
│  - Argument coherence avg      │
│  - Constructiveness metric     │
│  - Overall score (0-1)         │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Generating Summary Text       │
│  - Translate clusters to prose │
│  - List evidence anchors       │
│  - Summarize disagreement gaps │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Caching Result (Redis)        │
│  - 48 hour TTL                 │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Ready to Return to Client     │
└────────────────────────────────┘
```

Rationale: This ensures predictable UI transitions while data is being aggregated.

---

## Flow Chart

```
START
  │
  ▼
Moderator Clicks "View Debate Summary" on Thread
  │
  ▼
Client Sends: GET /api/v1/threads/{threadId}/debate-summary
  │
  ▼
┌──────────────────────────────┐
│ Check Redis Cache            │
│ Key: "debate_summary:{id}"   │
└──────┬───────────────────────┘
       │
       ├─ [Cache Hit] ─────────────────────┐
       │                                    │
       └─ [Cache Miss] ────────────┐        │
                                   │        │
                         ┌─────────▼──────┐ │
                         │ Query PostgreSQL  │
                         │ Get:              │
                         │ 1. Thread metadata│
                         │ 2. All comments   │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Call AI Service* │ │
                         │ For each comment:│ │
                         │ - Extract claims │ │
                         │ - Extract evid.  │ │
                         │ - Score coherence│ │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Position Clustering  │
                         │ - Similarity calc    │
                         │ - Group claims      │
                         │ - Create Position[] │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Evidence Extraction  │
                         │ - Per position:  │ │
                         │ - Best evidence  │ │
                         │ - Source links   │ │
                         │ - Rank by strength   │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Disagreement ID  │ │
                         │ - Compare positions  │
                         │ - Find key conflicts │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Quality Scoring  │ │
                         │ - Evidence count │ │
                         │ - Avg coherence  │ │
                         │ - Overall score  │ │
                         └─────────┬────────┘ │
                                   │          │
                         ┌─────────▼────────┐ │
                         │ Cache in Redis   │ │
                         │ TTL: 48 hours    │ │
                         └─────────┬────────┘ │
                                   │          │
       ┌───────────────────────────┘          │
       │                                      │
       └──────────────┬──────────────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Build DebateSummary DTO: │
         │ {                        │
         │   positions: [...],      │
         │   evidenceAnchors: [...],│
         │   disagreementAreas: [...],
         │   qualityScore: 0.72,    │
         │   topCommentIds: [...]   │
         │ }                        │
         └──────────┬───────────────┘
                    │
                    ▼
         Return JSON Response
                    │
                    ▼
         Client Displays Summary
         in Moderator Panel
                    │
                    ▼
                  END

* Note: Uses shared AIAnalysisService from US1;
  processes all comments in batch
```

Rationale: The flow emphasizes aggregation rather than AI processing

---

## Development Risks and Failures

| Risk                                   | Likelihood | Impact                                                | Mitigation                                                          |
| -------------------------------------- | ---------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| **Large Thread Performance**           | High       | Timeout on threads with 1000+ comments                | Process in batches, cache aggressively, consider async job queue    |
| **Position Clustering Accuracy**       | Medium     | Important positions missed or merged incorrectly      | Tune similarity threshold, test with diverse datasets               |
| **Evidence Validation**                | Medium     | False or weak evidence marked as strong               | Human review of top summaries, feedback loop                        |
| **Scalability of Position Clustering** | Medium     | O(n²) similarity calculations slow on large datasets  | Use approximate similarity, dimensionality reduction, caching       |
| **Lack of Domain Context**             | Medium     | AI misses nuanced disagreements in specialized topics | Allow manual position editing by moderators, domain expertise input |
| **Cache Invalidation**                 | Low        | Edited comments show stale analysis                   | Invalidate cache on comment edit/delete, 48h expiration anyway      |
| **Competing Summary Generations**      | Low        | Multiple regenerate requests cause duplicate work     | Implement generation lock/semaphore                                 |
| **Moderator Cognitive Overload**       | Medium     | Summary too complex or verbose                        | Limit to top 3-4 positions, keep text concise                       |
Rationale: Identifying these risks early helps constrain feature scope within a two-week sprint

---

## Technology Stack

| Layer             | Technology         | Version  | Purpose                        |
| ----------------- | ------------------ | -------- | ------------------------------ |
| **Frontend**      | React              | 18.x     | Moderator dashboard UI         |
| **Frontend**      | TypeScript         | 5.x      | Type safety                    |
| **Frontend**      | Material-UI        | 5.x      | Pre-built moderator components |
| **Backend**       | Node.js            | 18.x LTS | Runtime                        |
| **Backend**       | Express.js         | 4.x      | HTTP API framework             |
| **Backend**       | TypeScript         | 5.x      | Type safety                    |
| **AI Service**    | OpenAI API         | GPT-4    | Batch comment analysis         |
| **Database**      | PostgreSQL         | 14+      | Primary store                  |
| **Cache**         | Redis              | 7.x      | Summary cache (48h TTL)        |
| **ML/Clustering** | natural/compromise | Latest   | Position clustering algorithm  |
| **Job Queue**     | Bull               | 4.x      | Background summary generation  |
| **Testing**       | Jest               | 29.x     | Unit and integration tests     |

Rationale: Chart.js allows lightweight visualization without overcomplicating the frontend architecture.

---

## APIs

### Public REST Endpoints

#### 1. Get Thread Debate Summary

```http
GET /api/v1/threads/{threadId}/debate-summary
Authorization: Bearer {jwt_token}
```

**Query Parameters**:

- `includeCommentDetails` (optional, boolean): If true, include full comment text for each position

**Response** (200 OK):

```json
{
  "threadId": "t98765",
  "title": "Climate Change Accountability",
  "positions": [
    {
      "id": "p1",
      "label": "Human Activity Root Cause",
      "claim": "Human activity is the primary driver of climate change",
      "supportCount": 34,
      "opponents": ["p2"],
      "avgCoherenceScore": 0.82,
      "representativeCommentId": "c12345"
    },
    {
      "id": "p2",
      "label": "Natural Cycles Dominant",
      "claim": "Natural climate cycles are the dominant factor",
      "supportCount": 18,
      "opponents": ["p1"],
      "avgCoherenceScore": 0.69,
      "representativeCommentId": "c54321"
    }
  ],
  "evidenceAnchors": [
    {
      "id": "ea1",
      "positionId": "p1",
      "content": "IPCC 6th Assessment Report shows 97% scientific consensus",
      "strength": "high",
      "sources": ["IPCC", "Nature Climate Change"],
      "commentCount": 8
    },
    {
      "id": "ea2",
      "positionId": "p2",
      "content": "Milankovitch cycles explain past temperature variations",
      "strength": "medium",
      "sources": ["Solar Science", "Paleoclimatology"],
      "commentCount": 3
    }
  ],
  "disagreementAreas": [
    {
      "position1Id": "p1",
      "position2Id": "p2",
      "topic": "Causation Attribution",
      "description": "Debate centers on whether human factors are dominant or supplementary",
      "importanceScore": 0.95
    }
  ],
  "qualityScore": 0.76,
  "topCommentIds": ["c12345", "c54321", "c11111"],
  "generatedAt": "2026-02-11T14:30:00Z"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid threadId format
- `404 Not Found`: Thread does not exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing error

#### 2. Regenerate Thread Summary

```http
POST /api/v1/threads/{threadId}/debate-summary/regenerate
Authorization: Bearer {jwt_token}
```

**Request Body**:

```json
{
  "reason": "new comments added",
  "forceFullAnalysis": false
}
```

**Response** (202 Accepted):

```json
{
  "jobId": "job_abc123",
  "status": "queued",
  "message": "Summary regeneration queued. Check status with jobId.",
  "estimatedCompletion": "2026-02-11T14:35:00Z"
}
```

#### 3. Delete Cached Summary

```http
DELETE /api/v1/threads/{threadId}/debate-summary
Authorization: Bearer {jwt_token}
```

**Response** (200 OK):

```json
{
  "message": "Debate summary deleted successfully",
  "threadId": "t98765"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid threadId format
- `404 Not Found`: Summary does not exist
- `500 Internal Server Error`: Deletion failure

```http
DELETE /api/v1/threads/{threadId}/debate-summary
Authorization: Bearer {jwt_token}
```

**Response** (204 No Content)

Rationale: These RESTful endpoints allow scalable extension of analytics features.

---

## Public Interfaces

### Frontend Component Interfaces

```typescript
// DebateSummaryPanel Component
interface DebateSummaryPanelProps {
  threadId: string;
  isModeratorView: boolean;
  onSummaryLoaded?: (summary: DebateSummary) => void;
  refreshInterval?: number; // milliseconds
}

// DebateSummary DTO
interface DebateSummary {
  threadId: string;
  title: string;
  positions: Position[];
  evidenceAnchors: EvidenceAnchor[];
  disagreementAreas: DisagreementArea[];
  qualityScore: number; // 0 to 1
  topCommentIds: string[];
  generatedAt: Date;
}

interface Position {
  id: string;
  label: string;
  claim: string;
  supportCount: number;
  opponents: string[]; // position IDs
  avgCoherenceScore: number;
  representativeCommentId: string;
}

interface EvidenceAnchor {
  id: string;
  positionId: string;
  content: string;
  strength: "high" | "medium" | "low";
  sources: string[];
  commentCount: number;
}

interface DisagreementArea {
  position1Id: string;
  position2Id: string;
  topic: string;
  description: string;
  importanceScore: number; // 0 to 1
}
```

### Backend Service Interfaces

```typescript
interface IThreadAnalysisService {
  getDebateSummary(threadId: string): Promise<DebateSummary>;
  generateThreadSummary(thread: Thread): Promise<void>;
  invalidateCache(threadId: string): Promise<void>;
}

interface IPositionClusterer {
  clusterPositions(claims: Claim[]): Promise<Position[]>;
  calculateSimilarity(claim1: Claim, claim2: Claim): Promise<number>;
}

interface IEvidenceExtractor {
  extractKeyEvidence(
    positions: Position[],
    comments: Comment[],
  ): Promise<EvidenceAnchor[]>;
  rankEvidence(anchors: EvidenceAnchor[]): Promise<EvidenceAnchor[]>;
}

interface IDebateQualityScorer {
  scoreDebateQuality(summary: DebateSummary): Promise<number>;
  scorePosition(position: Position): Promise<number>;
}
```

Rationale: A structured JSON response ensures flexibility in UI rendering.

---

## Data Schemas

### PostgreSQL Tables

#### `debate_summaries` Table

```sql
CREATE TABLE debate_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id VARCHAR(255) NOT NULL UNIQUE,
  title TEXT,
  quality_score NUMERIC(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1),
  positions JSONB NOT NULL,
  evidence_anchors JSONB NOT NULL,
  disagreement_areas JSONB NOT NULL,
  top_comment_ids TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX idx_debate_thread_id ON debate_summaries(thread_id);
CREATE INDEX idx_debate_expires_at ON debate_summaries(expires_at);
```

#### `positions` Table (Denormalized in JSONB for efficiency; alternative normalized structure)

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL,
  position_key VARCHAR(255) NOT NULL,
  label TEXT NOT NULL,
  claim TEXT NOT NULL,
  support_count INTEGER,
  avg_coherence_score NUMERIC(3, 2),
  representative_comment_id VARCHAR(255),
  FOREIGN KEY (summary_id) REFERENCES debate_summaries(id) ON DELETE CASCADE,
  UNIQUE(summary_id, position_key)
);
```

#### `position_opponents` Table (Tracks which positions disagree)

```sql
CREATE TABLE position_opponents (
  position1_id UUID NOT NULL,
  position2_id UUID NOT NULL,
  PRIMARY KEY (position1_id, position2_id),
  FOREIGN KEY (position1_id) REFERENCES positions(id) ON DELETE CASCADE,
  FOREIGN KEY (position2_id) REFERENCES positions(id) ON DELETE CASCADE
);
```

### Redis Key Structure

```
debate_summary:{threadId} -> DebateSummary JSON object
TTL: 172800 seconds (48 hours)

Example key: debate_summary:t98765
{
  "threadId": "t98765",
  "title": "Climate Change Accountability",
  "positions": [...],
  "evidenceAnchors": [...],
  "disagreementAreas": [...],
  "qualityScore": 0.76,
  "topCommentIds": [...],
  "generatedAt": "2026-02-11T14:30:00Z"
}
```

Rationale: Storing precomputed metrics reduces repeated aggregation cost.

---

## Security and Privacy

### Data Protection

- **In Transit**: All API calls use HTTPS/TLS 1.3
- **At Rest**: PostgreSQL data encrypted at storage level
- **AI Service**: Comment batch sent to OpenAI under enterprise DPA
- **Cache**: Redis instance in private VPC, no public access

### Privacy & Access Control

- **Authentication**: Requires valid moderator JWT token
- **Authorization**: Only users with moderator role (verified in middleware)
- **Data Sensitivity**: Thread summaries may be viewed by moderators only
- **User Data**: Anonymized comments before sending to OpenAI when possible
- **Audit Logging**: Log summary regeneration requests for moderator actions

### Privacy Considerations

1. **Bulk Processing**: Batch comment processing complies with OpenAI DPA
2. **Retention**: Delete cached summaries after 48-hour TTL, purge DB after 60 days
3. **User Consent**: Moderators should disclose that AI analysis is used
4. **Rate Limiting**: 20 regenerate requests per thread per hour (prevent abuse)
5. **Right to Deletion**: When thread is deleted, cascade delete summaries

### Compliance

- **GDPR**: Support right-to-be-forgotten when thread deleted
- **CCPA**: Data retention minimized to necessary operational period
- **AI Transparency**: Disclose AI generation in summary UI ("AI-generated summary")

Rationale: Prevents unauthorized access to moderation tools.

---

## Risks to Completion

1. **Comment Volume Scalability**: 5000+ comments in a thread could timeout
   - _Mitigation_: Implement async batch processing with Bull job queue, sample large threads

2. **Position Clustering False Merges**: Similar-sounding but distinct positions merged
   - _Mitigation_: Conservative similarity thresholds, manual position merge UI for moderators, iterate with test data

3. **AI Inference Cost**: Batch analyzing all comments is expensive at scale
   - _Mitigation_: Reuse individual comment summaries from US1 if available, cache aggressively

4. **Evidence Quality**: Weak evidence ranked as strong by AI
   - _Mitigation_: Strength scoring calibration, human validation of top summaries, A/B test

5. **Disagreement Detection**: May miss subtle or implicit disagreements
   - _Mitigation_: Allow moderators to add disagreements manually, feedback loop

6. **Thread Edit Invalidation**: Edited comments not reflected in cached summary
   - _Mitigation_: Invalidate cache on comment edit, maintain activity log

8. **Integration Complexity**: US2 depends on US1 services (AI, cache)
   - _Mitigation_: Design shared service interfaces early, test dependency chain thoroughly

9. **Moderator Decision Impact**: Summary influences moderation decisions; bias concerns
   - _Mitigation_: Summary is advisory only, moderators retain full autonomy, transparency about limitations

Rationale: Scope must remain feasible within sprint constraints.
