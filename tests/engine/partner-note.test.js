/**
 * Two wording nits from the browser proof (2026-09-20):
 *  1. The partner's piece under a pairs instruction rendered in the same
 *     heavy prompt style as the instruction. It now travels OUTSIDE the
 *     prompt (`splitPartnerTokens` + `partnerText` on the collect payload)
 *     and the student screen shows it on a card of its own.
 *  2. The role-choice screens reused the team-split wording ("Tap the team
 *     you want", "Confirm Teams"); they now say role, in every language.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitPartnerTokens } from '../../engine/per-player-template.js';
import { STRINGS } from '../../engine/i18n/index.js';

describe('splitPartnerTokens', () => {
  it('lifts every partner token out and tidies the blank lines it leaves', () => {
    const out = splitPartnerTokens('Read this.\n\n{{open.partner}}\n\nStill arguing **{{open.side}}**.');
    expect(out.prompt).toBe('Read this.\n\nStill arguing **{{open.side}}**.');
    expect(out.partnerRefs).toEqual(['{{open.partner}}']);
  });

  it('leaves a prompt with no partner token untouched', () => {
    expect(splitPartnerTokens('Just write.')).toEqual({ prompt: 'Just write.', partnerRefs: [] });
    expect(splitPartnerTokens('')).toEqual({ prompt: '', partnerRefs: [] });
  });

  it('keeps side and partnerSide tokens in the prompt (they are short words)', () => {
    const out = splitPartnerTokens('You argue {{open.side}} against {{open.partnerSide}}.\n\n{{open.partner}}');
    expect(out.prompt).toBe('You argue {{open.side}} against {{open.partnerSide}}.');
  });
});

describe('the collect step sends the partner piece beside the prompt', () => {
  const js = readFileSync(new URL('../../engine/phase-handlers/collect.js', import.meta.url), 'utf8');
  it('on enter and on reconnect', () => {
    expect((js.match(/partnerPayload\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(js).toMatch(/partnerText,\r?\n/);
    expect(js).toContain('partnerText: recon.partnerText');
  });
});

describe('the student screen', () => {
  it('has a partner card, filled with textContent, hidden without one', () => {
    const html = readFileSync(new URL('../../screens/player/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/id="partner-note"[^>]*hidden/);
    const js = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');
    expect(js).toContain('partnerNote.textContent = hasPartner ? partnerText');
    expect(js).toContain('partnerNote.hidden = !hasPartner');
    const css = readFileSync(new URL('../../screens/player/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('.partner-note[hidden] { display: none; }');
  });

  it('says role on the role picker and team on the team picker', () => {
    const js = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');
    expect(js).toContain("UiLang.t('Tap the role you want, you can switch until the teacher locks it in.')");
    expect(js).toContain("UiLang.t('Tap the team you want, you can switch until the teacher locks it in.')");
  });
});

describe('the projector', () => {
  it('confirms roles on the role board and teams on the team board', () => {
    const js = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');
    expect(js).toContain("teamChoiceConfirmBtn.textContent = UiLang.t('Confirm roles')");
    expect(js).toContain("teamChoiceConfirmBtn.textContent = UiLang.t('Confirm Teams')");
  });
});

describe('every language has the new rows', () => {
  it('Confirm roles and both picker hints', () => {
    for (const code of Object.keys(STRINGS)) {
      for (const key of ['Confirm roles',
        'Tap the team you want, you can switch until the teacher locks it in.',
        'Tap the role you want, you can switch until the teacher locks it in.']) {
        expect(STRINGS[code][key], `${code}: ${key}`).toBeTruthy();
      }
    }
  });
});
