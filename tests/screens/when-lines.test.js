/**
 * `when` (2026-09-21): the classroom moment an activity is for, the line
 * the hover card shows in place of the description (owner: "the hover
 * description is the job it fills rather than what it does"). Every
 * featured built-in carries one, so the hover reads the same way across
 * the whole visible yard; it is teacher copy, so the house style applies.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

async function builtIns() {
  const dirs = (await readdir(new URL('games/', ROOT), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'user')
    .map((d) => d.name);
  const out = [];
  for (const id of dirs) {
    try {
      out.push({ id, config: JSON.parse(await read('games/' + id + '/config.json')) });
    } catch {
      // not a game dir
    }
  }
  return out;
}

describe('when lines', () => {
  it('every featured built-in says the moment it is for, in the house style', async () => {
    const games = await builtIns();
    const featured = games.filter((g) => g.config.featured);
    expect(featured.length).toBeGreaterThan(0);
    for (const { id, config } of featured) {
      expect(typeof config.when, id).toBe('string');
      expect(config.when, id).toMatch(/^When /);
      expect(config.when.length, id).toBeGreaterThan(30);
      expect(config.when.length, id).toBeLessThan(140);
      expect(config.when, id).not.toMatch(/—/);
      expect(config.when, id).not.toBe(config.description);
    }
  });

  it('rides to the pages on the games list and is what the hover card shows', async () => {
    const server = await read('server.js');
    expect(server).toMatch(/GAME_CARD_META_FIELDS = \[[^\]]*'when'/);
    const hover = await read('screens/shared/hover-card.js');
    expect(hover).toContain('game.when || game.description');
    const home = await read('screens/home/index.html');
    expect(home).toContain("(g.when || '')"); // the search reads it too
  });
});
