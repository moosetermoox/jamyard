/**
 * The make page's setup card (2026-09-13): the settings sit beside the
 * doors as lines with value chips (yellow = set, dashed = not), the tapped
 * line's control opens in a panel under the doors, never in a fold. The
 * AI's questions come one or two at a time, each a row of choices or a
 * plank when the answer is a specific thing. These guard the wiring the
 * owner's canvas fixed ("ok let's make it").
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('make page setup card', () => {
  it('the card lives inside the doors row and the More fold is gone', async () => {
    const html = await read('screens/make/index.html');
    const doorsStart = html.indexOf('<div class="doors"');
    const doorsEnd = html.indexOf('<!-- The tapped line', doorsStart);
    expect(doorsStart).toBeGreaterThan(-1);
    expect(doorsEnd).toBeGreaterThan(doorsStart);
    const doors = html.slice(doorsStart, doorsEnd);
    expect(doors).toContain('id="setup-card"');
    expect(doors).toContain('id="setup-tally"');
    expect(doors).toContain('id="setup-lines"');
    expect(doors).toContain('Make it fit your class');
    expect(doors).toContain('Tap a line to change it. All optional.');
    expect(html).toContain('id="setup-panel"');
    expect(html).toContain('id="class-holder"');
    expect(html).toContain('id="setup-questions"');
    expect(html).not.toContain('more-btn');
    expect(html).not.toContain('more-body');
    expect(html).not.toContain('names-hidden');
    expect(html).not.toContain('early-joke');
  });

  it('every line is a button with a value chip; the switches flip on the spot', async () => {
    const js = await read('screens/make/make.js');
    expect(js).toContain("lineButton('class', 'Your class'");
    expect(js).toContain("lineButton('q' + i, q.label || q.question");
    expect(js).toContain("lineButton('names', 'Student names', state.anonymous ? 'hidden' : '', 'shown')");
    expect(js).toContain("lineButton('joke', 'Early-bird joke', state.earlyJoke ? 'on' : '', 'off')");
    expect(js).toContain("chip.className = 'vchip' + (value ? ' is-set' : '')");
    expect(js).toContain("if (key === 'names') { state.anonymous = !state.anonymous; buildLines(); return; }");
    expect(js).toContain("if (key === 'joke') { state.earlyJoke = !state.earlyJoke; buildLines(); return; }");
    expect(js).toContain("el.setupTally.textContent = set + ' of ' + total + ' set'");
    // The doors read the switches off state, not off checkboxes
    expect(js).toContain('edits.anonymous = !!state.anonymous;');
    expect(js).toContain('edits.earlyJoke = !!state.earlyJoke;');
    expect(js).not.toContain('namesHidden');
  });

  it('a choice question is a row of chips with a typed way out; a text question is the plank', async () => {
    const js = await read('screens/make/make.js');
    expect(js).toContain("var isChoice = q.kind === 'choice' && Array.isArray(q.choices) && q.choices.length >= 2;");
    expect(js).toContain("c.className = 'setup-choice';");
    expect(js).toContain("other.textContent = 'Something else…';");
    expect(js).toContain("c.setAttribute('aria-pressed'");
    // The mic rides on the plank either way
    expect(js).toContain('Speech.attachMic(input)');
    // The questions load with the page and again when the class changes,
    // and a stale reply never lands over a newer one
    expect(js).toContain('var request = ++state.questionsRequest;');
    expect(js).toContain('if (request !== state.questionsRequest) return;');
    // A quiz or bluff panel owns the words: nothing to ask
    expect(js).toContain("state.noQuestions = !!(state.panel && state.panel !== 'knobs');");
    expect(js).toContain('if (!state.config || state.noQuestions) return;');
  });

  it('every sink is textContent (teacher text and AI output are untrusted)', async () => {
    const js = await read('screens/make/make.js');
    expect(js).not.toMatch(/\.innerHTML\s*\+?=/);
    expect(js).not.toContain('insertAdjacentHTML');
  });

  it('the styles carry the card, the chips, the panel, and the phone fold', async () => {
    const css = await read('screens/make/styles.css');
    for (const sel of ['.setup-card {', '.setup-tally {', '.setup-line {', '.setup-line.is-open', '.vchip {', '.vchip.is-set', '.setup-panel {', '.setup-choice {', '.setup-choice[aria-pressed="true"]', '.setup-choice-other', '.setup-q-input {']) {
      expect(css, sel).toContain(sel);
    }
    expect(css).toContain('.setup-panel[hidden] { display: none; }');
    expect(css).toContain('.class-holder[hidden] { display: none; }');
    expect(css).toContain('.setup-card { width: 100%; margin-left: 0; }');
    expect(css).not.toContain('.more-btn');
  });
});
