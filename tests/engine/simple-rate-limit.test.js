import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../engine/simple-rate-limit.js';

function clockAt(start = 0) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

describe('createRateLimiter', () => {
  it('allows up to max attempts inside the window, then blocks', () => {
    const clock = clockAt();
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock.now });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });

  it('keys are independent', () => {
    const clock = clockAt();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });

  it('window slides: old attempts expire', () => {
    const clock = clockAt();
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: clock.now });
    limiter.allow('a');
    limiter.allow('a');
    expect(limiter.allow('a')).toBe(false);
    clock.advance(60_001);
    expect(limiter.allow('a')).toBe(true);
  });

  it('a blocked attempt does not extend the lockout', () => {
    const clock = clockAt();
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    limiter.allow('a');
    clock.advance(900);
    expect(limiter.allow('a')).toBe(false); // blocked, but not recorded
    clock.advance(101);                     // original attempt now expired
    expect(limiter.allow('a')).toBe(true);
  });

  it('sweep drops stale keys', () => {
    const clock = clockAt();
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: clock.now });
    limiter.allow('a');
    limiter.allow('b');
    expect(limiter.size()).toBe(2);
    clock.advance(2000);
    limiter.sweep();
    expect(limiter.size()).toBe(0);
  });
});
