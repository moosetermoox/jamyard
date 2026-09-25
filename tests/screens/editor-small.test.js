/**
 * Editor and small things from two outside reviews (2026-09-24), each a
 * guard on the source so they do not come back:
 *   - the Simple view never squeezes its writing column to a letter a
 *     line: the row wraps and the detail keeps a floor; a narrow window
 *     starts with the side panels folded unless the teacher chose
 *   - Check for Problems lists the problems, not only their count
 *   - the Create page's back link has one arrow
 *   - the join page's hint is readable
 *   - an applied chat proposal saves like any other edit
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('the Simple view at a narrow width', () => {
  it('wraps the row and gives the writing column a floor', () => {
    const css = read('screens/designer/editor.css');
    const wrap = css.slice(css.indexOf('.sv-wrap {'), css.indexOf('}', css.indexOf('.sv-wrap {')));
    expect(wrap).toContain('flex-wrap: wrap');
    expect(css).toContain('#sv-detail { flex: 1; min-width: 320px; }');
  });

  it('starts with Settings folded under 1400px and Ask AI folded under 1000px, unless the teacher chose', () => {
    const js = read('screens/designer/panel-toggles.js');
    expect(js).toContain('var NARROW = 1400;');
    expect(js).toContain('var NARROWER = 1000;');
    expect(js).toMatch(/width < NARROW && !chosen\.settings\) state\.settings = 'closed'/);
    expect(js).toMatch(/width < NARROWER && !chosen\.chat\) state\.chat = 'closed'/);
    // a saved choice wins over the width
    expect(js).toContain("chosen.settings = saved.settings === 'closed' || saved.settings === 'open';");
  });
});

describe('Check for Problems', () => {
  it('lists every problem under the count, with its step', () => {
    const js = read('screens/designer/editor.js');
    const i = js.indexOf("problemList.className = 'review-problems'");
    expect(i).toBeGreaterThan(0);
    const block = js.slice(i, i + 1200);
    expect(block).toContain('humanizeReviewText(p.message)');
    expect(block).toContain('getFriendlyPhaseName(p.phaseId)');
    expect(block).toContain('reviewContent.appendChild(problemList)');
    expect(read('screens/designer/editor.css')).toContain('.review-problems {');
  });
});

describe('small things', () => {
  it('draws one arrow on the Create page back link', () => {
    expect(read('screens/designer/styles.css')).not.toMatch(/\.back-link::before\s*\{\s*content:/);
    expect(read('screens/designer/index.html')).toContain('&larr; The yard');
  });

  it('makes the join hint readable', () => {
    const css = read('screens/player/styles.css');
    const i = css.indexOf('.join-hint {');
    const block = css.slice(i, css.indexOf('}', i));
    expect(block).toContain('font-size: 0.95rem');
    expect(block).not.toContain('#777');
    expect(css).not.toContain('.join-hint { color: var(--t-muted');
  });

  it('saves after a chat proposal is applied or reverted', () => {
    const js = read('screens/designer/chat-panel.js');
    const i = js.indexOf('function refreshEditorAfterConfigSwap()');
    const block = js.slice(i, js.indexOf('function applyProposal', i));
    expect(block).toContain("if (typeof autoSaveIfDirty === 'function') autoSaveIfDirty();");
  });

  it('tells the truth about how long a big chat change takes', () => {
    const js = read('screens/designer/chat-panel.js');
    expect(js).not.toContain('up to 30 seconds');
    expect(js).toContain('a minute or two');
  });
});
