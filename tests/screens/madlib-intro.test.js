/**
 * The madlib intro (design handoff 2026-09-26,
 * docs/design_handoff_jamyard_madlib_intro): the home page's first screen
 * is one sentence with three blanks that spin like reels. These guard the
 * word lists (every combination reads), the timeline (the handoff's
 * seconds), the reel math (a pure function of time and a list of hops:
 * the first spin lands on the curated pick, idle hops never repeat a slot
 * and stop after three, a hover hop waits for the one running), the
 * scroll fade and the wordmark's flight, and the page wiring (the hidden
 * heading, the aria-hidden sentence, the fold's headline gone, the demo
 * code that is not a word).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
// Line endings normalized: a Windows checkout turns LF into CRLF and the
// multi-line matches below would miss
const read = (p) => readFile(new URL(p, ROOT), 'utf8').then((s) => s.replace(/\r\n/g, '\n'));

async function loadModule() {
  globalThis.window = globalThis;
  vi.resetModules();
  delete globalThis.MadlibIntro;
  await import('../../screens/shared/madlib-intro.js');
  return globalThis.MadlibIntro;
}

describe('MadlibIntro words and timeline', () => {
  let M;
  beforeEach(async () => { M = await loadModule(); });

  it('three blanks of four words each, the handoff lists in order', () => {
    expect(M.WORDS.map((l) => l.map((w) => w.t))).toEqual([
      ['YARD', 'TOOLBOX', 'SWISS ARMY KNIFE', 'ONE-STOP SHOP'],
      ['CONNECTING', 'THINKING', 'REVIEWING', 'HAVING FUN'],
      ['REMIX', 'CUSTOMIZE', 'ADAPT', 'BUILD ON']
    ]);
    M.WORDS.flat().forEach((w) => expect(w.c).toMatch(/^ml-(walnut|oak|pine|birch|magenta|cyan|green|orange|yellow)$/));
  });

  it('six curated first landings, every index a real word, picked by seed', () => {
    expect(M.FIRST).toHaveLength(6);
    M.FIRST.forEach((set) => {
      expect(set).toHaveLength(3);
      set.forEach((idx, slot) => expect(M.WORDS[slot][idx]).toBeDefined());
    });
    expect(M.firstLanding(0)).toEqual([0, 3, 0]);
    expect(M.firstLanding(7)).toEqual([1, 2, 1]);
  });

  it('the sentence a screen reader gets uses the words the blanks can land on', () => {
    expect(M.SENTENCE).toBe('JAMYARD is a yard of whole-class activities for connecting, thinking, reviewing and having fun. Use them, remix them, or create your own.');
    expect(M.SENTENCE).not.toContain('—');
  });

  it('the first play is 7.5 seconds: wordmark, sentence, spin, hold', () => {
    expect(M.SCENES.map((s) => [s.name, s.dur])).toEqual([['Wordmark', 1.0], ['Sentence', 0.9], ['Spin', 3.2], ['Hold', 2.4]]);
    expect(M.D).toBe(7.5);
    expect(M.CUES).toEqual({ Wordmark: 0, Sentence: 1.0, Spin: 1.9, Hold: 5.1 });
    expect(M.reelStarts()).toEqual([1.9, 2.35, 2.8]);
    expect(M.SPIN).toBe(2.2);
    expect(M.IDLE_SPIN).toBe(1.1);
    expect(M.IDLE_GAP).toBe(6);
    expect(M.IDLE_LEAD).toBe(1.5);
    expect(M.HOVER_DELAY).toBe(90);
  });

  it('the wide sentence is three lines and the stacked one six, the reels in slot order', () => {
    const wide = M.lines('wide');
    expect(wide).toHaveLength(3);
    const stack = M.lines('stack');
    expect(stack).toHaveLength(6);
    const slots = (ls) => ls.flatMap((l) => l.tokens).filter((t) => t.kind === 'reel' || t.kind === 'period').map((t) => t.slot);
    expect(slots(wide)).toEqual([0, 1, 2]);
    expect(slots(stack)).toEqual([0, 1, 2]);
    const text = (ls) => ls.flatMap((l) => l.tokens).map((t) => (t.kind === 'words' || t.kind === 'link') ? t.text : t.kind === 'mark' ? 'JAMYARD' : '_').join(' ');
    expect(text(wide)).toBe('JAMYARD is a _ of whole-class activities for _ Use them, _ them, or create your own.');
    expect(text(stack)).toBe('JAMYARD is a _ of whole-class activities for _ Use them, _ them, or create your own.');
    // the words fade up a tenth of a second per line, after the wordmark
    expect(wide[0].tokens[0].jamAt).toBe(0.1);
    expect(wide[0].tokens[0].yardAt).toBe(0.35);
    expect(wide[0].tokens[1].at).toBe(0.7);
    expect(wide[1].tokens[0].at).toBeCloseTo(1.1);
    expect(wide[2].tokens[0].at).toBeCloseTo(1.2);
  });

  it('the canvas is 1280 by 440 wide, 640 by 640 stacked under 760px, scaled to 1.15 at most', () => {
    expect(M.CANVAS).toEqual({ wide: { w: 1280, h: 440 }, stack: { w: 640, h: 640 } });
    expect(M.STACK_UNDER).toBe(760);
    expect(M.MAX_SCALE).toBe(1.15);
    expect(M.ROW).toBe(58);
    expect(M.PITCH).toBe(76);
  });
});

describe('MadlibIntro reel math', () => {
  let M;
  beforeEach(async () => { M = await loadModule(); });

  it('a reel is empty before its start and lands on its target two laps later', () => {
    const before = M.reelState(4, 1.0, 1.9, 2, []);
    expect(before.shown).toBe(false);
    expect(before.pos).toBe(0);
    const mid = M.reelState(4, 3.0, 1.9, 2, []);
    expect(mid.shown).toBe(true);
    expect(mid.spinning).toBe(true);
    expect(mid.first).toBe(true);
    expect(mid.to).toBe(2);
    const landed = M.reelState(4, 1.9 + 2.2, 1.9, 2, []);
    expect(landed.spinning).toBe(false);
    expect(landed.pos).toBe(2 * 4 + 2);
    expect(landed.idx).toBe(2);
  });

  it('the first spin overshoots a little near the end and settles back', () => {
    const late = M.reelState(4, 1.9 + 2.2 * 0.91, 1.9, 2, []);
    expect(late.pos).toBeLessThan(10);
    expect(late.pos).toBeGreaterThan(9.7);
    const end = M.reelState(4, 1.9 + 2.2 * 0.999, 1.9, 2, []);
    expect(end.pos).toBeCloseTo(10, 1);
  });

  it('a hop moves the reel forward by its step over 1.1 seconds', () => {
    const ev = [{ t: 9, step: 2 }];
    const going = M.reelState(4, 9.5, 1.9, 1, ev);
    expect(going.spinning).toBe(true);
    expect(going.from).toBe(1);
    expect(going.to).toBe(3);
    const done = M.reelState(4, 10.2, 1.9, 1, ev);
    expect(done.spinning).toBe(false);
    expect(done.pos).toBe(9 + 2);
    expect(done.idx).toBe(3);
  });

  it('hops never overlap: a second hop waits for the first to finish', () => {
    const ev = [{ t: 9, step: 1 }, { t: 9.3, step: 1 }];
    const first = M.reelState(4, 9.5, 1.9, 0, ev);
    expect(first.to).toBe(1);
    const second = M.reelState(4, 10.5, 1.9, 0, ev);
    expect(second.spinning).toBe(true);
    expect(second.from).toBe(1);
    expect(second.to).toBe(2);
    const done = M.reelState(4, 11.3, 1.9, 0, ev);
    expect(done.spinning).toBe(false);
    expect(done.idx).toBe(2);
  });

  it('the idle schedule re-spins one blank at a time, never the same slot twice, three hops in all', () => {
    for (let seed = 0; seed < 200; seed++) {
      const all = [0, 1, 2].flatMap((slot) => M.idleEvents(seed, slot, 4).map((e) => ({ ...e, slot })));
      all.sort((a, b) => a.t - b.t);
      expect(all).toHaveLength(M.IDLE_MAX);
      expect(all.map((e) => e.t)).toEqual([9, 15, 21]);
      for (let i = 1; i < all.length; i++) expect(all[i].slot).not.toBe(all[i - 1].slot);
      all.forEach((e) => { expect(e.step).toBeGreaterThanOrEqual(1); expect(e.step).toBeLessThanOrEqual(3); });
    }
    expect(M.IDLE_MAX).toBe(3);
  });

  it('the next hop wakes the clock; a hop already begun does not', () => {
    const ev = [{ t: 9, step: 1 }, { t: 15, step: 1 }];
    expect(M.nextEventTime(ev, 8)).toBe(9);
    expect(M.nextEventTime(ev, 9.5)).toBe(15);
    expect(M.nextEventTime(ev, 16)).toBe(null);
  });

  it('the window is the widest word while spinning and the landed word at rest', () => {
    const widths = [100, 150, 300, 220];
    expect(M.windowWidth({ shown: false }, widths)).toBe(300);
    expect(M.windowWidth({ shown: true, spinning: false, idx: 0 }, widths)).toBe(100);
    expect(M.windowWidth({ shown: true, spinning: true, first: true, t: 0.5, to: 0 }, widths)).toBe(300);
    expect(M.windowWidth({ shown: true, spinning: true, first: true, t: 1, to: 0 }, widths)).toBe(100);
    expect(M.windowWidth({ shown: true, spinning: true, t: 0.5, from: 0, to: 3 }, widths)).toBe(160);
  });

  it('each word draws at its nearest row, 76px apart, tilted by row', () => {
    const at1 = M.rowFor(1, 4, 10);
    expect(at1.j).toBe(9);
    expect(at1.y).toBe(-76);
    const at2 = M.rowFor(2, 4, 10);
    expect(at2.j).toBe(10);
    expect(at2.y).toBe(0);
    expect(at2.rot).toBe(-1.2);
    expect(M.rowFor(3, 4, 10).rot).toBe(1.2);
  });
});

describe('MadlibIntro scroll', () => {
  let M;
  beforeEach(async () => { M = await loadModule(); });

  it('progress runs over six tenths of a viewport', () => {
    expect(M.FADE_SCREENS).toBe(0.6);
    expect(M.progress(0, 1000)).toBe(0);
    expect(M.progress(300, 1000)).toBe(0.5);
    expect(M.progress(900, 1000)).toBe(1);
  });

  it('the intro fades, lifts, drops pointer events past half, and hides at the end', () => {
    const start = M.scrollState(0);
    expect(start.opacity).toBe(1);
    expect(start.pointerEvents).toBe('auto');
    expect(start.visibility).toBe('visible');
    expect(start.cue).toBe(true);
    const mid = M.scrollState(0.6);
    expect(mid.opacity).toBeCloseTo(0.4);
    expect(mid.transform).toBe('translateY(-28.799999999999997px) scale(0.982)');
    expect(mid.pointerEvents).toBe('none');
    expect(mid.cue).toBe(false);
    const end = M.scrollState(1);
    expect(end.visibility).toBe('hidden');
  });

  it('the wordmark flies from the sentence to the header, scale from the size ratio to one', () => {
    const src = { x: 100, y: 300, w: 200 };
    const tgt = { x: 54, y: 22, w: 100 };
    expect(M.flyTransform(src, tgt, 0)).toBe('translate(100px, 300px) scale(2)');
    expect(M.flyTransform(src, tgt, 1)).toBe('translate(54px, 22px) scale(1)');
    expect(M.flyTransform(src, tgt, 0.5)).toBe('translate(77px, 161px) scale(1.5)');
  });
});

describe('the home page carries the intro', () => {
  it('a hidden heading, an aria-hidden sentence, the fixed layer, the flight copy, and the spacer', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('<body class="has-intro">');
    expect(html).toContain('<h1 class="intro-said">JAMYARD is a yard of whole-class activities for connecting, thinking, reviewing and having fun. Use them, remix them, or create your own.</h1>');
    expect(html).toContain('<div class="intro" id="intro">');
    expect(html).toContain('<div class="ml-sentence" aria-hidden="true"></div>');
    expect(html).toContain('<button type="button" class="intro-join t-lift t-label t-yellow">Student? Join a room</button>');
    expect(html).toContain('<button type="button" class="intro-cue" aria-label="Scroll to the home page">');
    expect(html).toContain('<div class="intro-fly" id="intro-fly" aria-hidden="true" hidden>');
    expect(html).toContain('<div class="intro-spacer" aria-hidden="true"></div>');
    expect(html).toContain('<link rel="stylesheet" href="/shared/madlib-intro.css">');
    expect(html).toContain('<script src="/shared/madlib-intro.js"></script>');
    expect(html).toContain("MadlibIntro.mount(document.getElementById('intro'), {");
    expect(html).toContain("headerMark: document.querySelector('header .wordmark'),");
    expect(html).toContain("joinTab: document.getElementById('join-tab')");
    // the intro comes before the page, so the spacer lifts the page under it
    expect(html.indexOf('<div class="intro" id="intro">')).toBeLessThan(html.indexOf('<div class="page">'));
    expect(html.indexOf('<div class="intro-spacer"')).toBeLessThan(html.indexOf('<div class="page">'));
  });

  it('the hidden heading reads the module\'s sentence', async () => {
    const M = await loadModule();
    const html = await read('screens/home/index.html');
    expect(html).toContain('<h1 class="intro-said">' + M.SENTENCE + '</h1>');
  });

  it('the fold headline hides, the picture centers, and the question becomes the headline', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('body.has-intro .hero-row .hero-head { display: none; }');
    expect(html).toContain('body.has-intro .hero-row { justify-content: center; }');
    const ask = html.slice(html.indexOf('body.has-intro .ask {'), html.indexOf('}', html.indexOf('body.has-intro .ask {')));
    expect(ask).toContain('font-family: var(--t-display);');
    expect(ask).toContain('font-weight: 800;');
    expect(ask).toContain('font-size: 30px;');
    expect(ask).toContain('letter-spacing: -0.01em;');
    expect(ask).toContain('text-transform: none;');
    expect(ask).toContain('color: var(--t-ink);');
  });

  it('the demo room code is KQTW, which is not a word', async () => {
    const html = await read('screens/home/index.html');
    const fp = await read('screens/shared/fold-picture.js');
    expect(fp).toContain("var CODE = 'KQTW';");
    expect(html).toContain('<span class="cb-0">K</span><span class="cb-1">Q</span><span class="cb-2">T</span><span class="cb-3">W</span>');
    expect(html).toContain('<span class="cb-0" data-letter="1">K</span>');
    expect(html).toContain('<span class="cb-3" data-letter="4">W</span>');
    expect(html).not.toContain('YAHS');
  });

  it('the stylesheet has the handoff\'s sizes and cuts', async () => {
    const css = await read('screens/shared/madlib-intro.css');
    expect(css).toContain('.intro {\n  position: fixed;\n  inset: 0;\n  z-index: 2;');
    expect(css).toContain('.ml-wide { width: 1280px; height: 440px; padding: 0 72px; }');
    expect(css).toContain('.ml-stack { width: 640px; height: 640px; padding: 0 40px; }');
    expect(css).toContain('clip-path: polygon(2% 8%, 98% 0, 100% 90%, 0 100%);');
    expect(css).toContain('filter: drop-shadow(4px 6px 0 rgba(80,60,30,0.14));');
    expect(css).toContain('border: 3px dashed rgba(110,75,40,0.35);');
    expect(css).toContain('.intro-spacer { height: 60vh; }');
    expect(css).not.toMatch(/border-radius/);
    expect(css).not.toContain('fonts.googleapis.com');
  });

  it('the module writes text, never markup', async () => {
    const js = await read('screens/shared/madlib-intro.js');
    expect(js).not.toMatch(/innerHTML/);
    expect(js).not.toMatch(/insertAdjacentHTML/);
  });
});
