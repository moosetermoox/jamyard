/**
 * Pure validation for site-feedback submissions (the 💬 widget).
 *
 * Feedback is anonymous by design — the shape deliberately has no name or
 * email field, so there is nothing personal to protect. Free text still runs
 * through the content filter (same blocklist as student submissions) and a
 * length cap so the inbox can't be flooded with garbage.
 */
import { filterContent } from './content-filter.js';

export const FEEDBACK_CATEGORIES = ['problem', 'idea', 'praise', 'other'];
export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;
const PAGE_MAX_LENGTH = 100;

/**
 * @param {{ page?: unknown, category?: unknown, message?: unknown }} input
 * @returns {{ ok: true, cleaned: { page: string, category: string, message: string } }
 *         | { ok: false, error: string }}
 */
export function validateFeedback(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Missing feedback body.' };
  }

  const message = String(input.message == null ? '' : input.message).trim();
  if (message.length < FEEDBACK_MIN_LENGTH) {
    return { ok: false, error: 'Please write a bit more.' };
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `Please keep it under ${FEEDBACK_MAX_LENGTH} characters.` };
  }
  const filtered = filterContent(message);
  if (filtered.blocked) {
    return { ok: false, error: 'That message contains language we can\'t accept.' };
  }

  const category = typeof input.category === 'string' && FEEDBACK_CATEGORIES.includes(input.category)
    ? input.category
    : 'other';

  const page = String(input.page == null ? '' : input.page).trim().slice(0, PAGE_MAX_LENGTH);

  return { ok: true, cleaned: { page, category, message } };
}
