/**
 * End-to-end recipe tests:
 *   - Every shipped recipe in recipes/ is well-formed.
 *   - Every shipped recipe compiles cleanly with sensible sample params.
 *   - Every compiled config passes the game-loader validator.
 *
 * This is the recipe layer's safety net. A recipe that passes these
 * tests cannot ship a broken game. If a teacher fills in valid params,
 * the compiler will produce a valid game config — guaranteed.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateRecipe } from '../../engine/recipe-schema.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', '..', 'recipes');

// =======================================================================
// Helpers — build sensible sample params for any recipe.
// =======================================================================

/**
 * Auto-generate a plausible params object for a recipe based on its
 * parameter spec. Used to smoke-test that every recipe compiles.
 */
function buildSampleParams(recipe) {
  const params = {};
  for (const [name, spec] of Object.entries(recipe.parameters || {})) {
    if (spec.default !== undefined) continue; // let default kick in
    if (!spec.required) continue;             // optional, skip
    params[name] = sampleForType(spec);
  }
  return params;
}

function sampleForType(spec) {
  switch (spec.type) {
    case 'string':
    case 'templateString':
      return spec.minLength ? 'x'.repeat(spec.minLength) : 'sample';
    case 'integer':
      return spec.min ?? 1;
    case 'boolean':
      return false;
    case 'enum':
      return spec.values[0];
    case 'array': {
      const minItems = spec.minItems ?? 1;
      const sampleItem = spec.item ? sampleForType(spec.item) : 'item';
      return Array(minItems).fill(sampleItem);
    }
    default:
      return null;
  }
}

// =======================================================================
// Recipe loading + smoke-test
// =======================================================================

async function loadRecipeFiles() {
  const entries = await readdir(RECIPES_DIR);
  const recipes = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const raw = await readFile(join(RECIPES_DIR, entry), 'utf-8');
    const parsed = JSON.parse(raw);
    recipes.push({ filename: entry, recipe: parsed });
  }
  return recipes;
}

describe('shipped recipes — files validate', () => {
  it('every recipe file is well-formed', async () => {
    const recipes = await loadRecipeFiles();
    expect(recipes.length).toBeGreaterThan(0);
    for (const { filename, recipe } of recipes) {
      const diags = validateRecipe(recipe);
      const errors = diags.filter(d => d.severity === 'error');
      if (errors.length) {
        throw new Error(
          `${filename} has validation errors:\n  ` +
            errors.map(d => `${d.path || ''} ${d.message}`).join('\n  ')
        );
      }
    }
  });

  it('every recipe id matches its filename', async () => {
    const recipes = await loadRecipeFiles();
    for (const { filename, recipe } of recipes) {
      const expectedId = filename.replace(/\.json$/, '');
      expect(recipe.id, `${filename} declares id "${recipe.id}"`).toBe(expectedId);
    }
  });
});

describe('shipped recipes — compile + validate', () => {
  it('every recipe compiles with sample params + produces a valid game config', async () => {
    const recipes = await loadRecipeFiles();
    for (const { filename, recipe } of recipes) {
      const params = buildSampleParams(recipe);
      const { config, diagnostics } = compileRecipe(recipe, params);
      const errors = diagnostics.filter(d => d.severity === 'error');

      if (!config || errors.length) {
        throw new Error(
          `${filename} failed to compile with sample params ${JSON.stringify(params)}:\n  ` +
            errors.map(d => d.message).join('\n  ')
        );
      }

      const result = validate(config, recipe.id, { returnResults: true });
      if (result.errors.length) {
        throw new Error(
          `${filename} compiled but produced an invalid game config:\n  ` +
            result.errors.map(e => typeof e === 'string' ? e : e.message).join('\n  ')
        );
      }
    }
  });
});

// =======================================================================
// class-poll specific tests — the canary recipe.
// =======================================================================

describe('recipes/class-poll.json — golden output', () => {
  let recipe;

  it('loads', async () => {
    recipe = JSON.parse(
      await readFile(join(RECIPES_DIR, 'class-poll.json'), 'utf-8')
    );
    expect(recipe.id).toBe('class-poll');
  });

  it('compiles to expected phase shape with full params', () => {
    const { config, diagnostics } = compileRecipe(recipe, {
      question: 'How are you?',
      choices: ['Great', 'Okay', 'Not great'],
      timer: 90
    });

    expect(diagnostics).toEqual([]);
    expect(config.name).toBe('Poll: How are you?');
    expect(config.phases.lobby.next).toBe('ask');
    expect(config.phases.ask.type).toBe('collect-choice');
    expect(config.phases.ask.prompt).toBe('How are you?');
    expect(config.phases.ask.choices).toEqual(['Great', 'Okay', 'Not great']);
    expect(config.phases.ask.timer).toBe(90);
    expect(config.phases.results.template).toContain('How are you?');
    expect(config.phases.results.template).toContain('{{ask.barChart}}');
    expect(config.phases.end.type).toBe('end');
  });

  it('uses default timer (60) when not provided', () => {
    const { config } = compileRecipe(recipe, {
      question: 'Quick question?',
      choices: ['Yes', 'No']
    });
    expect(config.phases.ask.timer).toBe(60);
  });

  it('uses default choices when not provided', () => {
    const { config } = compileRecipe(recipe, { question: 'Comprehension check?' });
    expect(config.phases.ask.choices).toEqual([
      'Got it!', 'Mostly got it', 'A little confused', 'Lost'
    ]);
  });

  it('rejects too-short question', () => {
    const result = compileRecipe(recipe, { question: 'q', choices: ['A', 'B'] });
    expect(result.config).toBeNull();
    expect(result.diagnostics.some(d => d.code === 'PARAM_STRING_TOO_SHORT')).toBe(true);
  });

  it('rejects fewer than 2 choices', () => {
    const result = compileRecipe(recipe, {
      question: 'How are you?',
      choices: ['One']
    });
    expect(result.config).toBeNull();
    expect(result.diagnostics.some(d => d.code === 'PARAM_ARRAY_TOO_SHORT')).toBe(true);
  });

  it('rejects more than 8 choices', () => {
    const result = compileRecipe(recipe, {
      question: 'Pick one?',
      choices: ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    });
    expect(result.config).toBeNull();
    expect(result.diagnostics.some(d => d.code === 'PARAM_ARRAY_TOO_LONG')).toBe(true);
  });

  it('rejects timer outside the 10-600 range', () => {
    const tooLow = compileRecipe(recipe, {
      question: 'Q?',
      choices: ['A', 'B'],
      timer: 5
    });
    expect(tooLow.diagnostics.some(d => d.code === 'PARAM_INVALID_INTEGER_RANGE')).toBe(true);

    const tooHigh = compileRecipe(recipe, {
      question: 'Q?',
      choices: ['A', 'B'],
      timer: 1000
    });
    expect(tooHigh.diagnostics.some(d => d.code === 'PARAM_INVALID_INTEGER_RANGE')).toBe(true);
  });
});
