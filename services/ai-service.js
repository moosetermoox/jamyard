import Anthropic from '@anthropic-ai/sdk';

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

PHASE TYPES (internal reference — do NOT use these technical names in your output):
- lobby: Players join here
- collect: Players type a text response. Needs 'prompt'. Optional 'from' (all/remaining/eliminated).
- collect-choice: Players pick from choices. Needs 'prompt' and 'choices'. Optional 'from'.
- ai-process: AI processes responses or generates content from scratch. Needs 'instruction'. Optional 'input' (reference to a previous step's data — omit if generating from scratch), 'task', 'format'.
- ai-eliminate: AI judges and eliminates. Needs 'instruction', 'input'.
- vote: Players vote. Needs 'mode' (pick-one/head-to-head), 'candidates'.
- eliminate: Remove players by score. Needs 'method'. bottom-percent needs 'percent' and 'input'.
- announce: Show a message to everyone. Needs 'message'. Optional 'timer'.
- reveal: Display content. Needs 'template'.
- preview: Teacher reviews before showing. Needs 'approveNext' and 'rejectNext'.
- winner: Declare winner. Needs 'from' (scores).
- leaderboard: Show scores/rankings. Needs 'from' (scores). Optional 'style', 'timer'.
- reveal-one: Reveal items one by one. Needs 'from'.
- team-split: Divide into teams. Needs 'method' and 'teamCount'.
- rank: Reorder a list. Needs 'prompt' and 'candidates'.
- wager: Bet points. Needs 'prompt' and 'options'.
- relay: Turn-by-turn input. Needs 'prompt'.
- foreach: Loop through each response doing sub-steps. Needs 'data' and 'subPhases'. Sub-phases can ONLY be: announce, collect, collect-choice (NOT reveal). Optional: 'candidateSource' ("players"), 'decoyCount', 'scoring', 'aiInject'. Scoring modes: "correct" (guess who wrote it) or "tally" (rate items, author earns points). Template variables: {{_current.text}}, {{_current.playerName}}, "_candidates" for auto-generated choices. Has 'aiInject' option ({ count, instruction }) — AI generates fake responses mixed in with real ones for "human vs AI" detection games. With aiInject, use correctAnswer: "_current.isHuman" and choices: ["Human", "AI"].
- end: Game over.

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

Available phase types:

1. "collect" — Players type a text response
   Required: "prompt" (string)
   Optional: "timer" (seconds), "from" ("all"/"remaining"/"eliminated")

2. "collect-choice" — Players pick from predefined choices
   Required: "prompt" (string), "choices" (array of strings OR "_candidates" inside foreach)
   Optional: "timer", "from"

3. "ai-process" — AI processes player responses or generates content
   Required: "instruction" (detailed prompt for AI)
   Optional: "input" (data ref like "collect.responses" — omit if AI is generating from scratch), "task" ("summarize"/"generate"/"compare"/"rank"/"judge"), "format" ("text"/"json")

4. "announce" — Show a message to everyone
   Required: "message" (string, supports {{phase.field}} templates)
   Optional: "timer" (auto-advances after N seconds)

5. "reveal" — Display content to everyone
   Required: "template" (string with {{phase.field}} refs)
   Optional: none

6. "vote" — Players vote on options
   Required: "mode" ("pick-one"/"head-to-head"), "candidates" (data ref)
   Optional: "timer", "voters" ("all"/"remaining"/"eliminated")

7. "eliminate" — Remove players by score
   Required: "method" ("bottom-percent"), "percent" (1-100), "input" (scores data ref)
   Optional: "pause" (seconds)

8. "preview" — Teacher reviews before revealing
   Required: "content" (data ref) OR "template", plus "approveNext" and "rejectNext" (phase IDs)
   Optional: "showResponses" (boolean)

9. "winner" — Declare winner from scores
   Required: "from" (scores data ref)

10. "leaderboard" — Show scores and rankings
    Required: "from" (scores data ref)
    Optional: "style" ("full"/"top3"), "timer"

11. "team-split" — Divide players into teams
    Required: "method" ("random"/"balanced"), "teamCount" (2-20)
    Optional: "teamNames" (array), "from"

12. "rank" — Players reorder a list by preference
    Required: "prompt", "candidates" (data ref to items)
    Optional: "timer", "from"

13. "wager" — Players bet points on outcomes
    Required: "prompt", "options" (array of strings)
    Optional: "timer", "correctOption" (auto-resolve), "scoresFrom" (data ref)

14. "relay" — Turn-by-turn collaborative input
    Required: "prompt"
    Optional: "timer" (per turn), "order" ("random"/"join-order"), "from"

15. "foreach" — Iterate over data running sub-phases per item
    Required: "data" (data ref, e.g. "collect.responses"), "subPhases" (object of sub-phase configs)
    Optional: "shuffle" (boolean), "candidateSource" ("players"), "decoyCount" (number), "scoring" object

    Sub-phases can ONLY be: announce, collect, collect-choice. No "next" needed — they chain automatically.

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
    - Do NOT reference sub-phase data across iterations

16. "reveal-one" — Host reveals items one by one
    Required: "from" (data ref to items)
    Optional: "message", "timer"

17. "ai-eliminate" — AI judges answers and eliminates
    Required: "instruction" (rules), "input" (data ref)

Data references format: "phaseId.field" — e.g. "collect.responses", "vote.scores", "foreach-phase.scores"

Common data fields per phase:
- collect: .responses (array of {playerId, name, text})
- vote: .scores (object {playerId: score}), .winner
- rank: .rankings, .rankedList
- wager: .scores
- foreach: .scores (cumulative), .itemCount
- relay: .text (combined), .result (array)
- team-split: .teams, .playerTeam
- ai-process: .result

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

  async process({ instruction, responses, systemPrompt }) {
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
        text: message.content[0].text
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

      var text = message.content[0].text;
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

      const text = message.content[0].text;

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

      const text = message.content[0].text;

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

  async generateGame(description) {
    if (this.mode === 'mock') {
      return this._generateGameMock(description);
    }
    return this._generateGameReal(description);
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

  async _generateGameReal(description) {
    try {
      const message = await this.client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 4096,
        system: GAME_GENERATOR_PROMPT,
        messages: [
          { role: 'user', content: `Create a classroom game based on this description:\n\n${description}` }
        ]
      });

      const text = message.content[0].text;
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
      return this._fixGeneratedConfig(config);
    } catch (error) {
      console.error('[AIService] generateGame error:', error.message);
      return { error: `AI generation failed: ${error.message}` };
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
}
