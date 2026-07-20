/**
 * Brute-force throttle for the teacher-console PIN (COPPA security-program
 * item). A 4-digit PIN guards the console that shows student names — with
 * no lockout it's guessable in seconds by a student with a script.
 *
 * Keyed by ROOM CODE, not socket id: reconnecting gets an attacker a fresh
 * socket, but the target room stays the same. Five wrong PINs inside the
 * window lock that room's console joins (even with the RIGHT pin — that's
 * the point) for the lockout period. A successful join clears the count.
 * At 5 guesses per 5 minutes, a 4-digit space takes days — longer than any
 * room lives.
 *
 * Pure factory with injected clocks (pass `now` everywhere) so the timing
 * rules are unit-testable — same pattern as one-voice's adjudicateTap.
 */

export function createPinThrottle({
  maxAttempts = 5,
  windowMs = 10 * 60 * 1000,
  lockoutMs = 5 * 60 * 1000
} = {}) {
  const entries = new Map(); // key → { failures: number[], lockedUntil: number }

  function entry(key) {
    let e = entries.get(key);
    if (!e) { e = { failures: [], lockedUntil: 0 }; entries.set(key, e); }
    return e;
  }

  return {
    /** May this key even attempt a PIN right now? */
    check(key, now) {
      const e = entries.get(key);
      if (!e) return { allowed: true, retryAfterMs: 0 };
      if (now < e.lockedUntil) {
        return { allowed: false, retryAfterMs: e.lockedUntil - now };
      }
      return { allowed: true, retryAfterMs: 0 };
    },

    /** Register a wrong PIN. Returns { locked } when this failure trips the lockout. */
    recordFailure(key, now) {
      const e = entry(key);
      e.failures = e.failures.filter(t => now - t < windowMs);
      e.failures.push(now);
      if (e.failures.length >= maxAttempts) {
        e.lockedUntil = now + lockoutMs;
        e.failures = [];
        return { locked: true, retryAfterMs: lockoutMs };
      }
      return { locked: false, retryAfterMs: 0 };
    },

    /** A correct PIN clears the slate for that room. */
    recordSuccess(key) {
      entries.delete(key);
    },

    /** Housekeeping — drop stale entries (call occasionally, e.g. room sweep). */
    sweep(now) {
      for (const [key, e] of entries) {
        if (now >= e.lockedUntil && e.failures.every(t => now - t >= windowMs)) {
          entries.delete(key);
        }
      }
    },

    /** Test/inspection hook. */
    size() { return entries.size; }
  };
}
