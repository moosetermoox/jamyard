/**
 * The Create page's example ideas are answered ahead of time
 * (engine/example-ideas.js, 2026-10-04). These tests keep the stored answers
 * honest: one entry per example button, every answer recorded, every pick
 * pointing at a recipe or activity that exists and compiles, every plan
 * compiling clean, and nothing used outside real mode.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeIdea, storedExample, exampleIdeas, _resetExampleStore } from '../../engine/example-ideas.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';
import { AIService } from '../../services/ai-service.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const store = JSON.parse(read('engine/example-ideas.json'));
const recipes = Object.fromEntries(readdirSync(new URL('../../recipes', import.meta.url)).filter(f => f.endsWith('.json')).map(f => {
  const r = JSON.parse(read('recipes/' + f)); return [r.id, r];
}));
const games = new Set(readdirSync(new URL('../../games', import.meta.url)).filter(g => !g.startsWith('_')));

beforeEach(() => _resetExampleStore());

describe('the stored examples match the page', () => {
  it('one entry per "Try one of these" button, same words', () => {
    const html = read('screens/designer/index.html');
    const chips = [...html.matchAll(/class="idea-example-chip" type="button">([^<]+)</g)].map(m => m[1].replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&'));
    expect(chips.length).toBeGreaterThan(0);
    expect(exampleIdeas()).toEqual(chips);
  });
  it('every example has its questions and the matcher\'s pick recorded', () => {
    for (const e of store.examples) {
      expect(e.answers && e.answers.questions, e.idea).toBeTruthy();
      expect(e.answers.match, e.idea).toBeTruthy();
    }
    expect(store.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('every stored answer still builds', () => {
  for (const e of store.examples) {
    it(e.idea, () => {
      for (const [kind, ans] of Object.entries(e.answers)) {
        if (kind === 'questions') {
          expect(Array.isArray(ans.questions)).toBe(true);
          expect(ans.questions.length).toBeLessThanOrEqual(2);
          continue;
        }
        if (kind === 'storyboard') {
          const { config, problems } = S.compileStoryboard(ans);
          expect(problems, kind).toEqual([]);
          expect(validate(config, 'example', { returnResults: true }).errors, kind).toEqual([]);
          continue;
        }
        // match or forced:<id>: a recipe that compiles with these params, a real activity, or a hand-off
        if (ans.recipe) {
          expect(recipes[ans.recipe], `${kind} recipe ${ans.recipe}`).toBeTruthy();
          const { config, diagnostics } = compileRecipe(recipes[ans.recipe], ans.params || {});
          expect((diagnostics || []).filter(d => d.severity === 'error'), kind).toEqual([]);
          expect(config && config.phases).toBeTruthy();
        } else if (ans.game) {
          expect(games.has(ans.game), `${kind} game ${ans.game}`).toBe(true);
        } else {
          expect(ans.noMatch, kind).toBe(true);
        }
      }
    });
  }
});

describe('using them', () => {
  it('an example matches with any case, spacing, or end punctuation, and comes back as a copy', () => {
    const idea = store.examples[0].idea;
    expect(normalizeIdea('  ' + idea.toUpperCase().replace(/ /g, '  ') + '.')).toBe(normalizeIdea(idea));
    const a = storedExample(idea + '!', 'match');
    expect(a).toEqual(store.examples[0].answers.match);
    a.mutated = true;
    expect(storedExample(idea, 'match').mutated).toBeUndefined();
  });
  it('any other idea, or a kind never recorded, has no stored answer', () => {
    expect(storedExample('A quick poll before lunch about pizza', 'match')).toBeUndefined();
    expect(storedExample(store.examples[0].idea, 'forced:not-a-recipe')).toBeUndefined();
  });
  it('the real-mode calls answer an example without the model', async () => {
    const service = new AIService({ mode: 'real' });
    let calls = 0;
    service._callClaude = async () => { calls++; throw new Error('should not be called'); };
    const idea = store.examples[1].idea;
    const q = await service.generateIdeaQuestions(idea);
    const m = await service.matchRecipe(idea, Object.values(recipes), {});
    expect(calls).toBe(0);
    expect(q).toEqual(store.examples[1].answers.questions);
    expect(m.recipe || m.game || m.noMatch).toBeTruthy();
  });
  it('mock mode never uses them (tests and pretend rooms run as before)', async () => {
    const service = new AIService();
    const idea = store.examples[1].idea;
    expect(await service.generateIdeaQuestions(idea)).toEqual({ questions: [] });
  });
  it('no golden prompt is an example (the Create eval must measure the live prompts)', () => {
    const golden = JSON.parse(read('tests/designer/golden-prompts.json')).prompts;
    const examples = new Set(exampleIdeas().map(normalizeIdea));
    expect(golden.filter(p => examples.has(normalizeIdea(p.prompt))).map(p => p.id)).toEqual([]);
  });
  it('recording is off unless RECORD_EXAMPLE_IDEAS=1', () => {
    expect(read('engine/example-ideas.js')).toContain("process.env.RECORD_EXAMPLE_IDEAS !== '1'");
  });
});
