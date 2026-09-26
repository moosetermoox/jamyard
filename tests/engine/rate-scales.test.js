/**
 * A rate step's scales are the teacher's to type (owner, 2026-09-25: "it
 * should be really easy to type what the scales are and how big they are
 * without having to talk to the AI", and "on the Make page for Class
 * Critique, you should be able to set how many different scales there
 * are"):
 *
 *   - the make print lists every rate step's scales as plain rows;
 *   - the `scales` edit rebuilds a step's scales (ids kept for unchanged
 *     labels, made from new labels, the range clamped), and leaves a step
 *     alone when the edit would empty it;
 *   - the make route takes `scales`, the make page shows and reads the
 *     panel, and the Simple view edits the scales in place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scalesFor, scaleId, applyEdits, printFor } from '../../engine/make-print.js';
import { validate } from '../../engine/game-loader.js';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

function critique() {
  return JSON.parse(read('games/class-critique/config.json'));
}

describe('scalesFor', () => {
  it('lists every rate step\'s scales as label, range, and end labels', () => {
    const rows = scalesFor(critique());
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('rate-it');
    expect(rows[0].scales).toEqual([
      { label: 'Originality', min: 1, max: 5, low: 'Familiar', high: 'Fresh' },
      { label: 'Feasibility', min: 1, max: 5, low: 'Tough', high: 'Doable' },
      { label: 'Effectiveness', min: 1, max: 5, low: 'Won\'t solve it', high: 'Nails it' }
    ]);
    expect(printFor(critique()).scales).toEqual(rows);
  });

  it('leaves a step whose labels carry tokens to the designer', () => {
    const cfg = { phases: { r: { type: 'rate', prompt: 'x', scales: [{ id: 'a', label: '{{ai.word}}', min: 1, max: 5 }], next: 'end' }, end: { type: 'end' } } };
    expect(scalesFor(cfg)).toEqual([]);
  });
});

describe('scaleId', () => {
  it('slugs a label and keeps ids unique', () => {
    const taken = new Set();
    expect(scaleId('Originality', taken)).toBe('originality');
    expect(scaleId('Originality', taken)).toBe('originality-2');
    expect(scaleId('How clear?', taken)).toBe('how-clear');
    expect(scaleId('', taken)).toBe('scale');
  });
});

describe('applyEdits.scales', () => {
  it('rebuilds the scales: kept ids for unchanged labels, new ids from new labels, the range clamped, end labels optional', () => {
    const out = applyEdits(critique(), { scales: { 'rate-it': [
      { label: 'Originality', min: 1, max: 5, low: 'Familiar', high: 'Fresh' },
      { label: 'Clarity', min: 1, max: 7, low: '', high: 'Crystal clear' },
      { label: 'Effort', min: 5, max: 3, low: '', high: '' },
      { label: '', min: 1, max: 5 }
    ] } });
    expect(out.changed).toBe(true);
    const scales = out.config.phases['rate-it'].scales;
    expect(scales).toEqual([
      { id: 'originality', label: 'Originality', min: 1, max: 5, labels: { min: 'Familiar', max: 'Fresh' } },
      { id: 'clarity', label: 'Clarity', min: 1, max: 7, labels: { max: 'Crystal clear' } },
      { id: 'effort', label: 'Effort', min: 5, max: 9 }
    ]);
    expect(validate(out.config, 'critique', { returnResults: true }).errors).toEqual([]);
  });

  it('keeps the old scales when the edit would leave none, and reports no change for the same scales', () => {
    const same = scalesFor(critique())[0].scales;
    expect(applyEdits(critique(), { scales: { 'rate-it': same } }).changed).toBe(false);
    const empty = applyEdits(critique(), { scales: { 'rate-it': [{ label: '   ' }] } });
    expect(empty.changed).toBe(false);
    expect(empty.config.phases['rate-it'].scales).toHaveLength(3);
    expect(applyEdits(critique(), { scales: { intro: [{ label: 'x' }] } }).changed).toBe(false);
  });

  it('caps a range at eleven points and never lets max sit at or under min', () => {
    const out = applyEdits(critique(), { scales: { 'rate-it': [{ label: 'Wide', min: 0, max: 100 }, { label: 'Flat', min: 3, max: 3 }] } });
    const [wide, flat] = out.config.phases['rate-it'].scales;
    expect([wide.min, wide.max]).toEqual([0, 10]);
    expect([flat.min, flat.max]).toEqual([3, 7]);
  });
});

describe('the surfaces', () => {
  it('the make route takes scales by step id, capped', () => {
    const server = read('server.js');
    expect(server).toContain("if (body.scales && typeof body.scales === 'object' && !Array.isArray(body.scales))");
    expect(server).toContain('list.slice(0, 8).map((s) => ({');
  });

  it('the make page mounts the scales panel from the print, reads it into the edits, and keeps typed scales through a fit', () => {
    const js = read('screens/make/make.js');
    const html = read('screens/make/index.html');
    expect(html).toContain('id="scales-section"');
    expect(html).toContain('id="scales-holder"');
    expect(js).toContain('if (!state.panel) mountScales(print.scales);');
    expect(js).toContain('var scales = scalesValue();');
    expect(js).toContain('if (scales) edits.scales = scales;');
    expect(js).toContain('!scalesChanged()) mountScales(print.scales);');
    expect(js).toContain("add.textContent = '+ scale';");
  });

  it('the Simple view edits a rate step\'s scales in place: name, range, end labels, add and remove', () => {
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toContain('d.extra = scalesEditor(phase);');
    expect(sv).toContain("'+ Add a scale'");
    expect(sv).toContain("'Words at the low end'");
    expect(sv).toContain("if (fresh.indexOf(s) !== -1) s.id = uniqueId(slug(v), arr, s);");
    expect(read('screens/designer/editor.css')).toContain('.sv-scale-row');
  });
});

describe('the scales come first and the AI never asks for them', async () => {
  const { AIService } = await import('../../services/ai-service.js');
  it('drops a fit question about content the page has boxes for', () => {
    const known = ['Grade band', 'The rating scales, their ranges and end labels', 'The pairs'];
    expect(AIService.asksAboutTypedContent('What should the three rating scales measure?', known)).toBe(true);
    expect(AIService.asksAboutTypedContent('Which word pairs should students match?', known)).toBe(true);
    expect(AIService.asksAboutTypedContent('What kind of work will students present?', known)).toBe(false);
    expect(AIService.asksAboutTypedContent('What should the scales be?', ['Grade band'])).toBe(false);
    expect(AIService.asksAboutTypedContent('Which answer options fit?', ['The answer choices'])).toBe(true);
  });

  it('the make page names the scales and the pairs as known settings and puts the scales panel right under the doors', () => {
    const js = read('screens/make/make.js');
    expect(js).toContain("['The rating scales, their ranges and end labels']");
    expect(js).toContain("state.print.pairs.length ? ['The pairs'] : []");
    const html = read('screens/make/index.html');
    expect(html.indexOf('id="panel-section"')).toBeLessThan(html.indexOf('id="scales-section"'));
    expect(html.indexOf('id="scales-section"')).toBeLessThan(html.indexOf('id="fit-section"'));
    const prompt = read('services/ai-service.js');
    expect(prompt).toContain('the teacher is already typing that content on the page');
  });
});
