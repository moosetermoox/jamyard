import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a fun, energetic game host for a classroom game.
Your job is to take player responses and create entertaining content based on them.
Keep your responses appropriate for a classroom setting - fun but not inappropriate.
Be creative, playful, and engaging. Keep responses concise.`;

const MODELS = {
  haiku: 'claude-3-haiku-20240307',
  sonnet: 'claude-sonnet-4-5-20250929'
};

const MODEL = MODELS.haiku;

const LIGHT_REVIEW_PROMPT = `You are a game config validator for a classroom game framework. Review the config for issues that would prevent the game from working properly.

Phase types and their requirements:
- lobby: Starting phase, players join here
- collect: Asks players for text input. Needs 'prompt'. Optional 'from' (all/remaining/eliminated).
- collect-choice: Players pick from predefined choices. Needs 'prompt' and 'choices' (array of strings or data ref). Optional 'from'.
- ai-process: Sends player responses to AI. Needs 'instruction' (clear enough for AI), 'input' (data ref to collect phase). 'format' can be 'text' or 'json'.
- ai-eliminate: AI judges answers and eliminates rule-breakers. Needs 'instruction' (rules for AI) and 'input' (data ref to responses). Optional 'pause' (seconds before auto-advance).
- vote: Players vote. Needs 'mode' (pick-one/head-to-head), 'candidates' (data ref).
- eliminate: Removes players by score. Needs 'method' (bottom-percent/hook). bottom-percent needs 'percent' and 'input' (scores from vote). Auto-advances after 'pause' seconds.
- announce: Shows a message to everyone. Needs 'message' (supports {{phase.field}} templates). Optional 'timer' for auto-advance.
- reveal: Shows content to everyone. Needs 'template' with {{phase.field}} refs.
- preview: Teacher reviews before revealing. Needs 'content' (data ref) OR 'template' (or both), plus 'approveNext' and 'rejectNext'.
- winner: Declares winner. Needs 'from' (scores data ref). Auto-advances after 'pause' seconds.
- leaderboard: Shows scores and rankings. Needs 'from' (scores data ref). Optional 'style' (full/top3), 'timer' for auto-advance.
- reveal-one: Host reveals items one-by-one (countdown style). Needs 'from' (data ref to items). Optional 'message' (title text).
- team-split: Divides players into teams. Needs 'method' (random/balanced) and 'teamCount'. Optional 'teamNames' (array), 'balanceFrom' (scores data ref for balanced), 'from' (all/remaining).
- rank: Players reorder a list by preference. Needs 'prompt' and 'candidates' (data ref). Optional 'from', 'timer'.
- wager: Players bet points on outcomes. Needs 'prompt' and 'options' (array or data ref). Optional 'scoresFrom' (data ref to scores), 'minBet', 'maxBetPercent', 'timer', 'correctOption'.
- relay: Turn-by-turn collaborative input. Needs 'prompt'. Optional 'from', 'order' (random/join-order), 'timer' (per turn).
- end: Game over. Optional 'message'.

Loop system:
- Any phase can have 'loopBack' (phase ID to jump back to) and 'loopCount' (2-100, total iterations).
- After loopCount iterations, falls through to 'next' (the loop exit).
- Templates can use {{_loop.<phaseId>.iteration}} and {{_loop.<phaseId>.total}} for round display.
- Phase data is versioned: 'collect' has latest, 'collect~1', 'collect~2' have per-iteration copies.

Check for:
1. AI instructions too vague for the task type (compare needs grouping instructions, judge needs criteria, ai-eliminate needs clear rules)
2. Data flow breaks (collect -> ai-process -> reveal must be connected via data refs)
3. Player eligibility issues (collect after eliminate without from:'remaining' will ask eliminated players)
4. Vote candidates not pointing to usable data
5. Flow logic (loops without exit conditions, phases that skip important steps)
6. Loop issues (loopBack without loopCount, loopCount < 2, missing next for loop exit)

Return ONLY valid JSON:
{"issues":[{"phaseId":"...","severity":"error|warning","message":"...","suggestion":"..."}],"summary":"one sentence"}`;

const DEEP_REVIEW_EXTRA = `
Also check for:
6. Prompt quality — would the AI instruction produce good results? Suggest improvements.
7. Playability — is this fun? Are there enough rounds? Is the pacing good?
8. Timer recommendations — which phases would benefit from time limits?
9. Missing features — would announce phases help pace transitions? Would ai-eliminate add drama? Would collect-choice be simpler than free text?
10. Template quality — are reveal templates engaging or just dumping raw data?

Provide detailed, actionable suggestions. Be encouraging but specific.`;

/**
 * AIService - Processes collected responses using AI
 * Supports mock mode for testing and real mode for production
 */
export class AIService {
  constructor(config = {}) {
    this.mode = config.mode || 'mock';

    if (this.mode === 'real') {
      this.client = new Anthropic();
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

      const message = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt || SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ]
      });

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

      const message = await this.client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Review this game config:\n${configJson}` }
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
