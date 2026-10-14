/**
 * Make it in the yard's sticky row (owner 2026-10-13: a one-sentence
 * prompt that becomes an activity is the daily superpower, and the door
 * for it sat sixteen cards down as the last tile). A sanded plank with a
 * cyan Make it at the right end of the chip row, on screen the whole way
 * down the yard; Enter or the button hands the sentence to the Create
 * page, which starts building from ten letters on and otherwise leaves
 * the words in its box to finish.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

describe('the yard\'s Make it plank', () => {
  it('is built into the sticky chip row, after the jobs, and survives a chip re-render', async () => {
    const html = await read('screens/home/index.html');
    const chips = html.slice(html.indexOf('function renderChips() {'), html.indexOf('function showActivityPopup'));
    expect(chips).toContain("chipsEl.appendChild(buildMakeBar());");
    // after the last job chip, never before the class chip
    expect(chips.indexOf("chipsEl.appendChild(set);")).toBeLessThan(chips.indexOf("chipsEl.appendChild(buildMakeBar());"));
    expect(chips.indexOf("chipsEl.appendChild(chip);")).toBeLessThan(chips.indexOf("chipsEl.appendChild(buildMakeBar());"));
    const bar = html.slice(html.indexOf('function buildMakeBar() {'), html.indexOf('function renderChips() {'));
    expect(bar).toContain("var form = el('form', 'yard-make');");
    expect(bar).toContain("input.value = makeDraft;");
    expect(bar).toContain("input.addEventListener('input', function () { makeDraft = input.value; });");
    expect(bar).toContain("var go = el('button', 'yard-make-btn t-lift', 'Make it');");
    expect(bar).toContain("go.type = 'submit';");
  });

  it('hands the sentence to the Create page as its idea deep link, tagged from the home, and an empty plank still opens it', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toContain("window.location.href = '/designer?from=home' + (idea ? '&idea=' + encodeURIComponent(idea) : '');");
    // the native submit is a GET to the same page, so Enter works without the script too
    expect(html).toContain("form.action = '/designer';");
    expect(html).toContain("input.name = 'idea';");
  });

  it('the Create page puts any idea in its box and starts building from ten letters on', async () => {
    const js = await read('screens/designer/designer.js');
    expect(js).toContain("if (idea && ideaInput) ideaInput.value = idea;");
    expect(js).toContain("if (idea.length >= 10) showAIGenerateModal(idea);");
  });

  it('is a sanded plank with a cyan button (AI wears cyan, never the page\'s red), and takes its own row on a phone', async () => {
    const html = await read('screens/home/index.html');
    expect(html).toMatch(/\.yard-make-input\s*\{[^}]*background:\s*var\(--t-sanded\)/);
    expect(html).toMatch(/\.yard-make-btn\s*\{[^}]*background:\s*var\(--t-cyan\)/);
    expect(html).not.toMatch(/\.yard-make-btn\s*\{[^}]*--t-red/);
    expect(html).toMatch(/\.yard-make\s*\{[^}]*margin-left:\s*auto/);
    expect(html).toMatch(/@media \(max-width: 640px\)\s*\{\s*\.yard-make \{ flex-basis: 100%; margin-left: 0; \}/);
    // the class chip no longer pushes the jobs right: the plank takes the row's free space
    expect(html).not.toMatch(/\.class-set\s*\{[^}]*margin-right:\s*auto/);
  });

  it('the placeholder and the title carry no em dash and never name the AI', async () => {
    const html = await read('screens/home/index.html');
    const bar = html.slice(html.indexOf('function buildMakeBar() {'), html.indexOf('function renderChips() {'));
    expect(bar).toContain("input.placeholder = 'Have an idea? Describe it in a sentence';");
    expect(bar).not.toContain('—');
  });

  it('the guide names the plank beside the last tile', async () => {
    const guide = await read('screens/guide/index.html');
    expect(guide).toContain('Type it in the <strong>Have an idea?</strong> box at the top of the yard');
  });
});
