import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a fun, energetic game host for a classroom game.
Your job is to take player responses and create entertaining content based on them.
Keep your responses appropriate for a classroom setting - fun but not inappropriate.
Be creative, playful, and engaging. Keep responses concise.`;

const MODEL = 'claude-3-haiku-20240307';

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

  _buildUserMessage(instruction, responses) {
    const responseList = responses
      .map(r => `- ${r.name}: "${r.text}"`)
      .join('\n');

    return `${instruction}

Here are the player responses:
${responseList}`;
  }
}
