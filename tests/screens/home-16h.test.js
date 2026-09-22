/**
 * Home 16h (design handoff 2026-09-21): the fold's picture. A projector and
 * one student's screen play Snowball's first minute once on load (join,
 * roster, prompt, answer, the pairs' list), then the page is still. These
 * guard the sequence (a pure table in shared/fold-picture.js), the words
 * (Snowball's own, never a vote it does not have, never a button the
 * student screen does not have), and the page wiring (aria-hidden canvas,
 * a real replay button outside it, no replay on mouseenter, the plank ways
 * kept, the mechanic and sub lines gone because the picture does that job).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

async function loadModule() {
  globalThis.window = globalThis;
  vi.resetModules();
  delete globalThis.FoldPicture;
  await import('../../screens/shared/fold-picture.js');
  return globalThis.FoldPicture;
}

describe('FoldPicture sequence', () => {
  let FP;
  beforeEach(async () => { FP = await loadModule(); });

  it('has thirteen states that dwell about eight and a half seconds in all', () => {
    expect(FP.LAST).toBe(12);
    expect(FP.dwell(0)).toBe(600);
    expect(FP.dwell(4)).toBe(900);
    expect(FP.dwell(7)).toBe(900);
    expect(FP.dwell(8)).toBe(700);
    expect(FP.dwell(11)).toBe(900);
    expect(FP.dwell(1)).toBe(620);
    expect(FP.total()).toBeGreaterThan(8000);
    expect(FP.total()).toBeLessThan(9500);
  });

  it('starts empty: dashed slots and JOIN on the student screen, nothing on the projector', () => {
    const v = FP.view(0);
    expect(v.code).toBe(false);
    expect(v.letters).toBe(0);
    expect(v.studentView).toBe('join');
    expect(v.joinPressed).toBe(false);
    expect(v.names).toBe(0);
    expect(v.countLine).toBe('');
    expect(v.prompt).toBe(false);
    expect(v.replay).toBe(false);
  });

  it('the code arrives on the projector, then the letters fill one per state, JOIN presses on the fourth', () => {
    expect(FP.view(1).code).toBe(true);
    expect([1, 2, 3, 4].map((s) => FP.view(s).letters)).toEqual([1, 2, 3, 4]);
    expect(FP.view(3).joinPressed).toBe(false);
    expect(FP.view(4).joinPressed).toBe(true);
    // The header tab lifts for that one beat only
    expect(FP.view(3).tabLift).toBe(false);
    expect(FP.view(4).tabLift).toBe(true);
    expect(FP.view(5).tabLift).toBe(false);
  });

  it('the roster grows one plank per state with the count beside it, then the prompt lands and the student sees it', () => {
    expect([5, 6, 7].map((s) => FP.view(s).names)).toEqual([1, 2, 3]);
    expect(FP.view(5).countLine).toBe('1 in the room');
    expect(FP.view(7).countLine).toBe('3 in the room');
    expect(FP.view(6).prompt).toBe(false);
    expect(FP.view(7).prompt).toBe(true);
    expect(FP.view(6).studentView).toBe('join');
    expect(FP.view(7).studentView).toBe('answer');
  });

  it('the student types, presses Submit, and one block lands on the pile per answer', () => {
    expect(FP.view(7).typed).toBe('');
    expect(FP.view(8).typed).toBe('One voice at a');
    expect(FP.view(8).caret).toBe(true);
    expect(FP.view(9).typed).toBe(FP.ANSWER);
    expect(FP.view(9).caret).toBe(false);
    expect(FP.view(8).submitPressed).toBe(false);
    expect(FP.view(9).submitPressed).toBe(true);
    expect([8, 9, 10, 11].map((s) => FP.view(s).pileBlocks)).toEqual([0, 1, 2, 3]);
    expect(FP.view(9).pileLine).toBe('1 of 3 in');
    expect(FP.view(11).pileLine).toBe('3 of 3 in');
    expect(FP.view(11).built).toBe(false);
  });

  it('ends the way Snowball ends: the pairs\' list on the projector, the pile stepped back, replay offered', () => {
    const v = FP.view(12);
    expect(v.built).toBe(true);
    expect(v.pileDim).toBe(true);
    expect(v.replay).toBe(true);
    expect(v.pileLine).toBe('3 of 3 in');
    expect(v.studentView).toBe('answer');
  });

  it('uses Snowball\'s own prompt and sample answers, and never promises a vote', async () => {
    const cfg = JSON.parse(await read('games/snowball/config.json'));
    const phases = Array.isArray(cfg.phases) ? cfg.phases : Object.values(cfg.phases);
    const solo = phases.find((p) => p.type === 'collect');
    expect(FP.PROMPT).toBe(solo.prompt);
    expect(FP.BUILT).toHaveLength(3);
    expect(FP.BUILT[0]).toBe(FP.ANSWER);
    const src = await read('screens/shared/fold-picture.js');
    expect(src).not.toMatch(/most votes|winner|crown/i);
    // Replay is a button, never a mouse sweep across the picture
    expect(src).not.toContain('mouseenter');
    expect(src).not.toContain('mouseover');
  });
});

describe('home page 16h fold', () => {
  let html, css;
  beforeEach(async () => {
    html = await read('screens/home/index.html');
    css = await read('screens/shared/fold-picture.css');
  });

  it('puts the picture beside the headline, over the question and the planks', () => {
    expect(html).toContain('<h1>Get the whole class in on it.</h1>');
    const h1 = html.indexOf('<h1>');
    const pic = html.indexOf('class="fold-pic"');
    const ask = html.indexOf('<h2 class="ask">What does your class need?</h2>');
    const planks = html.indexOf('<div class="planks" id="planks">');
    expect(h1).toBeGreaterThan(0);
    expect(h1).toBeLessThan(pic);
    expect(pic).toBeLessThan(ask);
    expect(ask).toBeLessThan(planks);
  });

  it('drops the sub-line and the mechanic line: the picture does that job, a hidden sentence says it for screen readers', () => {
    expect(html).not.toContain('class="mechanic"');
    expect(html).not.toContain('class="sub"');
    expect(html).not.toContain('No student accounts, nothing to install.');
    expect(html).toMatch(/class="fold-pic-said"[^>]*>You project your screen/);
  });

  it('the canvas is decoration (aria-hidden, unselectable) and the replay button sits outside it', () => {
    expect(html).toMatch(/class="fold-pic-canvas"[^>]*aria-hidden="true"/);
    const canvasStart = html.indexOf('class="fold-pic-canvas"');
    const replay = html.search(/class="fold-pic-replay\b/);
    expect(replay).toBeGreaterThan(canvasStart);
    // The replay button follows the canvas's closing tag: count divs opened
    // inside the canvas before the button
    const between = html.slice(canvasStart, replay);
    const opened = (between.match(/<div\b/g) || []).length;
    const closed = (between.match(/<\/div>/g) || []).length;
    expect(closed).toBe(opened + 1); // the canvas closes itself before the button
    expect(html).toMatch(/<button[^>]*class="fold-pic-replay\b/);
    expect(css).toMatch(/\.fold-pic-canvas\s*\{[^}]*user-select:\s*none/);
  });

  it('the student screen says what the real one says: JOIN, then Submit, never ADD MY BLOCK', () => {
    const pic = html.slice(html.indexOf('class="fold-pic"'), html.search(/class="fold-pic-replay\b/));
    expect(pic).toContain('>Join<');
    expect(pic).toContain('>Submit<');
    expect(pic).not.toMatch(/add my block/i);
  });

  it('loads the module and its stylesheet, mounts it on the picture, and hands it the join tab to nudge', () => {
    expect(html).toContain('<link rel="stylesheet" href="/shared/fold-picture.css">');
    expect(html).toContain('<script src="/shared/fold-picture.js"></script>');
    expect(html).toContain("FoldPicture.mount(document.getElementById('fold-picture'), { tab: document.getElementById('join-tab') })");
    expect(css).toMatch(/\.join-tab\.is-nudged/);
  });

  it('the canvas is a fixed 660 by 330 drawing that scales with its column, still and finished on a phone', () => {
    expect(css).toMatch(/\.fold-pic-canvas\s*\{[^}]*width:\s*660px/);
    expect(css).toMatch(/\.fold-pic-canvas\s*\{[^}]*height:\s*330px/);
    const src = html;
    expect(src).toMatch(/@media \(max-width: 1100px\)[^}]*\{[^}]*\.hero-row[^}]*flex-direction:\s*column/);
    const mod = readFileSyncish();
    return mod.then((m) => {
      expect(m).toContain("'(prefers-reduced-motion: reduce)'");
      expect(m).toContain("'(max-width: 600px)'");
      expect(m).toContain('ResizeObserver');
      expect(m).toContain('/ 660');
    });
  });

  it('keeps the ways on the planks (they went always-on 2026-09-21; hover is invisible on a touchpad)', () => {
    expect(html).toContain('class="plank-ways"');
    expect(html).not.toContain('.plank:hover .plank-ways');
  });

  it('respects reduced motion in the stylesheet: no arrival transition', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

function readFileSyncish() { return read('screens/shared/fold-picture.js'); }
