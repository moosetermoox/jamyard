# AI Task Design

## Design Principle

**AI outputs must be structured and validated before the engine acts on them.**

The AI should never directly decide eliminations or scores via unstructured text. Instead:
1. AI returns structured JSON with a defined schema
2. Engine validates the JSON before use
3. If validation fails, engine uses fallback behavior
4. Hooks interpret AI output — the engine never parses free text for decisions

## Task Types Overview

| Task Type | Purpose | Output Type |
|-----------|---------|-------------|
| `summarize` | Combine responses into insight | Text with metadata |
| `generate` | Create content (poems, stories) | Text content |
| `generate-choices` | Create quiz questions | Choices array with answer |
| `compare` | Group by semantic similarity | Groups of IDs |
| `rank` | Order by criteria | Ordered list with scores |
| `judge` | Pick winner with explanation | Winner ID + reasoning |

---

## Model Recommendations

| Task Type | Recommended Model | Reasoning |
|-----------|------------------|-----------|
| `summarize` | claude-3-haiku-20240307 | Simple aggregation, speed matters |
| `generate` | claude-3-haiku-20240307 | Creative but straightforward |
| `generate-choices` | claude-sonnet-4-20250514 | Needs accuracy for correct answers |
| `compare` | claude-sonnet-4-20250514 | Semantic understanding is critical |
| `rank` | claude-sonnet-4-20250514 | Fair judgment requires nuance |
| `judge` | claude-sonnet-4-20250514 | Final decision needs best reasoning |

**Notes:**
1. **Override in config**: Model can be specified per `ai-process` phase in game config if needed (e.g., use Sonnet for a particularly important poem)
2. **Mock mode**: Model selection is ignored in mock mode — no API calls are made
3. **Cost**: Haiku is ~10x cheaper than Sonnet. For a typical game session with 5 AI calls, expect ~$0.01-0.05 depending on task mix

---

## 1. `summarize`

Combine multiple player responses into a cohesive insight or summary.

### System Prompt Template

```
You are analyzing responses from a classroom activity. Your job is to summarize the collective input in a way that's warm, supportive, and appropriate for students of all ages.

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
Summarize these {{count}} student responses about: "{{prompt}}"

Responses:
{{#each responses}}
- {{this.name}}: "{{this.text}}"
{{/each}}

Respond with JSON:
{
  "summary": "Your 2-3 sentence summary here",
  "themes": ["theme1", "theme2"],
  "sentiment": "positive" | "neutral" | "mixed" | "negative",
  "outliers": ["any unusual responses worth noting"]
}
```

### JSON Output Schema

```typescript
type SummarizeOutput = {
  summary: string;           // 2-3 sentence summary
  themes: string[];          // 1-5 common themes identified
  sentiment: "positive" | "neutral" | "mixed" | "negative";
  outliers: string[];        // 0-3 notable unusual responses
}
```

### Validation Rules

1. `summary` must be a non-empty string, max 500 characters
2. `themes` must be an array of 1-5 strings
3. `sentiment` must be one of the four allowed values
4. `outliers` must be an array (can be empty), max 3 items

### Fallback Behavior

If validation fails:
1. If JSON parse fails → return `{ summary: "The class shared a variety of responses!", themes: [], sentiment: "neutral", outliers: [] }`
2. If `summary` missing/invalid → use first 200 chars of raw AI text as summary
3. If other fields invalid → use defaults: `themes: []`, `sentiment: "neutral"`, `outliers: []`

### Examples

**Good Output:**
```json
{
  "summary": "The class is feeling energetic today! Most students mentioned feeling happy or excited, with several looking forward to the weekend.",
  "themes": ["happy", "excited", "tired"],
  "sentiment": "positive",
  "outliers": ["One student mentioned feeling anxious about an upcoming test"]
}
```

**Bad Output (missing required field):**
```json
{
  "themes": ["happy", "tired"],
  "sentiment": "positive"
}
```
*Fallback: Use default summary text.*

**Bad Output (invalid sentiment):**
```json
{
  "summary": "Students are feeling good!",
  "themes": ["good"],
  "sentiment": "happy"
}
```
*Fallback: Replace `sentiment` with "neutral".*

---

## 2. `generate`

Create original content based on player input (poems, stories, songs, etc.).

### System Prompt Template

```
You are a fun, creative game host for a classroom activity. Create entertaining content based on student responses. Keep everything appropriate for all ages — playful but never inappropriate.

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
{{instruction}}

Student responses to incorporate:
{{#each responses}}
- {{this.name}}: "{{this.text}}"
{{/each}}

Respond with JSON:
{
  "content": "Your generated content here",
  "title": "Optional creative title",
  "references": ["names of students whose responses were featured"]
}
```

### JSON Output Schema

```typescript
type GenerateOutput = {
  content: string;           // The generated content (poem, story, etc.)
  title?: string;            // Optional title for the content
  references: string[];      // Names of students featured/referenced
}
```

### Validation Rules

1. `content` must be a non-empty string, max 2000 characters
2. `title` is optional; if present, max 100 characters
3. `references` must be an array of strings (can be empty)

### Fallback Behavior

If validation fails:
1. If JSON parse fails → extract any text between quotes as content
2. If `content` missing → use raw AI response as content (truncated to 2000 chars)
3. If `references` invalid → default to empty array

### Examples

**Good Output:**
```json
{
  "content": "On weekends we rest and play,\nSome watched movies all the day,\nOthers kicked a soccer ball,\nBut sleeping in was best of all!",
  "title": "The Weekend Song",
  "references": ["Alex", "Jordan", "Sam"]
}
```

**Bad Output (content too long):**
```json
{
  "content": "[3000 character essay...]",
  "references": []
}
```
*Fallback: Truncate content to 2000 characters.*

---

## 3. `generate-choices`

Create multiple choice questions with one correct answer.

### System Prompt Template

```
You are creating quiz questions for a classroom game. Generate clear, unambiguous questions with exactly one correct answer. Make wrong answers plausible but clearly incorrect when you know the subject.

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
Create a multiple choice question based on this context:
{{context}}

Topic: {{topic}}
Difficulty: {{difficulty}}

Respond with JSON:
{
  "question": "The question text",
  "choices": [
    {"id": "a", "text": "First choice"},
    {"id": "b", "text": "Second choice"},
    {"id": "c", "text": "Third choice"},
    {"id": "d", "text": "Fourth choice"}
  ],
  "correctId": "b",
  "explanation": "Brief explanation of why this is correct"
}
```

### JSON Output Schema

```typescript
type GenerateChoicesOutput = {
  question: string;
  choices: Array<{
    id: string;              // "a", "b", "c", or "d"
    text: string;            // The choice text
  }>;
  correctId: string;         // Must match one of the choice IDs
  explanation: string;       // Why the correct answer is correct
}
```

### Validation Rules

1. `question` must be a non-empty string
2. `choices` must be an array of exactly 4 items
3. Each choice must have `id` (one of "a","b","c","d") and non-empty `text`
4. `correctId` must match one of the choice IDs
5. `explanation` must be a non-empty string

### Fallback Behavior

If validation fails:
1. If JSON parse fails → cannot recover, return error state
2. If wrong number of choices → cannot recover, return error state
3. If `correctId` doesn't match any choice → use first choice as correct
4. If `explanation` missing → use "This is the correct answer."

**Error state:** Game should skip this question or use a pre-defined backup question.

### Examples

**Good Output:**
```json
{
  "question": "What is the capital of France?",
  "choices": [
    {"id": "a", "text": "London"},
    {"id": "b", "text": "Paris"},
    {"id": "c", "text": "Berlin"},
    {"id": "d", "text": "Madrid"}
  ],
  "correctId": "b",
  "explanation": "Paris has been the capital of France since the 10th century."
}
```

**Bad Output (correctId doesn't match):**
```json
{
  "question": "What is 2 + 2?",
  "choices": [
    {"id": "a", "text": "3"},
    {"id": "b", "text": "4"},
    {"id": "c", "text": "5"},
    {"id": "d", "text": "6"}
  ],
  "correctId": "x",
  "explanation": "Basic addition"
}
```
*Fallback: Set `correctId` to "a" (first choice). This may be wrong — log a warning.*

---

## 4. `compare`

Group responses by semantic similarity (for duplicate detection).

### System Prompt Template

```
You are comparing student responses to find matches. Two responses "match" if they describe essentially the same thing, even if worded differently. Focus on meaning, not exact wording.

Examples of matches:
- "eat it" and "eating corn" = MATCH (same action)
- "make popcorn" and "pop it" = MATCH (same concept)
- "feed animals" and "eat it" = NO MATCH (different actors)

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
Group these responses by semantic similarity. Each group should contain responses that mean essentially the same thing.

Responses:
{{#each responses}}
- ID "{{this.playerId}}": "{{this.text}}"
{{/each}}

Respond with JSON:
{
  "groups": [
    {
      "theme": "short description of what this group means",
      "memberIds": ["id1", "id2"]
    }
  ],
  "reasoning": "Brief explanation of how you grouped them"
}
```

### JSON Output Schema

```typescript
type CompareOutput = {
  groups: Array<{
    theme: string;           // What this group represents
    memberIds: string[];     // Player IDs in this group
  }>;
  reasoning: string;         // Explanation of grouping logic
}
```

### Validation Rules

1. `groups` must be an array (can be empty if all unique)
2. Each group must have `theme` (string) and `memberIds` (array of strings)
3. Each `memberIds` must contain at least 1 ID
4. All IDs in groups must exist in the original input
5. No ID should appear in multiple groups
6. `reasoning` must be a string (can be empty)

### Fallback Behavior

If validation fails:
1. If JSON parse fails → treat all responses as unique (no groups)
2. If duplicate IDs across groups → keep first occurrence only
3. If unknown IDs → remove them from groups
4. If `reasoning` missing → use empty string

### Examples

**Good Output:**
```json
{
  "groups": [
    {
      "theme": "eating corn",
      "memberIds": ["player1", "player3"]
    },
    {
      "theme": "making popcorn",
      "memberIds": ["player2", "player5", "player7"]
    }
  ],
  "reasoning": "Grouped by the core action described. 'Eat it' and 'eating corn' both describe consumption. 'Pop it' and 'make popcorn' both describe making popcorn."
}
```

**Bad Output (duplicate ID):**
```json
{
  "groups": [
    {"theme": "eating", "memberIds": ["p1", "p2"]},
    {"theme": "cooking", "memberIds": ["p2", "p3"]}
  ],
  "reasoning": "..."
}
```
*Fallback: Remove "p2" from second group → `["p3"]`*

**Bad Output (unknown ID):**
```json
{
  "groups": [
    {"theme": "eating", "memberIds": ["p1", "p999"]}
  ],
  "reasoning": "..."
}
```
*Fallback: Remove "p999" → `["p1"]`*

---

## 5. `rank`

Order responses by a specified criteria (creativity, humor, etc.).

### System Prompt Template

```
You are ranking student responses for a classroom game. Be fair and consistent in your criteria. Every response deserves recognition — avoid harsh criticism. Focus on what makes each response work well.

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
Rank these responses by {{criteria}}.

Responses:
{{#each responses}}
- ID "{{this.playerId}}" ({{this.name}}): "{{this.text}}"
{{/each}}

Respond with JSON:
{
  "rankings": [
    {
      "playerId": "id",
      "rank": 1,
      "score": 95,
      "feedback": "Brief positive note about this response"
    }
  ],
  "criteria_notes": "How you interpreted the ranking criteria"
}
```

### JSON Output Schema

```typescript
type RankOutput = {
  rankings: Array<{
    playerId: string;        // Must match input player ID
    rank: number;            // 1 = best, no ties allowed
    score: number;           // 0-100 normalized score
    feedback: string;        // Positive note about this response
  }>;
  criteria_notes: string;    // How AI interpreted the criteria
}
```

### Validation Rules

1. `rankings` must include ALL input player IDs (no missing, no extras)
2. Each `rank` must be unique (1 through N, no ties)
3. Each `score` must be 0-100
4. Each `feedback` must be a non-empty string
5. `playerId` values must match input exactly

### Fallback Behavior

If validation fails:
1. If JSON parse fails → assign random order with equal scores (50)
2. If missing players → add them at the end with score 50, feedback "Great effort!"
3. If duplicate ranks → reassign sequential ranks by score order
4. If score out of range → clamp to 0-100
5. If feedback empty → use "Nice response!"

### Examples

**Good Output:**
```json
{
  "rankings": [
    {"playerId": "p1", "rank": 1, "score": 92, "feedback": "Super creative use of corn as a musical instrument!"},
    {"playerId": "p3", "rank": 2, "score": 85, "feedback": "Funny idea about corn-powered cars!"},
    {"playerId": "p2", "rank": 3, "score": 78, "feedback": "Classic but well-expressed!"}
  ],
  "criteria_notes": "Ranked by originality and creative thinking"
}
```

**Bad Output (missing player):**
```json
{
  "rankings": [
    {"playerId": "p1", "rank": 1, "score": 90, "feedback": "Great!"},
    {"playerId": "p3", "rank": 2, "score": 80, "feedback": "Nice!"}
  ],
  "criteria_notes": "..."
}
```
*Fallback: Add missing p2 → `{"playerId": "p2", "rank": 3, "score": 50, "feedback": "Great effort!"}`*

**Bad Output (tied ranks):**
```json
{
  "rankings": [
    {"playerId": "p1", "rank": 1, "score": 90, "feedback": "..."},
    {"playerId": "p2", "rank": 1, "score": 88, "feedback": "..."},
    {"playerId": "p3", "rank": 2, "score": 70, "feedback": "..."}
  ],
  "criteria_notes": "..."
}
```
*Fallback: Reassign by score → p1 rank 1, p2 rank 2, p3 rank 3*

---

## 6. `judge`

Pick a winner and explain why (final decision with reasoning).

### System Prompt Template

```
You are the final judge in a classroom game. Pick a winner fairly and explain your reasoning in a way that celebrates the winner while acknowledging other great responses. Be encouraging to everyone.

You MUST respond with valid JSON matching the schema provided. Do not include any text outside the JSON object.
```

### User Prompt Template

```
Pick a winner from these finalists based on: {{criteria}}

Finalists:
{{#each responses}}
- ID "{{this.playerId}}" ({{this.name}}): "{{this.text}}"
{{/each}}

Respond with JSON:
{
  "winnerId": "playerId of the winner",
  "winnerName": "Name of the winner",
  "reasoning": "2-3 sentences explaining why they won",
  "honorableMentions": [
    {
      "playerId": "id",
      "name": "name",
      "note": "What was great about their response"
    }
  ]
}
```

### JSON Output Schema

```typescript
type JudgeOutput = {
  winnerId: string;          // Must match an input player ID
  winnerName: string;        // Display name of winner
  reasoning: string;         // 2-3 sentence explanation
  honorableMentions: Array<{
    playerId: string;
    name: string;
    note: string;
  }>;
}
```

### Validation Rules

1. `winnerId` must match one of the input player IDs
2. `winnerName` must be a non-empty string
3. `reasoning` must be a non-empty string, max 500 characters
4. `honorableMentions` must be an array (can be empty)
5. Each honorable mention must have valid `playerId`, `name`, and `note`

### Fallback Behavior

If validation fails:
1. If JSON parse fails → pick random winner from inputs
2. If `winnerId` invalid → pick first input player as winner
3. If `reasoning` missing → use "Congratulations to our winner!"
4. If `honorableMentions` invalid → use empty array

### Examples

**Good Output:**
```json
{
  "winnerId": "p3",
  "winnerName": "Jordan",
  "reasoning": "Jordan's idea of using corn silk as dental floss was brilliantly unexpected! It combined creativity with practical thinking in a way that made everyone laugh.",
  "honorableMentions": [
    {
      "playerId": "p1",
      "name": "Alex",
      "note": "The corn-powered rocket ship was wonderfully imaginative!"
    }
  ]
}
```

**Bad Output (invalid winner ID):**
```json
{
  "winnerId": "p999",
  "winnerName": "Unknown",
  "reasoning": "Great answer!",
  "honorableMentions": []
}
```
*Fallback: Set `winnerId` to first input player, update `winnerName` accordingly.*

---

## Implementation Notes

### Model Selection

The AIService should select the model based on task type:

```javascript
const TASK_MODELS = {
  summarize: 'claude-3-haiku-20240307',
  generate: 'claude-3-haiku-20240307',
  'generate-choices': 'claude-sonnet-4-20250514',
  compare: 'claude-sonnet-4-20250514',
  rank: 'claude-sonnet-4-20250514',
  judge: 'claude-sonnet-4-20250514'
};

function getModelForTask(taskType, configOverride = null) {
  // Config override takes precedence
  if (configOverride) {
    return configOverride;
  }
  // Fall back to recommended model for task type
  return TASK_MODELS[taskType] || 'claude-3-haiku-20240307';
}
```

In the `ai-process` phase config, model can be overridden:

```json
{
  "type": "ai-process",
  "task": "generate",
  "model": "claude-sonnet-4-20250514",
  "instruction": "Write an epic poem worthy of Homer",
  "input": "collect.responses",
  "next": "reveal"
}
```

### JSON Extraction

Before parsing, the engine should:
1. Trim whitespace from AI response
2. If response starts with ` ```json `, extract content between code fences
3. If response contains multiple JSON objects, use the first complete one
4. Attempt `JSON.parse()` on cleaned string

```javascript
function extractJSON(text) {
  // Remove markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}
```

### Validation Function Pattern

Each task type should have a validation function:

```javascript
function validateSummarizeOutput(output, inputResponses) {
  const errors = [];

  if (!output.summary || typeof output.summary !== 'string') {
    errors.push('missing or invalid summary');
  } else if (output.summary.length > 500) {
    errors.push('summary exceeds 500 characters');
  }

  // ... more validation ...

  return {
    valid: errors.length === 0,
    errors,
    sanitized: applySanitization(output, errors)
  };
}
```

### Logging

All AI task executions should log:
1. Task type and input summary
2. Raw AI response (for debugging)
3. Validation result (pass/fail, any errors)
4. Final output used by engine

### Testing with Mock Mode

In mock mode, the AI service should return valid JSON that matches the schema:

```javascript
const MOCK_RESPONSES = {
  summarize: {
    summary: "[MOCK] Students shared various responses",
    themes: ["mock-theme"],
    sentiment: "neutral",
    outliers: []
  },
  // ... other task types
};
```

---

## Config Integration

In game config, the `ai-process` phase specifies the task type:

```json
{
  "type": "ai-process",
  "task": "compare",
  "instruction": "Group these answers by semantic similarity",
  "input": "round1-collect.responses",
  "next": "round1-eliminate"
}
```

The engine:
1. Looks up the task type ("compare")
2. Loads the appropriate system prompt template
3. Builds the user prompt with input data
4. Calls AI and parses response
5. Validates output against schema
6. Applies fallbacks if needed
7. Stores result for next phase

---

## Security Considerations

1. **Never eval() AI output** — always use JSON.parse()
2. **Sanitize all string fields** — escape HTML if displayed
3. **Validate IDs against known inputs** — reject unknown player IDs
4. **Limit string lengths** — prevent memory issues from huge responses
5. **Log but don't expose raw AI errors** — show friendly messages to players
