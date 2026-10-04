/**
 * The author gate, swept (cause 4 of docs/ARCHITECTURE-REVIEW-2026-10.md,
 * eighth pass, 2026-10-03). CLAUDE.md's rule: "a new round shape that names
 * an author must go through the same gate" (a student's words never reach
 * the projector with a name on them without a teacher review step).
 *
 * The detector in engine/review-gate.js reads the rounds; this runs it over
 * every built-in and every golden plan the compiler builds, and fails on a
 * round that names the author straight after its collect unless the
 * built-in is in ALLOWED with the reason (the validator says the same as
 * advice on those). First run: the detector looked for `_current.playerName`
 * only, while a round may read the author as `_current.name` (Doodle
 * Bluff's rounds do; its gate was already there).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { ungatedRounds, namesAuthor } from '../../engine/review-gate.js';
import '../../engine/transitions.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const ROOT = new URL('../../', import.meta.url);

// Built-ins whose rounds name each author after a transition card: the
// validator carries AUTHOR_UNGATED as advice on each (the diagnostics
// snapshot lists them); the owner has not asked for a gate on them.
const ALLOWED = {
  'class-quiz-showdown': 'the quiz names each question\'s author; advice since 2026-09-27',
  'convince-me': 'advice since 2026-09-27',
  'emoji-movies': 'advice since 2026-09-27',
  'excuse-machine': 'advice since 2026-09-26',
  'last-one-standing': 'advice since 2026-09-27',
  'two-truths-a-lie': 'advice since 2026-09-27'
};

describe('namesAuthor reads both name fields and any field', () => {
  it('playerName, name, in a message, a template, or an item template', () => {
    expect(namesAuthor({ type: 'foreach', subPhases: { s: { type: 'announce', message: '{{_current.playerName}} asks' } } })).toBe(true);
    expect(namesAuthor({ type: 'foreach', subPhases: { s: { type: 'reveal', template: '**{{_current.name}}**: {{_current.text}}' } } })).toBe(true);
    expect(namesAuthor({ type: 'foreach', subPhases: { s: { type: 'reveal-one', itemTemplate: '{{ _current.name }} drew it' } } })).toBe(true);
    expect(namesAuthor({ type: 'foreach', subPhases: { s: { type: 'announce', message: '{{_current.text}}' } } })).toBe(false);
    expect(namesAuthor({ type: 'foreach', candidateSource: 'players', subPhases: {} })).toBe(true);
  });
});

describe('every built-in that names an author in a round is gated, or says why not', () => {
  const games = readdirSync(new URL('games/', ROOT)).filter(d => !d.startsWith('_') && existsSync(new URL(`games/${d}/config.json`, ROOT)));
  for (const id of games) {
    it(`${id}`, () => {
      const config = JSON.parse(readFileSync(new URL(`games/${id}/config.json`, ROOT), 'utf8'));
      const pairs = ungatedRounds(config);
      if (ALLOWED[id]) {
        expect(pairs.length, `${id} is in ALLOWED but its rounds are gated now; drop it from the map`).toBeGreaterThan(0);
        return;
      }
      expect(pairs, `${id}: these rounds name the author straight after the collect with no teacher review step`).toEqual([]);
    });
  }

  it('every ALLOWED entry is a built-in', () => {
    for (const id of Object.keys(ALLOWED)) expect(games.includes(id), `${id} is not a built-in`).toBe(true);
  });
});

describe('every golden plan the compiler builds gates the rounds that name an author', () => {
  const golden = JSON.parse(readFileSync(new URL('tests/designer/golden-prompts.json', ROOT), 'utf8'));
  const plans = (golden.prompts || []).filter(p => p.expect && p.expect.storyboard);
  it('finds plans to compile', () => { expect(plans.length).toBeGreaterThan(30); });
  for (const p of plans) {
    it(`${p.id}`, () => {
      const { config, problems } = S.compileStoryboard(p.expect.storyboard);
      expect(problems).toEqual([]);
      expect(ungatedRounds(config), `${p.id}: a round names the author with no review step before it`).toEqual([]);
    });
  }
});
