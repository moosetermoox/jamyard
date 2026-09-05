/**
 * engine/pending-submits.js: a Close waits for answers still inside the
 * moderation ladder before it gathers responses.
 */
import { describe, it, expect } from 'vitest';
import { holdPendingSubmit, settlePendingSubmits, pendingSubmitCount } from '../../engine/pending-submits.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

describe('pending submits', () => {
  it('settles immediately when nothing is in flight', async () => {
    const room = {};
    expect(pendingSubmitCount(room)).toBe(0);
    expect(await settlePendingSubmits(room)).toBe(0);
  });

  it('waits for a held submission to be stored before resolving', async () => {
    const room = {};
    const stored = [];
    const release = holdPendingSubmit(room);
    expect(pendingSubmitCount(room)).toBe(1);

    // The handler's continuation: store, then release.
    setTimeout(() => { stored.push('answer'); release(); }, 10);

    const waited = await settlePendingSubmits(room);
    expect(waited).toBe(1);
    expect(stored).toEqual(['answer']);
    expect(pendingSubmitCount(room)).toBe(0);
  });

  it('a hold released twice is harmless', async () => {
    const room = {};
    const release = holdPendingSubmit(room);
    release();
    release();
    expect(pendingSubmitCount(room)).toBe(0);
    expect(await settlePendingSubmits(room)).toBe(0);
  });

  it('gives up after the timeout so a wedged moderation call cannot freeze a Close', async () => {
    const room = {};
    holdPendingSubmit(room); // never released
    const waited = await settlePendingSubmits(room, { timeoutMs: 15 });
    expect(waited).toBe(1);
    expect(pendingSubmitCount(room)).toBe(1);
  });

  it('keeps rooms apart', async () => {
    const a = {};
    const b = {};
    holdPendingSubmit(a);
    expect(pendingSubmitCount(b)).toBe(0);
    expect(await settlePendingSubmits(b)).toBe(0);
    await tick();
  });

  it('tolerates a missing room', async () => {
    const release = holdPendingSubmit(null);
    release();
    expect(await settlePendingSubmits(null)).toBe(0);
  });
});
