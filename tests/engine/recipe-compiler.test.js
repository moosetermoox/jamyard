/**
 * Tests for engine/recipe-compiler.js — type coercion, defaults,
 * placeholder substitution, end-to-end compilation.
 */

import { describe, it, expect } from 'vitest';
import {
  compileRecipe,
  carryRecipeStamp,
  coerceParams,
  applyDefaults
} from '../../engine/recipe-compiler.js';

// =======================================================================
// Coercion (form-string inputs → declared types)
// =======================================================================

describe('coerceParams — form-string to declared type', () => {
  const recipe = {
    parameters: {
      n: { type: 'integer' },
      b: { type: 'boolean' },
      s: { type: 'string' },
      list: { type: 'array', item: { type: 'integer' } }
    }
  };

  it('coerces "30" → 30 for integer fields', () => {
    expect(coerceParams(recipe, { n: '30' })).toEqual({ n: 30 });
  });

  it('coerces "-5" → -5 for integer fields', () => {
    expect(coerceParams(recipe, { n: '-5' })).toEqual({ n: -5 });
  });

  it('leaves "abc" alone for integer fields (validator will reject)', () => {
    expect(coerceParams(recipe, { n: 'abc' })).toEqual({ n: 'abc' });
  });

  it('coerces "true"/"false" → boolean', () => {
    expect(coerceParams(recipe, { b: 'true' })).toEqual({ b: true });
    expect(coerceParams(recipe, { b: 'false' })).toEqual({ b: false });
  });

  it('leaves strings alone for string fields', () => {
    expect(coerceParams(recipe, { s: 'hello' })).toEqual({ s: 'hello' });
  });

  it('coerces array item types recursively', () => {
    expect(coerceParams(recipe, { list: ['1', '2', '3'] })).toEqual({ list: [1, 2, 3] });
  });

  it('passes through unknown params unchanged', () => {
    const out = coerceParams(recipe, { unknown: 'value' });
    expect(out.unknown).toBe('value');
  });

  it('does not coerce empty string (leaves for required-check)', () => {
    expect(coerceParams(recipe, { n: '' })).toEqual({ n: '' });
  });
});

// =======================================================================
// Defaults
// =======================================================================

describe('applyDefaults', () => {
  const recipe = {
    parameters: {
      timer: { type: 'integer', default: 60 },
      style: { type: 'string', default: 'simple' },
      list: { type: 'array', default: ['a', 'b'] },
      provided: { type: 'string', default: 'never used' }
    }
  };

  it('fills in missing values from spec defaults', () => {
    expect(applyDefaults(recipe, {})).toEqual({
      timer: 60,
      style: 'simple',
      list: ['a', 'b'],
      provided: 'never used'
    });
  });

  it('does not override values the caller provided', () => {
    const out = applyDefaults(recipe, { timer: 30, provided: 'used' });
    expect(out.timer).toBe(30);
    expect(out.provided).toBe('used');
    // Non-provided params still get defaults
    expect(out.style).toBe('simple');
  });

  it('deep-clones array/object defaults so mutation does not affect the recipe', () => {
    const out = applyDefaults(recipe, {});
    out.list.push('mutated!');
    expect(recipe.parameters.list.default).toEqual(['a', 'b']);
  });

  it('leaves params with no default + no value undefined', () => {
    const r = { parameters: { x: { type: 'string' } } };
    const out = applyDefaults(r, {});
    expect('x' in out).toBe(false);
  });

  it('does not mutate the input params object', () => {
    const params = {};
    applyDefaults(recipe, params);
    expect(params).toEqual({});
  });
});

// =======================================================================
// Substitution — the core compile step
// =======================================================================

describe('compileRecipe — whole-string substitution preserves type', () => {
  it('preserves array type when "${name}" is the entire value', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { items: { type: 'array', item: { type: 'string' } } },
      template: { choices: '${items}' }
    };
    const { config } = compileRecipe(recipe, { items: ['A', 'B', 'C'] });
    expect(config.choices).toEqual(['A', 'B', 'C']); // array, not string
  });

  it('preserves number type when "${name}" is the entire value', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { n: { type: 'integer' } },
      template: { timer: '${n}' }
    };
    const { config } = compileRecipe(recipe, { n: 60 });
    expect(config.timer).toBe(60); // number, not string "60"
    expect(typeof config.timer).toBe('number');
  });

  it('preserves boolean type', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { b: { type: 'boolean' } },
      template: { enabled: '${b}' }
    };
    const { config } = compileRecipe(recipe, { b: true });
    expect(config.enabled).toBe(true);
    expect(typeof config.enabled).toBe('boolean');
  });
});

describe('compileRecipe — embedded interpolation', () => {
  it('interpolates strings into surrounding text', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { who: { type: 'string' } },
      template: { greeting: 'Hello, ${who}!' }
    };
    const { config } = compileRecipe(recipe, { who: 'class' });
    expect(config.greeting).toBe('Hello, class!');
  });

  it('handles multiple placeholders in one string', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { a: { type: 'string' }, b: { type: 'string' } },
      template: { msg: '${a} and ${b} together' }
    };
    const { config } = compileRecipe(recipe, { a: 'tea', b: 'coffee' });
    expect(config.msg).toBe('tea and coffee together');
  });

  it('handles same placeholder appearing twice', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { word: { type: 'string' } },
      template: { msg: '${word} ${word} ${word}' }
    };
    const { config } = compileRecipe(recipe, { word: 'go' });
    expect(config.msg).toBe('go go go');
  });

  it('stringifies numbers in interpolated context', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { n: { type: 'integer' } },
      template: { msg: 'Round ${n}' }
    };
    const { config } = compileRecipe(recipe, { n: 3 });
    expect(config.msg).toBe('Round 3');
  });

  it('joins arrays with comma in interpolated context', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { list: { type: 'array', item: { type: 'string' } } },
      template: { msg: 'Items: ${list}' }
    };
    const { config } = compileRecipe(recipe, { list: ['a', 'b', 'c'] });
    expect(config.msg).toBe('Items: a, b, c');
  });
});

describe('compileRecipe — recursion', () => {
  it('substitutes inside nested objects', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { q: { type: 'string' } },
      template: {
        phases: {
          collect: { type: 'collect', prompt: '${q}' }
        }
      }
    };
    const { config } = compileRecipe(recipe, { q: 'How are you?' });
    expect(config.phases.collect.prompt).toBe('How are you?');
  });

  it('substitutes inside array elements', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { word: { type: 'string' } },
      template: { list: ['plain', '${word}', 'plain'] }
    };
    const { config } = compileRecipe(recipe, { word: 'middle' });
    expect(config.list).toEqual(['plain', 'middle', 'plain']);
  });

  it('substitutes inside object KEYS (lets recipes generate phase IDs)', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { prefix: { type: 'string' } },
      template: {
        phases: {
          '${prefix}-vote': { type: 'vote' }
        }
      }
    };
    const { config } = compileRecipe(recipe, { prefix: 'round1' });
    expect(config.phases['round1-vote']).toBeDefined();
    expect(config.phases['${prefix}-vote']).toBeUndefined();
  });

  it('preserves null and other primitives unchanged', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: {},
      template: { a: null, b: 42, c: true, d: 'plain' }
    };
    const { config } = compileRecipe(recipe, {});
    expect(config).toEqual({
      a: null, b: 42, c: true, d: 'plain',
      recipe: { id: 'x', version: '1', params: {} }
    });
  });
});

describe('compileRecipe — error paths', () => {
  it('returns null config + error diagnostic when params invalid', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { q: { type: 'string', required: true } },
      template: { prompt: '${q}' }
    };
    const result = compileRecipe(recipe, {});
    expect(result.config).toBeNull();
    expect(result.diagnostics.some(d => d.code === 'PARAM_MISSING_REQUIRED')).toBe(true);
  });

  it('returns error when recipe references unknown placeholder', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: {},
      template: { msg: 'Hello ${nonexistent}' }
    };
    const result = compileRecipe(recipe, {});
    expect(result.config).toBeNull();
    expect(result.diagnostics.some(d => d.message.includes('nonexistent'))).toBe(true);
  });
});

describe('compileRecipe — defaults applied before validation', () => {
  it('compiles when teacher relies on default value', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: {
        timer: { type: 'integer', default: 60, min: 10, max: 600 }
      },
      template: { wait: '${timer}' }
    };
    const { config, diagnostics } = compileRecipe(recipe, {});
    expect(diagnostics).toEqual([]);
    expect(config.wait).toBe(60);
  });
});

describe('compileRecipe — form-string coercion before validation', () => {
  it('accepts string "30" for an integer param (HTML form input case)', () => {
    const recipe = {
      id: 'x', name: 'x', description: 'x',
      parameters: { n: { type: 'integer', min: 1, max: 100 } },
      template: { value: '${n}' }
    };
    const { config, diagnostics } = compileRecipe(recipe, { n: '30' });
    expect(diagnostics).toEqual([]);
    expect(config.value).toBe(30);
  });
});

// =======================================================================
// Provenance stamp
// =======================================================================

describe('compileRecipe — provenance stamp', () => {
  const recipe = {
    id: 'my-recipe', name: 'x', description: 'x', version: '3',
    parameters: {
      q: { type: 'string' },
      timer: { type: 'integer', default: 60, min: 10, max: 600 },
      items: { type: 'array', item: { type: 'string' } }
    },
    template: { phases: { collect: { type: 'collect', prompt: '${q}' } } }
  };

  it('stamps recipe id, version, and normalized params', () => {
    const { config } = compileRecipe(recipe, { q: 'Hi', items: ['a', 'b'] });
    expect(config.recipe).toEqual({
      id: 'my-recipe',
      version: '3',
      params: { q: 'Hi', timer: 60, items: ['a', 'b'] }
    });
  });

  it('defaults version to "1" when the recipe has none', () => {
    const bare = { ...recipe, version: undefined };
    const { config } = compileRecipe(bare, { q: 'Hi' });
    expect(config.recipe.version).toBe('1');
  });

  it('stamp params are materialized post-defaults and post-coercion', () => {
    const { config } = compileRecipe(recipe, { q: 'Hi', timer: '45' });
    expect(config.recipe.params.timer).toBe(45);
  });

  it('stamp params are an isolated deep copy', () => {
    const params = { q: 'Hi', items: ['a', 'b'] };
    const { config } = compileRecipe(recipe, params);
    config.recipe.params.items.push('c');
    expect(params.items).toEqual(['a', 'b']);
  });

  it('overwrites a template-authored recipe key (no spoofing)', () => {
    const spoofing = {
      ...recipe,
      template: { recipe: { id: 'fake', params: {} }, phases: recipe.template.phases }
    };
    const { config } = compileRecipe(spoofing, { q: 'Hi' });
    expect(config.recipe.id).toBe('my-recipe');
  });
});

describe('carryRecipeStamp — revise round-trip protection', () => {
  it('copies a well-formed stamp onto the revised config', () => {
    const from = { recipe: { id: 'r', version: '1', params: { n: 2 } } };
    const to = { phases: {} };
    carryRecipeStamp(from, to);
    expect(to.recipe).toEqual(from.recipe);
    expect(to.recipe).not.toBe(from.recipe);
  });

  it('does nothing without a stamp or with a malformed one', () => {
    const to = { phases: {} };
    carryRecipeStamp({}, to);
    carryRecipeStamp({ recipe: 'bogus' }, to);
    carryRecipeStamp({ recipe: { params: {} } }, to);
    expect(to.recipe).toBeUndefined();
  });

  it('tolerates a null revised config', () => {
    expect(() => carryRecipeStamp({ recipe: { id: 'r' } }, null)).not.toThrow();
  });
});
