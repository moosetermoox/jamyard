/**
 * Setup knobs as rows of chips (2026-09-14, owner on Group Work Day's make
 * page: "the bar doesn't need to take up the whole width, it could also
 * be multiple choice; whether or not there are specific roles should be
 * something you switch on or switch off, then it can suggest roles or you
 * can type your own; tasks shouldn't just be one text box, an individual
 * box per task, and if you have roles then next to each task you could
 * assign a role"). Every knob is ONE row: the question, then the answer
 * as chips (a switch, a pick, a small count, names with "Type your own"),
 * one box per item for a list with a picker for the name it belongs to,
 * the old plank for lines and a topic. These guard the shape in the shared
 * module and its sheet.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('setup knobs on the make page: rows of chips', () => {
  it('every knob is a row: the question, then the answer; chips carry aria-pressed', async () => {
    const js = await read('screens/shared/make-it-yours.js');
    expect(js).toContain("row.className = 'knob-row knob-row-' + knob.kind;");
    expect(js).toContain("q.className = 'knob-q';");
    expect(js).toContain("a.className = 'knob-a';");
    expect(js).toContain("b.className = 'knob-chip' + (dashed ? ' is-dashed' : '');");
    expect(js).toContain("b.setAttribute('aria-pressed', pressed ? 'true' : 'false');");
    // The old full-width widgets are gone from the knob panel
    expect(js).not.toContain("input = document.createElement('select');");
    expect(js).not.toContain("input.type = 'checkbox';");
  });

  it('a switch, a pick, and a small count are chips; the help line is the picked value\'s only', async () => {
    const js = await read('screens/shared/make-it-yours.js');
    expect(js).toContain('chipPick(entry, [true, false]');
    expect(js).toContain("chipPick(entry, knob.values || []");
    expect(js).toContain('knob.max - knob.min + 1 <= CHIP_MAX');
    expect(js).toContain("return labels[String(v)] || (v ? 'On' : 'Off');");
    expect(js).toContain("var helpFor = function (v) { return (knob.valueHelp && knob.valueHelp[String(v)]) || knob.helper || ''; };");
  });

  it('names are chips: the suggestions, "Type your own" adds one, the cap is told, the value is the pressed chips in row order', async () => {
    const js = await read('screens/shared/make-it-yours.js');
    expect(js).toContain("var addChip = knobChip('Type your own…', false, true);");
    expect(js).toContain("var names = knob.suggestions.slice();");
    expect(js).toContain("'That is the most, ' + knob.max + '. Take one off to add another.'");
    expect(js).toContain("return tagChips.filter(function (c) { return c.el.getAttribute('aria-pressed') === 'true'; })");
  });

  it('a list is one box per item with an ×, "+ Add one", Enter adds the next; a picker per box tags it with a name from the source knob, hidden when that knob is', async () => {
    const js = await read('screens/shared/make-it-yours.js');
    expect(js).toContain("line.className = 'knob-item';");
    expect(js).toContain("x.className = 'knob-x';");
    expect(js).toContain("addItem.textContent = '+ Add one';");
    expect(js).toContain("if (e.key === 'Enter') { e.preventDefault(); addRow('', null, { after: item }).box.focus(); }");
    expect(js).toContain("sel.className = 'knob-tag';");
    expect(js).toContain("none.textContent = knob.tagLabel;");
    // Read and written through the shared prefix rule, never typed twice
    expect(js).toContain('SetupKnobs.splitTag(v, tagNames)');
    expect(js).toContain("SetupKnobs.joinTag(tagsOn && it.sel ? it.sel.value : null, it.box.value)");
    // The pickers follow the source knob: its names, or none while hidden
    expect(js).toContain("ki.setTags(src && !src.row.hidden ? values[src.knob.name] : null);");
    expect(js).toContain("it.sel.hidden = !tagsOn;");
  });

  it('touched and content checks know the new kinds', async () => {
    const js = await read('screens/shared/make-it-yours.js');
    expect(js).toContain("if (ki.knob.kind === 'lines' || ki.knob.kind === 'tags' || ki.knob.kind === 'list') return JSON.stringify(now) !== JSON.stringify(ki.knob.value);");
    const make = await read('screens/make/make.js');
    expect(make).toContain("k.kind === 'tags' || k.kind === 'list'");
    const knobs = await read('screens/shared/setup-knobs.js');
    expect(knobs).toContain("kv.kind === 'lines' || kv.kind === 'tags' || kv.kind === 'list'");
  });

  it('the shared sheet paints the rows like the fit rows: a grid row, chips, a help line, the plank, the list pieces', async () => {
    const css = await read('screens/shared/make-it-yours.css');
    for (const sel of ['.knob-rows {', '.knob-row {', '.knob-row[hidden]', '.knob-q {', '.knob-a {', '.knob-chip {', '.knob-chip[aria-pressed="true"]', '.knob-chip.is-dashed', '.knob-help {', '.knob-plank {', '.knob-list {', '.knob-item {', '.knob-tag {', '.knob-tag[hidden]', '.knob-x {']) {
      expect(css, sel).toContain(sel);
    }
    expect(css).toContain('grid-template-columns: 190px minmax(0, 1fr);');
  });
});
