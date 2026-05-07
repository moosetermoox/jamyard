import Anthropic from '@anthropic-ai/sdk';
import { getAllowedFields } from '../engine/game-loader.js';
import { PHASE_SCHEMAS, getFields, getTransitions } from '../engine/phase-schemas.js';

/**
 * Extract text from the first text-type content block. Claude's content
 * array can include thinking/tool blocks; this returns the first text.
 * @param {any} message
 * @returns {string}
 */
function extractText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

// =======================================================================
// Phase docs — generated from PHASE_SCHEMAS so the AI prompts can't
// drift from the validator's allow-list. Two formats:
//
//   buildPhaseDocsForPrompt({ format: 'terse'   })  → light review prompt
//   buildPhaseDocsForPrompt({ format: 'verbose' })  → game generator prompt
//
// Hand-curated prose that the schema can't represent (foreach behavior,
// multi-field collect, per-player mode) lives in PHASE_EXTRA_GUIDANCE
// below and gets appended to the verbose form.
// =======================================================================

// Mixin-introduced fields. Excluded from prompt docs by default — they're
// either advanced (loops/screen-control) or handled separately (timer/from
// included individually because they're common). Kept here as a single
// list so it stays in sync with engine/phase-schemas.js MIXINS.
const COMMON_FIELDS_TO_INCLUDE = new Set(['timer', 'from', 'voters']);
const MIXIN_FIELDS_TO_SKIP = new Set([
  'hostShow', 'playerShow', 'hostTemplate', 'playerTemplate',
  'loopBack', 'loopCount'
]);

function describeFieldType(fdef) {
  switch (fdef.type) {
    case 'string':         return 'string';
    case 'templateString': return 'string with {{tokens}}';
    case 'boolean':        return 'boolean';
    case 'integer': {
      if (fdef.min != null && fdef.max != null) return `number ${fdef.min}-${fdef.max}`;
      if (fdef.min != null) return `number ≥ ${fdef.min}`;
      if (fdef.max != null) return `number ≤ ${fdef.max}`;
      return 'number';
    }
    case 'enum':           return fdef.values.map(v => `"${v}"`).join('/');
    case 'phaseRef':       return 'phase ID';
    case 'dataRef':        return 'data ref like "phaseId.field"';
    case 'array':          return 'array';
    case 'object':         return 'object';
    case 'oneOf':          return fdef.options.map(o => describeFieldType(o)).join(' OR ');
    default:               return fdef.type;
  }
}

function fieldEntry(fname, fdef) {
  return `"${fname}" (${describeFieldType(fdef)})`;
}

// Per-phase prose that the schema can't model. Keep concise; the field
// listings come from the schema.
const PHASE_EXTRA_GUIDANCE = {
  collect:
    `MULTI-FIELD COLLECT: When a game needs multiple separate inputs (e.g. "two truths and a lie" needs 3 inputs), use the "fields" array:
    "fields": [{"label": "Truth 1", "key": "truth1"}, {"label": "Truth 2", "key": "truth2"}, {"label": "The Lie", "key": "lie"}]
    Each field renders as a separate labeled text input. The response is stored with a "fields" object (keyed by "key") plus a "text" field joining all values.
    Inside foreach, reference specific fields with _current.fields.<key> (e.g. _current.fields.lie).
    Use "choices": "_current.shuffledFields" in a collect-choice sub-phase to show field values as shuffled multiple-choice options.
    Use "correctAnswer": "_current.fields.<key>" in scoring to match against a specific field value.`,

  'ai-process':
    `PER-PLAYER MODE: set "perPlayer": true to generate one item per player (e.g. unique debate topics, scenarios, math problems). The engine asks for exactly N items, parses as a JSON array, and assigns one to each player. In any later "collect" or "collect-choice" prompt, write {{phaseId.mine}} and the engine substitutes that player's item per-recipient. Do NOT use {{phaseId.result}} for per-player content — result is the full array and renders as joined text. Example:
    "topics": { "type": "ai-process", "instruction": "Generate fun debate topics for teens...", "perPlayer": true, "next": "argue" },
    "argue": { "type": "collect", "prompt": "Your topic: {{topics.mine}}\\n\\nWrite your argument.", "timer": 90, "next": "..." }`,

  foreach:
    `Sub-phases can ONLY be: announce, collect, collect-choice. No "next" needed — they chain automatically.

    Template variables inside foreach sub-phases:
    - {{_current.text}} — the current item's text content
    - {{_current.playerName}} — who submitted the current item
    - {{_foreach.<foreachPhaseId>.index}} — current iteration (1-based)
    - {{_foreach.<foreachPhaseId>.total}} — total iterations

    HOW FOREACH WORKS:
    foreach iterates over PLAYER RESPONSES from a collect phase. Each iteration focuses on ONE player's response.
    It CANNOT iterate over AI-generated content. It CANNOT mix AI content with player content.
    The data source MUST be a collect phase's .responses.

    CANDIDATE GENERATION (for "who wrote this?" guessing games):
    Set "candidateSource": "players" and "decoyCount": 3 on the foreach phase.
    Then use "choices": "_candidates" in a collect-choice sub-phase.
    _candidates becomes an array of PLAYER NAMES (strings): the real author + N random other player names.
    _candidates is ONLY usable as the "choices" value in collect-choice. You CANNOT do _candidates[0].text or _candidates.0.text.
    It is ONLY useful for "guess who wrote this" style games.

    FIELD-BASED CHOICES (for "pick from the player's own answers" games like Two Truths and a Lie):
    When the collect phase uses "fields", use "choices": "_current.shuffledFields" in a collect-choice sub-phase.
    This creates a shuffled array of ALL the current item's field values as choices.
    Use "correctAnswer": "_current.fields.<key>" to score against a specific field (e.g. "_current.fields.lie").
    EXAMPLE: Two Truths and a Lie scoring: { "subPhase": "guess", "correctAnswer": "_current.fields.lie", "pointsCorrect": 100 }

    Scoring has TWO modes:
    A) "correct" mode (for guessing games — who wrote it?):
       { "subPhase": "<collect-choice-id>", "correctAnswer": "_current.playerName", "pointsCorrect": 100 }
       Players earn points for correctly guessing the author. REQUIRES collect-choice with choices: "_candidates".
    B) "tally" mode (for rating games — rate each response):
       { "subPhase": "<collect-choice-id>", "mode": "tally", "pointMap": { "Great": 30, "Good": 20, "OK": 10 } }
       The author earns points based on how others rate their response. Uses collect-choice with LITERAL string choices (NOT _candidates).
       Author is auto-excluded (can't rate own item).
    Do NOT invent custom scoring modes beyond "correct" and "tally".

    AI INJECTION (for "human vs AI" detection games):
    Add "aiInject" to the foreach config to have AI generate fake responses that get mixed in with real ones:
    "aiInject": { "count": 3, "instruction": "Generate fake birthday party ideas matching the style of the real student responses." }
    - AI items get isAI: true and isHuman: false flags, real items get isAI: false and isHuman: true
    - AI items have playerName "AI" but this is hidden during the game — players see the text only
    - Use correctAnswer: "_current.isHuman" in scoring to award points for correctly guessing "Human" or "AI"
    - The choices for the detect sub-phase MUST be exactly ["Human", "AI"] to match the scoring

    EXAMPLE: Human vs AI detection game with aiInject (one-at-a-time):
    "each-idea": {
      "type": "foreach", "data": "collect.responses", "shuffle": true,
      "aiInject": { "count": 3, "instruction": "Generate fake answers matching the student responses." },
      "subPhases": {
        "show": { "type": "announce", "message": "Someone said:\\n\\n\\"{{_current.text}}\\"", "timer": 8 },
        "guess": { "type": "collect-choice", "prompt": "Was this written by a human or AI?", "choices": ["Human", "AI"], "timer": 15 }
      },
      "scoring": { "subPhase": "guess", "correctAnswer": "_current.isHuman", "pointsCorrect": 100 },
      "next": "scores"
    }

    PAIR MODE (for side-by-side human vs AI comparison):
    Add "pairMode": "human-vs-ai" to show pairs of items (one human, one AI) side by side each iteration.
    - Requires aiInject to be configured
    - Each iteration item has: _current.a (one item), _current.b (the other), randomly assigned
    - _current.aiPosition is "Idea A" or "Idea B" (which position the AI item is in)
    - _current.humanPosition is "Idea A" or "Idea B" (which position the human item is in)
    - _current.a.text and _current.b.text contain the response text
    - Use correctAnswer: "_current.aiPosition" with choices ["Idea A", "Idea B"] for scoring

    EXAMPLE: Human vs AI side-by-side with pairMode:
    "each-pair": {
      "type": "foreach", "data": "collect.responses", "shuffle": true,
      "aiInject": { "count": 3, "instruction": "Generate fake ideas matching the student style." },
      "pairMode": "human-vs-ai",
      "subPhases": {
        "show": { "type": "announce", "message": "IDEA A:\\n{{_current.a.text}}\\n\\nIDEA B:\\n{{_current.b.text}}", "timer": 12 },
        "guess": { "type": "collect-choice", "prompt": "Which was written by AI?\\n\\nIDEA A: {{_current.a.text}}\\n\\nIDEA B: {{_current.b.text}}", "choices": ["Idea A", "Idea B"], "timer": 20 }
      },
      "scoring": { "subPhase": "guess", "correctAnswer": "_current.aiPosition", "pointsCorrect": 100 },
      "next": "scores"
    }

    FOREACH LIMITATIONS — things it CANNOT do:
    - Cannot display candidate details in prompts (_candidates are just name strings, not objects)
    - Sub-phases cannot be: reveal, vote, ai-process, or any other type besides announce/collect/collect-choice
    - Do NOT reference sub-phase data across iterations`
};

/**
 * Build a phase-types reference block for inclusion in an AI prompt.
 *
 * @param {{ format?: 'terse'|'verbose' }} opts
 * @returns {string}
 */
function buildPhaseDocsForPrompt(opts = {}) {
  const verbose = opts.format === 'verbose';
  const lines = [];
  let n = 0;

  for (const [type, schema] of Object.entries(PHASE_SCHEMAS)) {
    n++;
    const allFields = getFields(type);
    const transitions = getTransitions(type);

    // Filter: keep base fields + common mixin fields (timer/from/voters).
    // Skip noisy mixin fields (screenControl, loops) — covered separately.
    // Include required transitions (e.g. preview.approveNext) so the AI
    // knows about them; skip optional `next` (universally implied).
    const fields = Object.entries(allFields).filter(([fname]) =>
      !MIXIN_FIELDS_TO_SKIP.has(fname)
    );
    const requiredTransitions = Object.entries(transitions).filter(
      ([_, t]) => t.required
    );
    const required = [
      ...fields.filter(([, f]) => f.required),
      ...requiredTransitions
    ];
    const optional = fields.filter(([, f]) => !f.required);

    if (verbose) {
      lines.push(`${n}. "${type}" — ${schema.description}`);
      if (required.length) {
        lines.push(`   Required: ${required.map(([k, f]) => fieldEntry(k, f)).join(', ')}`);
      }
      if (optional.length) {
        lines.push(`   Optional: ${optional.map(([k, f]) => fieldEntry(k, f)).join(', ')}`);
      }
      const extra = PHASE_EXTRA_GUIDANCE[type];
      if (extra) {
        lines.push('');
        lines.push('   ' + extra.split('\n').map(l => l.trimStart()).join('\n   '));
      }
      lines.push('');
    } else {
      const reqStr = required.length ? ` Needs ${required.map(([k]) => `'${k}'`).join(', ')}.` : '';
      const optStr = optional.length ? ` Optional: ${optional.map(([k]) => `'${k}'`).join(', ')}.` : '';
      lines.push(`- ${type}: ${schema.description}${reqStr}${optStr}`);
    }
  }

  return lines.join('\n').trimEnd();
}

const SYSTEM_PROMPT = `You are a fun, energetic game host for a classroom game.
Your job is to take player responses and create entertaining content based on them.
Keep your responses appropriate for a classroom setting - fun but not inappropriate.
Be creative, playful, and engaging. Keep responses concise.`;

const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929'
};

const MODEL = MODELS.haiku;

const LIGHT_REVIEW_PROMPT = `You are a friendly game advisor helping a teacher build a classroom game. The teacher is NOT a programmer — they're using a drag-and-drop game builder. Write feedback in plain, everyday language. NO technical jargon.

WRITING RULES:
- Talk about game steps, not "phases" or "data refs"
- Say "the step where players write answers" not "the collect phase"
- Say "this step needs to know where to get its data" not "missing input data reference"
- Say "the scoring won't work because..." not "scoring mode mismatch with candidateSource configuration"
- Use the step's display name from the config (e.g., "Write Your Ideas" or the phase ID in friendly form)
- Keep suggestions short and actionable — what should they click/change, not architecture redesigns
- If something won't work, explain what the player would actually experience ("players would see a blank screen")
- ABSOLUTELY NO TECHNICAL SYNTAX in your output. NEVER write {{anything}}, NEVER write backticks like \`field\`, NEVER reference field names like "instruction" or "candidateSource". Refer to things by what they DO ("the AI's instructions", "the choices players see"), not by their config field names.
- NEVER quote the JSON or show config snippets. The teacher doesn't see JSON. Describe the change in English: "Change the message in the first step to..." not "Set message: '...'".

PHASE TYPES (internal reference — do NOT use these technical names in your output):
${buildPhaseDocsForPrompt({ format: 'terse' })}

LOOP SYSTEM: Any step can repeat using 'loopBack' + 'loopCount'.

CHECK FOR:
1. Steps that are missing required settings (would cause the game to crash)
2. Steps that try to use data from a step that hasn't happened yet
3. Steps where eliminated players are still asked to participate
4. AI instructions that are too vague to produce good results
5. Foreach issues (wrong sub-phase types, missing scoring setup)
6. Flow problems (dead ends, unreachable steps)

Return ONLY valid JSON:
{"issues":[{"phaseId":"...","severity":"error|warning","message":"plain English problem description","suggestion":"what to do, in simple terms"}],"summary":"one friendly sentence overview"}`;

const DEEP_REVIEW_EXTRA = `
Also check (still in plain, friendly language):
- Would the AI instructions actually produce good results? Suggest better wording.
- Is this game fun? Good pacing? Enough variety?
- Would timers help keep things moving? Suggest specific times.
- Are there steps that would be confusing for students?
- Could any messages shown to students be more engaging or clearer?

Be encouraging! Start the summary with something positive about the game concept.`;

const CLARIFY_QUESTIONS_PROMPT = `You are helping a teacher design a classroom game. The teacher will describe a game idea, and you need to ask 2-4 SHORT clarifying questions to make sure you build exactly what they want.

Think about what could go wrong or be ambiguous:
- How many things does each player need to submit? (e.g., "two truths and a lie" needs 3 inputs, not 1)
- Should there be scoring? What kind?
- Should the class see each response one-at-a-time, or all at once?
- Is there elimination, or does everyone play to the end?
- Should AI be involved (generating content, judging, etc.)?
- How long should players have to respond?

IMPORTANT: Only ask questions where the answer is NOT obvious from the description. If the user says "two truths and a lie," you don't need to ask "how many things does each player submit?" — that's clearly 3. But you should ask clarifying things like "Should the class vote on which one is the lie, or just discuss?"

Return ONLY valid JSON in this format:
{
  "questions": [
    {
      "question": "Short, clear question in plain English",
      "options": ["Option A", "Option B", "Option C"],
      "default": "Option A"
    }
  ]
}

Each question MUST have 2-4 predefined options (not free text) plus a sensible default. Keep questions short and jargon-free — the user is a teacher, not a programmer.

If the description is so clear that no questions are needed, return: {"questions": []}`;

const GAME_GENERATOR_PROMPT = `You are a classroom game designer. Given a description, generate a complete game config JSON.

IMPORTANT: Return ONLY valid JSON. No explanation, no markdown, just the JSON object.

The config format is:
{
  "name": "Game Name",
  "description": "One-line description",
  "phases": {
    "lobby": { "type": "lobby", "next": "..." },
    ...phase definitions...,
    "end": { "type": "end", "message": "..." }
  }
}

Every game MUST start with a "lobby" phase and end with an "end" phase. Every phase (except end) needs a "next" field.

Available phase types (field listings generated from the schema — these
are exhaustive; do NOT invent fields that are not listed):

${buildPhaseDocsForPrompt({ format: 'verbose' })}

Data references format: "phaseId.field" — e.g. "collect.responses", "vote.scores", "foreach-phase.scores"

Common data fields per phase:
- collect: .responses (array of {playerId, name, text})
- collect-choice: .responses (array of {playerId, name, choice}), .tally (object {choice: count}), .barChart (pre-rendered ASCII bar chart string)
- vote: .scores (object {playerId: score}), .winner
- rank: .rankings, .rankedList
- wager: .scores
- foreach: .scores (cumulative), .itemCount
- relay: .text (combined), .result (array)
- team-split: .teams, .playerTeam
- ai-process: .result, .mine (only if perPlayer:true — usable inside collect/collect-choice prompts, announce messages, and reveal templates; renders the recipient's own item), .list (when result is a JSON array — renders as a numbered text list "1. item\n2. item\n..." — use this in templates instead of .result for arrays)

BAR CHART: To show poll/survey results visually, use {{phaseId.barChart}} in a reveal template where phaseId is a collect-choice phase. It renders as an ASCII bar chart with counts and percentages. Aliases: .pieChart, .chart (all produce the same ASCII bars). Do NOT try to use .tallies (wrong plural) or reference individual tally keys like {{phase.tally.SomeChoice}} — the chart already shows each choice with its count. For a simple poll with visual results, do: collect-choice → reveal with template "{{poll.barChart}}".

DESIGN TIPS:
- Use "foreach" for any "show each response and do something" pattern (guessing games, voting on each, reviewing)
- Use "announce" with timers to pace transitions and build suspense
- Use "collect-choice" inside foreach with "_candidates" for guessing games
- Use "leaderboard" to show scores — reference the scoring phase's .scores
- Keep timers reasonable: 30-60s for writing, 10-15s for choices, 5-8s for announcements
- Give the game a fun, catchy name
- Make the game work with 3-30 players
- The game should be completable in 10-20 minutes

CRITICAL RULES:
- ONLY use fields documented above. Do NOT invent custom fields.
- foreach sub-phases can ONLY be announce, collect, collect-choice. NOT reveal, vote, or ai-process.
- "correct" scoring REQUIRES collect-choice with choices: "_candidates" (for guessing the author)
- "tally" scoring REQUIRES collect-choice with literal string choices + a pointMap matching those choices
- If a game doesn't involve guessing authorship OR rating items, don't add scoring to foreach
- Every announce that should auto-advance MUST have a "timer" field
- Do NOT reference data that doesn't exist yet (e.g., sub-phase averages)
- ai-process CANNOT access game state beyond what you pass in "input". Don't ask AI to tally votes or compute scores — use leaderboard/foreach scoring for that.
- Do NOT try to use ai-process output as foreach data. foreach can ONLY iterate over collect.responses.

COMMON PITFALLS — check each one before returning:
1. foreach self-exclusion: If foreach scoring is "correct" mode and collect-choice uses "_candidates", the author is auto-excluded from guessing their own. This is automatic — do NOT add manual exclusion logic.
2. ai-process instructions: "instruction" field must be detailed and specific (at least 20 chars). Vague instructions like "summarize" or "generate something" produce poor results. Describe tone, format, length, and what to do with the input.
3. ai-eliminate rules: "instruction" must state SPECIFIC rules the AI can enforce (e.g. "Eliminate answers that don't mention a color"). Generic instructions fail.
4. Timers on collect phases: Always add a "timer" (30-90s typical) so the game doesn't stall waiting for slow players.
5. Timers on announce phases: If an announce has "next" and should auto-advance, it NEEDS a "timer". Otherwise the teacher has to click to continue.
6. leaderboard "from" must reference a phase that produces scores (vote, wager, or foreach with scoring). Do NOT reference a collect phase.
7. Multi-field collect for multi-input games: If the game needs 2+ distinct inputs per player (like Two Truths and a Lie), use "fields" array. Do NOT cram multiple inputs into one textarea.
8. Pair mode requires aiInject: pairMode only works when aiInject is configured. Don't set pairMode without aiInject.
9. candidateSource for guessing games: For "who wrote this?" games, set candidateSource: "players" AND decoyCount on the foreach, AND use choices: "_candidates" in collect-choice. All three must be present together.
10. correctAnswer field references: correctAnswer must match a real value in the game. For author-guessing use "_current.playerName". For field-guessing use "_current.fields.<key>". For AI detection use "_current.isHuman" or "_current.aiPosition".

IMPORTANT — SCOPE CHECK:
This framework builds TEXT-BASED classroom games where a teacher projects a host screen and students interact via text on their devices. Games consist of phases like collecting text, voting, AI processing, and displaying results.

If the user describes something OUTSIDE what the framework can do, respond with this JSON instead:

{"unsupported": true, "reason": "Brief explanation of what can't be done", "suggestion": "A fun text-based adaptation of their idea that WOULD work with the framework"}

UNSUPPORTED concepts (return unsupported JSON for these):
- Real-time graphics, 3D worlds, physics, video, drawing, audio, multiplayer action games, board game simulations
- Anything requiring custom UI beyond text and multiple-choice
- Pairing or matchmaking between player items (foreach with pairMode only pairs human vs AI, not human vs human)
- Real-time competitive play (the framework is turn-based: collect, then process, then show)

NOTE: "AI plays too" / "human vs AI" games ARE supported using foreach with aiInject. Do NOT mark these as unsupported.

When returning unsupported, your suggestion should be a SPECIFIC game design using the available phases, not vague advice. Describe the actual flow (e.g., "collect -> foreach with tally scoring -> leaderboard").

Do NOT try to force-fit impossible concepts. Be honest about limitations, but always offer a creative alternative.`;



/**
 * AIService - Processes collected responses using AI
 * Supports mock mode for testing and real mode for production
 */
export class AIService {
  constructor(config = {}) {
    this.mode = config.mode || 'mock';

    if (this.mode === 'real') {
      this.client = new Anthropic({
        timeout: 60 * 1000,  // 60s timeout per request
        maxRetries: 1
      });
    }
  }

  /**
   * @param {{ instruction?: string, responses?: any, systemPrompt?: string }} [args]
   */
  async process({ instruction, responses, systemPrompt } = {}) {
    if (this.mode === 'mock') {
      return this._processMock(instruction, responses);
    }

    return this._processReal(instruction, responses, systemPrompt);
  }

  _processMock(instruction, responses) {
    const count = responses.length;
    const truncatedInstruction = instruction.length > 50
      ? instruction.substring(0, 50) + '...'
      : instruction;

    return {
      text: `[MOCK AI] Would process ${count} responses with instruction: ${truncatedInstruction}`
    };
  }

  async _processReal(instruction, responses, systemPrompt) {
    try {
      const userMessage = this._buildUserMessage(instruction, responses);
      const start = Date.now();

      const message = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt || SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ]
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] process() completed in ${elapsed}s (model: ${MODEL}, input: ${message.usage?.input_tokens || '?'} tokens, output: ${message.usage?.output_tokens || '?'} tokens)`);

      return {
        text: extractText(message)
      };
    } catch (error) {
      console.error('[AIService] Error calling Anthropic API:', error.message);
      return {
        text: `[AI Error] Something went wrong: ${error.message}`
      };
    }
  }

  async generateFakeResponses({ instruction, responses, count }) {
    if (this.mode === 'mock') {
      return this._generateFakeResponsesMock(count);
    }
    return this._generateFakeResponsesReal({ instruction, responses, count });
  }

  _generateFakeResponsesMock(count) {
    var fakes = [];
    for (var i = 0; i < count; i++) {
      fakes.push({ text: `[Mock AI response #${i + 1}] This is a fake answer generated by AI for testing.` });
    }
    return fakes;
  }

  async _generateFakeResponsesReal({ instruction, responses, count }) {
    try {
      var examples = responses.map(r => `- "${r.text}"`).join('\n');
      var start = Date.now();

      var message = await this.client.messages.create({
        model: MODELS.haiku,
        max_tokens: 1024,
        system: `You generate fake responses that blend in with real student answers. Your goal is to make responses that are indistinguishable from human ones — match the tone, length, creativity level, and writing style. Some should be slightly better, some slightly worse, to feel natural.`,
        messages: [{
          role: 'user',
          content: `${instruction}\n\nHere are the real student responses for reference (match their style):\n${examples}\n\nGenerate exactly ${count} fake responses. Return ONLY a JSON array of objects with "text" field:\n[{"text": "fake response 1"}, {"text": "fake response 2"}]`
        }]
      });

      var elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] generateFakeResponses() completed in ${elapsed}s (model: ${MODELS.haiku}, ${count} fakes)`);

      var text = extractText(message);
      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.slice(0, count);
      } catch {
        var match = text.match(/\[[\s\S]*\]/);
        if (match) {
          var parsed2 = JSON.parse(match[0]);
          if (Array.isArray(parsed2)) return parsed2.slice(0, count);
        }
      }
      console.error('[AIService] Failed to parse fake responses, using fallback');
      return this._generateFakeResponsesMock(count);
    } catch (error) {
      console.error('[AIService] generateFakeResponses error:', error.message);
      return this._generateFakeResponsesMock(count);
    }
  }

  async review({ config, depth = 'light' }) {
    if (this.mode === 'mock') {
      return this._reviewMock(config, depth);
    }
    return this._reviewReal(config, depth);
  }

  _reviewMock(config, depth) {
    const phaseIds = Object.keys(config.phases || {});
    const issues = [];

    // Generate plausible mock issues for AI phases with empty instructions
    for (const id of phaseIds) {
      const phase = config.phases[id];
      if ((phase.type === 'ai-process' || phase.type === 'ai-eliminate') && (!phase.instruction || phase.instruction.trim().length < 10)) {
        issues.push({
          phaseId: id,
          severity: 'warning',
          message: phase.type === 'ai-eliminate'
            ? 'AI elimination rules are very short or empty'
            : 'AI instruction is very short or empty',
          suggestion: phase.type === 'ai-eliminate'
            ? 'Provide specific rules so the AI knows exactly what to enforce.'
            : 'Provide detailed instructions so the AI knows exactly what to produce.'
        });
      }
    }

    if (depth === 'deep' && issues.length === 0) {
      // Add a general suggestion for deep reviews
      const collectPhases = phaseIds.filter(id => config.phases[id].type === 'collect');
      if (collectPhases.length > 0 && !collectPhases.some(id => config.phases[id].timer)) {
        issues.push({
          phaseId: collectPhases[0],
          severity: 'suggestion',
          message: 'Consider adding a time limit to keep the game moving',
          suggestion: 'A 60-second timer works well for most classroom activities.'
        });
      }
    }

    return {
      issues,
      summary: issues.length > 0
        ? `[MOCK] Found ${issues.length} item(s) to review.`
        : '[MOCK] Game config looks good!'
    };
  }

  async _reviewReal(config, depth) {
    try {
      const model = depth === 'deep' ? MODELS.sonnet : MODELS.haiku;
      const systemPrompt = depth === 'deep'
        ? LIGHT_REVIEW_PROMPT + DEEP_REVIEW_EXTRA
        : LIGHT_REVIEW_PROMPT;

      const configJson = JSON.stringify(config, null, 0);
      const start = Date.now();

      const message = await this.client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Review this game config:\n${configJson}` }
        ]
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] review(${depth}) completed in ${elapsed}s (model: ${model})`);

      const text = extractText(message);

      try {
        return JSON.parse(text);
      } catch {
        // AI may wrap JSON in preamble — extract it
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch {
            return { issues: [], summary: text };
          }
        }
        return { issues: [], summary: text };
      }
    } catch (error) {
      console.error('[AIService] Review error:', error.message);
      return {
        issues: [],
        summary: `Review failed: ${error.message}`
      };
    }
  }

  async fixIssue({ phase, phaseId, issue, otherPhaseIds }) {
    if (this.mode === 'mock') {
      return this._fixIssueMock(phase, issue);
    }
    return this._fixIssueReal({ phase, phaseId, issue, otherPhaseIds });
  }

  _fixIssueMock(phase, issue) {
    const updated = JSON.parse(JSON.stringify(phase));
    const msg = (issue.message || '').toLowerCase();
    if (msg.includes('instruction') && (phase.type === 'ai-process' || phase.type === 'ai-eliminate')) {
      updated.instruction = (phase.instruction || '') + ' [MOCK: more detailed instructions]';
    } else if (msg.includes('timer') && !phase.timer) {
      updated.timer = 60;
    } else {
      updated._mockFix = true;
    }
    return { updatedPhase: updated, explanation: '[MOCK] Applied a placeholder fix.' };
  }

  async _fixIssueReal({ phase, phaseId, issue, otherPhaseIds }) {
    try {
      const systemPrompt = `You are fixing one phase of a classroom game config. You will be given the current phase JSON, an issue to address, and the IDs of other phases in the game (for reference only — do NOT modify them).

Rules:
- Return ONLY valid JSON matching this schema: {"updatedPhase": {...}, "explanation": "one-sentence summary"}
- Keep the phase's "type" and "next" fields unchanged unless the issue is specifically about them
- Do NOT rename the phase ID (it's referenced elsewhere)
- Do NOT invent new phase references in "next"/"loopBack" etc. — only use IDs from the provided list
- Make the smallest change that addresses the issue
- Preserve all other fields unless they conflict with the fix`;

      const userContent = `Phase ID: ${phaseId}
Other phase IDs in this game: ${JSON.stringify(otherPhaseIds)}

Current phase JSON:
${JSON.stringify(phase, null, 0)}

Issue: ${issue.message}
${issue.suggestion ? 'Suggestion: ' + issue.suggestion : ''}

Return the updated phase JSON.`;

      const start = Date.now();
      const message = await this.client.messages.create({
        model: MODELS.haiku,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] fixIssue completed in ${elapsed}s (model: ${MODELS.haiku})`);

      const text = extractText(message);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI response was not valid JSON');
        parsed = JSON.parse(match[0]);
      }
      if (!parsed.updatedPhase || typeof parsed.updatedPhase !== 'object') {
        throw new Error('AI response missing updatedPhase');
      }
      if (parsed.updatedPhase.type !== phase.type) {
        throw new Error('AI changed phase type — refusing to apply');
      }
      return { updatedPhase: parsed.updatedPhase, explanation: parsed.explanation || 'Fix applied.' };
    } catch (error) {
      console.error('[AIService] fixIssue error:', error.message);
      throw error;
    }
  }

  async reviseGame({ config, request }) {
    if (this.mode === 'mock') {
      return { updatedConfig: config, summary: '[MOCK] No changes applied.' };
    }
    return this._reviseGameReal({ config, request });
  }

  async _reviseGameReal({ config, request }) {
    try {
      const systemPrompt = `You are revising an existing classroom game config based on the teacher's request. Return ONLY valid JSON matching this schema:
{"updatedConfig": { ...full game config... }, "summary": "one-paragraph description of what you changed, in plain English for a teacher"}

Rules:
- Make the SMALLEST set of changes that fulfills the teacher's request. Do not refactor or "improve" unrelated parts.
- Preserve phase IDs that don't need to change. Add new phases only when the request requires them.
- Every phase must follow the same field rules as a freshly generated game (see the field allow-list).
- The "summary" is for the teacher: plain English, no JSON, no curly braces, no field names. Describe the change like "I shortened round 1 from 90s to 60s and added a leaderboard at the end."
- If the request is impossible or destructive (e.g., "delete everything"), return {"updatedConfig": <unchanged>, "summary": "I couldn't do that because..."}.

` + GAME_GENERATOR_PROMPT;

      const userContent = `Current game config:
${JSON.stringify(config, null, 0)}

Teacher's request:
${request}

Return the revised config.`;

      const start = Date.now();
      const message = await this.client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] reviseGame completed in ${elapsed}s (model: ${MODELS.sonnet})`);

      const text = extractText(message);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI response was not valid JSON');
        parsed = JSON.parse(match[0]);
      }
      if (!parsed.updatedConfig || !parsed.updatedConfig.phases) {
        throw new Error('AI response missing updatedConfig');
      }
      // Strip invented fields and run defensive fixes — same pipeline as generation
      const cleaned = this._fixGeneratedConfig(parsed.updatedConfig);
      return { updatedConfig: cleaned, summary: parsed.summary || 'Changes applied.' };
    } catch (error) {
      console.error('[AIService] reviseGame error:', error.message);
      throw error;
    }
  }

  async revisePhase({ config, phaseId, request }) {
    if (this.mode === 'mock') {
      const phase = config.phases[phaseId];
      return { updatedPhase: phase, summary: '[MOCK] No changes applied.' };
    }
    return this._revisePhaseReal({ config, phaseId, request });
  }

  async _revisePhaseReal({ config, phaseId, request }) {
    const phase = config.phases[phaseId];
    if (!phase) throw new Error(`Phase "${phaseId}" not found`);
    const otherPhaseIds = Object.keys(config.phases).filter(id => id !== phaseId);
    try {
      const systemPrompt = `You are revising ONE step of a classroom game based on the teacher's request. You will be given the step's current JSON, the IDs of the other steps in the game, and the teacher's plain-English request.

Return ONLY valid JSON matching this schema:
{"updatedPhase": { ...the revised step config... }, "summary": "one short sentence in plain English describing what you changed"}

Rules:
- Keep the step's "type" unchanged unless the request explicitly asks to change it.
- Keep "next" pointing to a real phase ID from the provided list.
- Make the SMALLEST change that fulfills the request.
- The "summary" is for the teacher: plain English, no JSON, no curly braces, no field names.
- Follow the same field rules as a freshly generated game (only fields documented in the schema).

` + GAME_GENERATOR_PROMPT;

      const userContent = `Step ID: ${phaseId}
Other step IDs in this game: ${JSON.stringify(otherPhaseIds)}

Current step JSON:
${JSON.stringify(phase, null, 0)}

Teacher's request:
${request}

Return the revised step.`;

      const start = Date.now();
      const message = await this.client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 1536,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] revisePhase completed in ${elapsed}s (model: ${MODELS.sonnet})`);

      const text = extractText(message);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI response was not valid JSON');
        parsed = JSON.parse(match[0]);
      }
      if (!parsed.updatedPhase || typeof parsed.updatedPhase !== 'object') {
        throw new Error('AI response missing updatedPhase');
      }
      // Strip invented fields on the single phase
      const updated = parsed.updatedPhase;
      const allowed = getAllowedFields(updated.type || phase.type);
      if (allowed.size > 0) {
        for (const f of Object.keys(updated)) {
          if (!allowed.has(f)) {
            console.log(`[revisePhase] Stripped unknown field "${f}" from "${phaseId}"`);
            delete updated[f];
          }
        }
      }
      return { updatedPhase: updated, summary: parsed.summary || 'Changes applied.' };
    } catch (error) {
      console.error('[AIService] revisePhase error:', error.message);
      throw error;
    }
  }

  async generateTheme(description) {
    if (this.mode === 'mock') {
      return this._generateThemeMock();
    }
    return this._generateThemeReal(description);
  }

  _generateThemeMock() {
    return {
      bg: '#FFF9C4', surface: '#FFFFFF', accent: '#0057FF', text: '#222222',
      heading: '#000000', button: '#FF4081', buttonText: '#FFFFFF', border: '#000000',
      timer: '#0057FF', success: '#00C853', danger: '#FF2D2D'
    };
  }

  async _generateThemeReal(description) {
    try {
      const systemPrompt = 'You are a CSS color palette designer. Given a theme description, return ONLY a JSON object with these color keys: bg, surface, accent, text, heading, button, buttonText, border, timer, success, danger. All values must be valid hex colors. Make the palette visually cohesive and appropriate for a classroom game projected on a screen. Ensure good contrast between text and backgrounds.';

      const message = await this.client.messages.create({
        model: MODELS.haiku,
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Generate a color palette for this theme: ${description}` }
        ]
      });

      const text = extractText(message);

      try {
        return JSON.parse(text);
      } catch {
        // AI may wrap JSON in preamble — extract it
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch {
            return this._generateThemeMock();
          }
        }
        return this._generateThemeMock();
      }
    } catch (error) {
      console.error('[AIService] generateTheme error:', error.message);
      return this._generateThemeMock();
    }
  }

  async generateQuestions(description) {
    if (this.mode === 'mock') {
      return {
        questions: [
          { question: 'How many things should each player submit?', options: ['1', '2', '3'], default: '1' },
          { question: 'Should there be scoring?', options: ['Yes, points for correct guesses', 'Yes, class rates each answer', 'No scoring'], default: 'Yes, points for correct guesses' },
          { question: 'How long should players have to answer?', options: ['30 seconds', '60 seconds', '90 seconds'], default: '60 seconds' }
        ]
      };
    }
    return this._generateQuestionsReal(description);
  }

  async _generateQuestionsReal(description) {
    try {
      const message = await this.client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 1024,
        system: CLARIFY_QUESTIONS_PROMPT,
        messages: [
          { role: 'user', content: description }
        ]
      });

      const text = extractText(message);
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { result = JSON.parse(match[0]); } catch { return { error: 'Failed to parse AI response' }; }
        }
        if (!result) return { error: 'No JSON found in AI response' };
      }
      return result;
    } catch (error) {
      console.error('[AIService] generateQuestions error:', error.message);
      return { error: `AI question generation failed: ${error.message}` };
    }
  }

  async generateGame(description, answers) {
    if (this.mode === 'mock') {
      return this._generateGameMock(description);
    }
    return this._generateGameReal(description, answers);
  }

  _generateGameMock(description) {
    return {
      name: 'Generated Game',
      description: description,
      phases: {
        lobby: { type: 'lobby', next: 'collect' },
        collect: { type: 'collect', prompt: 'Share your answer!', timer: 45, next: 'show-loop' },
        'show-loop': {
          type: 'foreach', data: 'collect.responses', shuffle: true,
          candidateSource: 'players', decoyCount: 3,
          subPhases: {
            show: { type: 'announce', message: 'Someone said:\n\n"{{_current.text}}"', timer: 5 },
            guess: { type: 'collect-choice', prompt: 'Who said it?', choices: '_candidates', timer: 15 },
            reveal: { type: 'announce', message: 'It was {{_current.playerName}}!', timer: 5 }
          },
          scoring: { subPhase: 'guess', correctAnswer: '_current.playerName', pointsCorrect: 100 },
          next: 'scores'
        },
        scores: { type: 'leaderboard', from: 'show-loop.scores', timer: 15, next: 'end' },
        end: { type: 'end', message: 'Thanks for playing!' }
      }
    };
  }

  async _generateGameReal(description, answers) {
    try {
      let userContent = `Create a classroom game based on this description:\n\n${description}`;
      if (answers && answers.length > 0) {
        userContent += '\n\nThe user clarified the following details:\n';
        for (const a of answers) {
          userContent += `- ${a.question}: ${a.answer}\n`;
        }
      }
      const message = await this.client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 4096,
        system: GAME_GENERATOR_PROMPT,
        messages: [
          { role: 'user', content: userContent }
        ]
      });

      const text = extractText(message);
      var config;

      try {
        config = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            config = JSON.parse(match[0]);
          } catch {
            return { error: 'Failed to parse AI response', raw: text };
          }
        }
        if (!config) return { error: 'No JSON found in AI response', raw: text };
      }

      if (config.error) return config;
      config = this._fixGeneratedConfig(config);
      // Run silent review + auto-apply fixes for non-error issues
      config = await this._autoPolishConfig(config);
      return config;
    } catch (error) {
      console.error('[AIService] generateGame error:', error.message);
      return { error: `AI generation failed: ${error.message}` };
    }
  }

  async _autoPolishConfig(config) {
    // Runs the SAME deep review (Sonnet) the user will run via "Check My Game",
    // then auto-fixes all non-error issues. Iterates up to MAX_PASSES so a fix
    // that introduces a new suggestion can be cleaned up too.
    //
    // Cost per generation: ~1-2 Sonnet reviews + N Haiku fixes (N typically 0-6).
    // Trades generation-time cost for the user seeing a clean game on first open.
    const MAX_PASSES = 2;
    const MAX_FIXES_PER_PASS = 10;

    try {
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        const review = await this._reviewReal(config, 'deep');
        if (!review || !review.issues || review.issues.length === 0) {
          console.log(`[auto-polish] Pass ${pass}: no issues, done.`);
          return config;
        }

        const fixable = review.issues.filter(iss =>
          iss.phaseId && config.phases[iss.phaseId] && iss.severity !== 'error'
        );
        if (fixable.length === 0) {
          console.log(`[auto-polish] Pass ${pass}: ${review.issues.length} issue(s) remain but none are auto-fixable (errors or unscoped). Stopping.`);
          return config;
        }

        const toFix = fixable.slice(0, MAX_FIXES_PER_PASS);
        console.log(`[auto-polish] Pass ${pass}: applying ${toFix.length} of ${fixable.length} fix(es)`);

        let fixesApplied = 0;
        for (const iss of toFix) {
          try {
            const phase = config.phases[iss.phaseId];
            const otherIds = Object.keys(config.phases).filter(p => p !== iss.phaseId);
            const result = await this._fixIssueReal({
              phase, phaseId: iss.phaseId, issue: iss, otherPhaseIds: otherIds
            });
            if (result && result.updatedPhase && result.updatedPhase.type === phase.type) {
              config.phases[iss.phaseId] = result.updatedPhase;
              fixesApplied++;
              console.log(`[auto-polish] Fixed "${iss.phaseId}": ${result.explanation}`);
            }
          } catch (err) {
            console.log(`[auto-polish] Skipped fix for "${iss.phaseId}": ${err.message}`);
          }
        }

        // If this pass applied nothing, further passes won't change anything either
        if (fixesApplied === 0) {
          console.log(`[auto-polish] Pass ${pass}: zero fixes landed, stopping.`);
          return config;
        }
      }
      console.log(`[auto-polish] Hit MAX_PASSES (${MAX_PASSES}), returning current state.`);
      return config;
    } catch (err) {
      console.log(`[auto-polish] Review failed, returning as-is: ${err.message}`);
      return config;
    }
  }

  /**
   * Fix common issues in AI-generated configs so they pass validation.
   * The AI sometimes omits required fields or uses wrong field names.
   */
  _fixGeneratedConfig(config) {
    if (!config.phases) return config;

    // Required fields per phase type (mirrors game-loader.js)
    var requiredFields = {
      collect: ['prompt'],
      'collect-choice': ['prompt', 'choices'],
      'ai-process': ['instruction', 'input'],
      'ai-eliminate': ['instruction', 'input'],
      vote: ['mode', 'candidates'],
      eliminate: ['method'],
      announce: ['message'],
      preview: ['approveNext', 'rejectNext'],
      winner: ['from'],
      leaderboard: ['from'],
      'reveal-one': ['from'],
      'team-split': ['method', 'teamCount'],
      rank: ['prompt', 'candidates'],
      wager: ['prompt', 'options'],
      relay: ['prompt'],
      foreach: ['data', 'subPhases']
    };

    var phaseIds = Object.keys(config.phases);

    for (var id of phaseIds) {
      var phase = config.phases[id];
      if (!phase || !phase.type) continue;

      var required = requiredFields[phase.type] || [];

      // Fix ai-eliminate missing "input" — find nearest prior collect phase
      // (ai-process input is optional — it can generate from scratch)
      if (phase.type === 'ai-eliminate' && !phase.input) {
        var collectId = this._findPriorPhase(config.phases, id, ['collect', 'collect-choice']);
        if (collectId) {
          phase.input = collectId + '.responses';
          console.log(`[fix-config] Added missing input "${phase.input}" to phase "${id}"`);
        }
      }

      // Fix vote missing "candidates" — find nearest prior collect or ai-process
      if (phase.type === 'vote' && !phase.candidates) {
        var srcId = this._findPriorPhase(config.phases, id, ['collect']);
        if (srcId) {
          phase.candidates = srcId + '.responses';
          console.log(`[fix-config] Added missing candidates "${phase.candidates}" to phase "${id}"`);
        }
      }

      // Fix vote missing "mode" — default to pick-one
      if (phase.type === 'vote' && !phase.mode) {
        phase.mode = 'pick-one';
        console.log(`[fix-config] Added missing mode "pick-one" to phase "${id}"`);
      }

      // Fix leaderboard/winner missing "from" — find nearest prior vote or foreach
      if ((phase.type === 'leaderboard' || phase.type === 'winner') && !phase.from) {
        var scoreId = this._findPriorPhase(config.phases, id, ['vote', 'foreach', 'wager']);
        if (scoreId) {
          phase.from = scoreId + '.scores';
          console.log(`[fix-config] Added missing from "${phase.from}" to phase "${id}"`);
        }
      }

      // Fix eliminate missing "method" — default to bottom-percent
      if (phase.type === 'eliminate' && !phase.method) {
        phase.method = 'bottom-percent';
        if (!phase.percent) phase.percent = 50;
        console.log(`[fix-config] Added missing method to phase "${id}"`);
      }

      // Fix announce missing "message" — use template or a placeholder
      if (phase.type === 'announce' && !phase.message) {
        if (phase.template) {
          phase.message = phase.template;
          delete phase.template;
        } else if (phase.text) {
          phase.message = phase.text;
          delete phase.text;
        } else {
          phase.message = 'Get ready for the next round!';
        }
        console.log(`[fix-config] Fixed missing message on announce phase "${id}"`);
      }

      // Fix reveal missing "template" — use message or content field
      if (phase.type === 'reveal' && !phase.template) {
        if (phase.message) {
          phase.template = phase.message;
          delete phase.message;
        } else if (phase.content) {
          phase.template = phase.content;
          delete phase.content;
        }
        if (phase.template) console.log(`[fix-config] Fixed reveal template on phase "${id}"`);
      }

      // Fix foreach sub-phases: apply same fixes recursively
      if (phase.type === 'foreach' && phase.subPhases) {
        for (var subId of Object.keys(phase.subPhases)) {
          var sub = phase.subPhases[subId];
          if (sub.type === 'announce' && !sub.message) {
            if (sub.template) { sub.message = sub.template; delete sub.template; }
            else if (sub.text) { sub.message = sub.text; delete sub.text; }
          }
        }
      }
    }

    // Strip unknown fields the AI invented. The engine ignores them, and they
    // mislead the teacher into thinking the game is doing something it isn't.
    for (var stripId of Object.keys(config.phases)) {
      var stripPhase = config.phases[stripId];
      if (!stripPhase || !stripPhase.type) continue;
      var allowed = getAllowedFields(stripPhase.type);
      if (allowed.size === 0) continue;
      for (var field of Object.keys(stripPhase)) {
        if (!allowed.has(field)) {
          console.log(`[fix-config] Stripped unknown field "${field}" from phase "${stripId}" (${stripPhase.type})`);
          delete stripPhase[field];
        }
      }
      if (stripPhase.type === 'foreach' && stripPhase.subPhases) {
        for (var sId of Object.keys(stripPhase.subPhases)) {
          var sp = stripPhase.subPhases[sId];
          if (!sp || !sp.type) continue;
          var subAllowed = getAllowedFields(sp.type, { subPhase: true });
          if (subAllowed.size === 0) continue;
          for (var sField of Object.keys(sp)) {
            if (!subAllowed.has(sField)) {
              console.log(`[fix-config] Stripped unknown field "${sField}" from subPhase "${stripId}.${sId}" (${sp.type})`);
              delete sp[sField];
            }
          }
        }
      }
    }

    return config;
  }

  /**
   * Walk backwards through phase chain to find the nearest phase of a given type.
   */
  _findPriorPhase(phases, targetId, types) {
    // Build ordered list by following next pointers from lobby
    var ordered = [];
    var current = 'lobby';
    var visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      ordered.push(current);
      if (current === targetId) break;
      var phase = phases[current];
      current = phase ? phase.next : null;
    }

    // Walk backwards from target to find matching type
    for (var i = ordered.length - 2; i >= 0; i--) {
      var p = phases[ordered[i]];
      if (p && types.includes(p.type)) return ordered[i];
    }
    return null;
  }

  _buildUserMessage(instruction, responses) {
    const responseList = responses
      .map(r => {
        const id = r.playerId ? ` [playerId: ${r.playerId}]` : '';
        return `- ${r.name}${id}: "${r.text}"`;
      })
      .join('\n');

    return `${instruction}

Here are the player responses:
${responseList}`;
  }

  // =====================================================================
  // matchRecipe — AI as recipe matcher (R4)
  //
  // Replaces the fragile generateGame() flow for the recipe-friendly
  // case. Instead of asking AI to emit a 200-line phase graph, we ask it
  // to pick one of N hand-built recipes and fill ~5 parameter values.
  // The structured output is tiny (~5 fields), so JSON malformation
  // becomes statistically near-impossible. Compiler turns the params
  // into a guaranteed-valid game config.
  //
  // Output shape (one of):
  //   { recipe: "id", params: { ... }, explanation: "..." }
  //   { noMatch: true, reason: "...", suggestion: "..." }
  //
  // Cost: one Haiku call, ~600 tokens output max. Way cheaper than the
  // ~4096-token Sonnet generateGame() call.
  // =====================================================================

  async matchRecipe(description, recipes) {
    if (this.mode === 'mock') {
      return this._matchRecipeMock(description, recipes);
    }
    return this._matchRecipeReal(description, recipes);
  }

  _matchRecipeMock(description, recipes) {
    // Mock mode: pick the first recipe + fill required params with placeholders.
    // Lets tests run without an API key.
    if (!recipes || recipes.length === 0) {
      return { noMatch: true, reason: 'No recipes available.', suggestion: '' };
    }
    const recipe = recipes[0];
    const params = {};
    for (const [name, spec] of Object.entries(recipe.parameters || {})) {
      if (!spec.required) continue;
      if (spec.type === 'integer') params[name] = spec.min ?? 1;
      else if (spec.type === 'array') params[name] = ['Mock A', 'Mock B'];
      else if (spec.type === 'boolean') params[name] = false;
      else if (spec.type === 'enum') params[name] = spec.values[0];
      else params[name] = `[MOCK] ${description.slice(0, 40)}`;
    }
    return {
      recipe: recipe.id,
      params,
      explanation: `[MOCK] Matched to ${recipe.name}.`
    };
  }

  async _matchRecipeReal(description, recipes) {
    if (!recipes || recipes.length === 0) {
      return { noMatch: true, reason: 'No recipes are available yet.', suggestion: '' };
    }

    const systemPrompt = this._buildMatchRecipePrompt(recipes);

    try {
      const start = Date.now();
      const message = await this.client.messages.create({
        model: MODELS.haiku,
        max_tokens: 800,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `A teacher described their classroom game idea:\n\n"${description}"\n\nReturn the matching recipe + filled parameters as JSON.`
          }
        ]
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AIService] matchRecipe() completed in ${elapsed}s (model: ${MODELS.haiku}, output: ${message.usage?.output_tokens || '?'} tokens)`);

      const text = extractText(message);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch {}
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        return {
          noMatch: true,
          reason: 'AI returned an unexpected response.',
          suggestion: 'Try rewording your description or use the recipe picker directly.'
        };
      }

      // Two valid shapes — pass through with light sanitation.
      if (parsed.noMatch === true) {
        return {
          noMatch: true,
          reason: typeof parsed.reason === 'string' ? parsed.reason : 'No recipe fits this idea.',
          suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : ''
        };
      }

      if (typeof parsed.recipe === 'string' && parsed.params && typeof parsed.params === 'object') {
        return {
          recipe: parsed.recipe,
          params: parsed.params,
          explanation: typeof parsed.explanation === 'string' ? parsed.explanation : ''
        };
      }

      return {
        noMatch: true,
        reason: 'AI response did not include a recipe id.',
        suggestion: 'Try the recipe picker directly.'
      };
    } catch (error) {
      console.error('[AIService] matchRecipe error:', error.message);
      return {
        noMatch: true,
        reason: `AI matcher failed: ${error.message}`,
        suggestion: 'Try the recipe picker directly.'
      };
    }
  }

  _buildMatchRecipePrompt(recipes) {
    const recipeBlocks = recipes.map(r => {
      const params = Object.entries(r.parameters || {}).map(([name, spec]) => {
        const bits = [`type: ${spec.type}`];
        if (spec.required) bits.push('required');
        if (spec.default !== undefined) {
          bits.push(`default: ${JSON.stringify(spec.default)}`);
        }
        if (spec.values) bits.push(`one of: ${spec.values.join(', ')}`);
        if (spec.min != null) bits.push(`min: ${spec.min}`);
        if (spec.max != null) bits.push(`max: ${spec.max}`);
        if (spec.minItems != null) bits.push(`minItems: ${spec.minItems}`);
        if (spec.maxItems != null) bits.push(`maxItems: ${spec.maxItems}`);
        return `    - ${name} (${bits.join(', ')}): ${spec.helper || spec.label || ''}`.trim();
      }).join('\n');
      return `## ${r.name} (id: "${r.id}")
${r.description}
${r.tagline ? '*' + r.tagline + '*\n' : ''}
Parameters:
${params || '    (none)'}`;
    }).join('\n\n---\n\n');

    return `You match a teacher's natural-language game idea to one of these pre-built classroom game recipes. Each recipe is a working game; you only need to fill in a few parameters.

# Available recipes

${recipeBlocks}

# Your job

Read the teacher's description and decide:

1. If ONE of the recipes above is a good fit:
   Return JSON with the recipe's id and filled parameters:
   {
     "recipe": "id-of-best-fit-recipe",
     "params": { /* filled in based on the description */ },
     "explanation": "One short sentence about why this recipe fits."
   }

2. If NONE of the recipes fit (the teacher wants something the seed library can't do, like a quiz with multiple different questions, or a mechanic not represented):
   Return JSON:
   {
     "noMatch": true,
     "reason": "One sentence explaining why no recipe fits.",
     "suggestion": "One sentence suggesting a recipe that's CLOSE — name the recipe and what they'd give up."
   }

# Parameter-filling rules

- Use the teacher's exact wording for prompts/questions when possible — don't paraphrase their pedagogical intent.
- For "choices" arrays, generate 3-5 sensible options based on the teacher's description.
- For timer values, default to the recipe's default unless the teacher specifies a duration.
- For enum parameters, pick the value that best matches the teacher's tone.
- DO NOT invent parameter names that aren't in the recipe spec.
- DO NOT skip required parameters — every required field must be present.
- Numbers are numbers (60), not strings ("60").

# Output format

Return ONLY valid JSON. No prose before or after. No markdown fences. Just the object.`;
  }
}
