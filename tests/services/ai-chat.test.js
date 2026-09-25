import { describe, it, expect } from 'vitest';
import { AIService, summarizeConfigForChat, trimChatHistory } from '../../services/ai-service.js';

// Design chat (editor chat panel): one Haiku triage-and-answer call per
// turn; only when the triage says "edit" does the turn chain into the
// full Sonnet reviseGame pipeline. See docs/CHANGELOG.md 2026-08-15.

const config = {
  name: 'Test Game',
  description: 'A test activity',
  minPlayers: 2,
  maxPlayers: 30,
  phases: {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'What is your favorite animal and why do you like it so much?', next: 'end' },
    end: { type: 'end' }
  }
};

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

describe('designChat', () => {
  it('mock mode returns a chat turn without any API call', async () => {
    const service = new AIService(); // mock
    service._callClaude = async () => { throw new Error('must not be called'); };
    const result = await service.designChat({
      config,
      messages: [{ role: 'user', content: 'Any ideas?' }]
    });
    expect(result.kind).toBe('chat');
    expect(result.reply).toContain('[MOCK]');
  });

  it('answer turn: one Haiku call, kind chat', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      return textResponse(JSON.stringify({ action: 'answer', reply: 'You could add a vote step after the answers come in.' }));
    };
    const result = await service.designChat({
      config,
      messages: [{ role: 'user', content: 'How do I make this more competitive?' }]
    });
    expect(result.kind).toBe('chat');
    expect(result.reply).toBe('You could add a vote step after the answers come in.');
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toMatch(/haiku/);
    // The triage sees the config summary and the transcript, never raw JSON
    expect(calls[0].messages[0].content).toContain('Test Game');
    expect(calls[0].messages[0].content).toContain('How do I make this more competitive?');
  });

  it('edit turn: chains into the Sonnet revise pipeline and returns a proposal', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      if (calls.length === 1) {
        return textResponse(JSON.stringify({
          action: 'edit',
          reply: 'On it, drafting that change now.',
          editRequest: 'Add a leaderboard step after the collect step named ask.'
        }));
      }
      return textResponse(JSON.stringify({ updatedConfig: config, summary: 'Added a leaderboard.' }));
    };
    const result = await service.designChat({
      config,
      messages: [{ role: 'user', content: 'Add a leaderboard at the end.' }]
    });
    expect(result.kind).toBe('proposal');
    expect(result.reply).toBe('On it, drafting that change now.');
    expect(result.updatedConfig.phases.ask.prompt).toContain('favorite animal');
    expect(result.summary).toBe('Added a leaderboard.');
    expect(calls).toHaveLength(2);
    expect(calls[0].model).toMatch(/haiku/);
    expect(calls[1].model).toMatch(/sonnet/);
    expect(calls[1].messages[0].content).toContain('Add a leaderboard step after the collect step named ask.');
  });

  it('non-JSON triage output becomes an answer with the raw prose', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse('Sure! A vote step would make this feel like a contest.');
    const result = await service.designChat({
      config,
      messages: [{ role: 'user', content: 'Ideas?' }]
    });
    expect(result.kind).toBe('chat');
    expect(result.reply).toBe('Sure! A vote step would make this feel like a contest.');
  });

  it('edit action with a blank editRequest degrades to an answer', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      return textResponse(JSON.stringify({ action: 'edit', reply: 'Working on it.', editRequest: '  ' }));
    };
    const result = await service.designChat({
      config,
      messages: [{ role: 'user', content: 'Do the thing.' }]
    });
    expect(result.kind).toBe('chat');
    expect(calls).toHaveLength(1);
  });

  it('focusPhaseId and classDescription ride into the triage prompt', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      return textResponse(JSON.stringify({ action: 'answer', reply: 'ok' }));
    };
    await service.designChat({
      config,
      messages: [{ role: 'user', content: 'Make this step better.' }],
      focusPhaseId: 'ask',
      classDescription: '7th grade science'
    });
    expect(calls[0].messages[0].content).toContain('ask');
    expect(calls[0].messages[0].content).toContain('7th grade science');
  });

  it('a revise failure during an edit turn surfaces as a thrown error', async () => {
    const service = new AIService({ mode: 'real' });
    let n = 0;
    service._callClaude = async () => {
      n++;
      if (n === 1) {
        return textResponse(JSON.stringify({ action: 'edit', reply: 'On it.', editRequest: 'Add a leaderboard.' }));
      }
      throw new Error('api down');
    };
    await expect(service.designChat({
      config,
      messages: [{ role: 'user', content: 'Add a leaderboard.' }]
    })).rejects.toThrow('api down');
  });
});

describe('summarizeConfigForChat', () => {
  it('covers name, every phase id and type, in next-chain order', () => {
    const summary = summarizeConfigForChat(config);
    expect(summary).toContain('Test Game');
    expect(summary).toContain('id "lobby"');
    expect(summary).toContain('id "ask"');
    expect(summary).toContain('id "end"');
    expect(summary).toContain('collect');
    expect(summary.indexOf('id "lobby"')).toBeLessThan(summary.indexOf('id "ask"'));
    expect(summary.indexOf('id "ask"')).toBeLessThan(summary.indexOf('id "end"'));
  });

  it('includes phases unreachable from the next chain', () => {
    const cfg = {
      name: 'Orphans',
      phases: {
        lobby: { type: 'lobby', next: 'end' },
        end: { type: 'end' },
        stray: { type: 'announce', message: 'unreachable step' }
      }
    };
    const summary = summarizeConfigForChat(cfg);
    expect(summary).toContain('id "stray"');
  });

  it('truncates long prompts and stays bounded', () => {
    const longPrompt = 'x'.repeat(3000);
    const cfg = {
      name: 'Long',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: longPrompt, next: 'end' },
        end: { type: 'end' }
      }
    };
    const summary = summarizeConfigForChat(cfg);
    expect(summary.length).toBeLessThan(600);
    expect(summary).not.toContain('x'.repeat(200));
  });

  it('lists foreach sub-steps', () => {
    const cfg = {
      name: 'Rounds',
      phases: {
        lobby: { type: 'lobby', next: 'rounds' },
        rounds: {
          type: 'foreach',
          from: 'lobby.responses',
          next: 'end',
          phases: { show: { type: 'announce', message: 'Look at this one' } }
        },
        end: { type: 'end' }
      }
    };
    const summary = summarizeConfigForChat(cfg);
    expect(summary).toContain('rounds.show');
  });
});

describe('trimChatHistory', () => {
  it('keeps only the last 12 messages', () => {
    const messages = [];
    for (let i = 0; i < 30; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'msg ' + i });
    }
    const trimmed = trimChatHistory(messages);
    expect(trimmed).toHaveLength(12);
    expect(trimmed[11].content).toBe('msg 29');
  });

  it('caps each message content at 2000 chars', () => {
    const trimmed = trimChatHistory([{ role: 'user', content: 'y'.repeat(5000) }]);
    expect(trimmed[0].content.length).toBeLessThanOrEqual(2000);
  });

  it('drops malformed entries', () => {
    const trimmed = trimChatHistory([
      { role: 'user', content: 'good' },
      { role: 'system', content: 'bad role' },
      { role: 'user', content: 42 },
      null
    ]);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].content).toBe('good');
  });
});

describe('designChat "Just do it" (forceEdit)', () => {
  it('appends the just-do-it instruction to the triage turn and chains into a proposal', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      if (calls.length === 1) {
        return textResponse(JSON.stringify({
          action: 'edit',
          reply: 'Making those changes now.',
          editRequest: 'Make the vote head-to-head and add a leaderboard after it.'
        }));
      }
      return textResponse(JSON.stringify({ updatedConfig: config, summary: 'Head-to-head vote plus leaderboard.' }));
    };
    const result = await service.designChat({
      config,
      forceEdit: true,
      messages: [
        { role: 'user', content: 'Could the vote be head-to-head?' },
        { role: 'assistant', content: 'Yes, and a leaderboard after it would show the standings.' },
        { role: 'user', content: 'Just do it.' }
      ]
    });
    expect(calls[0].messages[0].content).toContain('pressed the "Just do it" button');
    expect(calls[0].messages[0].content).toContain('You MUST choose "edit"');
    expect(result.kind).toBe('proposal');
    expect(result.summary).toBe('Head-to-head vote plus leaderboard.');
  });

  it('an ordinary turn never carries the instruction', async () => {
    const service = new AIService({ mode: 'real' });
    const calls = [];
    service._callClaude = async (params) => {
      calls.push(params);
      return textResponse(JSON.stringify({ action: 'answer', reply: 'Sure.' }));
    };
    await service.designChat({ config, messages: [{ role: 'user', content: 'Ideas?' }] });
    expect(calls[0].messages[0].content).not.toContain('Just do it');
  });
});
