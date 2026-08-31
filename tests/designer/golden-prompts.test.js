/**
 * Golden-prompt corpus — the deterministic half of the one-shot guarantee.
 *
 * For every prompt in tests/designer/golden-prompts.json, prove the expected
 * deliverable is deliverable TODAY, with no AI involved:
 *   - host       → the built-in game exists and validates clean
 *   - recipe     → the recipe exists, compiles with defaults (+ entry params)
 *                  to a config that validates clean
 *   - storyboard → the reference brick realization compiles with zero
 *                  problems to a config that validates clean
 *   - cantBuild  → the gap is documented with a reason (honesty on record)
 *
 * The AI half (does the matcher actually CHOOSE these?) is not CI-provable;
 * run scripts/eval-designer-prompts.js before and after touching a matcher
 * or storyboard prompt and diff the two reports.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { validate } from '../../engine/game-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import '../../screens/shared/step-suggestions.js';

const ROOT = new URL('../..', import.meta.url);
const S = globalThis.StepSuggestions;

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

/** Recipe defaults merged with the corpus entry's explicit params. */
function paramsFor(recipe, explicit) {
  const params = {};
  for (const [name, spec] of Object.entries(recipe.parameters || {})) {
    if (spec && spec.default !== undefined) params[name] = spec.default;
  }
  return { ...params, ...(explicit || {}) };
}

function expectValid(config, gameId, label) {
  const { errors } = validate(config, gameId, { returnResults: true });
  expect(errors, `${label} must validate clean`).toEqual([]);
}

const corpus = await loadJson('tests/designer/golden-prompts.json');

describe('golden prompts: every expected deliverable is deliverable', () => {
  for (const entry of corpus.prompts) {
    const kind = entry.expect && entry.expect.kind;

    it(`${entry.id} (${kind})`, async () => {
      expect(typeof entry.prompt, 'prompt text').toBe('string');
      expect(entry.prompt.length).toBeGreaterThan(20);

      if (kind === 'host') {
        const config = await loadJson(`games/${entry.expect.game}/config.json`);
        expectValid(config, entry.expect.game, `game "${entry.expect.game}"`);
        return;
      }

      if (kind === 'recipe') {
        const recipe = await loadJson(`recipes/${entry.expect.recipe}.json`);
        const params = paramsFor(recipe, entry.expect.params);
        const { config, diagnostics } = compileRecipe(recipe, params);
        const errors = diagnostics.filter(d => d.severity === 'error');
        expect(errors, `recipe "${entry.expect.recipe}" must compile clean`).toEqual([]);
        expectValid(config, entry.expect.recipe, `recipe "${entry.expect.recipe}" compile`);
        return;
      }

      if (kind === 'storyboard') {
        const { config, problems } = S.compileStoryboard(entry.expect.storyboard);
        expect(problems, `storyboard "${entry.id}" must compile clean`).toEqual([]);
        expectValid(
          { name: entry.expect.storyboard.name, description: entry.expect.storyboard.description || 'golden prompt', phases: config.phases },
          entry.id, `storyboard "${entry.id}"`
        );
        return;
      }

      if (kind === 'cantBuild') {
        expect(typeof entry.expect.reason, 'cantBuild entries must document why').toBe('string');
        expect(entry.expect.reason.length).toBeGreaterThan(10);
        return;
      }

      throw new Error(`${entry.id}: unknown expect.kind "${kind}"`);
    });
  }
});
