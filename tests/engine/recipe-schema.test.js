/**
 * Tests for engine/recipe-schema.js — validates recipe files and
 * teacher-submitted parameter values.
 */

import { describe, it, expect } from 'vitest';
import {
  validateRecipe,
  validateParams,
  RECIPE_DIAGNOSTIC_CODES
} from '../../engine/recipe-schema.js';

const codes = RECIPE_DIAGNOSTIC_CODES;

function codeSet(diags) {
  return [...new Set(diags.map(d => d.code))].sort();
}

// =======================================================================
// validateRecipe — recipe file shape
// =======================================================================

describe('validateRecipe — well-formed recipes', () => {
  it('accepts a minimal valid recipe', () => {
    const recipe = {
      id: 'minimal',
      name: 'Minimal',
      description: 'tiny',
      parameters: {},
      template: { phases: {} }
    };
    expect(validateRecipe(recipe)).toEqual([]);
  });

  it('accepts a recipe with all optional fields', () => {
    const recipe = {
      id: 'full',
      name: 'Full',
      icon: '📊',
      description: 'all the fields',
      tagline: 'perfect for…',
      version: '1',
      parameters: {
        q: { type: 'templateString', required: true, label: 'Question' },
        n: { type: 'integer', min: 1, max: 100, default: 10 },
        c: { type: 'array', item: { type: 'string' }, minItems: 2, maxItems: 8 },
        m: { type: 'enum', values: ['a', 'b', 'c'] },
        b: { type: 'boolean', default: false }
      },
      template: { phases: {} }
    };
    expect(validateRecipe(recipe)).toEqual([]);
  });
});

describe('validateRecipe — malformed recipes', () => {
  it('rejects null', () => {
    expect(codeSet(validateRecipe(null))).toContain(codes.RECIPE_INVALID_FIELD_TYPE);
  });

  it('rejects an array', () => {
    expect(codeSet(validateRecipe([]))).toContain(codes.RECIPE_INVALID_FIELD_TYPE);
  });

  it('flags every missing top-level field', () => {
    const diags = validateRecipe({});
    const messages = diags.map(d => d.message);
    expect(messages).toContain('Recipe is missing required field "id".');
    expect(messages).toContain('Recipe is missing required field "name".');
    expect(messages).toContain('Recipe is missing required field "description".');
    expect(messages).toContain('Recipe is missing required field "parameters".');
    expect(messages).toContain('Recipe is missing required field "template".');
  });

  it('rejects non-object template', () => {
    const diags = validateRecipe({
      id: 'x', name: 'x', description: 'x', parameters: {}, template: 'not an object'
    });
    expect(codeSet(diags)).toContain(codes.RECIPE_TEMPLATE_MISSING);
  });

  it('rejects non-string id/name/description', () => {
    const diags = validateRecipe({
      id: 1, name: true, description: [], parameters: {}, template: {}
    });
    const fields = diags.filter(d => d.code === codes.RECIPE_INVALID_FIELD_TYPE).map(d => d.field);
    expect(fields).toContain('id');
    expect(fields).toContain('name');
    expect(fields).toContain('description');
  });
});

describe('validateRecipe — parameter spec checks', () => {
  function buildRecipe(parameters) {
    return { id: 'x', name: 'x', description: 'x', parameters, template: {} };
  }

  it('rejects parameter without a type', () => {
    const diags = validateRecipe(buildRecipe({ q: { label: 'No type' } }));
    expect(codeSet(diags)).toContain(codes.RECIPE_INVALID_PARAM_SPEC);
  });

  it('rejects unknown parameter type', () => {
    const diags = validateRecipe(buildRecipe({ q: { type: 'date' } }));
    expect(diags.some(d => d.message.includes('unknown type "date"'))).toBe(true);
  });

  it('rejects enum without values array', () => {
    const diags = validateRecipe(buildRecipe({ q: { type: 'enum' } }));
    expect(diags.some(d => d.message.includes('non-empty "values" array'))).toBe(true);
  });

  it('rejects enum with empty values array', () => {
    const diags = validateRecipe(buildRecipe({ q: { type: 'enum', values: [] } }));
    expect(diags.some(d => d.message.includes('non-empty "values" array'))).toBe(true);
  });

  it('rejects integer with non-numeric min/max', () => {
    const diags = validateRecipe(buildRecipe({ q: { type: 'integer', min: 'low' } }));
    expect(diags.some(d => d.message.includes('must be a number'))).toBe(true);
  });

  it('recursively validates array.item spec', () => {
    const diags = validateRecipe(buildRecipe({
      list: { type: 'array', item: { type: 'date' } }
    }));
    expect(diags.some(d => d.message.includes('unknown type "date"'))).toBe(true);
  });
});

describe('validateRecipe — setup flags (Customize knobs)', () => {
  function buildRecipe(parameters) {
    return { id: 'x', name: 'x', description: 'x', parameters, template: {} };
  }

  it('accepts setup: true on integer, boolean, and enum params', () => {
    const diags = validateRecipe(buildRecipe({
      timer: { type: 'integer', setup: true },
      bonus: { type: 'boolean', setup: true },
      style: { type: 'enum', values: ['a', 'b'], setup: true }
    }));
    expect(diags).toEqual([]);
  });

  it('accepts a count setup object on array params, label optional', () => {
    const diags = validateRecipe(buildRecipe({
      items: { type: 'array', item: { type: 'string' }, setup: { mode: 'count' } },
      more: { type: 'array', item: { type: 'string' }, setup: { mode: 'count', label: 'How many' } }
    }));
    expect(diags).toEqual([]);
  });

  it('rejects setup: true on free-text and array params', () => {
    for (const spec of [
      { type: 'string', setup: true },
      { type: 'templateString', setup: true },
      { type: 'promptDeck', setup: true },
      { type: 'array', item: { type: 'string' }, setup: true }
    ]) {
      const diags = validateRecipe(buildRecipe({ q: spec }));
      expect(codeSet(diags)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
    }
  });

  it('rejects a setup object on non-array params', () => {
    const diags = validateRecipe(buildRecipe({
      timer: { type: 'integer', setup: { mode: 'count' } }
    }));
    expect(codeSet(diags)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
  });

  it('rejects setup modes other than "count" and bad labels', () => {
    const badMode = validateRecipe(buildRecipe({
      items: { type: 'array', item: { type: 'string' }, setup: { mode: 'pick' } }
    }));
    expect(codeSet(badMode)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
    const badLabel = validateRecipe(buildRecipe({
      items: { type: 'array', item: { type: 'string' }, setup: { mode: 'count', label: 7 } }
    }));
    expect(codeSet(badLabel)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
  });

  it('rejects non-boolean, non-object setup values', () => {
    const diags = validateRecipe(buildRecipe({
      timer: { type: 'integer', setup: 'yes' }
    }));
    expect(codeSet(diags)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
  });
});

// =======================================================================
// validateParams — teacher-submitted parameter values
// =======================================================================

const sampleRecipe = {
  id: 'sample',
  name: 'Sample',
  description: 'Sample',
  parameters: {
    question: { type: 'templateString', required: true, label: 'Question', minLength: 3, maxLength: 100 },
    choices:  { type: 'array', item: { type: 'string' }, minItems: 2, maxItems: 5 },
    timer:    { type: 'integer', min: 10, max: 600 },
    style:    { type: 'enum', values: ['simple', 'rich'] },
    show:     { type: 'boolean' }
  },
  template: { phases: {} }
};

describe('validateParams — required + types', () => {
  it('accepts well-formed params', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'What is your name?',
      choices: ['Alice', 'Bob'],
      timer: 60,
      style: 'simple',
      show: true
    });
    expect(diags).toEqual([]);
  });

  it('flags missing required parameter', () => {
    const diags = validateParams(sampleRecipe, { choices: ['a', 'b'] });
    expect(codeSet(diags)).toContain(codes.PARAM_MISSING_REQUIRED);
  });

  it('flags string used where integer expected', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'q?',
      timer: 'sixty'
    });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_TYPE);
  });

  it('flags non-array used where array expected', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'q?',
      choices: 'not-an-array'
    });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_TYPE);
  });

  it('flags float used where integer expected', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', timer: 60.5 });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_TYPE);
  });

  it('flags enum value not in values list', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', style: 'fancy' });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_ENUM_VALUE);
  });

  it('flags non-boolean used where boolean expected', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', show: 'yes' });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_TYPE);
  });
});

describe('validateParams — range checks', () => {
  it('flags integer below min', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', timer: 5 });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_INTEGER_RANGE);
  });

  it('flags integer above max', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', timer: 1000 });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_INTEGER_RANGE);
  });

  it('flags array shorter than minItems', () => {
    const diags = validateParams(sampleRecipe, { question: 'q?', choices: ['only-one'] });
    expect(codeSet(diags)).toContain(codes.PARAM_ARRAY_TOO_SHORT);
  });

  it('flags array longer than maxItems', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'q?',
      choices: ['a', 'b', 'c', 'd', 'e', 'f']
    });
    expect(codeSet(diags)).toContain(codes.PARAM_ARRAY_TOO_LONG);
  });

  it('flags string shorter than minLength', () => {
    const diags = validateParams(sampleRecipe, { question: 'hi' });
    expect(codeSet(diags)).toContain(codes.PARAM_STRING_TOO_SHORT);
  });

  it('flags string longer than maxLength', () => {
    const diags = validateParams(sampleRecipe, { question: 'q'.repeat(101) });
    expect(codeSet(diags)).toContain(codes.PARAM_STRING_TOO_LONG);
  });
});

describe('validateParams — array item validation', () => {
  it('flags array containing wrong-type items', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'q?',
      choices: ['ok', 123]
    });
    expect(codeSet(diags)).toContain(codes.PARAM_INVALID_TYPE);
  });
});

describe('validateParams — unknown params', () => {
  it('warns about unknown params (typo guard)', () => {
    const diags = validateParams(sampleRecipe, {
      question: 'q?',
      questoin: 'typo!'
    });
    expect(codeSet(diags)).toContain(codes.PARAM_UNKNOWN);
    // Warning, not error — unknowns shouldn't block compilation
    expect(diags.find(d => d.code === codes.PARAM_UNKNOWN).severity).toBe('warning');
  });
});

describe('validateParams — non-object input', () => {
  it('rejects null', () => {
    expect(codeSet(validateParams(sampleRecipe, null))).toContain(codes.PARAM_INVALID_TYPE);
  });

  it('rejects array', () => {
    expect(codeSet(validateParams(sampleRecipe, []))).toContain(codes.PARAM_INVALID_TYPE);
  });
});

describe('validateRecipe — valueHelp on enums and setup.writes on text knobs (2026-09-13)', () => {
  const mk = (parameters) => ({ id: 'x', name: 'x', description: 'x', parameters, template: {} });
  it('accepts a helper line per enum value and a writer on a text knob', () => {
    const diags = validateRecipe(mk({
      who: { type: 'enum', values: ['a', 'b'], setup: true, valueHelp: { a: 'A does this', b: 'B does that' } },
      list: { type: 'array', item: { type: 'string' }, setup: { mode: 'lines', showWhen: 'who=a|b' } },
      topic: { type: 'string', setup: { mode: 'text', showWhen: 'who=b', writes: { list: 'list', count: 36, button: 'Write them', then: { who: 'a' } } } }
    }));
    expect(diags).toEqual([]);
  });

  it('rejects valueHelp keys that are not values, non-string lines, and a malformed writes', () => {
    expect(codeSet(validateRecipe(mk({
      who: { type: 'enum', values: ['a', 'b'], valueHelp: { a: 'fine', c: 'not a value' } }
    })))).toContain(codes.RECIPE_INVALID_PARAM_SPEC);
    expect(codeSet(validateRecipe(mk({
      who: { type: 'enum', values: ['a', 'b'], valueHelp: { a: 42 } }
    })))).toContain(codes.RECIPE_INVALID_PARAM_SPEC);
    for (const writes of [{}, { list: 'list', count: 0 }, { list: 'list', then: [] }, 'list']) {
      const diags = validateRecipe(mk({
        topic: { type: 'string', setup: { mode: 'text', writes } }
      }));
      expect(codeSet(diags), JSON.stringify(writes)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
    }
    // writes belongs to text knobs only
    expect(codeSet(validateRecipe(mk({
      list: { type: 'array', item: { type: 'string' }, setup: { mode: 'lines', writes: { list: 'x' } } }
    })))).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
  });
});

describe('validateRecipe — chips per value, tags and list knobs, a scalar behind another knob (2026-09-14)', () => {
  const mk = (parameters) => ({ id: 'x', name: 'x', description: 'x', parameters, template: {} });

  it('accepts valueLabels and valueHelp on enums and booleans, tags with suggestions, a list with tagFrom, and a mode-less scalar setup', () => {
    const diags = validateRecipe(mk({
      how: { type: 'enum', values: ['a', 'b'], setup: true, valueLabels: { a: 'Random', b: 'Students choose' } },
      jobs: { type: 'boolean', setup: true, valueLabels: { true: 'Yes', false: 'No' }, valueHelp: { true: 'One each.' } },
      roles: { type: 'array', item: { type: 'string' }, setup: { mode: 'tags', suggestions: ['Recorder', 'Timekeeper'], showWhen: 'jobs=true' } },
      given: { type: 'enum', values: ['choice', 'random'], setup: { showWhen: 'jobs=true' } },
      tasks: { type: 'array', item: { type: 'string' }, setup: { mode: 'list', tagFrom: 'roles', tagLabel: 'Anyone' } }
    }));
    expect(diags).toEqual([]);
  });

  it('rejects a boolean valueHelp keyed off true/false, and labels that are not strings', () => {
    expect(codeSet(validateRecipe(mk({
      jobs: { type: 'boolean', valueHelp: { yes: 'nope' } }
    })))).toContain(codes.RECIPE_INVALID_PARAM_SPEC);
    expect(codeSet(validateRecipe(mk({
      how: { type: 'enum', values: ['a'], valueLabels: { a: 1 } }
    })))).toContain(codes.RECIPE_INVALID_PARAM_SPEC);
  });

  it('rejects suggestions off a tags knob, tagFrom off a list knob, and a mode-less setup on an array', () => {
    for (const spec of [
      { type: 'array', item: { type: 'string' }, setup: { mode: 'lines', suggestions: ['a'] } },
      { type: 'array', item: { type: 'string' }, setup: { mode: 'tags', suggestions: ['a', 3] } },
      { type: 'array', item: { type: 'string' }, setup: { mode: 'tags', tagFrom: 'x' } },
      { type: 'array', item: { type: 'string' }, setup: { mode: 'list', tagFrom: '' } },
      { type: 'array', item: { type: 'string' }, setup: { mode: 'list', tagLabel: 4 } },
      { type: 'array', item: { type: 'string' }, setup: { showWhen: 'a=b' } },
      { type: 'string', setup: { mode: 'tags' } }
    ]) {
      expect(codeSet(validateRecipe(mk({ q: spec }))), JSON.stringify(spec)).toContain(codes.RECIPE_INVALID_SETUP_FLAG);
    }
  });
});
