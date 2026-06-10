/**
 * AI budget (services/ai-budget.js) — cost guards on every real AI call.
 *
 * Two independent guards, both env-configurable, both 0-disableable:
 *   - per-minute sliding-window throttle (runaway client / hammered button)
 *   - daily cap (spend ceiling; survives restarts via the optional store)
 *
 * Pure logic with an injected clock; the Anthropic call never happens when
 * take() throws.
 */

import { describe, it, expect } from 'vitest';
import { createAiBudget, AiBudgetError } from '../../services/ai-budget.js';

function fakeClock(start = 1000000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  now.set = (ms) => { t = ms; };
  return now;
}

describe('per-minute throttle', () => {
  it('allows calls under the limit and throttles at it', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 3, dailyCap: 0, now });
    await b.take();
    await b.take();
    await b.take();
    await expect(b.take()).rejects.toThrow(AiBudgetError);
  });

  it('reports how long to wait, and frees up as the window slides', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 2, dailyCap: 0, now });
    await b.take();
    now.advance(30000);
    await b.take();

    let err = null;
    try { await b.take(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AiBudgetError);
    expect(err.statusCode).toBe(429);
    // First call leaves the window in 30s
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(31);

    now.advance(31000); // first call is now > 60s old
    await expect(b.take()).resolves.not.toThrow();
  });

  it('perMinute: 0 disables the throttle', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 0, dailyCap: 0, now });
    for (let i = 0; i < 50; i++) await b.take();
  });
});

describe('daily cap', () => {
  it('blocks after the cap and mentions the env var in the message', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 0, dailyCap: 2, now });
    await b.take();
    await b.take();
    let err = null;
    try { await b.take(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AiBudgetError);
    expect(err.message).toContain('AI_DAILY_CAP');
  });

  it('resets when the day rolls over', async () => {
    const now = fakeClock(Date.parse('2026-06-10T22:00:00'));
    const b = createAiBudget({ perMinute: 0, dailyCap: 1, now });
    await b.take();
    await expect(b.take()).rejects.toThrow(AiBudgetError);
    now.advance(3 * 3600 * 1000); // 01:00 next day
    await expect(b.take()).resolves.not.toThrow();
  });

  it('dailyCap: 0 disables the cap', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 0, dailyCap: 0, now });
    for (let i = 0; i < 100; i++) await b.take();
  });
});

describe('persistence store', () => {
  function memStore(initial = {}) {
    const days = { ...initial };
    return {
      days,
      load: async (day) => days[day] ?? 0,
      save: async (day, count) => { days[day] = count; }
    };
  }

  it('resumes the day count from the store (restart survival)', async () => {
    const now = fakeClock(Date.parse('2026-06-10T12:00:00'));
    const store = memStore({ '2026-06-10': 4 });
    const b = createAiBudget({ perMinute: 0, dailyCap: 5, now, store });
    await b.take(); // 5th of the day
    await expect(b.take()).rejects.toThrow(AiBudgetError);
  });

  it('writes the running count back to the store', async () => {
    const now = fakeClock(Date.parse('2026-06-10T12:00:00'));
    const store = memStore();
    const b = createAiBudget({ perMinute: 0, dailyCap: 10, now, store });
    await b.take();
    await b.take();
    expect(store.days['2026-06-10']).toBe(2);
  });

  it('a broken store never blocks AI calls', async () => {
    const now = fakeClock();
    const store = {
      load: async () => { throw new Error('db down'); },
      save: async () => { throw new Error('db down'); }
    };
    const b = createAiBudget({ perMinute: 0, dailyCap: 5, now, store });
    await expect(b.take()).resolves.not.toThrow();
  });
});

describe('peek', () => {
  it('loads the persisted count without recording a call', async () => {
    const now = fakeClock(Date.parse('2026-06-10T12:00:00'));
    const store = {
      load: async () => 7,
      save: async () => {}
    };
    const b = createAiBudget({ perMinute: 0, dailyCap: 10, now, store });
    const s = await b.peek();
    expect(s.dayCount).toBe(7); // restored, not reset
    expect((await b.peek()).dayCount).toBe(7); // peek never increments
  });
});

describe('snapshot', () => {
  it('exposes current usage for status displays', async () => {
    const now = fakeClock();
    const b = createAiBudget({ perMinute: 10, dailyCap: 100, now });
    await b.take();
    await b.take();
    const s = b.snapshot();
    expect(s.dayCount).toBe(2);
    expect(s.windowCount).toBe(2);
    expect(s.perMinute).toBe(10);
    expect(s.dailyCap).toBe(100);
  });
});
