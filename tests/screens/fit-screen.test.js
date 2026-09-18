/**
 * The screen that is up fits the viewport (2026-09-18, owner: "during an
 * activity the entire screen should fit so you don't have to scroll down.
 * most projectors fit 16:9"). screens/shared/fit-screen.js shrinks the
 * active section with CSS zoom until the document fits; this guards the
 * math and the wiring: both the projector and the student screen load the
 * module before their own script and install it, and each section switch
 * fits at once (no frame at the wrong size).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

beforeEach(async () => {
  globalThis.window = globalThis;
  globalThis.document = { body: null, addEventListener() {}, querySelector: () => null };
  vi.resetModules();
  delete globalThis.FitScreen;
  await import('../../screens/shared/fit-screen.js');
});

describe('FitScreen.zoomFor', () => {
  const z = (...a) => globalThis.FitScreen.zoomFor(...a);

  it('leaves a page that fits at zoom 1', () => {
    expect(z(800, 80, 1080, 0.5, 1)).toBe(1);
  });

  it('shrinks the section to the room left after the fixed parts', () => {
    // 1200px of section + 80px of padding into 1080px: (1080-80)/1200
    expect(z(1200, 80, 1080, 0.5, 1)).toBeCloseTo(1000 / 1200, 5);
  });

  it('measures at the current zoom, so a second round refines the first', () => {
    // At zoom 0.8 the section takes 900 real px; room after padding is 1000
    expect(z(900, 80, 1080, 0.5, 0.8)).toBeCloseTo(0.8 * 1000 / 900, 5);
  });

  it('never goes under the floor (the page scrolls again instead)', () => {
    expect(z(5000, 80, 1080, 0.5, 1)).toBe(0.5);
    expect(z(5000, 80, 1080, 0.6, 1)).toBe(0.6);
  });

  it('never grows past 1 and survives a zero-height section', () => {
    expect(z(300, 80, 1080, 0.5, 0.7)).toBe(1);
    expect(z(0, 80, 1080, 0.5, 0.7)).toBe(0.7);
  });

  it('goes to the floor when the fixed parts alone overflow the room', () => {
    expect(z(400, 1200, 1080, 0.5, 1)).toBe(0.5);
  });
});

describe('FitScreen wiring', () => {
  it('exposes install, fitNow, schedule', () => {
    const F = globalThis.FitScreen;
    ['install', 'fitNow', 'schedule', 'zoomFor', 'current'].forEach((n) => expect(typeof F[n], n).toBe('function'));
  });

  it('the projector and the student screen load it before their own script', async () => {
    for (const [html, own] of [['screens/host/index.html', 'host.js'], ['screens/player/index.html', 'player.js']]) {
      const src = await read(html);
      const fit = src.indexOf('/shared/fit-screen.js');
      const script = src.indexOf(`src="${own}"`);
      expect(fit, `${html} loads fit-screen.js`).toBeGreaterThan(-1);
      expect(fit, `${html} loads fit-screen.js before ${own}`).toBeLessThan(script);
    }
  });

  it('both screens install it and fit on every section switch', async () => {
    const host = await read('screens/host/host.js');
    const player = await read('screens/player/player.js');
    expect(host).toMatch(/FitScreen\.install\(/);
    expect(player).toMatch(/FitScreen\.install\(/);
    // showSection ends with a synchronous fit so the new step never paints at the wrong size
    expect(host).toMatch(/function showSection[\s\S]*?FitScreen\.fitNow\(\)/);
    expect(player).toMatch(/function showSection[\s\S]*?FitScreen\.fitNow\(\)/);
  });

  it('a student on a Chromebook gets a wider column than a phone', async () => {
    const css = await read('screens/player/styles.css');
    expect(css).toMatch(/@media \(min-width: 900px\)[\s\S]*?body \{[\s\S]*?max-width: (5|6)\d0px/);
  });
});
