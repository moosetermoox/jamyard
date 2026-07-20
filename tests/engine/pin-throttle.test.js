/**
 * PIN throttle — timing rules for teacher-console brute-force protection.
 * All clocks injected; keyed by room code so fresh sockets don't reset it.
 */

import { describe, it, expect } from 'vitest';
import { createPinThrottle } from '../../engine/pin-throttle.js';

const T0 = 1_000_000;
const MIN = 60 * 1000;

describe('createPinThrottle', () => {
  it('allows attempts below the threshold', () => {
    const t = createPinThrottle({ maxAttempts: 5 });
    for (let i = 0; i < 4; i++) {
      expect(t.check('ROOM', T0 + i).allowed).toBe(true);
      expect(t.recordFailure('ROOM', T0 + i).locked).toBe(false);
    }
    expect(t.check('ROOM', T0 + 10).allowed).toBe(true);
  });

  it('the Nth failure inside the window locks the room — even for the right PIN', () => {
    const t = createPinThrottle({ maxAttempts: 5, lockoutMs: 5 * MIN });
    for (let i = 0; i < 4; i++) t.recordFailure('ROOM', T0 + i * 1000);
    const fifth = t.recordFailure('ROOM', T0 + 4000);
    expect(fifth.locked).toBe(true);
    const check = t.check('ROOM', T0 + 5000);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterMs).toBeGreaterThan(4 * MIN);
  });

  it('the lockout expires after lockoutMs', () => {
    const t = createPinThrottle({ maxAttempts: 2, lockoutMs: 5 * MIN });
    t.recordFailure('ROOM', T0);
    t.recordFailure('ROOM', T0 + 1);
    expect(t.check('ROOM', T0 + MIN).allowed).toBe(false);
    expect(t.check('ROOM', T0 + 5 * MIN + 2).allowed).toBe(true);
  });

  it('old failures age out of the window (slow typos never lock)', () => {
    const t = createPinThrottle({ maxAttempts: 3, windowMs: 10 * MIN });
    t.recordFailure('ROOM', T0);
    t.recordFailure('ROOM', T0 + 1 * MIN);
    // Third failure 11 minutes later — the first two have aged out
    expect(t.recordFailure('ROOM', T0 + 11 * MIN).locked).toBe(false);
  });

  it('a successful join clears the count', () => {
    const t = createPinThrottle({ maxAttempts: 3 });
    t.recordFailure('ROOM', T0);
    t.recordFailure('ROOM', T0 + 1);
    t.recordSuccess('ROOM');
    expect(t.recordFailure('ROOM', T0 + 2).locked).toBe(false);
    expect(t.recordFailure('ROOM', T0 + 3).locked).toBe(false);
  });

  it('rooms are throttled independently', () => {
    const t = createPinThrottle({ maxAttempts: 2 });
    t.recordFailure('AAAA', T0);
    t.recordFailure('AAAA', T0 + 1);
    expect(t.check('AAAA', T0 + 2).allowed).toBe(false);
    expect(t.check('BBBB', T0 + 2).allowed).toBe(true);
  });

  it('sweep drops stale entries but keeps active lockouts', () => {
    const t = createPinThrottle({ maxAttempts: 2, windowMs: 10 * MIN, lockoutMs: 5 * MIN });
    t.recordFailure('OLD', T0);
    t.recordFailure('HOT', T0);
    t.recordFailure('HOT', T0 + 1); // locked until T0 + 5min
    t.sweep(T0 + 11 * MIN);
    expect(t.size()).toBe(0); // both stale by now
    t.recordFailure('HOT2', T0 + 12 * MIN);
    t.recordFailure('HOT2', T0 + 12 * MIN + 1);
    t.sweep(T0 + 13 * MIN); // HOT2 still locked — must survive the sweep
    expect(t.check('HOT2', T0 + 13 * MIN).allowed).toBe(false);
  });
});
