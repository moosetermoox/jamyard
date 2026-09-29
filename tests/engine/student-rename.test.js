import { describe, it, expect } from 'vitest';
import { checkNewName, SELF_RENAME_MESSAGES } from '../../engine/student-rename.js';
import { filterName } from '../../engine/content-filter.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { readFileSync } from 'fs';

const room = [{ id: 'a', name: 'Maya' }, { id: 'b', name: 'Jordan' }];

describe('checkNewName', () => {
  it('accepts a fresh name, trimmed and capped at 20', () => {
    expect(checkNewName(room, 'a', '  Maya R  ', filterName)).toEqual({ ok: true, name: 'Maya R' });
    expect(checkNewName(room, 'a', 'Abcdefghijklmnopqrstuvwxyz', filterName).name).toHaveLength(20);
  });
  it('refuses a short name', () => {
    expect(checkNewName(room, 'a', ' M ', filterName)).toEqual({ ok: false, reason: 'short' });
  });
  it('refuses a name the filter blocks', () => {
    expect(checkNewName(room, 'a', 'shithead', filterName)).toEqual({ ok: false, reason: 'blocked' });
  });
  it("refuses a classmate's name, any case", () => {
    expect(checkNewName(room, 'a', 'jordan', filterName)).toEqual({ ok: false, reason: 'taken' });
  });
  it('lets a student fix their own capitalization', () => {
    expect(checkNewName(room, 'a', 'maya', filterName)).toEqual({ ok: true, name: 'maya' });
    expect(checkNewName(room, 'a', 'Maya', filterName)).toEqual({ ok: false, reason: 'same' });
  });
  it('every refusal line has a row in every language table', () => {
    for (const [lang, table] of Object.entries(STRINGS)) {
      for (const line of Object.values(SELF_RENAME_MESSAGES)) {
        expect(table[line], `${lang}: ${line}`).toBeTruthy();
      }
    }
  });
});

describe('the student screen offers Change my name in the lobby', () => {
  const html = readFileSync('screens/player/index.html', 'utf8');
  const js = readFileSync('screens/player/player.js', 'utf8');
  it('has the link and the form in the waiting section', () => {
    const waiting = html.slice(html.indexOf('id="waiting-section"'), html.indexOf('id="collect-section"'));
    expect(waiting).toContain('id="rename-open"');
    expect(waiting).toContain('id="rename-form"');
  });
  it('emits rename-self and hides the link in an anonymous room', () => {
    expect(js).toContain("socket.emit('rename-self'");
    expect(js).toMatch(/renameOpen\.hidden\s*=\s*!!anonymous/);
  });
});
