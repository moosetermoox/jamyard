import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitPartnerWords } from '../../engine/phases/partner-words.js';

describe('fitPartnerWords', () => {
  const snowball = 'Stand up and go sit next to your partner. Combine your answers into one stronger answer.';

  it('leaves a pair alone', () => {
    expect(fitPartnerWords(snowball, 2)).toBe(snowball);
  });

  it('speaks to a group of three', () => {
    expect(fitPartnerWords(snowball, 3)).toBe('Stand up and go sit with your group. Combine your answers into one stronger answer.');
    expect(fitPartnerWords('Your new partner is here. Read your partner\'s answer.', 3))
      .toBe('Your new group is here. Read your group\'s answer.');
  });

  it('the merge step uses it on every send', () => {
    const src = readFileSync(new URL('../../engine/phase-handlers/merge.js', import.meta.url), 'utf8');
    expect(src.match(/fitPartnerWords\(/g).length).toBeGreaterThanOrEqual(2);
  });
});
