/**
 * The moderation ladder (owner design, 2026-08-30): blocklist first (already
 * in content-filter.js), then OpenAI's free moderation scores block the
 * obvious, the uncertain band goes to Haiku for classroom judgment, and
 * what Haiku can't settle is flagged for the teacher console. Fail-open on
 * OpenAI errors (the blocklist already passed), fail-to-teacher on Haiku
 * errors (uncertainty goes to a human, never silently accepted as clean).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyScores,
  createModerationLadder,
  DEFAULT_BLOCK_AT,
  DEFAULT_REVIEW_AT
} from '../../services/moderation-ladder.js';
import { AIService, parseModerationVerdict } from '../../services/ai-service.js';

const T = { blockAt: 0.85, reviewAt: 0.4 };

function okJson(scores) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [{ category_scores: scores }] })
  };
}

describe('classifyScores', () => {
  it('low scores everywhere are ok', () => {
    expect(classifyScores({ harassment: 0.01, violence: 0.05 }, T).verdict).toBe('ok');
  });

  it('any category at or above blockAt blocks, naming the category', () => {
    const r = classifyScores({ harassment: 0.02, 'self-harm': 0.91 }, T);
    expect(r.verdict).toBe('block');
    expect(r.category).toBe('self-harm');
  });

  it('the uncertain band goes to review', () => {
    const r = classifyScores({ harassment: 0.55 }, T);
    expect(r.verdict).toBe('review');
    expect(r.category).toBe('harassment');
  });

  it('missing or empty scores are ok (nothing to judge)', () => {
    expect(classifyScores(undefined, T).verdict).toBe('ok');
    expect(classifyScores({}, T).verdict).toBe('ok');
  });

  it('default thresholds exist and are sane', () => {
    expect(DEFAULT_BLOCK_AT).toBeGreaterThan(DEFAULT_REVIEW_AT);
  });
});

describe('createModerationLadder', () => {
  it('is disabled without an api key and accepts everything', async () => {
    const ladder = createModerationLadder({ apiKey: '', aiService: {} });
    expect(ladder.enabled).toBe(false);
    const v = await ladder.check('whatever');
    expect(v.action).toBe('accept');
  });

  it('rejects on a high OpenAI score without calling Haiku', async () => {
    const moderateText = vi.fn();
    const ladder = createModerationLadder({
      apiKey: 'k', aiService: { moderateText },
      fetchFn: async () => okJson({ harassment: 0.95 })
    });
    const v = await ladder.check('mean text');
    expect(v.action).toBe('reject');
    expect(v.rung).toBe('openai');
    expect(v.category).toBe('harassment');
    expect(moderateText).not.toHaveBeenCalled();
  });

  it('accepts a clean text without calling Haiku', async () => {
    const moderateText = vi.fn();
    const ladder = createModerationLadder({
      apiKey: 'k', aiService: { moderateText },
      fetchFn: async () => okJson({ harassment: 0.01 })
    });
    const v = await ladder.check('nice text');
    expect(v.action).toBe('accept');
    expect(v.rung).toBe('openai');
    expect(moderateText).not.toHaveBeenCalled();
  });

  it('escalates the uncertain band to Haiku: ok accepts', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k',
      aiService: { moderateText: async () => ({ verdict: 'ok' }) },
      fetchFn: async () => okJson({ violence: 0.5 })
    });
    const v = await ladder.check('borderline');
    expect(v.action).toBe('accept');
    expect(v.rung).toBe('haiku');
  });

  it('escalates the uncertain band to Haiku: block rejects', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k',
      aiService: { moderateText: async () => ({ verdict: 'block' }) },
      fetchFn: async () => okJson({ harassment: 0.5 })
    });
    const v = await ladder.check('borderline');
    expect(v.action).toBe('reject');
    expect(v.rung).toBe('haiku');
  });

  it('escalates the uncertain band to Haiku: unsure flags for the teacher', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k',
      aiService: { moderateText: async () => ({ verdict: 'unsure' }) },
      fetchFn: async () => okJson({ harassment: 0.5 })
    });
    const v = await ladder.check('borderline');
    expect(v.action).toBe('flag');
    expect(v.category).toBe('harassment');
  });

  it('fails OPEN when OpenAI errors (the blocklist already passed)', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k', aiService: {},
      fetchFn: async () => { throw new Error('network down'); }
    });
    const v = await ladder.check('text');
    expect(v.action).toBe('accept');
    expect(v.rung).toBe('openai-error');
  });

  it('fails OPEN on a non-200 OpenAI response', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k', aiService: {},
      fetchFn: async () => ({ ok: false, status: 429, json: async () => ({}) })
    });
    const v = await ladder.check('text');
    expect(v.action).toBe('accept');
    expect(v.rung).toBe('openai-error');
  });

  it('fails TO THE TEACHER when Haiku errors on an uncertain text', async () => {
    const ladder = createModerationLadder({
      apiKey: 'k',
      aiService: { moderateText: async () => { throw new Error('budget'); } },
      fetchFn: async () => okJson({ harassment: 0.5 })
    });
    const v = await ladder.check('borderline');
    expect(v.action).toBe('flag');
  });

  it('scrubs roster names and contact patterns before anything leaves the server', async () => {
    let sentBody = null;
    const ladder = createModerationLadder({
      apiKey: 'k', aiService: {},
      fetchFn: async (url, opts) => { sentBody = JSON.parse(opts.body); return okJson({}); }
    });
    await ladder.check('Maya is at maya@example.com', { rosterNames: ['Maya'] });
    expect(sentBody.input).not.toContain('Maya');
    expect(sentBody.input).not.toContain('maya@example.com');
  });

  it('sends the api key as a bearer header to the moderations endpoint', async () => {
    let seenUrl = null, seenAuth = null;
    const ladder = createModerationLadder({
      apiKey: 'sk-test', aiService: {},
      fetchFn: async (url, opts) => { seenUrl = url; seenAuth = opts.headers.Authorization; return okJson({}); }
    });
    await ladder.check('text');
    expect(seenUrl).toContain('/v1/moderations');
    expect(seenAuth).toBe('Bearer sk-test');
  });
});

describe('parseModerationVerdict', () => {
  it('reads a clean JSON verdict', () => {
    expect(parseModerationVerdict('{"verdict": "block"}')).toBe('block');
  });

  it('survives preamble around the JSON (the standing AI-reply gotcha)', () => {
    expect(parseModerationVerdict('Here is my judgment:\n{"verdict":"ok"}')).toBe('ok');
  });

  it('unreadable replies become unsure, never silently ok', () => {
    expect(parseModerationVerdict('I think this is fine')).toBe('unsure');
    expect(parseModerationVerdict('')).toBe('unsure');
  });
});

describe('AIService.moderateText', () => {
  it('mock mode says ok (sims and keyless dev never block)', async () => {
    const svc = new AIService({ mode: 'mock' });
    expect((await svc.moderateText('anything')).verdict).toBe('ok');
  });
});
