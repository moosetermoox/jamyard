/**
 * A print's paint is its job (2026-09-15, owner: "I wonder if there's a
 * small thing we can do to make the different categories of activities
 * more visually distinct"): the one painted block every print carries
 * takes the job's paint (magenta connect, cyan think, green review,
 * orange fun), prints without a pile get a single painted block, and the
 * chips over the yard (home and library) wear the same paint as a small
 * block, so the chip row is the legend. The carousel's full-size pile
 * follows the same rule.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

const PAINT = { connect: 't-magenta', think: 't-cyan', review: 't-green', play: 't-orange' };

describe('yard prints: one paint per print, the job\'s', () => {
  it('maps each job to one paint, and every print carries it (pile or a single block)', async () => {
    const js = await read('screens/shared/yard-prints.js');
    expect(js).toContain("var PAINT_OF_GROUP = { connect: 't-magenta', think: 't-cyan', review: 't-green', play: 't-orange' };");
    expect(js).toContain('var paint = paintOf(g);');
    expect(js).toContain("var tone = WOODS.indexOf(blocks[i].tone) === -1 ? paint : blocks[i].tone;");
    expect(js).toContain("el('div', 'yp-block yp-stamp ' + paint)");
    // join prints and talk-only prints get the single block
    expect(js.split('mini.appendChild(stamp());').length - 1).toBe(2);
    expect(js).toContain('paintOf: paintOf,');
  });

  it('the home and library chips carry the job and its swatch', async () => {
    for (const [page, marker] of [
      ['screens/home/index.html', "chip.setAttribute('data-goal', group.key);"],
      ['screens/library/library.js', "chip.setAttribute('data-goal', group.key);"]
    ]) {
      expect(await read(page), page).toContain(marker);
    }
    for (const sheet of ['screens/home/index.html', 'screens/library/styles.css']) {
      const css = await read(sheet);
      expect(css, sheet).toContain('.goal-chip[data-goal]::before {');
      for (const [key, paint] of Object.entries(PAINT)) {
        expect(css, `${sheet} ${key}`).toMatch(new RegExp(`\\.goal-chip\\[data-goal="${key}"\\]::before\\s*\\{ background: var\\(--${paint}\\); \\}`));
      }
    }
  });
});
