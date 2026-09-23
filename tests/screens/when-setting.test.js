/**
 * "When is this for?" as an editor setting (2026-09-22): the hover line
 * (`when`) a teacher can write on any activity, including copies that live
 * only in the database. Follows the top-level-setting wiring: a Settings
 * row, render + read in editor.js, the validator on both sides, and a carry
 * at both AI edit sites so a whole-config rewrite keeps the teacher's line.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { validate } from '../../engine/game-loader.js';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

async function minimalConfig(extra) {
  const cfg = JSON.parse(await read('games/live-poll/config.json'));
  return Object.assign(cfg, extra);
}

describe('the when line as an editor setting', () => {
  it('the Settings panel has the field under the description, with helper copy in the teacher\'s words', async () => {
    const html = await read('screens/designer/editor.html');
    expect(html).toContain('<label for="game-when">When is this for?</label>');
    expect(html).toContain('id="game-when"');
    expect(html.indexOf('id="game-description"')).toBeLessThan(html.indexOf('id="game-when"'));
    expect(html.indexOf('id="game-when"')).toBeLessThan(html.indexOf('id="game-min-players"'));
    expect(html).toMatch(/game-when[^]*?field-help">The line a teacher sees when they hover/);
  });

  it('editor.js renders it, reads it back (absent when blank), listens for typing, and validates it', async () => {
    const js = await read('screens/designer/editor.js');
    expect(js).toContain("var settingsWhen = document.getElementById('game-when');");
    expect(js).toContain("if (settingsWhen) settingsWhen.addEventListener('input', readSettings);");
    expect(js).toContain("if (settingsWhen) settingsWhen.value = typeof gameConfig.when === 'string' ? gameConfig.when : '';");
    expect(js).toContain('if (whenLine) gameConfig.when = whenLine; else delete gameConfig.when;');
    expect(js).toContain(`errors.push('"When is this for?" must be text.');`);
  });

  it('the server validator accepts text, absence, and rejects anything else', async () => {
    const ok = validate(await minimalConfig({ when: 'When you need a quick read of the room.' }), 'live-poll', { returnResults: true });
    expect(ok.errors || []).toEqual([]);
    const none = validate(await minimalConfig({}), 'live-poll', { returnResults: true });
    expect(none.errors || []).toEqual([]);
    const bad = validate(await minimalConfig({ when: 42 }), 'live-poll', { returnResults: true });
    expect((bad.errors || []).join(' ')).toContain('"when" must be text');
  });

  it('an AI rewrite keeps the teacher\'s line at both edit sites', async () => {
    const server = await read('server.js');
    expect(server).toContain('function carryWhen(original, updated) {');
    expect((server.match(/carryWhen\(config, result\.updatedConfig\);/g) || []).length).toBe(2);
  });
});
