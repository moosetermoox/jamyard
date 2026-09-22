/**
 * `when` lines for activities that live only in the database (2026-09-22):
 * Guess Who: Rose, Bud, Thorn was made on the live site and has no editor
 * field for the line yet, so engine/when-lines.js keeps it by id and the
 * games list fills it in when the row has none. A row's own line always
 * wins; the map holds teacher copy in the house style.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { WHEN_LINES, whenLineFor } from '../../engine/when-lines.js';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('when-lines fallback', () => {
  it('keeps the owner\'s line for Guess Who: Rose, Bud, Thorn', () => {
    expect(WHEN_LINES['rose-bud-thorn']).toMatch(/^When your class needs to check in on each other/);
    expect(WHEN_LINES['rose-bud-thorn']).toContain('advisory');
  });

  it('every line is in the house style', () => {
    for (const [id, line] of Object.entries(WHEN_LINES)) {
      expect(line, id).toMatch(/^When /);
      expect(line.length, id).toBeGreaterThan(30);
      expect(line.length, id).toBeLessThan(140);
      expect(line, id).not.toMatch(/—/);
    }
  });

  it('the row\'s own line wins, the map fills a blank, an unknown id gets nothing', () => {
    expect(whenLineFor('rose-bud-thorn', { when: 'When the row says so.' })).toBe('When the row says so.');
    expect(whenLineFor('rose-bud-thorn', { when: '  ' })).toBe(WHEN_LINES['rose-bud-thorn']);
    expect(whenLineFor('rose-bud-thorn', {})).toBe(WHEN_LINES['rose-bud-thorn']);
    expect(whenLineFor('some-other-copy', {})).toBe('');
  });

  it('the games list route fills it in for every listed row', async () => {
    const server = await read('server.js');
    expect(server).toContain("import { whenLineFor } from './engine/when-lines.js';");
    expect((server.match(/whenLineFor\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
