/**
 * Outside review, 2026-09-12, the six small items after the four fixes:
 *   - red used as SMALL text (errors, links) needs its own deeper token;
 *     the primary-button red stays (owner accepted white-on-red)
 *   - the home's projector mock scales its layout on a phone instead of
 *     wrapping the prompt three letters to a line
 *   - the button that moves the room stays in view on the projector, and
 *     the student's Submit stays in view under a notice
 *   - the doors say what Launch opens, so Try it out is not hidden
 *   - the paste-up design system (Archivo Black, electric blue tokens) is
 *     gone from design.css; nothing references the old font
 *   - the feedback widget's select is painted, not the OS default
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function token(css, name) {
  const m = css.match(new RegExp(name + ':\\s*(#[0-9A-Fa-f]{6})'));
  return m && m[1];
}

async function walk(dir, ext, out = []) {
  for (const e of await readdir(new URL(dir + '/', ROOT), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, ext, out);
    else if (ext.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

describe('small red text', () => {
  it('totem.css carries a deeper red for small text that clears AA on every ground', async () => {
    const css = await read('screens/shared/totem.css');
    const red = token(css, '--t-red-text');
    expect(red, '--t-red-text defined').toBeTruthy();
    for (const ground of ['--t-gesso', '--t-paper', '--t-sanded']) {
      const bg = token(css, ground);
      expect(contrast(red, bg), `${red} on ${ground} ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // The cream the home's join strip uses
    expect(contrast(red, '#FFF9C4')).toBeGreaterThanOrEqual(4.5);
  });

  it('inline errors and links read the small-text red, never the action red', async () => {
    const sites = [
      ['screens/home/index.html', /\.join-error \{[^}]*color: var\(--t-red-text\)/],
      ['screens/share/index.html', /\.error-line \{[^}]*var\(--t-red-text\)/],
      ['screens/guide/index.html', /\n\s*a \{ color: var\(--t-red-text\)/],
      ['screens/privacy/index.html', /\n\s*a \{ color: var\(--t-red-text\)/]
    ];
    for (const [file, re] of sites) expect(await read(file), file).toMatch(re);
    for (const file of ['screens/designer/editor.css', 'screens/designer/styles.css', 'screens/designer/editor.js', 'screens/designer/designer.js']) {
      expect(await read(file), file).not.toMatch(/color:\s*#FF2D2D/);
    }
  });
});


describe('the button that moves the room stays in view', () => {
  it('host sections keep their direct button sticky at the bottom edge', async () => {
    const css = await read('screens/host/styles.css');
    expect(css).toMatch(/section\.active > button:not\(\[hidden\]\)[^{]*\{[^}]*position: sticky/);
  });
  it('the student Submit button is sticky too', async () => {
    const css = await read('screens/player/styles.css');
    expect(css).toMatch(/#submit-btn[^{]*\{[^}]*position: sticky/);
  });
});

describe('the paste-up leftovers', () => {
  it('design.css no longer carries the old palette or display font', async () => {
    const css = await read('screens/shared/design.css');
    for (const gone of ['--font-display', '--blue:', '--red:', '--pink:', '--shadow-pop', 'Archivo', 'Nunito', 'EB Garamond']) {
      expect(css, gone).not.toContain(gone);
    }
  });
  it('no screen names Archivo Black', async () => {
    const files = await walk('screens', ['.css', '.html', '.js']);
    const dirty = [];
    for (const f of files) if ((await read(f.split('\\').join('/'))).includes('Archivo')) dirty.push(f);
    expect(dirty).toEqual([]);
  });
  it('the feedback widget paints its select', async () => {
    const src = await read('screens/shared/feedback-widget.js');
    expect(src).toMatch(/#feedback-widget-panel select \{[^}]*appearance: none/);
  });
});
