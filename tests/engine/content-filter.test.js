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
  filterAboutClassmate,
  spacedRuns,
  CLASSMATE_REFUSED_MESSAGE,
  DEFAULT_MAX_LENGTH
} from '../../engine/content-filter.js';
import { THREATS, CLASSMATE_INSULTS } from '../../engine/blocklist.js';

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

// A twentieth outside review (2026-09-29): "I have a f u c k i n g cat"
// went up as a Two Truths choice while "fucking" was refused; "Ben is a
// loser" went up during Ana's round with Ben in the room; "kys" and "go
// kill yourself" carried no swear word at all.
describe('filterContent — letters spaced out one by one', () => {
  it('reads a word typed letter by letter with spaces', () => {
    expect(filterContent('I have a s h i t list').blocked).toBe(true);
    expect(filterContent('I have a s h i t list').word).toBe('shit');
  });
  it('reads a run that ends in a short word', () => {
    expect(filterContent('s h itty day').blocked).toBe(true);
  });
  it('closes the run over the leading article', () => {
    // "a s h i t" joins to "ashit": the blocked word is inside the run
    expect(filterContent('what a s h i t day').blocked).toBe(true);
  });
  it('a spaced threat is still a threat', () => {
    expect(filterContent('k y s').blocked).toBe(true);
    expect(filterContent('k y s').category).toBe('threat');
  });
  it('leaves initialisms and ordinary short words alone', () => {
    expect(filterContent('I love the U S A').blocked).toBe(false);
    expect(filterContent('A B C is easy').blocked).toBe(false);
    expect(filterContent('I a m happy').blocked).toBe(false);
    expect(filterContent('I have a cat and a dog').blocked).toBe(false);
    expect(filterContent('the pen is red').blocked).toBe(false);
  });
  it('spacedRuns closes only runs with at least two single letters', () => {
    expect(spacedRuns('I have a s h i t list')).toEqual(['ihaveashitlist']);
    expect(spacedRuns('Yesterday a s h i t storm')).toEqual(['ashit']);
    expect(spacedRuns('the pen is red')).toEqual([]);
    expect(spacedRuns('a cat')).toEqual([]);
  });
});

describe('filterContent — threats without a swear word', () => {
  it('blocks the goads the word filter used to pass', () => {
    for (const line of ['kys', 'go kill yourself', 'you should kill urself', 'just go die']) {
      const r = filterContent(line);
      expect(r.blocked, line).toBe(true);
      expect(r.category).toBe('threat');
    }
  });
  it('the list is data in the blocklist', () => {
    expect(THREATS).toContain('kys');
    expect(THREATS).toContain('kill yourself');
  });
  it('an ordinary sentence about dying is fine', () => {
    expect(filterContent('the plant will die without water').blocked).toBe(false);
  });
});

describe('filterAboutClassmate — a roster name next to an insult', () => {
  const roster = ['Ben', 'Ana Lopez', 'Maya'];
  it('refuses the reviewer\'s line and its cousins', () => {
    for (const line of [
      'Ben is a loser', 'Ben is such a big loser', 'ben is the worst', 'nobody likes Ben',
      'stupid ben', 'Ana smells', 'Lopez is trash', 'Ben has no friends', 'Maya sucks at math',
      'Ben is a loser and nobody likes him', 'Ben, you are so annoying', "Ben's a loser",
      'Ben is a fucking idiot'
    ]) {
      const r = filterAboutClassmate(line, roster);
      expect(r.blocked, line).toBe(true);
      expect(r.category).toBe('classmate');
    }
  });
  it('a name in a kind or ordinary line passes', () => {
    for (const line of [
      'Ben is great at soccer', 'I went hiking with Ben', 'Ben and I ate the worst pizza ever',
      'The best thing about Ben is his jokes', 'Maya helped me with math', 'Ana Lopez won the race'
    ]) {
      expect(filterAboutClassmate(line, roster).blocked, line).toBe(false);
    }
  });
  it('the insult words alone, with no roster name, pass (answers may use them)', () => {
    expect(filterAboutClassmate('that was a stupid mistake', roster).blocked).toBe(false);
    expect(filterAboutClassmate('the worst part was the rain', roster).blocked).toBe(false);
    expect(filterAboutClassmate('Ben is a loser', []).blocked).toBe(false);
    expect(filterAboutClassmate('Ben is a loser').blocked).toBe(false);
  });
  it('leet and stretched letters do not hide it', () => {
    expect(filterAboutClassmate('B3n is a l0ser', roster).blocked).toBe(true);
    expect(filterAboutClassmate('Ben is a looooser', roster).blocked).toBe(true);
  });
  it('the insult list is data in the blocklist', () => {
    expect(CLASSMATE_INSULTS).toContain('nobody likes');
    expect(CLASSMATE_INSULTS).toContain('sucks');
  });
  it('checkSubmission refuses it with its own reason when the roster rides along', () => {
    const r = checkSubmission('Ben is a loser', { rosterNames: roster });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('about_classmate');
    expect(r.message).toBe(CLASSMATE_REFUSED_MESSAGE);
    expect(r.message).not.toMatch(/ben|loser/i);
    expect(checkSubmission({ truth: 'I have a cat', lie: 'Ben is a loser' }, { rosterNames: roster }).reason).toBe('about_classmate');
    expect(checkSubmission('Ben is a loser').ok).toBe(true);
  });
});
