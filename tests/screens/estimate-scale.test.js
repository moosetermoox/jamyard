/**
 * An estimate step with a known range shows a row of numbers to tap (or a
 * slider for a longer range) on the student screen, never a bare number
 * box ("On a scale of 1 to 10" showed one, owner 2026-09-12). Source
 * guards: the markup, the picker, the hidden overrides, and the bench's
 * bot fill picking from the scale.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the student estimate picker', () => {
  it('the markup carries the scale row and the slider next to the typed box', async () => {
    const html = await read('screens/player/index.html');
    expect(html).toContain('id="estimate-scale"');
    expect(html).toContain('id="estimate-slider"');
    expect(html).toContain('id="estimate-input-row"');
  });

  it('the screen builds the picker from the range the server sends', async () => {
    const src = await read('screens/player/player.js');
    expect(src).toContain('function renderEstimatePicker(min, max)');
    expect(src).toMatch(/socket\.on\('estimate-start'[\s\S]*renderEstimatePicker\(min, max\)/);
    expect(src).toContain("b.className = 'scale-pick'");
    // the bench's bot fill taps a number on the scale instead of typing 1..200
    expect(src).toMatch(/picks\[Math\.floor\(Math\.random\(\) \* picks\.length\)\]\.click\(\)/);
  });

  it('every styled-display piece keeps its hidden override (standing gotcha)', async () => {
    const css = await read('screens/player/styles.css');
    for (const sel of ['.estimate-scale[hidden]', '.estimate-slider[hidden]', '.estimate-input-row[hidden]']) {
      expect(css, sel).toContain(sel + ' { display: none; }');
    }
  });

  it('the server sends the range it computes, not the raw fields', async () => {
    const handler = await read('engine/phase-handlers/estimate.js');
    expect(handler).toContain("import { effectiveRange } from '../phases/estimate-range.js'");
    expect(handler).not.toMatch(/min: typeof phase\.min === 'number'/);
    const server = await read('server.js');
    expect(server).toContain('clampGuess(value, effectiveRange(phase))');
  });
});
