/**
 * Review eighteen, the home page and the Create box (2026-09-28): a
 * reviewer at laptop and phone widths. The room-code line hangs under the
 * strip (a wrong code pushed the box sideways), the header's student door
 * waits for the intro to fade (it rose through the sentence on a phone),
 * the picture goes on a phone (its words were 6px), one h1, the sentence's
 * links show a focus ring and a word space, the popup's name wears the
 * need's paint and the page holds still behind it, long names wrap, a job
 * plus a moment that share nothing still shows something, a database row
 * gets a time from the estimate, and Make it on an empty box says why.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8').then((s) => s.replace(/\r\n/g, '\n'));

describe('the home page', () => {
  it('has one h1, and the fold headline reads with its space', async () => {
    const html = await read('screens/home/index.html');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('<p class="hero-head">Get the whole class <br>in on it.</p>');
  });

  it('hangs the wrong-code line under the strip instead of beside it', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toMatch(/\.join-form \{ position: relative; \}/);
    const rule = html.slice(html.indexOf('    .join-error {'), html.indexOf('}', html.indexOf('    .join-error {')));
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('top: calc(100% + 6px)');
  });

  it('drops the drawn picture at phone width', async () => {
    const html = await read('screens/home/index.html');
    const phone = html.slice(html.indexOf('@media (max-width: 600px)'));
    expect(phone.slice(0, phone.indexOf('@media (prefers-reduced-motion'))).toContain('.fold-pic { display: none; }');
  });

  it('paints the popup name by the need and holds the page still behind it', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain("el('div', 'home-dialog-name ' + YardPrints.paintOf(g), g.name)");
    const name = html.slice(html.indexOf('    .home-dialog-name {'), html.indexOf('}', html.indexOf('    .home-dialog-name {')));
    expect(name).not.toContain('--t-magenta');
    expect(html).toContain('html:has(.home-dialog-overlay, .myyard-dialog-overlay) { overflow: hidden; }');
    expect(html).toContain('html { scrollbar-gutter: stable; }');
    const bar = html.slice(html.indexOf('    .home-dialog-actions {'), html.indexOf('}', html.indexOf('    .home-dialog-actions {')));
    expect(bar).toContain('bottom: -22px');
  });

  it('shows a moment across every job when the picked job has none of it', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain('pool = parts.rest.filter(byMoment).filter(matchesQuery);');
    expect(html).toContain('picks are under "');
    expect(html).toContain('so here they are from every job.');
  });
});

describe('My yard popup', () => {
  it('paints the name by the need too', async () => {
    const js = await read('screens/shared/my-yard.js');
    expect(js).toContain("'myyard-dialog-name ' + (window.YardPrints && YardPrints.paintOf ? YardPrints.paintOf(game) : 't-magenta')");
    const css = await read('screens/shared/my-yard.css');
    const rule = css.slice(css.indexOf('.myyard-dialog-name {'), css.indexOf('}', css.indexOf('.myyard-dialog-name {')));
    expect(rule).not.toContain('--t-magenta');
  });
});

describe('the yard cards', () => {
  it('let a long name wrap to two lines', async () => {
    const css = await read('screens/shared/yard-prints.css');
    const rule = css.slice(css.indexOf('.yard-name {'), css.indexOf('}', css.indexOf('.yard-name {')));
    expect(rule).not.toContain('white-space: nowrap');
    expect(rule).toContain('-webkit-line-clamp: 2');
  });

  it('reads the estimate when a row has no playTime', async () => {
    globalThis.window = globalThis;
    globalThis.document = { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, classList: { add() {} } }) };
    delete globalThis.YardPrints;
    vi.resetModules();
    await import('../../screens/shared/goal-groups.js');
    await import('../../screens/shared/yard-prints.js');
    const meta = globalThis.YardPrints.metaOf({ id: 'rose-bud-thorn', name: 'Guess Who: Rose, Bud, Thorn', minutes: 15 });
    expect(meta).toContain('~15 min');
    expect(globalThis.YardPrints.metaOf({ id: 'x', name: 'X', playTime: '5 min (rolling)', minutes: 9 })).toContain('5 min');
    expect(globalThis.YardPrints.metaOf({ id: 'y', name: 'Y' })).not.toMatch(/min/);
  });
});

describe('the madlib sentence', () => {
  it('gives its links a focus ring and a word space before "create"', async () => {
    const css = await read('screens/shared/madlib-intro.css');
    expect(css).toMatch(/\.ml-link:focus-visible \{ outline: 4px solid var\(--t-ink\)/);
    expect(css).not.toMatch(/\.ml-link:focus-visible \{[^}]*outline: none/);
    expect(css).toContain('.ml-words + .ml-link { margin-left: -6px; }');
  });

  it('fades faster on a phone and keeps the header door back until the end', async () => {
    globalThis.window = globalThis;
    vi.resetModules();
    delete globalThis.MadlibIntro;
    await import('../../screens/shared/madlib-intro.js');
    const M = globalThis.MadlibIntro;
    expect(M.fadeScreens(1055)).toBe(0.6);
    expect(M.fadeScreens(390)).toBe(0.3);
    expect(M.progress(150, 1000, 390)).toBe(0.5);
    expect(M.progress(300, 1000)).toBe(0.5);
    expect(M.doorOpacity(0)).toBe(0);
    expect(M.doorOpacity(0.8)).toBe(0);
    expect(M.doorOpacity(1)).toBe(1);
    expect(M.doorOpacity(0.9)).toBeGreaterThan(0);
  });
});

describe('the Create box', () => {
  it('says why when Make it is pressed with nothing in the box', async () => {
    const html = await read('screens/designer/index.html');
    expect(html).toContain('<p class="idea-hint" id="idea-hint" role="status" hidden></p>');
    const js = await read('screens/designer/designer.js');
    expect(js).toContain('Type what you want your class to do first, or pick one of the ideas below.');
    const css = await read('screens/designer/styles.css');
    expect(css).toContain('.idea-hint[hidden] { display: none; }');
  });
});
