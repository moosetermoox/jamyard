/**
 * Every Make it yours lands on the make page (owner, 2026-09-12: "the
 * Make it yours on the live website aren't using the new format"). The
 * Create page was the holdout: a recipe match saved the copy and showed
 * the old doors dialog, and its existing-activity match detoured through
 * the yard's ?customize= deep link, which sends an owner-mode browser to
 * the editor instead. Both go straight to /make now. And a teacher's own
 * copy on the make page saves back to itself, never a second copy.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the Create page', () => {
  it('sends every Make it yours to the make page, never through the yard or the old doors', async () => {
    const src = await read('screens/designer/designer.js');
    expect(src).not.toContain('/library?customize=');
    expect(src).not.toContain('renderMatchedDoors');
    const save = src.slice(src.indexOf('async function saveMatchedConfig'));
    const body = save.slice(0, save.search(/\r?\n\}\r?\n/));
    expect(body).toContain("'/make?game=' + encodeURIComponent(newId) + '&from=designer'");
    expect(body).not.toContain('/designer/edit?game=');
  });
});

describe('the make page with a copy that is already yours', () => {
  it('saves edits back to the same activity instead of spawning a copy', async () => {
    const src = await read('screens/make/make.js');
    expect(src).toContain('function saveAndGo');
    const fn = src.slice(src.indexOf('function saveAndGo'));
    expect(fn.slice(0, 1200)).toContain("method: 'PUT'");
    expect(src).toContain('MyGames.has(gameId)');
    // The doors go through it; the only direct call to the copy helper is
    // saveAndGo's own fallback for a built-in
    expect(src.match(/MakeItYours\.saveCopyAndReturn\(/g)).toHaveLength(1);
  });
});
