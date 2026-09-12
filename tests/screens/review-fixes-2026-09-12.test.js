/**
 * Outside review, 2026-09-12: three student- and teacher-screen defects
 * that only a source scan can guard (the screens have no DOM tests).
 *   - the draw pad's "Draw something first!" notice cleared only for
 *     typed answers; drawing a stroke must clear it too
 *   - multi-field answers (Exit Ticket) had no client-side length cap
 *     while the single box has 280 and a counter
 *   - the Make page's AI reword fell back to the plain copy on ANY
 *     failure without a word, so a typed topic vanished at launch
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('student screen input guards', () => {
  it('drawing a stroke clears the response notice', async () => {
    const src = await read('screens/player/player.js');
    const attach = src.match(/Draw\.attachPad\(drawPadCanvas[^)]*\)/);
    expect(attach, 'the pad is attached with options').not.toBeNull();
    expect(attach[0]).toContain('onChange');
  });

  it('every multi-field input carries the step length cap', async () => {
    const src = await read('screens/player/player.js');
    const block = src.slice(src.indexOf("fieldInput.className = 'field-input'"), src.indexOf('fieldsContainer.appendChild(fieldInput)'));
    expect(block).toContain('fieldInput.maxLength = responseMax');
  });
});

describe('make page reword', () => {
  it('a failed AI fit is told to the teacher, never swallowed', async () => {
    const src = await read('screens/make/make.js');
    expect(src).not.toMatch(/catch\(function \(\) \{ return working; \}\)/);
    expect(src).toContain('Use it as written');
    expect(src).toContain('function rewordFailure');
  });
});
