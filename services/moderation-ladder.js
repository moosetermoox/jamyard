/**
 * The moderation ladder — the semantic layer behind the blocklist
 * (owner design 2026-08-30; SAFETY-DESIGN.md Risk 1 & 5).
 *
 * The blocklist (engine/content-filter.js) catches words. This ladder
 * catches MEANING: unkind messages aimed at classmates, threats, self-harm
 * signals, content with no swear word in it. Three rungs:
 *
 *   1. OpenAI's free moderation endpoint scores the text. At or above
 *      blockAt on any category: reject outright. Below reviewAt: clean.
 *   2. The uncertain band in between goes to Haiku with classroom context
 *      (a moderation model tuned on adult internet content is jumpy about
 *      middle-school banter; Haiku knows the difference).
 *   3. What Haiku can't settle is FLAGGED for the teacher console, never
 *      silently accepted or silently blocked.
 *
 * Failure directions are deliberate and different:
 *   - OpenAI unreachable: fail OPEN (accept). The blocklist already
 *     passed, and a dead third party must not stop a class.
 *   - Haiku unreachable or over budget: fail TO THE TEACHER (flag). At
 *     that point the text is known-uncertain; uncertainty goes to a
 *     human, not into the room.
 *
 * Privacy: text is PII-scrubbed (roster names, emails, phones, links)
 * before ANY of it leaves the server, same boundary rule as every other
 * outbound AI payload. OpenAI is a disclosed processor on /privacy.
 */

import { scrubForAI } from '../engine/pii-scrub.js';

export const DEFAULT_BLOCK_AT = 0.85;
export const DEFAULT_REVIEW_AT = 0.4;
// Overridable for testing against a local stub (and if the endpoint ever
// moves); defaults to the real thing.
const OPENAI_MODERATIONS_URL = process.env.OPENAI_MODERATION_URL || 'https://api.openai.com/v1/moderations';
const MODERATION_MODEL = 'omni-moderation-latest';
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Sort a moderation result's category scores into a verdict.
 * @param {Record<string, number>|undefined} categoryScores
 * @param {{blockAt: number, reviewAt: number}} thresholds
 * @returns {{verdict: 'block'|'review'|'ok', category?: string, score?: number}}
 */
export function classifyScores(categoryScores, { blockAt, reviewAt }) {
  let topCategory = null;
  let topScore = 0;
  for (const [category, score] of Object.entries(categoryScores || {})) {
    if (typeof score === 'number' && score > topScore) {
      topScore = score;
      topCategory = category;
    }
  }
  if (!topCategory || topScore < reviewAt) return { verdict: 'ok' };
  if (topScore >= blockAt) return { verdict: 'block', category: topCategory, score: topScore };
  return { verdict: 'review', category: topCategory, score: topScore };
}

/**
 * Build the ladder. With no apiKey it is disabled and accepts everything
 * (exactly the pre-ladder behavior); callers can also skip on `enabled`.
 *
 * @param {{ apiKey?: string, aiService?: { moderateText: Function },
 *           blockAt?: number, reviewAt?: number,
 *           fetchFn?: Function, timeoutMs?: number }} opts
 */
export function createModerationLadder({
  apiKey,
  aiService,
  blockAt = DEFAULT_BLOCK_AT,
  reviewAt = DEFAULT_REVIEW_AT,
  fetchFn = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const enabled = !!apiKey;

  async function callOpenAI(text) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(OPENAI_MODERATIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`moderations endpoint returned ${res.status}`);
      const data = await res.json();
      return (data.results && data.results[0] && data.results[0].category_scores) || {};
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Run the ladder on one student text.
   * @param {string} text  raw student text (scrubbed here before sending)
   * @param {{rosterNames?: string[]}} [ctx]
   * @returns {Promise<{action: 'accept'|'reject'|'flag', category?: string, rung: string}>}
   */
  async function check(text, { rosterNames } = {}) {
    if (!enabled) return { action: 'accept', rung: 'off' };

    const scrubbed = scrubForAI(text, rosterNames);

    let scores;
    try {
      scores = await callOpenAI(scrubbed);
    } catch (err) {
      console.warn(`[moderation] OpenAI check failed, accepting (blocklist already passed): ${err.message}`);
      return { action: 'accept', rung: 'openai-error' };
    }

    const first = classifyScores(scores, { blockAt, reviewAt });
    if (first.verdict === 'ok') return { action: 'accept', rung: 'openai' };
    if (first.verdict === 'block') {
      return { action: 'reject', category: first.category, rung: 'openai' };
    }

    // Uncertain band: Haiku judges with classroom context. Any failure here
    // (budget cap included) means the text stays known-uncertain, so it
    // goes to the teacher.
    let verdict = 'unsure';
    try {
      const result = await aiService.moderateText(scrubbed);
      verdict = (result && result.verdict) || 'unsure';
    } catch (err) {
      console.warn(`[moderation] Haiku check failed, flagging for the teacher: ${err.message}`);
    }
    if (verdict === 'ok') return { action: 'accept', rung: 'haiku' };
    if (verdict === 'block') return { action: 'reject', category: first.category, rung: 'haiku' };
    return { action: 'flag', category: first.category, rung: 'haiku' };
  }

  return { enabled, check };
}
