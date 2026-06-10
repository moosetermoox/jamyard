/**
 * Connection Pack — Phase 4 (One Voice).
 * Spec: docs/connection-pack-spec.md §4.
 *
 * adjudicateTap is pure with an injected clock, so every timing rule is
 * tested to the millisecond here — including the exact window boundary.
 * The end-to-end flows (broadcasts, lockout over real sockets, stats
 * reveal) are covered by scripts/simulate-one-voice.js.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  adjudicateTap,
  oneVoiceStats,
  RESET_LOCKOUT_MS
} from '../../engine/phase-handlers/one-voice.js';
import { validate } from '../../engine/game-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function freshState(overrides = {}) {
  return {
    phaseId: 'count',
    kind: 'one-voice',
    target: 5,
    windowMs: 400,
    maxAttempts: null,
    count: 0,
    attempt: 1,
    bestRun: 0,
    resets: 0,
    lastTapAt: null,
    lastTapBy: null,
    lockoutUntil: 0,
    finished: false,
    history: [],
    timer: null,
    cleanup() {},
    ...overrides
  };
}

describe('adjudicateTap — counting', () => {
  it('the first tap always counts', () => {
    const s = freshState();
    expect(adjudicateTap(s, 'p1', 1000)).toEqual({ type: 'count', count: 1 });
    expect(s.lastTapBy).toBe('p1');
  });

  it('a tap after the window counts and labels the next number', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    const r = adjudicateTap(s, 'p2', 1401); // 401ms later — just outside
    expect(r).toEqual({ type: 'count', count: 2 });
  });

  it('reaching the target is success and finishes the run', () => {
    const s = freshState({ target: 3 });
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 2000);
    const r = adjudicateTap(s, 'p3', 3000);
    expect(r).toEqual({ type: 'success', count: 3 });
    expect(s.finished).toBe(true);
    expect(s.bestRun).toBe(3);
    // taps after success are rejected
    expect(adjudicateTap(s, 'p1', 4000)).toEqual({ type: 'reject', reason: 'finished' });
  });
});

describe('adjudicateTap — window-boundary adjudication', () => {
  it('a gap of EXACTLY collisionWindowMs is a collision (inside the window)', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    const r = adjudicateTap(s, 'p2', 1400); // exactly 400ms
    expect(r.type).toBe('reset');
  });

  it('a gap of collisionWindowMs + 1 counts', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    const r = adjudicateTap(s, 'p2', 1401);
    expect(r.type).toBe('count');
  });
});

describe('adjudicateTap — collision reset', () => {
  it('records bestRun, bumps attempt, zeroes the count, opens a lockout', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 2000);
    adjudicateTap(s, 'p3', 3000); // count = 3
    const r = adjudicateTap(s, 'p4', 3100); // collision
    expect(r).toEqual({ type: 'reset', attempt: 2, bestRun: 3, resets: 1 });
    expect(s.count).toBe(0);
    expect(s.history).toEqual([{ attempt: 1, reachedCount: 3 }]);
    expect(s.lockoutUntil).toBe(3100 + RESET_LOCKOUT_MS);
  });

  it('taps during the post-reset lockout are rejected (no cascade)', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 1100); // collision → lockout until 1100 + 800
    expect(adjudicateTap(s, 'p3', 1500)).toEqual({ type: 'reject', reason: 'lockout' });
    // after lockout, counting resumes fresh
    expect(adjudicateTap(s, 'p3', 1100 + RESET_LOCKOUT_MS)).toEqual({ type: 'count', count: 1 });
  });

  it('the first tap after a reset is never judged against the collision time', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 1100); // collision
    const r = adjudicateTap(s, 'p3', 2000); // 900ms after collision, past lockout
    expect(r).toEqual({ type: 'count', count: 1 });
  });
});

describe('adjudicateTap — same-player rejection', () => {
  it('the same student may not say two numbers in a row', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    expect(adjudicateTap(s, 'p1', 2000)).toEqual({ type: 'reject', reason: 'same-player' });
    // someone else can — then p1 may go again
    expect(adjudicateTap(s, 'p2', 3000).type).toBe('count');
    expect(adjudicateTap(s, 'p1', 4000).type).toBe('count');
  });

  it('a rejected same-player tap does not cause a collision', () => {
    const s = freshState();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p1', 1050); // within window AND same player → reject, not reset
    expect(s.count).toBe(1);
    expect(s.resets).toBe(0);
  });
});

describe('adjudicateTap — attempt cap', () => {
  it('a reset past maxAttempts finishes the run unsuccessfully', () => {
    const s = freshState({ maxAttempts: 2 });
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 1100); // reset → attempt 2
    adjudicateTap(s, 'p1', 3000);
    const r = adjudicateTap(s, 'p2', 3100); // reset → would be attempt 3 > cap
    expect(r).toEqual({ type: 'finished-attempts' });
    expect(s.finished).toBe(true);
  });
});

describe('oneVoiceStats', () => {
  it('exposes the broadcast/stored snapshot', () => {
    const s = freshState({ count: 4, attempt: 3, bestRun: 4, resets: 2 });
    expect(oneVoiceStats(s)).toEqual({
      target: 5, count: 4, attempt: 3, attempts: 3, bestRun: 4, resets: 2
    });
  });
});

// ---------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------

function ovConfig(countOverrides = {}) {
  return {
    name: 'OV', family: 'connection', phases: {
      lobby: { type: 'lobby', next: 'count' },
      count: { type: 'one-voice', target: 20, collisionWindowMs: 400, next: 'end', ...countOverrides },
      end: { type: 'end' }
    }
  };
}

describe('validator: one-voice', () => {
  it('accepts a clean one-voice connection game', () => {
    const { errors, warnings } = validate(ovConfig(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('blocks collisionWindowMs below 100 (physically unwinnable)', () => {
    const { errors } = validate(ovConfig({ collisionWindowMs: 50 }), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('physically unwinnable'))).toBe(true);
  });

  it('warns above 1500ms', () => {
    const { warnings } = validate(ovConfig({ collisionWindowMs: 2000 }), 'test', { returnResults: true });
    expect(warnings.some(w => w.includes('almost every tap collides'))).toBe(true);
  });

  it('rejects an out-of-range target', () => {
    const { errors } = validate(ovConfig({ target: 1 }), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('invalid target'))).toBe(true);
  });

  it('one-voice is allowed in a connection-family game', () => {
    const { errors } = validate(ovConfig(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Shipped recipe
// ---------------------------------------------------------------------

describe('one-voice recipe', () => {
  it('compiles with zero typing into a valid connection game', async () => {
    const recipe = JSON.parse(
      await readFile(join(__dirname, '..', '..', 'recipes', 'one-voice.json'), 'utf-8')
    );
    const { config, diagnostics } = compileRecipe(recipe, {});
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.family).toBe('connection');
    expect(config.phases.count.type).toBe('one-voice');
    expect(config.phases.count.target).toBe(20);              // integer preserved
    expect(config.phases.count.collisionWindowMs).toBe(400);  // integer preserved
    expect(config.phases.story.template).toContain('{{count.attempts}}');

    const { errors, warnings } = validate(config, 'one-voice', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
