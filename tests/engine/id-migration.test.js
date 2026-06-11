/**
 * Player-id migration on reconnect.
 *
 * Players are keyed by socket id; a reconnect rebinds them to a NEW id.
 * Before this, every structure holding the old id went stale: the turn
 * describer couldn't tap Got It after a wifi blip, relay players lost
 * their turn, votes were silently dropped, and completed-phase scores
 * orphaned (reconnected kids vanished from leaderboards). Found by the
 * chaos simulator.
 */

import { describe, it, expect } from 'vitest';
import { migrateIdsInPlace } from '../../engine/id-migration.js';

describe('migrateIdsInPlace', () => {
  it('rewrites object keys, string values, arrays, Sets, and Maps', () => {
    const state = {
      describerId: 'old',
      turnOrder: ['a', 'old', 'b'],
      scores: { old: 30, b: 10 },
      completed: new Set(['old', 'b']),
      drafts: new Map([['old', 'their text']]),
      nested: { votes: [{ voterId: 'old', choice: 'b' }] }
    };
    migrateIdsInPlace(state, 'old', 'new');

    expect(state.describerId).toBe('new');
    expect(state.turnOrder).toEqual(['a', 'new', 'b']);
    expect(state.scores).toEqual({ new: 30, b: 10 });
    expect(state.completed.has('new')).toBe(true);
    expect(state.completed.has('old')).toBe(false);
    expect(state.drafts.get('new')).toBe('their text');
    expect(state.nested.votes[0].voterId).toBe('new');
    expect(state.nested.votes[0].choice).toBe('b'); // untouched
  });

  it('migrates completed-phase score maps (the leaderboard orphan bug)', () => {
    const phaseData = {
      buzzer: { scores: { old: 20 }, questions: 3 },
      guess1: { scores: { old: 10, other: 5 }, average: 50 }
    };
    migrateIdsInPlace(phaseData, 'old', 'new');
    expect(phaseData.buzzer.scores).toEqual({ new: 20 });
    expect(phaseData.guess1.scores).toEqual({ new: 10, other: 5 });
  });

  it('survives cycles and leaves functions/class instances alone', () => {
    const cleanup = () => 'untouched';
    const state = { id: 'old', cleanup, timer: new (class Timer { constructor() { this.x = 'old'; } })() };
    state.self = state; // cycle
    expect(() => migrateIdsInPlace(state, 'old', 'new')).not.toThrow();
    expect(state.id).toBe('new');
    expect(state.cleanup).toBe(cleanup);
    expect(state.timer.x).toBe('old'); // non-plain objects are not walked
  });

  it('no-ops cleanly on null/undefined roots', () => {
    expect(() => migrateIdsInPlace(null, 'a', 'b')).not.toThrow();
    expect(() => migrateIdsInPlace(undefined, 'a', 'b')).not.toThrow();
  });
});
