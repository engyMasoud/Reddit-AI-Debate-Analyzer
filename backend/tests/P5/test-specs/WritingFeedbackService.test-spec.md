# Test Specification — `WritingFeedbackService.ts`

**Source file:** `backend/src/services/WritingFeedbackService.ts`  
**User Story:** US3 — Real-Time Writing Feedback  
**Coverage target:** ≥ 80 % of execution paths

---

## Functions Under Test

| # | Function | Visibility | Description |
|---|----------|-----------|-------------|
| 1 | `analyzeDraft(text)` | public | Runs three detectors in parallel, aggregates results, caches, and returns a `FeedbackResult`. |
| 2 | `analyzeDraftAndLog(text, userId, draftId?)` | public | Calls `analyzeDraft`, then persists the result to `feedback_logs` via the repository. |
| 3 | `aggregateFeedback(issues, text)` | private | Combines issues into a full `FeedbackResult` by computing score, suggestions, good points, and confidence. |
| 4 | `computeScore(issues)` | private | Calculates a 0–1 quality score by subtracting severity-weighted penalties from 1.0. |
| 5 | `generateSuggestions(issues)` | private | Maps each issue type to a structured `Suggestion` object. |
| 6 | `identifyGoodPoints(issues, text)` | private | Regex-scans the draft for positive rhetorical patterns and returns an array of praise strings. |
| 7 | `hashText(text)` | private | Returns the SHA-256 hex digest of the input text. |

---

## Test Specification Table

| ID | Function | Test Purpose | Test Inputs | Expected Output |
|----|----------|-------------|-------------|-----------------|
| **T-01** | `analyzeDraft` | Return cached result when the draft has already been analyzed | `text = "Previously analyzed draft"`. Stub `cache.get` to return a pre-built `FeedbackResult`. | Returns the cached `FeedbackResult` directly; none of the three detectors are invoked. |
| **T-02** | `analyzeDraft` | Run all three detectors when no cache hit | `text = "A fresh draft with no cache entry"`. Stub `cache.get` → `null`. Stub each detector's `detect()` to return one `Issue` each. | Returns a `FeedbackResult` whose `issues` array contains exactly 3 issues (one per detector). `cache.set` is called once with key `draft_feedback:<sha256>` and TTL = `env.CACHE_FEEDBACK_TTL`. |
| **T-03** | `analyzeDraft` | Handle an empty-string draft | `text = ""`. Stub `cache.get` → `null`. All detectors return `[]`. | Returns `FeedbackResult` with `issues: []`, `score: 1.0`, `suggestions: []`, `confidence: 0.5`. Result is still cached. |
| **T-04** | `analyzeDraft` | Aggregate issues from multiple detectors correctly | `text = "Draft text"`. Stub `cache.get` → `null`. `circularLogicDetector.detect` returns 2 issues; `weakEvidenceDetector.detect` returns 1 issue; `unsupportedClaimsDetector.detect` returns 1 issue. | `result.issues.length === 4`. Issues from all three detectors appear in the returned array. |
| **T-05** | `analyzeDraft` | Same text produces the same cache key (deterministic hash) | Call `analyzeDraft("identical text")` twice. First call: `cache.get` → `null`. Second call: `cache.get` returns the result from the first call. | Second call returns the cached result without running detectors again. `cache.set` is called exactly once. |
| **T-06** | `analyzeDraftAndLog` | Persist analysis result to feedback log with explicit `draftId` | `text = "Log me"`, `userId = 42`, `draftId = 7`. Stub `analyzeDraft` to return a known `FeedbackResult`. Stub `feedbackLogRepo.save` to return a row with `id: 101`. | Returns `{ feedbackId: 101, result: <the FeedbackResult> }`. `feedbackLogRepo.save` is called with `{ userId: 42, draftId: 7, draftText: "Log me", issues, score, suggestions, confidence }`. |
| **T-07** | `analyzeDraftAndLog` | Persist with `draftId` omitted (defaults to `null`) | `text = "No draft id"`, `userId = 5`, `draftId` not passed. Stub `feedbackLogRepo.save` → row with `id: 200`. | `feedbackLogRepo.save` is called with `draftId: null`. Returns `{ feedbackId: 200, result }`. |
| **T-08** | `analyzeDraftAndLog` | Persist with `draftId` explicitly set to `null` | `text = "Explicit null"`, `userId = 5`, `draftId = null`. | `feedbackLogRepo.save` receives `draftId: null`. Behaves identically to T-07. |
| **T-09** | `aggregateFeedback` | Produce correct confidence as the average of issue confidences | `issues = [{ confidence: 0.8, ... }, { confidence: 0.6, ... }]`, `text = "any"` | `result.confidence === 0.7` (mean of 0.8 and 0.6). |
| **T-10** | `aggregateFeedback` | Default confidence for zero issues | `issues = []`, `text = "clean draft"` | `result.confidence === 0.5`. |
| **T-11** | `aggregateFeedback` | Result includes a `generatedAt` Date | Any non-empty issues list and text. | `result.generatedAt` is an instance of `Date` and is close to `Date.now()`. |
| **T-12** | `computeScore` | Perfect score when no issues exist | `issues = []` | Returns `1.0`. |
| **T-13** | `computeScore` | Single high-severity issue | `issues = [{ severity: 'high', ... }]` | Returns `0.85` (1 − 0.15). |
| **T-14** | `computeScore` | Single medium-severity issue | `issues = [{ severity: 'medium', ... }]` | Returns `0.90` (1 − 0.10). |
| **T-15** | `computeScore` | Single low-severity issue | `issues = [{ severity: 'low', ... }]` | Returns `0.95` (1 − 0.05). |
| **T-16** | `computeScore` | Mixed severities accumulate correctly | `issues = [{ severity: 'high' }, { severity: 'medium' }, { severity: 'low' }]` | Returns `0.70` (1 − 0.15 − 0.10 − 0.05). |
| **T-17** | `computeScore` | Score floors at 0 when penalties exceed 1.0 | `issues` = 10 issues each with `severity: 'high'` (penalty = 10 × 0.15 = 1.5). | Returns `0` (clamped by `Math.max(0, …)`). |
| **T-18** | `computeScore` | Unknown severity defaults to 0.05 penalty | `issues = [{ severity: 'critical' as any, ... }]` (unrecognized severity string). | Returns `0.95` (1 − 0.05 default). |
| **T-19** | `generateSuggestions` | Suggestion for `circular_logic` issue | `issues = [{ type: 'circular_logic', ... }]` | Returns `[{ text: 'Remove the repeated argument or expand it with new evidence', type: 'structure', priority: 'medium', exampleFix: 'Move this to a separate paragraph with new supporting points' }]`. |
| **T-20** | `generateSuggestions` | Suggestion for `weak_evidence` issue | `issues = [{ type: 'weak_evidence', ... }]` | Returns one `Suggestion` with `type: 'reference'`, `priority: 'high'`, text containing `'Add a specific citation'`. |
| **T-21** | `generateSuggestions` | Suggestion for `unsupported_claim` issue | `issues = [{ type: 'unsupported_claim', ... }]` | Returns one `Suggestion` with `type: 'clarity'`, `priority: 'high'`, text containing `'Avoid absolute claims'`. |
| **T-22** | `generateSuggestions` | Empty array when no issues | `issues = []` | Returns `[]`. |
| **T-23** | `generateSuggestions` | Multiple issues of mixed types | `issues = [{ type: 'circular_logic' }, { type: 'weak_evidence' }, { type: 'unsupported_claim' }]` | Returns an array of 3 `Suggestion` objects: types `'structure'`, `'reference'`, `'clarity'` respectively. |
| **T-24** | `generateSuggestions` | Unrecognized issue type produces no suggestion | `issues = [{ type: 'logical_fallacy' as any, ... }]` (type exists in `Issue` union but has no `case` in the switch). | Returns `[]` — the switch falls through without pushing a suggestion. |
| **T-25** | `identifyGoodPoints` | Detects "I think" position statement | `text = "I think renewable energy is important"`, `issues = []` | Returned array includes `'Clear assertion of main position'`. |
| **T-26** | `identifyGoodPoints` | Detects "I believe" position statement | `text = "I believe we should act now"`, `issues = []` | Returned array includes `'Clear assertion of main position'`. |
| **T-27** | `identifyGoodPoints` | Detects "I argue" position statement | `text = "I argue that policy must change"`, `issues = []` | Returned array includes `'Clear assertion of main position'`. |
| **T-28** | `identifyGoodPoints` | Detects evidence keywords ("according to", "study", etc.) | `text = "According to a 2024 study, results show improvement"`, `issues = []` | Returned array includes `'Attempts to provide evidence'`. |
| **T-29** | `identifyGoodPoints` | Detects percentage/numeric evidence | `text = "Approximately 75% of respondents agreed"`, `issues = []` | Returned array includes `'Attempts to provide evidence'`. |
| **T-30** | `identifyGoodPoints` | Detects four-digit year as evidence marker | `text = "The data from 2023 confirms this trend"`, `issues = []` | Returned array includes `'Attempts to provide evidence'`. |
| **T-31** | `identifyGoodPoints` | Detects capitalized technical concepts | `text = "Using Machine Learning to solve NLP tasks"`, `issues = []` | Returned array includes `'Mentions specific technical concepts'`. |
| **T-32** | `identifyGoodPoints` | All three good-point categories at once | `text = "I believe that according to the 2024 study, Machine Learning is vital"`, `issues = []` | Returns all three: `'Clear assertion of main position'`, `'Attempts to provide evidence'`, `'Mentions specific technical concepts'`. |
| **T-33** | `identifyGoodPoints` | Fallback message when nothing matches | `text = "ok sure"`, `issues = []` | Returns `['Draft submitted for analysis']`. |
| **T-34** | `hashText` | Returns a valid SHA-256 hex string | `text = "hello world"` | Returns a 64-character lowercase hex string equal to `crypto.createHash('sha256').update('hello world').digest('hex')`. |
| **T-35** | `hashText` | Different inputs produce different hashes | `text1 = "abc"`, `text2 = "def"` | `hashText("abc") !== hashText("def")`. |
| **T-36** | `hashText` | Identical inputs produce identical hashes | `text1 = "same"`, `text2 = "same"` | `hashText("same") === hashText("same")`. |
