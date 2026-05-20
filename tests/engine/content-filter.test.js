/**
 * Content filter + input validation (engine/content-filter.js).
 *
 * Tests use the mild profanity "shit" as the representative blocked word so the
 * test file itself stays classroom-clean while exercising the matching logic
 * (leet-speak, repeated letters, separators, word boundaries).
 */

import { describe, it, expect } from 'vitest';
import {
  filterContent,
  validateResponse,
  checkSubmission,
  DEFAULT_MAX_LENGTH
} from '../../engine/content-filter.js';

describe('filterContent — blocks inappropriate content', () => {
  it('blocks a plain blocked word', () => {
    expect(filterContent('this is shit').blocked).toBe(true);
  });

  it('blocks leet-speak (sh1t)', () => {
    expect(filterContent('this is sh1t').blocked).toBe(true);
  });

  it('blocks separator evasion (s.h.i.t)', () => {
    expect(filterContent('this is s.h.i.t').blocked).toBe(true);
  });

  it('blocks repeated-letter evasion (shiiiit)', () => {
    expect(filterContent('this is shiiiit').blocked).toBe(true);
  });

  it('reports the category', () => {
    expect(filterContent('shit').category).toBe('profanity');
  });

  it('blocks regardless of case', () => {
    expect(filterContent('SHIT').blocked).toBe(true);
  });
});

describe('filterContent — allows clean content (no Scunthorpe false positives)', () => {
  it('allows ordinary text', () => {
    expect(filterContent('I love corn').blocked).toBe(false);
  });

  it('does not flag innocent words that contain a fragment', () => {
    // "class", "assignment", "pass" must not trip a standalone profanity match
    expect(filterContent('our class assignment passed').blocked).toBe(false);
  });

  it('handles empty / non-string input', () => {
    expect(filterContent('').blocked).toBe(false);
    expect(filterContent(null).blocked).toBe(false);
    expect(filterContent(42).blocked).toBe(false);
  });
});

describe('validateResponse', () => {
  it('accepts a normal response', () => {
    expect(validateResponse('I played soccer').valid).toBe(true);
  });

  it('rejects too-short responses', () => {
    expect(validateResponse('a').valid).toBe(false);
    expect(validateResponse('a').reason).toBe('too_short');
  });

  it('rejects responses over the max length', () => {
    const long = 'a'.repeat(DEFAULT_MAX_LENGTH + 1);
    const r = validateResponse(long);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('too_long');
  });

  it('rejects keyboard mashing (repeated chars)', () => {
    const r = validateResponse('aaaaaa');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('low_effort');
  });

  it('rejects copying the prompt', () => {
    const prompt = 'What is your favorite weekend activity?';
    const r = validateResponse(prompt, { prompt });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('prompt_copy');
  });

  it('respects a custom maxLength', () => {
    expect(validateResponse('hello', { maxLength: 3 }).reason).toBe('too_long');
  });
});

describe('checkSubmission — combined gate', () => {
  it('passes a clean string', () => {
    expect(checkSubmission('I went hiking').ok).toBe(true);
  });

  it('blocks inappropriate content with the right reason', () => {
    const r = checkSubmission('this is shit');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('inappropriate_content');
  });

  it('fails empty input', () => {
    expect(checkSubmission('').ok).toBe(false);
    expect(checkSubmission(null).ok).toBe(false);
  });

  it('handles multi-field object responses — clean', () => {
    expect(checkSubmission({ a: 'cats', b: 'dogs' }).ok).toBe(true);
  });

  it('handles multi-field object responses — one field blocked', () => {
    const r = checkSubmission({ a: 'cats', b: 'shit' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('inappropriate_content');
  });

  it('skips content filtering when asked (still validates length)', () => {
    expect(checkSubmission('this is shit', { skipContentFilter: true }).ok).toBe(true);
  });
});
