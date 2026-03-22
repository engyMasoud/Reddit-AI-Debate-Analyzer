# Development Specification: US1 — Inline AI Reasoning Summary

## Overview

This document is the **complete backend development specification** for the Inline AI Reasoning Summary feature. It has been fully rewritten to integrate the [Harmonized Backend Blueprint](harmonizedBackend.md), which establishes the shared architecture for both US1 and US3.

**User Story:** As a new user, I want an inline AI summary of a comment's reasoning so that I can quickly understand its main claims and supporting evidence.

**T-Shirt Size:** Small — Sprint 1 (2-week sprint), Priority: High, Dependencies: None.

### Justification

Users leave lengthy Reddit threads because of repetition and buried arguments. This feature surfaces AI-generated reasoning quality indicators directly on each comment, giving new users immediate insight into the strength, coherence, and evidence behind any argument — without reading every reply.

### Scope Boundaries

| In Scope | Out of Scope |
|----------|-------------|
| Single-comment AI reasoning summary (REST) | Thread-level debate summary (US2) |
| Lazy-load on user click ("Show AI Summary") | Auto-generating summaries for all comments |
| In-memory cache (Map-based, P4 constraint) | Redis or distributed cache |
| Mocked AI service for testing | Production OpenAI prompt tuning |
| Numeric `SERIAL` IDs for all tables | UUID primary keys |

### P4 Constraints Recap

| Constraint | Decision |
|-----------|----------|
| Scale: 10 simultaneous users | In-memory `Map` replaces Redis; `Promise.all` replaces Bull |
| Mocked AI | All OpenAI calls behind `IAIAnalysisService`; `MockAIAnalysisService` for tests |
| Data standardization | `posts` (not threads); numeric `SERIAL` PKs everywhere |

---

## Architecture Diagram

```mermaid
graph TB
    subgraph Client ["Client (Browser — React 18 + Vite)"]
        UI["PostDetail.jsx"]
        RSP["ReasoningSummaryPanel.jsx"]
        UI -->|renders| RSP
    end

    RSP -->|"GET /api/v1/comments/:commentId/reasoning-summary<br/>Authorization: Bearer JWT"| API

    subgraph Backend ["Backend Server (Node.js 18 / Express 4 — :4000)"]
        API["API Routes Layer<br/>reasoningSummary.routes.ts"]
        AUTH["authMiddleware.ts<br/>(JWT verify)"]
        RL["rateLimiter.ts<br/>(in-memory Map)"]
        CTRL["ReasoningSummaryController"]
        SVC["ReasoningSummaryService"]
        CACHE["InMemoryCacheService<br/>(Map&lt;string, {value, expiresAt}&gt;)"]
        AI["IAIAnalysisService<br/>«interface»"]
        MOCK["MockAIAnalysisService<br/>(deterministic fixtures)"]
        PROD["AIAnalysisService<br/>(OpenAI GPT-4)"]

        API --> AUTH --> RL --> CTRL
        CTRL --> SVC
        SVC --> CACHE
        SVC --> AI
        AI -.->|implements| MOCK
        AI -.->|implements| PROD
    end

    subgraph DB ["PostgreSQL 14+"]
        COMMENTS["comments<br/>(SERIAL PK)"]
        SUMMARIES["reasoning_summaries<br/>(SERIAL PK, FK → comments)"]
    end

    SVC -->|"CommentRepository.getById(id)"| COMMENTS
    SVC -->|"ReasoningSummaryRepository.upsert()"| SUMMARIES
    CACHE -.->|"reasoning_summary:&lt;commentId&gt;<br/>TTL 24h"| SVC

    RSP -->|"200 JSON"| Client

    style MOCK fill:#d4edda,stroke:#28a745
    style PROD fill:#fff3cd,stroke:#ffc107
    style CACHE fill:#e2e3f1,stroke:#6c63ff
```

### Component Locations

| Component | Runtime | Notes |
|-----------|---------|-------|
| Client | Browser (React 18 + Vite, `:3000`) | Plain JavaScript (JSX), NOT TypeScript |
| API Server | Node.js 18 + Express 4 (`:4000`) | TypeScript 5.x; single HTTP server shared with Socket.IO (US3) |
| Database | PostgreSQL 14+ | Single tenant; numeric `SERIAL` PKs |
| Cache | In-process `Map` | **No Redis** — P4 constraint (10 users) |
| AI Service | `IAIAnalysisService` interface | `MockAIAnalysisService` in dev/test; `AIAnalysisService` (OpenAI) in production |

### Information Flows

1. User clicks **"Show AI Summary"** on a comment in `ReasoningSummaryPanel.jsx`.
2. Frontend sends `GET /api/v1/comments/:commentId/reasoning-summary` with JWT.
3. `authMiddleware` verifies the token; `rateLimiter` checks the in-memory per-user window.
4. `ReasoningSummaryController` delegates to `ReasoningSummaryService.getSummary(commentId)`.
5. Service checks `InMemoryCacheService` (key: `reasoning_summary:<commentId>`).
6. **Cache hit** → return cached `ReasoningSummary` DTO immediately.
7. **Cache miss** → query `reasoning_summaries` table. If a non-expired row exists, cache it and return.
8. **DB miss** → fetch comment text from `comments` table → call `IAIAnalysisService` methods → build DTO → upsert into `reasoning_summaries` → cache → return.
9. Frontend receives 200 JSON and renders the summary panel with claim, evidence blocks, and coherence score.

---

## MIT 6.005 Data Abstraction — `InMemoryCacheService`

The **primary state-holding class** in the US1 module is `InMemoryCacheService`. It manages an in-process key-value store with time-based expiration, replacing what would otherwise be a Redis instance. Because this class owns mutable state that the rest of the system depends on, we define it as a formal data abstraction following [MIT 6.005 Reading 13](https://web.mit.edu/6.005/www/fa15/classes/13-abstraction-functions-rep-invariants/).

### Overview

`InMemoryCacheService` provides a **mutable** abstract data type that maps string keys to arbitrary JavaScript objects, each with an associated time-to-live (TTL). After the TTL expires, a key becomes invisible to consumers and is eventually reaped by a periodic sweep. The class implements `ICacheService`, the shared cache contract used by both US1 and US3.

### Space of Representation Values (Rep)

```typescript
class InMemoryCacheService implements ICacheService {
  // -- Rep --
  private store: Map<
    string,
    {
      value: object; // the cached datum (deep-cloned on get/set)
      expiresAt: number; // absolute epoch-ms deadline
    }
  >;
  private readonly maxEntries: number; // upper bound on Map size (default 10 000)
  private readonly sweepIntervalMs: number; // how often sweepExpired() runs (default 60 000 ms)
  private sweepIntervalId: NodeJS.Timeout | null; // handle for clearInterval; null when destroyed
}
```

**Rep components:**

| Field                  | Type                      | Domain                                                      |
| ---------------------- | ------------------------- | ----------------------------------------------------------- |
| `store`                | `Map<string, CacheEntry>` | keys ⊂ non-empty strings; size ∈ [0, `maxEntries`]          |
| `CacheEntry.value`     | `object`                  | any non-null JavaScript object                              |
| `CacheEntry.expiresAt` | `number`                  | positive integer (epoch milliseconds), always > 0           |
| `maxEntries`           | `number`                  | positive integer, default 10 000                            |
| `sweepIntervalMs`      | `number`                  | positive integer, default 60 000                            |
| `sweepIntervalId`      | `NodeJS.Timeout \| null`  | non-null while the cache is alive; `null` after `destroy()` |

### Space of Abstract Values

Abstractly, an `InMemoryCacheService` represents:

> A **finite partial function** _f : Key → Value_ from string keys to JavaScript objects, where each mapping has an associated deadline _d_, and only mappings whose deadline is in the future are visible. The function's domain has cardinality ≤ _N_ (the `maxEntries` cap).

In set-builder notation:

$$A = \{ f : \text{String} \rightharpoonup \text{Object} \mid |dom(f)| \leq N \}$$

where each element of the domain carries an implicit deadline:

$$\forall k \in dom(f): deadline(k) > now$$

Keys whose deadlines have passed are **not** in _dom(f)_ — they are invisible to the abstract value even if they still physically exist in `store` awaiting the next sweep.

### Rep Invariant (RI)

```
RI(r) =
    r.maxEntries > 0
  ∧ r.sweepIntervalMs > 0
  ∧ r.store.size ≤ r.maxEntries
  ∧ ∀ (key, entry) ∈ r.store:
        key.length > 0
      ∧ entry.value !== null
      ∧ entry.value !== undefined
      ∧ entry.expiresAt > 0
```

A `checkRep()` method enforces this invariant after every mutator in debug builds:

```typescript
private checkRep(): void {
    assert(this.maxEntries > 0, 'maxEntries must be positive');
    assert(this.sweepIntervalMs > 0, 'sweepIntervalMs must be positive');
    assert(this.store.size <= this.maxEntries,
           `store size ${this.store.size} exceeds cap ${this.maxEntries}`);
    for (const [key, entry] of this.store) {
        assert(key.length > 0, 'cache key must be non-empty');
        assert(entry.value !== null && entry.value !== undefined,
               `null/undefined value for key "${key}"`);
        assert(entry.expiresAt > 0,
               `expiresAt must be positive for key "${key}"`);
    }
}
```

### Abstraction Function (AF)

```
AF(r) = the partial function f where:
    dom(f) = { key | r.store.has(key) ∧ r.store.get(key).expiresAt > Date.now() }
    f(key)  = deep clone of r.store.get(key).value      for each key ∈ dom(f)
```

In words: _the abstract value is the set of non-expired entries in the store, where each key maps to a deep copy of its stored value._ Expired entries exist in `store` only until the next `sweepExpired()` call — they are ghosts in the representation but invisible to the abstraction.

### Safety from Rep Exposure

The class ensures no client can obtain a direct reference to its mutable internal state:

| Technique                       | Where Applied                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`private` fields**            | `store`, `maxEntries`, `sweepIntervalMs`, `sweepIntervalId` are all `private`. No public field exposes the Map.                                              |
| **Defensive copying on output** | `get<T>(key)` returns `structuredClone(entry.value)`, never the stored reference itself. If the caller mutates the returned object, the cache is unaffected. |
| **Defensive copying on input**  | `set(key, value, ttl)` stores `structuredClone(value)`, so the caller cannot mutate the cached object after insertion.                                       |
| **Immutable config**            | `maxEntries` and `sweepIntervalMs` are `readonly`; set once in the constructor, never changed.                                                               |
| **No iterator exposure**        | There is no public method that returns the `Map`, its keys, or its entries. The only way to read data is through `get(key)`, which returns a clone.          |
| **Timer encapsulation**         | `sweepIntervalId` is private; only `destroy()` clears it, preventing external interference with the sweep cycle.                                             |

---

## Class Hierarchy Diagram

```mermaid
classDiagram
    class ReasoningSummaryController {
        -reasoningSummaryService: IReasoningSummaryService
        +getSummary(req, res): Promise~void~
    }

    class IReasoningSummaryService {
        <<interface>>
        +getSummary(commentId: number): Promise~ReasoningSummaryDTO~
        +generateAndCacheSummary(comment: Comment): Promise~ReasoningSummaryDTO~
        +invalidateCache(commentId: number): Promise~void~
    }

    class ReasoningSummaryService {
        -aiService: IAIAnalysisService
        -cache: ICacheService
        -commentRepo: CommentRepository
        -summaryRepo: ReasoningSummaryRepository
        +getSummary(commentId: number): Promise~ReasoningSummaryDTO~
        +generateAndCacheSummary(comment: Comment): Promise~ReasoningSummaryDTO~
        +invalidateCache(commentId: number): Promise~void~
        -buildDTO(row: DBRow): ReasoningSummaryDTO
    }

    class IAIAnalysisService {
        <<interface>>
        +extractClaims(text: string): Promise~Claim[]~
        +extractEvidence(text: string): Promise~EvidenceBlock[]~
        +evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise~number~
        +generateSummary(analysis: AnalysisResult): Promise~string~
    }

    class AIAnalysisService {
        -openaiClient: OpenAI
        -model: string
        +extractClaims(text: string): Promise~Claim[]~
        +extractEvidence(text: string): Promise~EvidenceBlock[]~
        +evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise~number~
        +generateSummary(analysis: AnalysisResult): Promise~string~
    }

    class MockAIAnalysisService {
        -fixtures: Map~string_AnalysisResult~
        +extractClaims(text: string): Promise~Claim[]~
        +extractEvidence(text: string): Promise~EvidenceBlock[]~
        +evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise~number~
        +generateSummary(analysis: AnalysisResult): Promise~string~
    }

    class ICacheService {
        <<interface>>
        +get(key: string): Promise~object_or_null~
        +set(key: string, value: object, ttl: number): Promise~void~
        +delete(key: string): Promise~void~
        +exists(key: string): Promise~boolean~
    }

    class InMemoryCacheService {
        -store: Map~string_CacheEntry~
        -sweepIntervalId: NodeJS.Timeout
        +get(key: string): Promise~object_or_null~
        +set(key: string, value: object, ttl: number): Promise~void~
        +delete(key: string): Promise~void~
        +exists(key: string): Promise~boolean~
        +sweepExpired(): void
        +destroy(): void
    }

    class CommentRepository {
        -pool: Pool
        +getById(id: number): Promise~Comment_or_null~
        +getByPostId(postId: number): Promise~Comment[]~
    }

    class ReasoningSummaryRepository {
        -pool: Pool
        +findByCommentId(commentId: number): Promise~DBRow_or_null~
        +upsert(summary: ReasoningSummaryInsert): Promise~DBRow~
        +deleteByCommentId(commentId: number): Promise~void~
    }

    class CommentValidator {
        +validateCommentId(id: any): number
        +sanitizeText(text: string): string
    }

    class NLPProcessor {
        +tokenize(text: string): string[]
        +parseSentences(text: string): string[]
    }

    class ReasoningSummaryDTO {
        +commentId: number
        +summary: string
        +primaryClaim: string
        +evidenceBlocks: EvidenceBlock[]
        +coherenceScore: number
        +generatedAt: Date
    }

    class EvidenceBlock {
        +type: string
        +content: string
        +strength: string
    }

    class Claim {
        +id: number
        +text: string
        +supportingEvidence: string[]
    }

    ReasoningSummaryController --> IReasoningSummaryService
    IReasoningSummaryService <|.. ReasoningSummaryService
    ReasoningSummaryService --> IAIAnalysisService
    ReasoningSummaryService --> ICacheService
    ReasoningSummaryService --> CommentRepository
    ReasoningSummaryService --> ReasoningSummaryRepository
    IAIAnalysisService <|.. AIAnalysisService
    IAIAnalysisService <|.. MockAIAnalysisService
    ICacheService <|.. InMemoryCacheService
    ReasoningSummaryService --> CommentValidator
    ReasoningSummaryService --> NLPProcessor
    ReasoningSummaryService ..> ReasoningSummaryDTO : creates
    ReasoningSummaryDTO --> EvidenceBlock
    ReasoningSummaryDTO --> Claim
```

---

## List of Classes

| Class Name | Package | Responsibility |
|------------|---------|----------------|
| `ReasoningSummaryController` | `controllers/` | Thin HTTP handler; validates params via `CommentValidator`, delegates to `IReasoningSummaryService`, serializes response |
| `ReasoningSummaryService` | `services/` | Orchestrates cache → DB → AI generation pipeline; implements `IReasoningSummaryService` |
| `IAIAnalysisService` | `services/interfaces/` | Interface — single contract for all LLM interaction (shared with US3) |
| `AIAnalysisService` | `services/` | Production implementation; wraps `openai` npm client; sends structured prompts to GPT-4 |
| `MockAIAnalysisService` | `services/` | Test implementation; returns deterministic fixtures; zero network calls |
| `ICacheService` | `services/interfaces/` | Interface for key-value cache with TTL |
| `InMemoryCacheService` | `services/` | `Map`-based implementation; 60 s sweep interval; replaces Redis (P4) |
| `CommentRepository` | `repositories/` | Parameterized SQL queries against `comments` table via `pg` Pool |
| `ReasoningSummaryRepository` | `repositories/` | CRUD on `reasoning_summaries` table; `upsert` uses `ON CONFLICT (comment_id) DO UPDATE` |
| `CommentValidator` | `utils/` | Validates and sanitizes `commentId` param (must be positive integer) |
| `NLPProcessor` | `utils/` | Sentence splitting and tokenization (used as fallback when AI service calls fail) |
| `ReasoningSummaryDTO` | `models/` | Immutable DTO matching the frontend `aiSummary` shape |
| `EvidenceBlock` | `models/` | Value object: `{ type, content, strength }` |
| `Claim` | `models/` | Value object: `{ id, text, supportingEvidence }` |

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> ValidatingRequest : GET /comments/:id/reasoning-summary

    ValidatingRequest --> Rejected : Invalid commentId or auth failure
    ValidatingRequest --> CheckingCache : Valid request

    Rejected --> [*] : Return 400/401/429

    CheckingCache --> ReturningResponse : Cache HIT (Map lookup)
    CheckingCache --> CheckingDatabase : Cache MISS

    CheckingDatabase --> CachingFromDB : DB row exists & not expired
    CheckingDatabase --> FetchingComment : No DB row or expired

    CachingFromDB --> ReturningResponse : Cache set, return DTO

    FetchingComment --> CommentNotFound : Comment ID not in DB
    FetchingComment --> AnalyzingText : Comment found

    CommentNotFound --> [*] : Return 404

    AnalyzingText --> ExtractingClaims : IAIAnalysisService.extractClaims()
    ExtractingClaims --> ExtractingEvidence : IAIAnalysisService.extractEvidence()
    ExtractingEvidence --> EvaluatingCoherence : IAIAnalysisService.evaluateCoherence()
    EvaluatingCoherence --> GeneratingSummary : IAIAnalysisService.generateSummary()

    GeneratingSummary --> PersistingResult : Build ReasoningSummaryDTO

    GeneratingSummary --> AnalysisError : AI service throws

    AnalysisError --> [*] : Return 500 with graceful message

    PersistingResult --> CachingResult : Upsert into reasoning_summaries

    CachingResult --> ReturningResponse : InMemoryCacheService.set(key, dto, 86400)

    ReturningResponse --> [*] : Return 200 JSON

    note right of CheckingCache
        Key: reasoning_summary:<commentId>
        TTL: 86,400s (24 hours)
    end note

    note right of AnalyzingText
        Uses IAIAnalysisService interface.
        MockAIAnalysisService in tests;
        AIAnalysisService (OpenAI) in prod.
    end note
```

---

## Flow Chart

```mermaid
flowchart TD
    A([User clicks 'Show AI Summary']) --> B["Client: GET /api/v1/comments/:commentId/reasoning-summary<br/>Header: Authorization: Bearer JWT"]

    B --> C{authMiddleware:<br/>JWT valid?}
    C -- No --> C1[Return 401 Unauthorized]
    C -- Yes --> D{rateLimiter:<br/>under 100 req/min?}
    D -- No --> D1[Return 429 Too Many Requests]
    D -- Yes --> E["CommentValidator.validateCommentId(commentId)"]

    E --> F{Valid positive<br/>integer?}
    F -- No --> F1[Return 400 Bad Request]
    F -- Yes --> G["InMemoryCacheService.get('reasoning_summary:' + commentId)"]

    G --> H{Cache<br/>HIT?}
    H -- Yes --> R[Return 200 JSON — cached ReasoningSummaryDTO]

    H -- No --> I["ReasoningSummaryRepository.findByCommentId(commentId)"]
    I --> J{DB row exists<br/>and not expired?}
    J -- Yes --> K["InMemoryCacheService.set(key, dto, 86400)"] --> R

    J -- No --> L["CommentRepository.getById(commentId)"]
    L --> M{Comment<br/>found?}
    M -- No --> M1[Return 404 Not Found]
    M -- Yes --> N["IAIAnalysisService.extractClaims(comment.text)"]
    N --> O["IAIAnalysisService.extractEvidence(comment.text)"]
    O --> P["IAIAnalysisService.evaluateCoherence(claims, evidence)"]
    P --> Q["IAIAnalysisService.generateSummary({claims, evidence, coherence})"]

    Q --> S{AI service<br/>error?}
    S -- Yes --> S1[Return 500 Internal Server Error]
    S -- No --> T["Build ReasoningSummaryDTO"]

    T --> U["ReasoningSummaryRepository.upsert(dto)"]
    U --> V["InMemoryCacheService.set(key, dto, 86400)"]
    V --> R

    R --> W([Client renders ReasoningSummaryPanel<br/>with summary, claim, evidence, coherence score])
```

---

## Technology Stack

| Layer | Technology | Version | Purpose | P4 Note |
|-------|-----------|---------|---------|---------|
| **Frontend** | React | 18.x | UI — `ReasoningSummaryPanel.jsx` | Plain JSX (not TypeScript) |
| **Frontend** | Vite | 5.x | Dev server on `:3000`, proxy `/api → :4000` | |
| **Frontend** | Tailwind CSS | 3.x | Styling + lucide-react icons | |
| **Backend** | Node.js | 18.x LTS | Runtime | |
| **Backend** | Express.js | 4.x | HTTP framework | Shared server with Socket.IO (US3) |
| **Backend** | TypeScript | 5.x | Type safety | |
| **Database** | PostgreSQL | 14+ | Primary store (`comments`, `reasoning_summaries`) | Numeric `SERIAL` PKs |
| **Cache** | **In-memory `Map`** | N/A | Key-value w/ TTL (replaces Redis) | **P4: 10-user scale** |
| **Job Queue** | **`Promise.all`** | N/A | Parallel AI calls (replaces Bull) | **P4: no Bull** |
| **AI** | OpenAI API (GPT-4) | Latest | Behind `IAIAnalysisService` | **Mocked in tests** |
| **NLP Fallback** | natural / compromise | Latest | Local tokenization & sentence splitting | |
| **Testing** | Jest | 29.x | Unit + integration (`MockAIAnalysisService`) | |
| **Auth** | jsonwebtoken | Latest | JWT HS256 | |
| **Validation** | zod | 3.x | Request schema validation | |
| **Query** | pg (node-postgres) | 8.x | Raw parameterized SQL | |

---

## APIs

### 1. Get Reasoning Summary

```http
GET /api/v1/comments/:commentId/reasoning-summary
Authorization: Bearer {jwt_token}
```

**Path Parameters:**

| Param | Type | Constraints | Example |
|-------|------|-------------|---------|
| `commentId` | `integer` | Positive, matches `comments.id` | `3` |

**Response — 200 OK:**

```json
{
  "commentId": 3,
  "summary": "Takes a balanced position, arguing that team familiarity and project consistency matter more than the specific CSS approach chosen.",
  "primaryClaim": "Team familiarity is the key factor in CSS methodology effectiveness, not the tool itself",
  "evidenceBlocks": [
    {
      "type": "anecdote",
      "content": "Personal experience shipping production apps with both approaches",
      "strength": "medium"
    }
  ],
  "coherenceScore": 0.91,
  "generatedAt": "2026-03-10T14:30:00.000Z"
}
```

**Response — 400 Bad Request:**

```json
{
  "error": "INVALID_COMMENT_ID",
  "message": "commentId must be a positive integer"
}
```

**Response — 401 Unauthorized:**

```json
{
  "error": "UNAUTHORIZED",
  "message": "Missing or invalid JWT token"
}
```

**Response — 404 Not Found:**

```json
{
  "error": "COMMENT_NOT_FOUND",
  "message": "No comment found with id 9999"
}
```

**Response — 429 Too Many Requests:**

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit of 100 requests per minute exceeded",
  "retryAfterMs": 12400
}
```

**Response — 500 Internal Server Error:**

```json
{
  "error": "ANALYSIS_FAILED",
  "message": "Failed to generate reasoning summary. Please try again."
}
```

### Response DTO Contract

The response body **must** match the shape consumed by the frontend's `ReasoningSummaryPanel.jsx` (via the `comment.aiSummary` field):

```typescript
interface ReasoningSummaryResponse {
  commentId: number;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: {
    type: 'study' | 'data' | 'anecdote' | 'authority' | 'other';
    content: string;
    strength: 'high' | 'medium' | 'low';
  }[];
  coherenceScore: number;   // 0.00–1.00
  generatedAt: string;      // ISO 8601
}
```

### Zod Validation Schema

```typescript
import { z } from 'zod';

export const getReasoningSummaryParams = z.object({
  commentId: z.coerce.number().int().positive(),
});
```

### Related CRUD Endpoints (Defined in Blueprint)

These core endpoints are **not** US1-specific but are required for the summary to function:

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/api/v1/posts/:id/comments` | List comments (returns `aiSummary: null`; lazy-load via US1 endpoint) |
| 2 | `POST` | `/api/v1/posts/:id/comments` | Create comment (new comments have no summary) |
| 3 | `POST` | `/api/v1/auth/login` | Obtain JWT for authenticated requests |
| 4 | `POST` | `/api/v1/auth/register` | Register user |

---

## Public Interfaces

### Backend Service Interfaces

```typescript
// ─── services/interfaces/IReasoningSummaryService.ts ───
import { ReasoningSummaryDTO } from '../../models/ReasoningSummary';
import { Comment } from '../../models/Comment';

export interface IReasoningSummaryService {
  /** Retrieve summary (cache → DB → generate). */
  getSummary(commentId: number): Promise<ReasoningSummaryDTO>;

  /** Force-generate summary, persist, and cache. */
  generateAndCacheSummary(comment: Comment): Promise<ReasoningSummaryDTO>;

  /** Remove from both cache and DB. */
  invalidateCache(commentId: number): Promise<void>;
}
```

```typescript
// ─── services/interfaces/IAIAnalysisService.ts ───  (shared with US3)
import { Claim } from '../../models/Claim';
import { EvidenceBlock } from '../../models/EvidenceBlock';
import { AnalysisResult } from '../../models/AnalysisResult';

export interface IAIAnalysisService {
  extractClaims(text: string): Promise<Claim[]>;
  extractEvidence(text: string): Promise<EvidenceBlock[]>;
  evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise<number>;
  generateSummary(analysis: AnalysisResult): Promise<string>;
}
```

```typescript
// ─── services/interfaces/ICacheService.ts ───  (shared with US3)
export interface ICacheService {
  get<T = object>(key: string): Promise<T | null>;
  set(key: string, value: object, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

### Model Interfaces (DTOs)

```typescript
// ─── models/ReasoningSummary.ts ───
import { EvidenceBlock } from './EvidenceBlock';

/** Immutable DTO returned to the frontend. */
export interface ReasoningSummaryDTO {
  commentId: number;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: EvidenceBlock[];
  coherenceScore: number;   // 0–1
  generatedAt: Date;
}

/** Shape for inserting/upserting into the DB. */
export interface ReasoningSummaryInsert {
  commentId: number;
  summary: string;
  primaryClaim: string;
  evidenceBlocks: EvidenceBlock[];  // stored as JSONB
  coherenceScore: number;
}

/** Raw row shape from PostgreSQL. */
export interface ReasoningSummaryRow {
  id: number;
  comment_id: number;
  summary: string;
  primary_claim: string;
  evidence_blocks: EvidenceBlock[];  // JSONB auto-parsed by pg
  coherence_score: string;           // NUMERIC comes as string from pg
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}
```

```typescript
// ─── models/EvidenceBlock.ts ───
export interface EvidenceBlock {
  type: 'study' | 'data' | 'anecdote' | 'authority' | 'other';
  content: string;
  strength: 'high' | 'medium' | 'low';
}
```

```typescript
// ─── models/Claim.ts ───
export interface Claim {
  id: number;
  text: string;
  supportingEvidence: string[];
}
```

```typescript
// ─── models/Comment.ts ───
export interface Comment {
  id: number;
  postId: number;
  authorId: number;
  parentCommentId: number | null;
  text: string;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
  updatedAt: Date;
}
```

```typescript
// ─── models/AnalysisResult.ts ───
import { Claim } from './Claim';
import { EvidenceBlock } from './EvidenceBlock';

export interface AnalysisResult {
  claims: Claim[];
  evidence: EvidenceBlock[];
  coherenceScore: number;
}
```

### Repository Interfaces

```typescript
// ─── repositories/CommentRepository.ts ───
import { Comment } from '../models/Comment';
import { Pool } from 'pg';

export class CommentRepository {
  constructor(private pool: Pool) {}

  async getById(id: number): Promise<Comment | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );
    return rows.length ? this.mapRow(rows[0]) : null;
  }

  async getByPostId(postId: number): Promise<Comment[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC',
      [postId]
    );
    return rows.map(this.mapRow);
  }

  private mapRow(row: any): Comment {
    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentCommentId: row.parent_comment_id,
      text: row.text,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

```typescript
// ─── repositories/ReasoningSummaryRepository.ts ───
import { ReasoningSummaryInsert, ReasoningSummaryRow } from '../models/ReasoningSummary';
import { Pool } from 'pg';

export class ReasoningSummaryRepository {
  constructor(private pool: Pool) {}

  async findByCommentId(commentId: number): Promise<ReasoningSummaryRow | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM reasoning_summaries
       WHERE comment_id = $1 AND expires_at > NOW()`,
      [commentId]
    );
    return rows.length ? rows[0] : null;
  }

  async upsert(data: ReasoningSummaryInsert): Promise<ReasoningSummaryRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO reasoning_summaries
         (comment_id, summary, primary_claim, evidence_blocks, coherence_score, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
       ON CONFLICT (comment_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         primary_claim = EXCLUDED.primary_claim,
         evidence_blocks = EXCLUDED.evidence_blocks,
         coherence_score = EXCLUDED.coherence_score,
         updated_at = NOW(),
         expires_at = NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [data.commentId, data.summary, data.primaryClaim,
       JSON.stringify(data.evidenceBlocks), data.coherenceScore]
    );
    return rows[0];
  }

  async deleteByCommentId(commentId: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM reasoning_summaries WHERE comment_id = $1',
      [commentId]
    );
  }
}
```

### MockAIAnalysisService (Test Implementation)

```typescript
// ─── services/MockAIAnalysisService.ts ───
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { Claim } from '../models/Claim';
import { EvidenceBlock } from '../models/EvidenceBlock';
import { AnalysisResult } from '../models/AnalysisResult';

/**
 * Deterministic mock — returns fixtures based on text length.
 * Zero network calls. Used in all Jest test suites.
 */
export class MockAIAnalysisService implements IAIAnalysisService {
  async extractClaims(text: string): Promise<Claim[]> {
    return [
      { id: 1, text: text.substring(0, 60), supportingEvidence: ['mock-ev-1'] },
    ];
  }

  async extractEvidence(text: string): Promise<EvidenceBlock[]> {
    const strength = text.length > 200 ? 'high' : text.length > 100 ? 'medium' : 'low';
    return [
      { type: 'anecdote', content: 'Mock evidence from text analysis', strength },
    ];
  }

  async evaluateCoherence(_claims: Claim[], _evidence: EvidenceBlock[]): Promise<number> {
    return 0.75; // deterministic
  }

  async generateSummary(analysis: AnalysisResult): Promise<string> {
    const claimText = analysis.claims[0]?.text ?? 'No claims found';
    return `Mock summary: Argues "${claimText}" with ${analysis.evidence.length} piece(s) of evidence.`;
  }
}
```

---

## Data Schemas

> All schemas below use **numeric `SERIAL` primary keys** per the P4 Data Standardization constraint. These replace the UUID PKs from the original DS1.

### `reasoning_summaries` Table

```sql
CREATE TABLE reasoning_summaries (
    id              SERIAL PRIMARY KEY,
    comment_id      INTEGER       NOT NULL UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
    summary         TEXT          NOT NULL,
    primary_claim   TEXT          NOT NULL,
    evidence_blocks JSONB         NOT NULL,
    coherence_score NUMERIC(3,2)  CHECK (coherence_score >= 0 AND coherence_score <= 1),
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP     DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX idx_reasoning_comment ON reasoning_summaries(comment_id);
CREATE INDEX idx_reasoning_expires ON reasoning_summaries(expires_at);
```

**Design decisions:**

- `evidence_blocks` stored as **JSONB** (denormalized) — sufficient for the read-heavy, write-rare pattern of summaries. No separate `evidence_blocks` table needed.
- `expires_at` defaults to 24 h from creation; `ReasoningSummaryRepository.findByCommentId` filters `WHERE expires_at > NOW()`.
- `ON DELETE CASCADE` from `comments(id)` — deleting a comment auto-deletes its summary (GDPR right-to-deletion).

### Dependent Base Tables (Defined in Blueprint)

The `reasoning_summaries` table has a foreign key to `comments(id)`. The complete `comments` and related base table schemas are defined in the [Harmonized Backend Blueprint §2](harmonizedBackend.md). Key schemas referenced:

```sql
-- comments (Blueprint §2.5)
CREATE TABLE comments (
    id                SERIAL PRIMARY KEY,
    post_id           INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id INTEGER          REFERENCES comments(id) ON DELETE CASCADE,
    text              TEXT    NOT NULL,
    upvotes           INTEGER DEFAULT 0,
    downvotes         INTEGER DEFAULT 0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- users (Blueprint §2.1)
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar        VARCHAR(255) DEFAULT '👤',
    karma         INTEGER      DEFAULT 0,
    joined_date   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
```

### In-Memory Cache Key Structure (replaces Redis)

```
Key pattern:  reasoning_summary:<commentId>
Value:        ReasoningSummaryDTO (JavaScript object)
TTL:          86,400 seconds (24 hours)
Storage:      Map<string, { value: ReasoningSummaryDTO; expiresAt: number }>
Sweep:        setInterval every 60 s removes entries where Date.now() > expiresAt

Example:
  Key:   "reasoning_summary:3"
  Value: {
    commentId: 3,
    summary: "Takes a balanced position...",
    primaryClaim: "Team familiarity is the key factor...",
    evidenceBlocks: [{ type: "anecdote", content: "...", strength: "medium" }],
    coherenceScore: 0.91,
    generatedAt: "2026-03-10T14:30:00.000Z"
  }
```

### Stable Storage Justification

> **Rubric constraint addressed:** _"Determine the stable storage mechanism… you can't just use an in-memory data structure because your app might crash and lose its memory. Customers really hate data loss."_

**PostgreSQL 14+ is the sole, authoritative stable storage mechanism for all US1 customer data.** Every reasoning summary that is generated passes through the following persistence guarantee before a success response is ever returned to the client:

1. `ReasoningSummaryService` calls `ReasoningSummaryRepository.upsert()`, which executes a parameterized `INSERT … ON CONFLICT DO UPDATE … RETURNING *` against the `reasoning_summaries` table.
2. The `pg` driver awaits the PostgreSQL server's acknowledgment (i.e., the row has been committed to WAL and the transaction is durable) **before** the service proceeds to cache the result or return the DTO.
3. Only after the durable write completes does `InMemoryCacheService.set()` populate the in-process `Map`.

**What happens on a Node.js process crash:**

| Layer                     | Effect of Crash                                                                                                      | Customer Data Loss?                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL**            | Unaffected. Committed rows survive process, container, and OS restarts. WAL + `fsync` guarantee ACID durability.     | **None**                                                                                                                                                                                                                                                                                                        |
| **In-memory `Map` cache** | Entire cache is lost (expected).                                                                                     | **None** — the cache is a _derived, ephemeral replica_ of data already committed to Postgres. On the next `GET /reasoning-summary` request, the service simply re-reads the `reasoning_summaries` table (a cache miss → DB hit path already implemented in the state diagram) and repopulates the cache lazily. |
| **In-flight analysis**    | If the crash occurs _during_ an AI analysis (after `extractClaims` but before `upsert`), the partial result is lost. | **None** — no row was committed, so no stale data exists. The next user request triggers a fresh analysis, and the user sees a normal loading state.                                                                                                                                                            |

**Design invariant:** At no point does the system return a `200 OK` to the client unless the summary row has been durably committed to PostgreSQL. The `InMemoryCacheService` is strictly a **read-through performance optimization** — a warm lookup that avoids a round-trip to Postgres on repeated requests. It holds no data that does not already exist in the database. Losing the cache is operationally equivalent to a cold start: the first request for each comment incurs one extra DB read, which at P4 scale (≤ 10 concurrent users) adds negligible latency (< 5 ms per query on indexed `comment_id`).

**Summary:** PostgreSQL is the durable, crash-safe source of truth. The in-memory `Map` is a disposable acceleration layer. Customers experience zero data loss on any process crash.

### Seed Data

The seed script must mirror `frontend/src/mockData.js` to ensure dev parity. The 6 mock comments across posts 1–3 should be seeded with pre-generated reasoning summaries matching the existing `aiSummary` fields:

| Comment ID | Post ID | Author | Existing `aiSummary` | Seed Summary? |
|-----------|---------|--------|---------------------|---------------|
| 1 | 1 | ReactFan42 | Yes (coherence 0.87) | Yes |
| 2 | 1 | CSSPurist | Yes (coherence 0.72) | Yes |
| 3 | 1 | FullStackDev | Yes (coherence 0.91) | Yes |
| 4 | 2 | EdgeComputing | Yes (coherence 0.83) | Yes |
| 5 | 2 | AISkeptic | Yes (coherence 0.88) | Yes |
| 6 | 3 | UXResearcher | Yes (coherence 0.79) | Yes |

---

## Security and Privacy

### Authentication & Authorization

| Concern | Implementation |
|---------|---------------|
| **Auth method** | JWT (HS256) — token required in `Authorization: Bearer` header |
| **Middleware** | `authMiddleware.ts` — verifies signature, expiry, and extracts `userId` onto `req.user` |
| **Authorization** | Any authenticated user may request a reasoning summary for any comment (public content) |
| **Rate limiting** | In-memory `Map<number, { count: number; windowStart: number }>` — 100 req/min/user; returns 429 with `retryAfterMs` |

### Data Protection

| Layer | Measure |
|-------|---------|
| **In transit** | HTTPS / TLS 1.3 for all REST calls |
| **At rest** | PostgreSQL storage-level encryption |
| **AI service** | Comment text sent to OpenAI under enterprise DPA; in test/dev, `MockAIAnalysisService` sends nothing |
| **Cache** | In-process `Map` — no network exposure (unlike Redis); data lost on process restart (acceptable at P4 scale) |

### Privacy Considerations

1. **Anonymization**: Strip PII (usernames, emails) from text before sending to OpenAI in production `AIAnalysisService`.
2. **User consent**: Frontend displays notice that summaries are AI-generated by a third-party service.
3. **Data retention**: Summaries expire after 24 h (`expires_at` column); a scheduled sweep (`DELETE FROM reasoning_summaries WHERE expires_at < NOW()`) runs daily.
4. **Right-to-deletion**: `ON DELETE CASCADE` from `comments` — deleting a comment auto-purges its summary from both DB and triggers cache invalidation.
5. **AI transparency**: All AI-generated content is labeled with the ✨ `Sparkles` icon and "AI Summary" header in the frontend.

### Compliance

| Regulation | How Met |
|-----------|---------|
| **GDPR** | Cascade delete on comment removal; 24 h TTL; user can request data deletion |
| **CCPA** | Minimum-necessary retention; no secondary use of summary data |
| **AI Act** | Clear labeling of AI-generated content in UI |

---

## Development Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **AI latency on first load** | High | UX — user sees spinner for 2–5 s | Frontend shows animated loading state (already in `ReasoningSummaryPanel.jsx`); pre-seed popular comments; cache aggressively (24 h TTL) |
| 2 | **Mock ↔ production AI divergence** | Medium | Integration bugs on deploy | `MockAIAnalysisService` returns structurally identical DTOs; integration tests validate the `IAIAnalysisService` interface contract |
| 3 | **In-memory cache lost on restart** | Medium | Cold-start latency spike | Acceptable at P4 scale (10 users); DB serves as persistent fallback; summaries regenerate lazily |
| 4 | **Coherence score accuracy** | Medium | Misleading quality signals | Start with mock-era fixed scores; iterate prompt engineering post-MVP; add user-feedback loop later |
| 5 | **OpenAI API rate limiting** | High | Service degradation | `MockAIAnalysisService` eliminates this in dev/test; in production: per-user rate limiter + 24 h cache means ≤ 1 OpenAI call per comment per day |
| 6 | **Cache staleness on comment edit** | Low | User sees old summary after edit | Invalidate cache + DB row when comment is updated (`CommentController.update()` calls `ReasoningSummaryService.invalidateCache()`) |
| 7 | **Prompt injection** | Low | Malicious comment text manipulates AI output | `CommentValidator.sanitizeText()` strips control characters; AI output is treated as untrusted display-only text (no HTML rendering) |
| 8 | **10-user ceiling exceeded** | Low | Memory growth, potential OOM | `InMemoryCacheService.sweepExpired()` runs every 60 s; `maxEntries` guard on Map size (default 10 000) |

---

## Testing Strategy

### Testing with `MockAIAnalysisService`

All tests inject `MockAIAnalysisService` instead of the production `AIAnalysisService`. This ensures:

- **Zero network calls** — tests are fast and deterministic.
- **Interface compliance** — `MockAIAnalysisService` implements the exact same `IAIAnalysisService` interface.
- **Reproducible results** — same input always produces the same output.

### Unit Tests

| Test File | Class Under Test | Key Cases |
|-----------|-----------------|-----------|
| `ReasoningSummaryService.test.ts` | `ReasoningSummaryService` | Cache hit returns DTO; cache miss + DB hit returns & caches; cache miss + DB miss generates via AI; `invalidateCache` clears both |
| `MockAIAnalysisService.test.ts` | `MockAIAnalysisService` | Returns valid `Claim[]`; returns valid `EvidenceBlock[]`; coherence in [0,1]; summary is non-empty string |
| `InMemoryCacheService.test.ts` | `InMemoryCacheService` | `get` returns null for missing key; `get` returns null after TTL; `set` + `get` round-trip; `sweepExpired` evicts expired entries |
| `CommentValidator.test.ts` | `CommentValidator` | Positive int passes; zero/negative/NaN/string throws; sanitize strips control chars |
| `ReasoningSummaryRepository.test.ts` | `ReasoningSummaryRepository` | `upsert` inserts new row; `upsert` updates existing; `findByCommentId` respects `expires_at`; `deleteByCommentId` removes row |

### Integration Tests

| Test File | Flow Tested |
|-----------|------------|
| `reasoning-summary.integration.test.ts` | Full HTTP flow: seed comment → `GET /api/v1/comments/:id/reasoning-summary` → assert 200 with correct DTO shape → second request hits cache |
| `reasoning-summary-errors.integration.test.ts` | 401 without JWT; 400 with invalid ID; 404 with nonexistent comment; 429 after rate limit exceeded |

### Example Test (Unit)

```typescript
// tests/unit/ReasoningSummaryService.test.ts
import { ReasoningSummaryService } from '../../src/services/ReasoningSummaryService';
import { MockAIAnalysisService } from '../../src/services/MockAIAnalysisService';
import { InMemoryCacheService } from '../../src/services/InMemoryCacheService';

describe('ReasoningSummaryService', () => {
  let service: ReasoningSummaryService;
  let cache: InMemoryCacheService;
  let mockAI: MockAIAnalysisService;
  let mockCommentRepo: jest.Mocked<CommentRepository>;
  let mockSummaryRepo: jest.Mocked<ReasoningSummaryRepository>;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    mockAI = new MockAIAnalysisService();
    mockCommentRepo = { getById: jest.fn() } as any;
    mockSummaryRepo = { findByCommentId: jest.fn(), upsert: jest.fn(), deleteByCommentId: jest.fn() } as any;
    service = new ReasoningSummaryService(mockAI, cache, mockCommentRepo, mockSummaryRepo);
  });

  afterEach(() => cache.destroy());

  it('returns cached summary on cache hit', async () => {
    const dto = { commentId: 1, summary: 'cached', primaryClaim: 'c', evidenceBlocks: [], coherenceScore: 0.8, generatedAt: new Date() };
    await cache.set('reasoning_summary:1', dto, 86400);

    const result = await service.getSummary(1);
    expect(result).toEqual(dto);
    expect(mockCommentRepo.getById).not.toHaveBeenCalled();
  });

  it('generates and caches on full miss', async () => {
    mockSummaryRepo.findByCommentId.mockResolvedValue(null);
    mockCommentRepo.getById.mockResolvedValue({ id: 1, text: 'Some argument text', postId: 1, authorId: 1 } as any);
    mockSummaryRepo.upsert.mockImplementation(async (data) => ({ ...data, id: 99, created_at: new Date(), updated_at: new Date(), expires_at: new Date() }));

    const result = await service.getSummary(1);

    expect(result.commentId).toBe(1);
    expect(result.summary).toContain('Mock summary');
    expect(result.coherenceScore).toBe(0.75);
    expect(mockSummaryRepo.upsert).toHaveBeenCalledTimes(1);
    expect(await cache.exists('reasoning_summary:1')).toBe(true);
  });

  it('invalidateCache removes from cache and DB', async () => {
    await cache.set('reasoning_summary:1', { commentId: 1 }, 86400);
    mockSummaryRepo.deleteByCommentId.mockResolvedValue(undefined);

    await service.invalidateCache(1);

    expect(await cache.exists('reasoning_summary:1')).toBe(false);
    expect(mockSummaryRepo.deleteByCommentId).toHaveBeenCalledWith(1);
  });
});
```

---

## File Structure (US1-Specific within Backend)

```
backend/src/
├── routes/
│   └── reasoningSummary.routes.ts       # Route registration
├── controllers/
│   └── ReasoningSummaryController.ts    # HTTP handler
├── services/
│   ├── interfaces/
│   │   ├── IAIAnalysisService.ts        # Shared AI contract
│   │   ├── ICacheService.ts             # Shared cache contract
│   │   └── IReasoningSummaryService.ts  # US1 service contract
│   ├── AIAnalysisService.ts             # Prod OpenAI impl (shared)
│   ├── MockAIAnalysisService.ts         # Mock impl (shared)
│   ├── InMemoryCacheService.ts          # Map cache (shared)
│   └── ReasoningSummaryService.ts       # US1 orchestrator
├── repositories/
│   ├── CommentRepository.ts             # Shared
│   └── ReasoningSummaryRepository.ts    # US1
├── models/
│   ├── ReasoningSummary.ts              # DTOs + row types
│   ├── EvidenceBlock.ts                 # Value object
│   ├── Claim.ts                         # Value object
│   ├── Comment.ts                       # Entity
│   └── AnalysisResult.ts               # AI pipeline DTO
├── utils/
│   ├── CommentValidator.ts              # Param validation
│   └── NLPProcessor.ts                  # Sentence/token util
└── middleware/
    ├── authMiddleware.ts                # JWT verification (shared)
    ├── rateLimiter.ts                   # In-memory rate limiter (shared)
    ├── validate.ts                      # Zod middleware (shared)
    └── errorHandler.ts                  # Global error handler (shared)

backend/tests/
├── unit/
│   ├── ReasoningSummaryService.test.ts
│   ├── MockAIAnalysisService.test.ts
│   ├── InMemoryCacheService.test.ts
│   ├── CommentValidator.test.ts
│   └── ReasoningSummaryRepository.test.ts
└── integration/
    ├── reasoning-summary.integration.test.ts
    └── reasoning-summary-errors.integration.test.ts
```

---

## Appendix A — Frontend Integration Notes

### `ReasoningSummaryPanel.jsx` Integration

The existing frontend component (`frontend/src/components/ReasoningSummaryPanel.jsx`) currently reads `comment.aiSummary` directly from mock data. To integrate with the US1 backend:

1. **Lazy-load on expand**: When the user clicks "Show AI Summary", the panel calls `GET /api/v1/comments/:commentId/reasoning-summary` instead of reading from `comment.aiSummary`.
2. **Loading state**: The `ReasoningSummaryPanel` already supports a `'loading'` state with a `Loader2` spinner — this remains unchanged.
3. **Error handling**: The `'error'` state (with retry button) maps to HTTP 500 responses; the `handleRetry` function re-fetches the endpoint.
4. **Empty state**: If the backend returns 404 (no comment found), show the `'empty'` panel state.

### Vite Proxy Configuration

Add to `frontend/vite.config.js`:

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

### `aiSummary` Delivery Strategy

**Decision: Separate lazy-load** (not inline on comment response).

- `GET /api/v1/posts/:id/comments` returns comments with `aiSummary: null`.
- When the user expands the summary panel, `GET /api/v1/comments/:commentId/reasoning-summary` is called.
- This avoids loading AI summaries for all comments upfront (may be dozens per post).

---

## Appendix B — Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant FE as ReasoningSummaryPanel.jsx
    participant Auth as authMiddleware
    participant RL as rateLimiter
    participant Ctrl as ReasoningSummaryController
    participant Svc as ReasoningSummaryService
    participant Cache as InMemoryCacheService
    participant DB as PostgreSQL
    participant AI as IAIAnalysisService

    User->>FE: Click "Show AI Summary"
    FE->>Auth: GET /api/v1/comments/3/reasoning-summary<br/>Bearer JWT

    Auth->>Auth: Verify JWT signature & expiry
    Auth->>RL: Pass userId
    RL->>RL: Check Map<userId, {count, windowStart}>

    alt Rate limit exceeded
        RL-->>FE: 429 Too Many Requests
    end

    RL->>Ctrl: req.user = { id: userId }
    Ctrl->>Ctrl: CommentValidator.validateCommentId(3)
    Ctrl->>Svc: getSummary(3)

    Svc->>Cache: get("reasoning_summary:3")

    alt Cache HIT
        Cache-->>Svc: ReasoningSummaryDTO
        Svc-->>Ctrl: DTO
        Ctrl-->>FE: 200 JSON
    else Cache MISS
        Svc->>DB: SELECT * FROM reasoning_summaries WHERE comment_id = 3 AND expires_at > NOW()

        alt DB row exists
            DB-->>Svc: ReasoningSummaryRow
            Svc->>Cache: set("reasoning_summary:3", dto, 86400)
            Svc-->>Ctrl: DTO
            Ctrl-->>FE: 200 JSON
        else No DB row
            Svc->>DB: SELECT * FROM comments WHERE id = 3
            DB-->>Svc: Comment row

            alt Comment not found
                Svc-->>Ctrl: throw 404
                Ctrl-->>FE: 404 Not Found
            else Comment found
                Svc->>AI: extractClaims(comment.text)
                AI-->>Svc: Claim[]
                Svc->>AI: extractEvidence(comment.text)
                AI-->>Svc: EvidenceBlock[]
                Svc->>AI: evaluateCoherence(claims, evidence)
                AI-->>Svc: number (0–1)
                Svc->>AI: generateSummary({ claims, evidence, coherence })
                AI-->>Svc: string

                Svc->>Svc: Build ReasoningSummaryDTO
                Svc->>DB: UPSERT INTO reasoning_summaries
                DB-->>Svc: ReasoningSummaryRow
                Svc->>Cache: set("reasoning_summary:3", dto, 86400)
                Svc-->>Ctrl: DTO
                Ctrl-->>FE: 200 JSON
            end
        end
    end

    FE->>User: Render summary panel<br/>(claim, evidence, coherence score)
```

---

## Appendix C — Environment Variables (US1-Relevant)

```env
# Server
PORT=4000
NODE_ENV=development     # "development" uses MockAIAnalysisService; "production" uses AIAnalysisService

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reddit_ai_debate
DB_USER=postgres
DB_PASSWORD=postgres

# Auth
JWT_SECRET=<random-256-bit-hex>
JWT_EXPIRES_IN=7d

# OpenAI (only used when NODE_ENV=production)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4

# Cache
CACHE_REASONING_TTL=86400       # 24 hours in seconds
CACHE_SWEEP_INTERVAL=60000      # 60 seconds in ms

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000      # 1 minute
RATE_LIMIT_MAX_REQUESTS=100     # per user per window
```

---

## Appendix D — Glossary

| Term | Definition |
|------|-----------|
| **Reasoning Summary** | An AI-generated analysis of a single comment, containing its primary claim, supporting evidence, and a coherence score |
| **Coherence Score** | A number in [0, 1] indicating how logically consistent the comment's argument is |
| **Evidence Block** | A structured piece of evidence extracted from comment text, typed (study/data/anecdote/authority/other) and rated (high/medium/low) |
| **`IAIAnalysisService`** | The shared interface abstracting all LLM calls; has production (OpenAI) and mock implementations |
| **InMemoryCacheService** | A `Map`-based in-process cache that replaces Redis under P4 constraints |
| **P4** | The set of architectural constraints for this project: 10 users, no Redis/Bull, mocked AI, numeric IDs, single-tenant PostgreSQL |
| **DTO** | Data Transfer Object — an immutable structure for transferring data between layers |

---

## Appendix E — Generated Backend Code

The following production-ready TypeScript implementations correspond to the two key shared services defined in this specification. Both classes explicitly document and enforce the MIT 6.005 Rep Invariants defined in the Data Abstraction section via `private checkRep(): void` methods.

### `InMemoryCacheService.ts`

```typescript
// ─── services/InMemoryCacheService.ts ───
import { ICacheService } from "./interfaces/ICacheService";

/**
 * InMemoryCacheService — Map-based in-process cache with TTL.
 *
 * Replaces Redis under P4 constraints (10 concurrent users).
 * Implements ICacheService (shared contract for US1 and US3).
 *
 * === MIT 6.005 Data Abstraction ===
 *
 * Rep:
 *   store          : Map<string, { value: object; expiresAt: number }>
 *   maxEntries     : number   (positive integer, default 10_000)
 *   sweepIntervalMs: number   (positive integer, default 60_000)
 *   sweepIntervalId: NodeJS.Timeout | null
 *
 * Abstraction Function:
 *   AF(r) = the partial function f where
 *     dom(f) = { key | r.store.has(key) ∧ r.store.get(key).expiresAt > Date.now() }
 *     f(key) = deep clone of r.store.get(key).value   for each key ∈ dom(f)
 *
 * Rep Invariant:
 *   r.maxEntries > 0
 *   ∧ r.sweepIntervalMs > 0
 *   ∧ r.store.size ≤ r.maxEntries
 *   ∧ ∀ (key, entry) ∈ r.store:
 *       key.length > 0
 *     ∧ entry.value !== null ∧ entry.value !== undefined
 *     ∧ entry.expiresAt > 0
 *
 * Safety from Rep Exposure:
 *   - All fields are private.
 *   - get() returns structuredClone(entry.value), not the stored reference.
 *   - set() stores structuredClone(value), not the caller's reference.
 *   - No public method exposes the Map, its keys, or its entries.
 *   - maxEntries and sweepIntervalMs are readonly.
 */

interface CacheEntry {
  value: object;
  expiresAt: number;
}

export class InMemoryCacheService implements ICacheService {
  // -- Rep --
  private readonly store: Map<string, CacheEntry>;
  private readonly maxEntries: number;
  private readonly sweepIntervalMs: number;
  private sweepIntervalId: NodeJS.Timeout | null;

  constructor(maxEntries: number = 10_000, sweepIntervalMs: number = 60_000) {
    if (maxEntries <= 0) throw new Error("maxEntries must be positive");
    if (sweepIntervalMs <= 0)
      throw new Error("sweepIntervalMs must be positive");

    this.store = new Map();
    this.maxEntries = maxEntries;
    this.sweepIntervalMs = sweepIntervalMs;
    this.sweepIntervalId = setInterval(
      () => this.sweepExpired(),
      this.sweepIntervalMs,
    );

    // Prevent the timer from keeping the Node.js process alive
    if (this.sweepIntervalId.unref) {
      this.sweepIntervalId.unref();
    }

    this.checkRep();
  }

  // ──────── Public API (ICacheService) ────────

  async get<T = object>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Expired entries are invisible to the abstract value
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.checkRep();
      return null;
    }

    // Defensive copy on output — caller cannot mutate cached data
    return structuredClone(entry.value) as T;
  }

  async set(
    key: string,
    value: object,
    ttlSeconds: number = 3600,
  ): Promise<void> {
    if (!key || key.length === 0) {
      throw new Error("Cache key must be non-empty");
    }
    if (value === null || value === undefined) {
      throw new Error("Cache value must not be null/undefined");
    }
    if (ttlSeconds <= 0) {
      throw new Error("TTL must be positive");
    }

    // Evict oldest entry if at capacity and this is a new key
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    // Defensive copy on input — caller cannot mutate stored data after set()
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    this.checkRep();
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.checkRep();
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.checkRep();
      return false;
    }

    return true;
  }

  // ──────── Sweep & Lifecycle ────────

  /**
   * Remove all entries whose expiresAt deadline has passed.
   * Called automatically every sweepIntervalMs by the internal timer.
   */
  sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    this.checkRep();
  }

  /**
   * Stop the sweep timer and clear the store.
   * Must be called in test teardown (afterEach) to prevent open handles.
   */
  destroy(): void {
    if (this.sweepIntervalId !== null) {
      clearInterval(this.sweepIntervalId);
      this.sweepIntervalId = null;
    }
    this.store.clear();
  }

  // ──────── Rep Invariant Check ────────

  /**
   * Asserts the rep invariant holds.
   * Called after every mutator in debug/test builds.
   * In production, the check is skipped for performance.
   */
  private checkRep(): void {
    if (process.env.NODE_ENV === "production") return;

    console.assert(
      this.maxEntries > 0,
      "RI violation: maxEntries must be positive",
    );
    console.assert(
      this.sweepIntervalMs > 0,
      "RI violation: sweepIntervalMs must be positive",
    );
    console.assert(
      this.store.size <= this.maxEntries,
      `RI violation: store size ${this.store.size} exceeds cap ${this.maxEntries}`,
    );

    for (const [key, entry] of this.store) {
      console.assert(
        key.length > 0,
        "RI violation: cache key must be non-empty",
      );
      console.assert(
        entry.value !== null && entry.value !== undefined,
        `RI violation: null/undefined value for key "${key}"`,
      );
      console.assert(
        entry.expiresAt > 0,
        `RI violation: expiresAt must be positive for key "${key}"`,
      );
    }
  }
}
```

### `MockAIAnalysisService.ts`

```typescript
// ─── services/MockAIAnalysisService.ts ───
import { IAIAnalysisService } from "./interfaces/IAIAnalysisService";
import { Claim } from "../models/Claim";
import { EvidenceBlock } from "../models/EvidenceBlock";
import { AnalysisResult } from "../models/AnalysisResult";

/**
 * MockAIAnalysisService — Deterministic test double for IAIAnalysisService.
 *
 * Shared between US1 and US3. Returns fixture data based on input text length.
 * Zero network calls. Used in all Jest test suites.
 *
 * === MIT 6.005 Data Abstraction ===
 *
 * Rep:
 *   fixtures: ReadonlyMap<string, AnalysisResult>   (immutable lookup table)
 *
 * Abstraction Function:
 *   AF(r) = an IAIAnalysisService that, for any input text t:
 *     - If r.fixtures.has(t), returns the pre-configured AnalysisResult for t.
 *     - Otherwise, returns a deterministic default result derived from len(t).
 *
 * Rep Invariant:
 *   ∀ (key, result) ∈ r.fixtures:
 *       key.length > 0
 *     ∧ result.claims.length ≥ 0
 *     ∧ result.evidence.length ≥ 0
 *     ∧ result.coherenceScore ≥ 0 ∧ result.coherenceScore ≤ 1
 *
 * Safety from Rep Exposure:
 *   - fixtures is private and readonly; its type is ReadonlyMap.
 *   - All returned arrays and objects are freshly constructed (not refs into fixtures).
 *   - The class has no setters or mutators.
 */
export class MockAIAnalysisService implements IAIAnalysisService {
  // -- Rep --
  private readonly fixtures: ReadonlyMap<string, AnalysisResult>;

  constructor(fixtures?: Map<string, AnalysisResult>) {
    this.fixtures = fixtures ? new Map(fixtures) : new Map();
    this.checkRep();
  }

  // ──────── Public API (IAIAnalysisService) ────────

  async extractClaims(text: string): Promise<Claim[]> {
    const fixtureResult = this.fixtures.get(text);
    if (fixtureResult) {
      // Return a defensive copy of fixture claims
      return fixtureResult.claims.map((c) => ({
        ...c,
        supportingEvidence: [...c.supportingEvidence],
      }));
    }

    // Default deterministic behavior: one claim derived from input
    return [
      {
        id: 1,
        text: text.substring(0, 60),
        supportingEvidence: ["mock-evidence-1"],
      },
    ];
  }

  async extractEvidence(text: string): Promise<EvidenceBlock[]> {
    const fixtureResult = this.fixtures.get(text);
    if (fixtureResult) {
      return fixtureResult.evidence.map((e) => ({ ...e }));
    }

    // Deterministic strength based on text length
    const strength: EvidenceBlock["strength"] =
      text.length > 200 ? "high" : text.length > 100 ? "medium" : "low";

    return [
      {
        type: "anecdote",
        content: "Mock evidence from text analysis",
        strength,
      },
    ];
  }

  async evaluateCoherence(
    _claims: Claim[],
    _evidence: EvidenceBlock[],
  ): Promise<number> {
    // Deterministic: always returns 0.75
    return 0.75;
  }

  async generateSummary(analysis: AnalysisResult): Promise<string> {
    const claimText = analysis.claims[0]?.text ?? "No claims found";
    return `Mock summary: Argues "${claimText}" with ${analysis.evidence.length} piece(s) of evidence.`;
  }

  // ──────── Rep Invariant Check ────────

  /**
   * Asserts the rep invariant holds.
   * Called once in the constructor (fixtures are immutable after construction).
   */
  private checkRep(): void {
    for (const [key, result] of this.fixtures) {
      console.assert(
        key.length > 0,
        "RI violation: fixture key must be non-empty",
      );
      console.assert(
        Array.isArray(result.claims) && result.claims.length >= 0,
        `RI violation: claims must be an array for fixture "${key}"`,
      );
      console.assert(
        Array.isArray(result.evidence) && result.evidence.length >= 0,
        `RI violation: evidence must be an array for fixture "${key}"`,
      );
      console.assert(
        result.coherenceScore >= 0 && result.coherenceScore <= 1,
        `RI violation: coherenceScore must be in [0,1] for fixture "${key}", got ${result.coherenceScore}`,
      );
    }
  }
}
```
