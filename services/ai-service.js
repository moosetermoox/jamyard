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
- collect: Asks players for text input. Needs 'prompt'. Optional 'from' to filter by remaining/eliminated.
- ai-process: Sends player responses to AI. Needs 'instruction' (clear enough for AI), 'input' (data ref to collect phase). 'format' can be 'text' or 'json'.
- vote: Players vote. Needs 'mode' (pick-one/head-to-head), 'candidates' (data ref).
- eliminate: Removes players. Needs 'method' (bottom-percent/hook). bottom-percent needs 'percent' and 'input' (scores from vote).
- reveal: Shows content to everyone. Needs 'template' with {{phase.field}} refs.
- preview: Teacher reviews before revealing. Needs 'content' (data ref), 'approveNext', 'rejectNext'.
- winner: Declares winner. Needs 'from' (scores data ref).
- end: Game over. Optional 'message'.

Check for:
1. AI instructions too vague for the task type (compare needs grouping instructions, judge needs criteria)
2. Data flow breaks (collect -> ai-process -> reveal must be connected via data refs)
3. Player eligibility issues (collect after eliminate without from:'remaining' will ask eliminated players)
4. Vote candidates not pointing to usable data
5. Flow logic (loops without exit conditions, phases that skip important steps)

Return ONLY valid JSON:
{"issues":[{"phaseId":"...","severity":"error|warning","message":"...","suggestion":"..."}],"summary":"one sentence"}`;

const DEEP_REVIEW_EXTRA = `
Also check for:
6. Prompt quality — would the AI instruction produce good results? Suggest improvements.
7. Playability — is this fun? Are there enough rounds? Is the pacing good?
8. Timer recommendations — which phases would benefit from time limits?
9. Missing features — would a preview phase help? Would elimination make it more exciting?
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

  async process({ instruction, responses }) {
    if (this.mode === 'mock') {
      return this._processMock(instruction, responses);
    }

    return this._processReal(instruction, responses);
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

  async _processReal(instruction, responses) {
    try {
      const userMessage = this._buildUserMessage(instruction, responses);

      const message = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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

    // Generate a plausible mock issue for ai-process phases with empty instructions
    for (const id of phaseIds) {
      const phase = config.phases[id];
      if (phase.type === 'ai-process' && (!phase.instruction || phase.instruction.trim().length < 10)) {
        issues.push({
          phaseId: id,
          severity: 'warning',
          message: 'AI instruction is very short or empty',
          suggestion: 'Provide detailed instructions so the AI knows exactly what to produce.'
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
