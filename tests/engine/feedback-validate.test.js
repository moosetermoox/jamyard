import { describe, it, expect } from 'vitest';
import { validateFeedback, FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH } from '../../engine/feedback-validate.js';

describe('validateFeedback', () => {
  it('accepts a normal submission and returns cleaned fields', () => {
    const result = validateFeedback({ page: '/designer', category: 'idea', message: '  Love the drawing pad!  ' });
    expect(result.ok).toBe(true);
    expect(result.cleaned).toEqual({ page: '/designer', category: 'idea', message: 'Love the drawing pad!' });
  });

  it('rejects missing or non-object bodies', () => {
    expect(validateFeedback(null).ok).toBe(false);
    expect(validateFeedback(undefined).ok).toBe(false);
    expect(validateFeedback('hi').ok).toBe(false);
  });

  it('rejects empty and too-short messages', () => {
    expect(validateFeedback({ message: '' }).ok).toBe(false);
    expect(validateFeedback({ message: '  a ' }).ok).toBe(false);
  });

  it('rejects messages over the cap', () => {
    const result = validateFeedback({ message: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1) });
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(FEEDBACK_MAX_LENGTH));
  });

  it('runs the content filter on the message', () => {
    // 'fuck' is in the blocklist per engine/blocklist.js
    const result = validateFeedback({ message: 'this fuck thing broke' });
    expect(result.ok).toBe(false);
  });

  it('coerces unknown categories to other', () => {
    const result = validateFeedback({ category: '<script>', message: 'a real message' });
    expect(result.ok).toBe(true);
    expect(result.cleaned.category).toBe('other');
  });

  it('accepts every declared category', () => {
    for (const category of FEEDBACK_CATEGORIES) {
      const result = validateFeedback({ category, message: 'a real message' });
      expect(result.ok).toBe(true);
      expect(result.cleaned.category).toBe(category);
    }
  });

  it('truncates absurd page strings and tolerates a missing page', () => {
    const long = validateFeedback({ page: '/x'.repeat(200), message: 'a real message' });
    expect(long.ok).toBe(true);
    expect(long.cleaned.page.length).toBeLessThanOrEqual(100);

    const none = validateFeedback({ message: 'a real message' });
    expect(none.ok).toBe(true);
    expect(none.cleaned.page).toBe('');
  });

  it('stringifies non-string messages instead of crashing', () => {
    const result = validateFeedback({ message: 12345 });
    expect(result.ok).toBe(true);
    expect(result.cleaned.message).toBe('12345');
  });
});
