# Developer Specification: Inline AI Reasoning Summary

## 1. Overview
* **User Story:** As a new user, I want an inline AI summary of a comment's reasoning so that I can quickly understand its main claims and supporting evidence.
* **Goal:** Display a concise 1–2 sentence summary next to comments highlighting claims, evidence, and logical coherence.
* **T-Shirt Size:** Small

---

## 2. Architecture Diagram

```mermaid
graph TD
    Client["Client (Web/Mobile)"] -->|GET /comments| API["API Gateway / Load Balancer"]
    API -->|Request| CommentService["Comment Service (FastAPI)"]
    CommentService -->|Read| DB[(PostgreSQL Read Replica)]
    CommentService -->|Check Cache| Redis[(Redis Cache)]

    subgraph AsyncProcessing["Async Processing"]
        CommentService -->|Publish New Comment Event| Queue["Message Queue (RabbitMQ)"]
        Worker["AI Analysis Worker"] -->|Consume Event| Queue
        Worker -->|Send Text| LLM["LLM Provider (e.g., OpenAI/Gemini)"]
        LLM -->|Return Analysis| Worker
        Worker -->|Write Summary| DB
        Worker -->|Update Cache| Redis
    end
```
---

## 3. Class Diagram
```mermaid
classDiagram
    class Comment {
        +UUID id
        +String content
        +UUID author_id
        +UUID parent_id
        +DateTime created_at
        +ReasoningSummary summary
    }

    class ReasoningSummary {
        +UUID id
        +UUID comment_id
        +String claim_text
        +String evidence_text
        +String coherence_note
        +Float confidence_score
    }

    class AIService {
        +generate_summary(text: String) ReasoningSummary
    }

    Comment "1" -- "0..1" ReasoningSummary : has
    AIService ..> ReasoningSummary : creates

```
---
##5. State Diagrams
```mermaid
stateDiagram-v2
    [*] --> Pending : Comment Created
    Pending --> Processing : Worker Picked Up
    Processing --> Completed : LLM Success
    Processing --> Failed : LLM Error / Timeout
    Failed --> Pending : Retry Policy (Max 3)
    Completed --> [*]
```
---
##6. Flow Chart Data Flow
```mermaid
sequenceDiagram
    participant User
    participant Client
    participant API
    participant Queue
    participant Worker
    participant DB

    User->>Client: Views Thread
    Client->>API: GET /threads/{id}/comments
    API->>DB: Fetch Comments + Summaries
    DB-->>API: Return Data
    
    alt Summary Missing (New Comment)
        API-->>Client: Return Comment (status: pending)
        Client->>Client: Show "Analyzing..." spinner
    else Summary Exists
        API-->>Client: Return Comment + Summary
        Client->>Client: Render Inline Summary
    end
    
    par Async Generation (for new comments)
        API->>Queue: Enqueue CommentID
        Queue->>Worker: Process Job
        Worker->>Worker: Generate Summary via LLM
        Worker->>DB: Save ReasoningSummary
    end
```
---
##9. API's
```json
{
  "comment_id": "uuid",
  "status": "completed",
  "claim": "Nuclear energy is cleaner than coal.",
  "evidence": "Cites carbon output statistics from 2023.",
  "coherence": "Logically sound."
}
```
