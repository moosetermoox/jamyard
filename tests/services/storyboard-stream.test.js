/**
 * Snappier AI, 2026-09-20 (measured first: no model swap moved the
 * numbers, so three cheaper levers instead):
 *  1. the storyboard call runs at effort low (the 29-second thinking
 *     outlier is gone, the honest declines stay);
 *  2. the storyboard can STREAM: steps land on the Create page one at a
 *     time, the model's thinking summary shows while nothing else can;
 *  3. the revise and recipe-match system prompts carry a cache marker
 *     (about 90% off their input cost on a hit; no speed change, measured).
 * Every outbound call still goes through the one chokepoint, so the
 * style rules ride on the cached block too.
 */

import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

const board = {
  name: 'Exit Check',
  description: 'One thing learned, one still open.',
  steps: [
    { brick: 'announce', text: 'Before you go, two quick things.' },
    { brick: 'collect', text: 'What is one thing you learned today?', timer: 60 },
    { brick: 'end', text: 'Thanks, see you tomorrow.' }
  ]
};

function textResponse(obj) {
  return { content: [{ type: 'thinking', thinking: 'weighing' }, { type: 'text', text: JSON.stringify(obj) }] };
}

function fakeStream(chunks, thinking = []) {
  const events = [];
  thinking.forEach(t => events.push({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: t } }));
  chunks.forEach(t => events.push({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } }));
  const text = chunks.join('');
  return {
    async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
    finalMessage: async () => ({ content: [{ type: 'thinking', thinking: thinking.join('') }, { type: 'text', text }] })
  };
}

function realService() {
  const service = new AIService({ mode: 'real' });
  service.budget = { take: async () => {} };
  return service;
}

describe('storyboard at effort low', () => {
  it('sends the storyboard call at effort low, thinking still adaptive', async () => {
    const service = realService();
    let sent = null;
    service.client = { messages: { create: async (p) => { sent = p; return textResponse(board); } } };
    const result = await service.generateStoryboard('an exit check where everyone writes one thing they learned');
    expect(result.steps).toHaveLength(3);
    expect(sent.model).toBe('claude-sonnet-5');
    expect(sent.output_config).toEqual({ effort: 'low' });
    expect(sent.thinking).toEqual({ type: 'adaptive' });
  });
});

describe('storyboard streaming', () => {
  it('emits the name, then each step exactly once as it completes, and returns the full storyboard', async () => {
    const service = realService();
    const json = JSON.stringify(board);
    // Split at awkward places: mid-name, mid-step, and across the array close.
    const chunks = [json.slice(0, 12), json.slice(12, 60), json.slice(60, 150), json.slice(150, 200), json.slice(200)];
    let sent = null;
    service._streamClaude = async (p) => { sent = p; return fakeStream(chunks, ['Three steps ', 'should do.']); };
    const events = [];
    const result = await service.generateStoryboard('an exit check', { onEvent: (e) => events.push(e) });

    expect(result).toEqual(board);
    expect(sent.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(sent.output_config).toEqual({ effort: 'low' });

    const kinds = events.map(e => e.type);
    expect(kinds.filter(k => k === 'thinking')).toHaveLength(2);
    expect(events.filter(e => e.type === 'name')).toEqual([{ type: 'name', name: 'Exit Check' }]);
    const steps = events.filter(e => e.type === 'step');
    expect(steps.map(s => s.index)).toEqual([0, 1, 2]);
    expect(steps.map(s => s.step.brick)).toEqual(['announce', 'collect', 'end']);
    expect(kinds.indexOf('name')).toBeLessThan(kinds.indexOf('step'));
  });

  it('streams an honest refusal as no steps and returns cantBuild', async () => {
    const service = realService();
    service._streamClaude = async () => fakeStream(['{"cantBuild": true, "reason": ', '"I cannot pair students yet."}']);
    const events = [];
    const result = await service.generateStoryboard('a pair debate', { onEvent: (e) => events.push(e) });
    expect(result.cantBuild).toBe(true);
    expect(result.reason).toBe('I cannot pair students yet.');
    expect(events.filter(e => e.type === 'step')).toEqual([]);
  });

  it('reports a broken stream as an error, never a throw', async () => {
    const service = realService();
    service._streamClaude = async () => { throw new Error('socket closed'); };
    const result = await service.generateStoryboard('anything at all', { onEvent: () => {} });
    expect(result.error).toMatch(/socket closed/);
  });

  it('without a listener the plain call path is used, unchanged', async () => {
    const service = realService();
    let streamed = false;
    service._streamClaude = async () => { streamed = true; return fakeStream([JSON.stringify(board)]); };
    service._callClaude = async () => textResponse(board);
    const result = await service.generateStoryboard('an exit check');
    expect(streamed).toBe(false);
    expect(result.name).toBe('Exit Check');
  });

  it('mock mode plays its fixed storyboard through the listener too', async () => {
    const service = new AIService();
    const events = [];
    const result = await service.generateStoryboard('an exit check', { onEvent: (e) => events.push(e) });
    expect(events.filter(e => e.type === 'step')).toHaveLength(result.steps.length);
    expect(events[0]).toEqual({ type: 'name', name: result.name });
  });
});

describe('cached system prompts', () => {
  it('turns cache: true into one cached system block carrying the style rules, and drops the flag', () => {
    const service = realService();
    const out = service._prepareParams({ model: 'claude-sonnet-5', max_tokens: 100, system: 'Be brief.', cache: true, messages: [] });
    expect(out.cache).toBeUndefined();
    expect(Array.isArray(out.system)).toBe(true);
    expect(out.system).toHaveLength(1);
    expect(out.system[0].type).toBe('text');
    expect(out.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(out.system[0].text.startsWith('Be brief.')).toBe(true);
    expect(out.system[0].text).toContain('STYLE RULES');
  });

  it('leaves an uncached system prompt as the plain string it always was', () => {
    const service = realService();
    const out = service._prepareParams({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, system: 'Be brief.', messages: [] });
    expect(typeof out.system).toBe('string');
    expect(out.system.startsWith('Be brief.')).toBe(true);
    expect(out.system).toContain('STYLE RULES');
    expect(out.cache).toBeUndefined();
  });

  it('reviseGame asks for the cache', async () => {
    const service = realService();
    let sent = null;
    service._callClaude = async (p) => { sent = p; return textResponse({ updatedConfig: { name: 'x', phases: {} }, summary: 'ok' }); };
    await service.reviseGame({ config: { name: 'x', phases: {} }, request: 'shorter' });
    expect(sent.cache).toBe(true);
    expect(typeof sent.system).toBe('string');
  });

  it('matchRecipe asks for the cache', async () => {
    const service = realService();
    let sent = null;
    service._callClaude = async (p) => { sent = p; return textResponse({ noMatch: true, reason: 'none', suggestion: '' }); };
    await service.matchRecipe('a warm up', [{ id: 'r1', name: 'Recipe One', description: 'd', params: {} }]);
    expect(sent.cache).toBe(true);
  });
});
