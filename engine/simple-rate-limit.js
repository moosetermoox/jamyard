/**
 * Minimal fixed-window rate limiter, keyed by caller (usually an IP).
 * Pure with an injected clock so the rules unit-test without timers —
 * same pattern as pin-throttle.js.
 *
 * First non-AI rate limiter in the codebase; deliberately tiny. AI
 * endpoints keep using services/ai-budget.js.
 */

/**
 * @param {{ max?: number, windowMs?: number, now?: () => number }} [opts]
 */
export function createRateLimiter(opts = {}) {
  const max = opts.max ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  /** @type {Map<string, number[]>} */
  const hits = new Map();

  function prune(key, t) {
    const list = hits.get(key);
    if (!list) return [];
    const fresh = list.filter(ts => t - ts < windowMs);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
    return fresh;
  }

  return {
    /** Record an attempt; returns false when the key is over its window budget. */
    allow(key) {
      const t = now();
      const fresh = prune(key, t);
      if (fresh.length >= max) return false;
      fresh.push(t);
      hits.set(key, fresh);
      return true;
    },
    /** Drop stale keys wholesale (call from a periodic sweep). */
    sweep() {
      const t = now();
      for (const key of [...hits.keys()]) prune(key, t);
    },
    size() {
      return hits.size;
    }
  };
}
