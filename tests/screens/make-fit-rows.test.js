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
    // Above What happens: the settings before the map; and a recipe's own
    // panel (the quiz's questions) right under the doors, above both
    // ("on speed quiz it's really important to be able to customize
    // questions", owner 2026-09-13)
    expect(html.indexOf('id="panel-section"')).toBeLessThan(html.indexOf('id="fit-section"'));
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

  // The owner changed Snowball's question, answered a row, and the copy
  // came back with the AI's version of the question ("it seems to use
  // make it fit your class more"): the reword must keep the print's words
  it('the reword names the teacher\'s own question and field labels as fixed, word for word', async () => {
    const js = await read('screens/make/make.js');
    expect(js).toContain('The teacher wrote the question in step "\' + stepId + \'" themselves: "\' + state.promptBox.value.trim() + \'". Keep it word for word.');
    expect(js).toContain('They also wrote these field labels in step "\' + stepId + \'" themselves: \' + labels.join(\', \') + \'. Keep them word for word.');
    expect(js).toContain("Rewrite ONLY the other teacher- and student-facing words");
    expect(js).toContain("(fixed.length ? 'that question and ' : '') + 'their answers below. '");
  });

  // "Is there a way that What happens can populate a preview based on your
  // responses?" (owner, 2026-09-13): the map follows the edits at once,
  // and one button runs the AI fit on demand; the doors reuse that copy
  it('What happens redraws from the edited copy, and See how it reads fits once and hands the copy to the doors', async () => {
    const html = await read('screens/make/index.html');
    const js = await read('screens/make/make.js');
    const server = await read('server.js');
    expect(html).toContain('id="fit-see"');
    expect(html).toContain('>See how it reads</button>');
    // Tier one: the question, labels, and timer redraw the map without AI
    expect(js).toContain("state.promptBox.box.addEventListener('input', scheduleMap);");
    expect(js).toContain("box.box.addEventListener('input', scheduleMap);");
    expect(js).toContain('scheduleMap();\n    };');
    expect(js).toContain('redrawMap(d.map);');
    expect(server).toContain('res.json({ config: working, changed, map: buildActivityMap(working) });');
    // Tier two: the fitted copy's map, and the doors reuse the copy
    expect(server).toContain("app.post('/api/games/map'");
    expect(js).toContain("state.fitted = { key: key, config: revised };");
    expect(js).toContain('if (withAi && state.fitted && state.fitted.key === fitKey()) {');
    expect(js).toContain('return saveAndGo(state.fitted.config, dest);');
    // No AI call fires on its own: only the button runs the fit
    expect(js).toContain("el.fitSee.addEventListener('click', seeHowItReads)");
    expect(js).not.toContain('scheduleFit');
    // The fit shows at the TOP too: the print redraws from the fitted copy
    // (a Live Poll run saw no change at the top, 2026-09-13), and the
    // key is read after the boxes take the fitted words
    expect(server).toContain("app.post('/api/games/print'");
    expect(js).toContain("Promise.all([post('/api/games/map'), post('/api/games/print')])");
    expect(js).toContain('applyFittedPrint(parts[1]);');
    expect(js).toContain('state.fitted.key = fitKey();');
    // Only words the teacher CHANGED are fixed; an untouched question is the AI's to fit
    expect(js).toContain('if (state.promptBox && stepId && promptChanged()) {');
    expect(js).toContain('if (state.promptBox && !promptChanged() && print.prompt && print.prompt.text) {');
    // Back from the simulator: the cached page drops its "Opening…" card
    expect(js).toContain("window.addEventListener('pageshow', function (e) {");
    expect(js).toContain('if (e.persisted && state.busy) clearOpening();');
  });

  // "With vocab match there should be a way to preview the pairs, similar
  // to the quiz ones" (owner 2026-09-13): a pairs panel under the doors,
  // editable, read into the edits by step id, kept by the fit when edited
  it('a matching activity gets a pairs panel: two planks and an x per pair, a + pair per round, read into the edits', async () => {
    const html = await read('screens/make/index.html');
    const js = await read('screens/make/make.js');
    const server = await read('server.js');
    expect(html).toContain('id="pairs-section"');
    expect(html).toContain('<h2 class="panel-heading">The pairs</h2>');
    // Under the fit rows, above What happens (owner 2026-09-13)
    expect(html.indexOf('id="fit-section"')).toBeLessThan(html.indexOf('id="pairs-section"'));
    expect(html.indexOf('id="pairs-section"')).toBeLessThan(html.indexOf('id="map-section"'));
    expect(js).toContain('if (!state.panel) mountPairs(print.pairs);');
    expect(js).toContain("x.setAttribute('aria-label', 'Drop this pair');");
    expect(js).toContain("add.textContent = '+ pair';");
    expect(js).toContain('if (pairs) edits.pairs = pairs;');
    // "+ round": a new round the teacher can drop, read into the edits, kept by the fit
    expect(js).toContain("more.textContent = '+ round';");
    expect(js).toContain("drop.setAttribute('aria-label', 'Drop this round');");
    expect(js).toContain('if (newRounds.length) edits.newRounds = newRounds;');
    expect(js).toContain('The teacher added \' + added.length + \' more round');
    expect(server).toContain('edits.newRounds = body.newRounds.slice(0, 8)');
    expect(js).toContain('The teacher wrote the pairs in step "\' + r.id + \'" themselves: ');
    expect(server).toContain('edits.pairs[id.slice(0, 64)] = list.slice(0, 40)');
    // The designer link says why you would go there
    expect(html).toContain('>Make it even more yours in the designer</a>');
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
