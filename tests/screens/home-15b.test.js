/**
 * Home 15b (design handoff 2026-09-10): the fold asks what the class needs
 * and answers with four planks; the planks and the yard's chips are ONE
 * control at two sizes; every activity door on the page lands on the
 * make page (never straight into a room); the student join is one tab.
 * These guard the wiring the README and the owner's decisions fixed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

async function loadGoalGroups() {
  globalThis.window = globalThis;
  vi.resetModules();
  delete globalThis.GoalGroups;
  await import('../../screens/shared/goal-groups.js');
  return globalThis.GoalGroups;
}

describe('GoalGroups job labels', () => {
  beforeEach(loadGoalGroups);

  it('names the four jobs the way the planks and chips say them', () => {
    const jobs = globalThis.GoalGroups.GROUPS.map((g) => [g.key, g.job]);
    expect(jobs).toEqual([
      ['connect', 'To connect'],
      ['think', 'To think'],
      ['review', 'To review'],
      ['play', 'To just have fun']
    ]);
  });

  it('keeps the internal keys and tag mapping unchanged (labels changed, internals did not)', () => {
    const G = globalThis.GoalGroups;
    expect(G.GROUPS.map((g) => g.key)).toEqual(['connect', 'think', 'review', 'play']);
    expect(G.groupOf({ tags: ['energize'] })).toBe('play');
    expect(G.groupOf({ tags: ['discuss'] })).toBe('think');
    expect(G.jobOf({ tags: ['review'] })).toBe('To review');
  });
});

describe('home page 15b', () => {
  let html;
  beforeEach(async () => { html = await read('screens/home/index.html'); });

  it('has one plank per goal group, keyed by the same group keys as the chips', () => {
    const planks = [...html.matchAll(/class="plank[^"]*"[^>]*data-goal="([a-z]+)"/g)].map((m) => m[1]);
    expect(planks).toEqual(['connect', 'think', 'review', 'play']);
    // The chips are rendered from GoalGroups.GROUPS, never a second list
    expect(html).toContain('GoalGroups.GROUPS');
    expect(html).not.toMatch(/label:\s*'(Connect|Think|Review|Play)'/);
  });

  it('the chip row is sticky, so the planks are never on screen twice', () => {
    const rule = /\.yard-chips\s*\{[^}]*position:\s*sticky/;
    expect(html).toMatch(rule);
  });

  it('every activity door goes to the make page, and nothing opens a room straight from home', () => {
    expect(html).toContain("'/make?game=' + encodeURIComponent(g.id) + '&from=home'");
    expect(html).not.toContain('/host?game=');
  });

  it('a print opens the popup with the map first, so a name like Snowball explains itself on the page', () => {
    expect(html).toContain('function showActivityPopup');
    expect(html).toContain('ActivityMap.attach(g.id, mapHolder, edits ? { edits: edits } : undefined)');
    expect(html).toContain('onClick: showActivityPopup');
    expect(html).toContain('href: makeHref');
    for (const dep of ['/shared/dialog.js', '/shared/phase-names.js', '/shared/activity-map.js', '/shared/activity-map.css']) {
      expect(html, dep).toContain(dep);
    }
  });

  it('the student join is one tab that reveals the code field', () => {
    expect(html).toContain('id="join-tab"');
    expect(html).toContain('id="join-form"');
    expect(html).toMatch(/id="join-form"[^>]*\shidden/);
    expect(html).toContain('id="room-code"');
    expect(html).toContain("'/player?code=' + code");
  });

  it('the fold says what Jamyard is, then asks what the class needs (2026-09-21; the picture beside the headline took over the mechanic and sub lines, see home-16h)', () => {
    expect(html).toContain('<h1>Get the whole class<br>in on it.</h1>');
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('<h2 class="ask">What does your class need?</h2>'));
    expect(html.indexOf('<h2 class="ask">')).toBeLessThan(html.indexOf('<div class="planks" id="planks">'));
    expect(html).not.toContain('t-painted-word');
  });

  it('each plank carries the ways Jamyard does that job, shown on hover, and the red door says Pick this one (owner 2026-09-12)', async () => {
    for (const goal of ['connect', 'think', 'review', 'play']) {
      const plank = html.match(new RegExp('<a class="plank" data-goal="' + goal + '"[^]*?</a>'));
      expect(plank, goal).not.toBeNull();
      expect(plank[0]).toContain('class="plank-ways"');
      expect(plank[0]).toContain('class="plank-label"');
    }
    // On hover (owner 2026-09-22, to compare with the always-on day before)
    expect(html).toContain('.plank:hover .plank-ways');
    // The popup's red door (the carousel's went with the carousel, 2026-09-22)
    expect(html).toContain("'Pick this one'");
    expect(html).not.toMatch(/Start the room/i);
    expect(html).not.toContain('mid-activity.');
    // The shelf popup's door says the same thing (owner 2026-09-13: "we're
    // going with pick this one"); Make it yours stays the flow's name
    const shelf = await read('screens/shared/my-yard.js');
    expect(shelf).toContain("'Pick this one'");
    expect(shelf).not.toContain("'Make it yours'");
  });

  it('the grid of prints is the shared module on the home (the one yard), with the hover card', async () => {
    const mod = await read('screens/shared/yard-prints.js');
    expect(mod).toContain('Have an idea? Make it real');
    expect(mod).toContain("href || '/designer'");
    expect(mod).toContain('HoverCard.attach(card, g)');
    expect(mod).not.toMatch(/card.titles*=s*g./);
    for (const page of ['screens/home/index.html']) {
      const page_html = await read(page);
      expect(page_html, page).toContain('/shared/yard-prints.js');
      expect(page_html, page).toContain('/shared/yard-prints.css');
      expect(page_html, page).toContain('/shared/hover-card.js');
      // Script tags, not the comments that mention the modules
      expect(page_html.indexOf('<script src="/shared/goal-groups.js"'), page + ': goal groups first').toBeLessThan(page_html.indexOf('<script src="/shared/yard-prints.js"'));
    }
    expect(html).toContain('YardPrints.buildGrid(');
    const lib = await read('screens/library/library.js');
    expect(lib).not.toContain('function buildPileGroup');
    expect(lib).not.toContain('function buildPlank(');
  });

  it('the owner console filters by the same one-job rule the prints show (first goal tag wins)', async () => {
    const lib = await read('screens/library/library.js');
    const body = lib.slice(lib.indexOf('function matchesGoal('), lib.indexOf('function matchesFilters('));
    expect(body).toContain('goalGroupOf(game) === activeGoal');
    expect(body).not.toContain('group.goals.indexOf');
    const chips = lib.slice(lib.indexOf('function buildGoalChips('), lib.indexOf('function refreshLibrary('));
    expect(chips).toContain('goalGroupOf(games[i]) === group.key');
  });

  it('uses the teacher vocabulary the owner fixed', () => {
    expect(html).not.toMatch(/Practice run/i);
    expect(html).not.toMatch(/Pick an activity/i);
    expect(html).not.toMatch(/Pick a template/i);
  });

  it('never says the old domain', async () => {
    const dirs = ['screens', 'engine', 'services'];
    for (const dir of dirs) {
      const files = await walk(join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), dir));
      for (const f of files) {
        const text = await readFile(f, 'utf8');
        expect(text, f).not.toContain('jamyard.xyz');
      }
    }
  });
});

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (/\.(js|html|css|md|json)$/.test(entry.name)) out.push(p);
  }
  return out;
}
