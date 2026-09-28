/**
 * Review eighteen: a pretend student's answer sat on "Sending..." with
 * nothing reaching the teacher. Every way out of submit-response answers
 * the student, and the student screen reads a refused payload too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../../engine/i18n/index.js';

const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
const player = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');

describe('submit-response never drops a student silently', () => {
  const start = server.indexOf('socket.on(EVENTS.SUBMIT_RESPONSE');
  const head = server.slice(start, start + 1400);

  it('a lost room or seat answers with a line', () => {
    expect(head).toMatch(/Room \$\{code\} not found`\);\s*lostSeat\(\);/);
    expect(head).toMatch(/not found in room`\);\s*lostSeat\(\);/);
  });

  it('the line is translated in every language', () => {
    const m = server.match(/const SUBMIT_LOST_SEAT = '([^']+)'/);
    expect(m).toBeTruthy();
    for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang][m[1]]).toBeTruthy();
    expect(player).toMatch(/var notice = UiLang\.t\(message/);
  });

  it('a refused payload clears Sending...', () => {
    expect(player).toMatch(/socket\.on\('event-rejected'/);
  });
});
