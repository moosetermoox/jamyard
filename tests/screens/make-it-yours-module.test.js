/**
 * Make it yours is one shared flow (2026-09-07): the yard's cards, the
 * yard's ?customize= deep link, and the home page's popup all open the
 * same dialog through /shared/make-it-yours.js. This guards the wiring:
 * the module exposes its doors, both pages load it after everything it
 * needs, and the flow no longer lives inside library.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

beforeEach(async () => {
  globalThis.window = globalThis;
  globalThis.document = { createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }) };
  vi.resetModules();
  delete globalThis.MakeItYours;
  await import('../../screens/shared/make-it-yours.js');
});

describe('MakeItYours module', () => {
  it('exposes the flow and its helpers', () => {
    const M = globalThis.MakeItYours;
    ['open', 'seedIds', 'renderClassPicker', 'buildChipRow', 'askOtherSubject', 'saveCopyAndReturn', 'openDraftCopy', 'mountPanel']
      .forEach((name) => expect(typeof M[name], name).toBe('function'));
  });

  it('is the only home of the dialog: library.js just hands it the button', async () => {
    const lib = await read('screens/library/library.js');
    expect(lib).not.toContain('function showCustomizeDialog');
    expect(lib).not.toContain('function saveCopyAndReturn');
    expect(lib).not.toContain('function renderClassPicker');
    expect(lib).toContain('MakeItYours.open(game, btn)');
    const mod = await read('screens/shared/make-it-yours.js');
    expect(mod).toContain('function showCustomizeDialog');
    expect(mod).not.toMatch(/\ballGames\b/);
  });

  it('both pages load the module after everything it needs, plus its sheet', async () => {
    const needs = [
      '/shared/dialog.js', '/shared/activity-prefs.js', '/shared/my-games.js',
      '/shared/teacher-profile.js', '/shared/setup-knobs.js', '/shared/growing-text.js',
      '/shared/speech-input.js', '/shared/make-it-yours-doors.js'
    ];
    for (const page of ['screens/home/index.html', 'screens/library/index.html']) {
      const html = await read(page);
      const at = html.indexOf('/shared/make-it-yours.js');
      expect(at, page + ' loads the module').toBeGreaterThan(-1);
      needs.forEach((dep) => {
        const d = html.indexOf(dep);
        expect(d, page + ' loads ' + dep).toBeGreaterThan(-1);
        expect(d, page + ': ' + dep + ' before the module').toBeLessThan(at);
      });
      expect(html).toContain('/shared/make-it-yours.css');
      expect(html).toContain('/shared/make-it-yours-doors.css');
    }
  });

  it('the home popup opens Make it yours in place, with the yard as the fallback', async () => {
    const home = await read('screens/home/index.html');
    expect(home).toContain('MakeItYours.open(g, customize)');
    expect(home).toContain("'/library?customize=' + encodeURIComponent(g.id)");
    expect(home).not.toContain("customize.href = '/library?customize=");
  });
});
