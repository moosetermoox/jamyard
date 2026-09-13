/**
 * Make it fit your class (2026-09-13): rows of chips on the make page,
 * nothing folded. Every setting is ONE row, the question on the left and
 * the answer as chips on the right, tapped in place; a typed answer is a
 * plank in its row. The AI's one or two questions come first (choice or
 * text), then Your class, Student names, Early-bird joke. The owner's
 * first cut (a card beside the doors plus a panel) asked every question
 * twice and read as work; these guard the simpler shape.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('make page: make it fit your class', () => {
  it('one headed section under the doors, no fold, no card, no panel', async () => {
    const html = await read('screens/make/index.html');
    expect(html).toContain('id="fit-section"');
    expect(html).toContain('id="fit-rows"');
    expect(html).toContain('id="class-holder"');
    expect(html).toContain('<h2 class="panel-heading">Make it fit your class</h2>');
    // Above What happens: the settings before the map
    expect(html.indexOf('id="fit-section"')).toBeLessThan(html.indexOf('id="map-section"'));
    for (const gone of ['more-btn', 'more-body', 'names-hidden', 'early-joke', 'setup-card', 'setup-panel', 'setup-tally', 'Tap a line']) {
      expect(html, gone).not.toContain(gone);
    }
    // The doors row holds the doors only
    const doors = html.slice(html.indexOf('<div class="doors"'), html.indexOf('id="make-error"'));
    expect(doors).not.toContain('fit-');
  });

  it('every setting is one row: the question, then chips; the switches are two chips each', async () => {
    const js = await read('screens/make/make.js');
    expect(js).toContain("var classRow = rowEl('Your class');");
    expect(js).toContain("var names = rowEl('Student names');");
    expect(js).toContain("var joke = rowEl('Early-bird joke');");
    expect(js).toContain("chipButton('Shown', !state.anonymous)");
    expect(js).toContain("chipButton('Hidden', state.anonymous)");
    expect(js).toContain("chipButton('On', state.earlyJoke)");
    expect(js).toContain("chipButton('Off', !state.earlyJoke)");
    // The class is a chip and a link; the picker shows under the rows
    expect(js).toContain("link.textContent = cls ? 'change' : 'set it';");
    expect(js).toContain('function toggleClassPicker(show)');
    // The doors read the switches off state
    expect(js).toContain('edits.anonymous = !!state.anonymous;');
    expect(js).toContain('edits.earlyJoke = !!state.earlyJoke;');
    // No tally, no instructions
    expect(js).not.toContain("' of ' + total + ' set'");
    expect(js).not.toContain('Tap a line');
    expect(js).not.toContain('One tap, or type your own');
  });

  it('a choice question is chips with "Type your own…" opening the plank; a text question is the plank in the row', async () => {
    const js = await read('screens/make/make.js');
    expect(js).toContain("var isChoice = q.kind === 'choice' && Array.isArray(q.choices) && q.choices.length >= 2;");
    expect(js).toContain("var own = chipButton('Type your own…', false, true);");
    expect(js).toContain("input.className = 'fit-plank';");
    expect(js).toContain('Speech.attachMic(input)');
    // The mic wrapper hides with the plank
    expect(js).toContain("p.classList.contains('mic-wrap')) p.hidden = !show;");
    // The questions load with the page and again when the class changes;
    // a stale reply never lands over a newer one
    expect(js).toContain('var request = ++state.questionsRequest;');
    expect(js).toContain('if (request !== state.questionsRequest) return;');
    // A quiz or bluff panel owns the words: nothing to ask
    expect(js).toContain("state.noQuestions = !!(state.panel && state.panel !== 'knobs');");
  });

  it('every sink is textContent (teacher text and AI output are untrusted)', async () => {
    const js = await read('screens/make/make.js');
    expect(js).not.toMatch(/\.innerHTML\s*\+?=/);
    expect(js).not.toContain('insertAdjacentHTML');
  });

  it('the styles carry the rows, the chips, the plank, and the phone fold', async () => {
    const css = await read('screens/make/styles.css');
    for (const sel of ['.fit-section {', '.fit-card {', '.fit-row {', '.fit-q {', '.fit-chip {', '.fit-chip[aria-pressed="true"]', '.fit-chip.is-dashed', '.fit-link {', '.fit-plank {']) {
      expect(css, sel).toContain(sel);
    }
    expect(css).toContain('.fit-plank[hidden] { display: none; }');
    expect(css).toContain('.fit-row .mic-wrap[hidden] { display: none; }');
    expect(css).toContain('.class-holder[hidden] { display: none; }');
    expect(css).toContain('.fit-a {');
    expect(css).toContain('.fit-row { grid-template-columns: minmax(0, 1fr); }');
    for (const gone of ['.more-btn', '.setup-card', '.setup-panel', '.vchip']) {
      expect(css, gone).not.toContain(gone);
    }
  });
});
