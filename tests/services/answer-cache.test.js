/**
 * Fewer AI calls with no quality cost (2026-10-04, owner): an identical
 * request gets the answer the model already gave. Two places use it: the
 * make page's fit questions (the activity, the class, the page's settings)
 * and an activity's translation (its texts and the language).
 */
import { describe, it, expect } from 'vitest';
import { AnswerCache, cacheKey } from '../../services/answer-cache.js';
import { AIService } from '../../services/ai-service.js';

describe('AnswerCache', () => {
  it('gives back a copy of what it stored, never the stored object', () => {
    const c = new AnswerCache();
    const stored = { questions: [{ question: 'A?' }] };
    c.set('k', stored);
    const got = c.get('k');
    expect(got).toEqual(stored);
    got.questions.push({ question: 'B?' });
    expect(c.get('k').questions.length).toBe(1);
  });
  it('forgets after its time is up', () => {
    let now = 1000;
    const c = new AnswerCache({ ttlMs: 50, now: () => now });
    c.set('k', 1);
    now += 49; expect(c.get('k')).toBe(1);
    now += 2; expect(c.get('k')).toBe(undefined);
  });
  it('holds a bounded number, the oldest leaves first', () => {
    const c = new AnswerCache({ maxEntries: 2 });
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    expect(c.get('a')).toBe(undefined);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });
  it('the key ignores the order of an object\'s keys and nothing else', () => {
    expect(cacheKey('x', { a: 1, b: [1, { c: 2, d: 3 }] })).toBe(cacheKey('x', { b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(cacheKey('x', { a: 1 })).not.toBe(cacheKey('y', { a: 1 }));
    expect(cacheKey('x', { a: 1 })).not.toBe(cacheKey('x', { a: 2 }));
  });
});

const config = {
  name: 'Snowball',
  description: 'Alone, then pairs, then the class',
  phases: {
    lobby: { type: 'lobby', next: 'solo' },
    solo: { type: 'collect', prompt: 'What is the most important idea?', next: 'end' },
    end: { type: 'end', message: 'Nice work.' }
  }
};

describe('the fit questions reuse an identical request', () => {
  it('one model call for two identical requests; a different class asks again', async () => {
    const service = new AIService({ mode: 'real' });
    let calls = 0;
    service._callClaude = async () => {
      calls++;
      return { content: [{ type: 'text', text: '{"questions":[{"question":"How long should answers be?","kind":"choice","choices":["A word","A sentence"]}]}' }] };
    };
    const a = await service.generateCustomizeQuestions(config, '7th grade science', []);
    const b = await service.generateCustomizeQuestions(JSON.parse(JSON.stringify(config)), '7th grade science', []);
    expect(calls).toBe(1);
    expect(b).toEqual(a);
    await service.generateCustomizeQuestions(config, '3rd grade reading', []);
    expect(calls).toBe(2);
  });
  it('an empty answer (a failure looks the same) is never kept', async () => {
    const service = new AIService({ mode: 'real' });
    let calls = 0;
    service._callClaude = async () => { calls++; throw new Error('boom'); };
    await service.generateCustomizeQuestions(config, '', []);
    await service.generateCustomizeQuestions(config, '', []);
    expect(calls).toBe(2);
  });
});

describe('a translation reuses an identical request', () => {
  it('one model call for the same texts and language; the result is the same activity', async () => {
    const service = new AIService({ mode: 'real' });
    let calls = 0;
    service._callClaude = async (params) => {
      calls++;
      const body = params.messages[0].content;
      const json = JSON.parse(body.slice(body.indexOf('\n{\n') + 1, body.lastIndexOf('}') + 1));
      const out = {};
      for (const k of Object.keys(json)) out[k] = 'ES ' + json[k];
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    };
    const a = await service.translateActivityText({ config, language: 'es' });
    const b = await service.translateActivityText({ config: JSON.parse(JSON.stringify(config)), language: 'es' });
    expect(calls).toBe(1);
    expect(b).toEqual(a);
    expect(a.phases.solo.prompt).toBe('ES What is the most important idea?');
    expect(config.phases.solo.prompt).toBe('What is the most important idea?'); // the original is untouched
    await service.translateActivityText({ config, language: 'fr' });
    expect(calls).toBe(2);
  });
});
