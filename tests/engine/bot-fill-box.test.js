/**
 * Review eighteen: a pretend student's line went into a box that already
 * held its last try ("okay I guess" twice) and past the step's cap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/bot-brain.js';

const fit = (...a) => globalThis.fitBotLine(...a);

describe('fitBotLine', () => {
  it('fills an empty box with the line', () => {
    expect(fit('', 'okay I guess', 280)).toBe('okay I guess');
  });
  it('adds under the passed-on text of an editable hand-off', () => {
    expect(fit('Cells make energy.', 'And they divide.', 280)).toBe('Cells make energy.\nAnd they divide.');
  });
  it('keeps to the box cap on a word boundary', () => {
    expect(fit('', 'okay I guess', 8)).toBe('okay I');
    expect(fit('', 'okay I guess', 3)).toBe('oka');
  });
  it('the student screen fills from the step prefill, never from the box', () => {
    const player = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');
    expect(player).toMatch(/fitBotLine\(collectBoxPrefill, line, responseMax\)/);
  });
});
