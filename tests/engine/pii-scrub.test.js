/**
 * PII scrub — outbound AI payload minimization. Roster names (known list,
 * word-boundary, case-insensitive) + email/phone/URL patterns. Scrubs a
 * copy; classroom display is never affected (that's asserted at the
 * service boundary test in ai-service.test.js).
 */

import { describe, it, expect } from 'vitest';
import { scrubPatterns, scrubRosterNames, scrubForAI } from '../../engine/pii-scrub.js';

describe('scrubPatterns', () => {
  it('redacts emails', () => {
    expect(scrubPatterns('mail me at maya.r@example.com!'))
      .toBe('mail me at [email]!');
  });

  it('redacts phone formats', () => {
    expect(scrubPatterns('call 555-123-4567 ok')).toBe('call [phone] ok');
    expect(scrubPatterns('call (555) 123-4567 ok')).toBe('call [phone] ok');
    expect(scrubPatterns('call 5551234567 ok')).toBe('call [phone] ok');
  });

  it('redacts URLs', () => {
    expect(scrubPatterns('see https://mysite.example/profile?id=7 now'))
      .toBe('see [link] now');
    expect(scrubPatterns('see www.mysite.example now')).toBe('see [link] now');
  });

  it('leaves ordinary numbers and text alone', () => {
    expect(scrubPatterns('I guessed 7 million in 1999')).toBe('I guessed 7 million in 1999');
    expect(scrubPatterns('room 314 at 3:45')).toBe('room 314 at 3:45');
  });
});

describe('scrubRosterNames', () => {
  const roster = ['Maya', 'Dev Patel', 'Jo'];

  it('removes roster names case-insensitively on word boundaries', () => {
    expect(scrubRosterNames('MAYA said dev patel is funny', roster))
      .toBe('someone said someone is funny');
  });

  it('matches whole multi-word names and their parts', () => {
    expect(scrubRosterNames('Dev Patel and Patel and Dev', roster))
      .toBe('someone and someone and someone');
  });

  it('does not fire inside other words', () => {
    expect(scrubRosterNames('the mayans developed devices', roster))
      .toBe('the mayans developed devices');
  });

  it('handles regex metacharacters in names without crashing', () => {
    expect(scrubRosterNames('A+ work from A+', ['A+'])).toBe('someone work from someone');
  });

  it('empty roster passes text through', () => {
    expect(scrubRosterNames('hello Maya', [])).toBe('hello Maya');
  });
});

describe('scrubForAI', () => {
  it('composes both scrubs', () => {
    const out = scrubForAI('Maya: email me at m@x.co or call 555-123-4567', ['Maya']);
    expect(out).toBe('someone: email me at [email] or call [phone]');
  });

  it('tolerates null/undefined', () => {
    expect(scrubForAI(null)).toBe('');
    expect(scrubForAI(undefined, undefined)).toBe('');
  });
});
