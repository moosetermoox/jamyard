/**
 * The model's answer to an identical request, kept a while (2026-10-04,
 * owner: fewer AI calls, no quality cost). A second teacher who opens the
 * same activity with the same class, or puts the same activity into the same
 * language, gets the answer the model already gave, at once and for free.
 *
 * In memory only: a deploy or restart starts empty, which costs nothing but
 * the first call again. Entries are copied in and out, so a caller that
 * edits what it got never changes what the next caller gets. Bounded by
 * count and by age; the oldest entry leaves first.
 */
import { createHash } from 'node:crypto';

export const DEFAULT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_ENTRIES = 400;

// JSON with every object's keys sorted, so the same request always hashes the same
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** A short key for one kind of request and its inputs. */
export function cacheKey(kind, inputs) {
  return kind + ':' + createHash('sha256').update(stable(inputs)).digest('hex');
}

const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class AnswerCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) { this.entries.delete(key); return undefined; }
    return copy(hit.value);
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), value: copy(value) });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }
}
