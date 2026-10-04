/**
 * The Create page's example ideas, answered ahead of time (2026-10-04,
 * owner: fewer AI calls, no quality cost). "Try one of these" is the first
 * thing a new teacher clicks; each click asked the matcher, often the plan,
 * and the follow-up questions, the same request every time.
 *
 * engine/example-ideas.json keeps the MODEL'S DECISION for each example, as
 * the real call returned it: the matcher's pick (`match`, and `forced:<id>`
 * for a re-run held to one recipe), the plan (`storyboard`), and the
 * follow-up questions (`questions`). Everything after the decision still runs
 * live (compiling the recipe, timing, settings, the ideas log), so a changed
 * recipe can never leave a stale activity behind. Only an idea that matches
 * an example word for word (case and spacing aside) is answered from here,
 * and only in real mode: tests and mock rooms run as before.
 *
 * Re-record after a prompt or model change: node scripts/record-example-ideas.js
 * (it runs the real routes with RECORD_EXAMPLE_IDEAS=1, which writes the file).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('./example-ideas.json', import.meta.url));

let store = null;
function load() {
  if (!store) {
    try { store = JSON.parse(readFileSync(FILE, 'utf8')); } catch { store = { examples: [] }; }
    if (!Array.isArray(store.examples)) store.examples = [];
  }
  return store;
}

/** The form two ideas are compared in: trimmed, single-spaced, lower case, no end punctuation. */
export function normalizeIdea(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').toLowerCase();
}

function entryFor(description) {
  const key = normalizeIdea(description);
  if (!key) return null;
  return load().examples.find(e => normalizeIdea(e.idea) === key) || null;
}

/** The example ideas the file answers, as the page shows them. */
export function exampleIdeas() {
  return load().examples.map(e => e.idea);
}

/**
 * The stored answer of this kind for an example idea, as a fresh copy, or
 * undefined when the idea is not an example or that answer was never recorded.
 * @param {string} description
 * @param {string} kind  'match' | 'forced:<recipeId>' | 'storyboard' | 'questions'
 */
export function storedExample(description, kind) {
  const entry = entryFor(description);
  if (!entry || !entry.answers || !(kind in entry.answers)) return undefined;
  return JSON.parse(JSON.stringify(entry.answers[kind]));
}

/**
 * While recording (RECORD_EXAMPLE_IDEAS=1), keep a real answer for an idea on
 * the example list and write the file. Never changes anything otherwise.
 */
export function recordExample(description, kind, value) {
  if (process.env.RECORD_EXAMPLE_IDEAS !== '1') return;
  const entry = entryFor(description);
  if (!entry) return;
  entry.answers = entry.answers || {};
  entry.answers[kind] = JSON.parse(JSON.stringify(value));
  store.recordedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(FILE, JSON.stringify(store, null, 1) + '\n');
}

/** For tests: drop the loaded copy so the next read sees the file again. */
export function _resetExampleStore() { store = null; }
