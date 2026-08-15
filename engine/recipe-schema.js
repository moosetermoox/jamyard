/**
 * Recipe schema — the shape every recipe file must match.
 *
 * Recipes sit on top of the phase graph: a recipe is a phase-graph
 * template plus a manifest of parameters teachers fill in. The compiler
 * (engine/recipe-compiler.js) walks the template, substitutes the
 * parameter values, and emits a regular game config that flows through
 * the existing validate() pipeline.
 *
 * Why this exists: see docs/RECIPE-LAYER.md. Short version — teachers
 * shouldn't have to think in phases. They pick a recipe, fill 3-5
 * fields, get a working game. The phase graph becomes compiler output,
 * not something the teacher mentally models.
 *
 * Two validators:
 *   validateRecipe(recipe)              — is the recipe file well-formed?
 *   validateParams(recipe, params)      — are the teacher's inputs valid?
 *
 * Both return Diagnostic[] using the structured format from
 * engine/diagnostics.js, so callers get the same {severity, code,
 * path, message} shape everywhere.
 *
 * Parameter type vocabulary intentionally mirrors the field-type
 * vocabulary in phase-schemas.js (string, templateString, integer,
 * boolean, enum, array). A teacher filling in a recipe parameter sees
 * the same form widget as the same-typed field in the advanced editor.
 */

import { mkDiagnostic, path } from './diagnostics.js';

// =======================================================================
// Diagnostic codes specific to the recipe layer
// =======================================================================

export const RECIPE_DIAGNOSTIC_CODES = {
  // Recipe file structure
  RECIPE_MISSING_FIELD:       'RECIPE_MISSING_FIELD',
  RECIPE_INVALID_FIELD_TYPE:  'RECIPE_INVALID_FIELD_TYPE',
  RECIPE_INVALID_PARAM_SPEC:  'RECIPE_INVALID_PARAM_SPEC',
  RECIPE_INVALID_SETUP_FLAG:  'RECIPE_INVALID_SETUP_FLAG',
  RECIPE_TEMPLATE_MISSING:    'RECIPE_TEMPLATE_MISSING',

  // Parameter validation (when teacher submits values)
  PARAM_MISSING_REQUIRED:     'PARAM_MISSING_REQUIRED',
  PARAM_INVALID_TYPE:         'PARAM_INVALID_TYPE',
  PARAM_INVALID_ENUM_VALUE:   'PARAM_INVALID_ENUM_VALUE',
  PARAM_INVALID_INTEGER_RANGE:'PARAM_INVALID_INTEGER_RANGE',
  PARAM_ARRAY_TOO_SHORT:      'PARAM_ARRAY_TOO_SHORT',
  PARAM_ARRAY_TOO_LONG:       'PARAM_ARRAY_TOO_LONG',
  PARAM_STRING_TOO_SHORT:     'PARAM_STRING_TOO_SHORT',
  PARAM_STRING_TOO_LONG:      'PARAM_STRING_TOO_LONG',
  PARAM_UNKNOWN:              'PARAM_UNKNOWN'
};

// =======================================================================
// Parameter type vocabulary
// =======================================================================

/**
 * Field-type names recipes can use for parameters. Mirrors phase-schemas.js
 * field types so the editor's existing form-renderer code works on
 * recipe parameter forms with no changes.
 */
export const RECIPE_PARAM_TYPES = new Set([
  'string',
  'templateString',
  'integer',
  'boolean',
  'enum',
  'array',
  'object',
  // A string whose value teachers usually PICK from a curated prompt deck
  // rather than write (library-first workstream B3). Compiles exactly like
  // a string; the deck (`bank` + `decks` on the spec, served from
  // recipes/prompt-banks/) is form-UI sugar. Optional `choicesParam` names
  // an array param the picker also fills when a picked prompt carries
  // answer choices (polls).
  'promptDeck'
]);

// =======================================================================
// Recipe shape
// =======================================================================

/**
 * @typedef {Object} RecipeParam
 * @property {'string'|'templateString'|'integer'|'boolean'|'enum'|'array'} type
 * @property {string} [label]
 * @property {string} [helper]
 * @property {string} [placeholder]
 * @property {boolean} [required]
 * @property {*} [default]
 * @property {boolean|{mode:'count', label?:string}} [setup]
 *   Marks the param as a Customize-dialog knob (library setup mode).
 *   `true` on integer/boolean/enum shows the param's normal widget;
 *   `{mode:"count"}` on an array shows a how-many stepper that slices
 *   the stamped array to the first N at recompile time.
 *
 * Type-specific:
 * @property {number} [min]               integer
 * @property {number} [max]               integer
 * @property {number} [minLength]         string / templateString
 * @property {number} [maxLength]         string / templateString
 * @property {Array<string|number>} [values]  enum
 * @property {RecipeParam} [item]         array — describes each element
 * @property {number} [minItems]          array
 * @property {number} [maxItems]          array
 * @property {Object<string, RecipeParam>} [fields]  object — named sub-fields
 *   (e.g. quiz-show's questions: array of {question, choices, correct})
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id           Filename-safe identifier (matches recipe filename).
 * @property {string} name         Display name shown to teachers.
 * @property {string} [icon]       Emoji or short icon string.
 * @property {string} description  One-line summary.
 * @property {string} [tagline]    "Perfect for..." subtitle.
 * @property {string} [family]     Game-family contract carried into the compiled
 *                                 config ("connection" = no winners/points/eliminations).
 * @property {Object<string, RecipeParam>} parameters
 * @property {Object} template     Game config template with ${param} placeholders.
 * @property {string} [version]    Recipe schema version (currently always '1').
 */

// =======================================================================
// validateRecipe — is the recipe file well-formed?
// =======================================================================

/**
 * Validates a recipe file's shape. Use at recipe-loader startup so
 * broken recipe files surface as warnings, not runtime crashes.
 *
 * @param {*} recipe
 * @returns {import('./diagnostics.js').Diagnostic[]}
 */
export function validateRecipe(recipe) {
  const diags = [];

  if (recipe == null || typeof recipe !== 'object' || Array.isArray(recipe)) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_FIELD_TYPE,
      message: 'Recipe must be a JSON object.',
      source: 'validator'
    }));
    return diags;
  }

  // Required top-level fields
  for (const field of ['id', 'name', 'description', 'parameters', 'template']) {
    if (recipe[field] == null) {
      diags.push(mkDiagnostic({
        severity: 'error',
        code: RECIPE_DIAGNOSTIC_CODES.RECIPE_MISSING_FIELD,
        path: field,
        field,
        message: `Recipe is missing required field "${field}".`,
        source: 'validator'
      }));
    }
  }

  // Type checks on present fields
  if (recipe.id != null && typeof recipe.id !== 'string') {
    diags.push(typeError('id', 'string'));
  }
  if (recipe.name != null && typeof recipe.name !== 'string') {
    diags.push(typeError('name', 'string'));
  }
  if (recipe.description != null && typeof recipe.description !== 'string') {
    diags.push(typeError('description', 'string'));
  }
  if (recipe.icon != null && typeof recipe.icon !== 'string') {
    diags.push(typeError('icon', 'string'));
  }
  if (recipe.tagline != null && typeof recipe.tagline !== 'string') {
    diags.push(typeError('tagline', 'string'));
  }
  // family: opt-in game-family contract carried into the compiled config.
  // "connection" = no winners / points / eliminations, enforced by the game
  // validator (engine/game-loader.js checkConnectionFamily).
  if (recipe.family != null && recipe.family !== 'connection') {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_FIELD_TYPE,
      path: 'family',
      field: 'family',
      message: 'Recipe field "family" must be "connection" (the only family currently defined).',
      source: 'validator'
    }));
  }

  // setupPanel: opt-in dedicated Customize experience for games born from
  // this recipe ("quiz" = topic box + AI-written questions + editable
  // question list). Generic setup knobs need no panel.
  if (recipe.setupPanel != null && recipe.setupPanel !== 'quiz') {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_FIELD_TYPE,
      path: 'setupPanel',
      field: 'setupPanel',
      message: 'Recipe field "setupPanel" must be "quiz" (the only panel currently defined).',
      source: 'validator'
    }));
  }

  if (recipe.template != null && (typeof recipe.template !== 'object' || Array.isArray(recipe.template))) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_TEMPLATE_MISSING,
      path: 'template',
      field: 'template',
      message: 'Recipe "template" must be an object (a game config).',
      source: 'validator'
    }));
  }

  // Parameter specs
  if (recipe.parameters != null) {
    if (typeof recipe.parameters !== 'object' || Array.isArray(recipe.parameters)) {
      diags.push(typeError('parameters', 'object'));
    } else {
      for (const [paramName, paramSpec] of Object.entries(recipe.parameters)) {
        diags.push(...validateParamSpec(paramName, paramSpec));
      }
    }
  }

  return diags;
}

function typeError(field, expected) {
  return mkDiagnostic({
    severity: 'error',
    code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_FIELD_TYPE,
    path: field,
    field,
    message: `Recipe field "${field}" must be a ${expected}.`,
    source: 'validator'
  });
}

/**
 * Validate one parameter spec from the recipe's parameters block.
 */
function validateParamSpec(paramName, spec) {
  const diags = [];
  const where = path('parameters', paramName);

  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
      path: where,
      field: paramName,
      message: `Parameter "${paramName}" must be an object describing its type.`,
      source: 'validator'
    }));
    return diags;
  }

  if (!spec.type) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
      path: path(where, 'type'),
      field: paramName,
      message: `Parameter "${paramName}" is missing required "type".`,
      source: 'validator'
    }));
    return diags;
  }

  if (!RECIPE_PARAM_TYPES.has(spec.type)) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
      path: path(where, 'type'),
      field: paramName,
      message: `Parameter "${paramName}" has unknown type "${spec.type}". Allowed: ${[...RECIPE_PARAM_TYPES].join(', ')}.`,
      source: 'validator'
    }));
    return diags;
  }

  // Type-specific spec sanity checks
  if (spec.type === 'enum') {
    if (!Array.isArray(spec.values) || spec.values.length === 0) {
      diags.push(mkDiagnostic({
        severity: 'error',
        code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
        path: path(where, 'values'),
        field: paramName,
        message: `Enum parameter "${paramName}" must declare a non-empty "values" array.`,
        source: 'validator'
      }));
    }
  }

  if (spec.type === 'array') {
    if (spec.item != null) {
      diags.push(...validateParamSpec(paramName + '.item', spec.item));
    }
  }

  if (spec.type === 'object') {
    if (spec.fields == null || typeof spec.fields !== 'object' || Array.isArray(spec.fields)) {
      diags.push(mkDiagnostic({
        severity: 'error',
        code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
        path: path(where, 'fields'),
        field: paramName,
        message: `Object parameter "${paramName}" must declare a "fields" map describing its sub-fields.`,
        source: 'validator'
      }));
    } else {
      for (const [fieldName, fieldSpec] of Object.entries(spec.fields)) {
        diags.push(...validateParamSpec(paramName + '.' + fieldName, fieldSpec));
      }
    }
  }

  if (spec.type === 'integer') {
    if (spec.min != null && typeof spec.min !== 'number') {
      diags.push(typeError(path(where, 'min'), 'number'));
    }
    if (spec.max != null && typeof spec.max !== 'number') {
      diags.push(typeError(path(where, 'max'), 'number'));
    }
  }

  if (spec.setup != null) {
    diags.push(...validateSetupFlag(paramName, spec, where));
  }

  return diags;
}

// Which scalar types may carry `setup: true` (rendered with their normal
// widget in the Customize dialog). Arrays use the {mode:"count"} object
// form instead; free-text types have no sensible knob widget.
const SETUP_SCALAR_TYPES = new Set(['integer', 'boolean', 'enum']);

function validateSetupFlag(paramName, spec, where) {
  const bad = (message) => [mkDiagnostic({
    severity: 'error',
    code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_SETUP_FLAG,
    path: path(where, 'setup'),
    field: paramName,
    message,
    source: 'validator'
  })];

  if (spec.setup === true) {
    if (!SETUP_SCALAR_TYPES.has(spec.type)) {
      return bad(`Parameter "${paramName}": "setup": true is only allowed on ${[...SETUP_SCALAR_TYPES].join('/')} params (arrays use {"mode": "count"}).`);
    }
    return [];
  }

  if (typeof spec.setup === 'object' && !Array.isArray(spec.setup)) {
    if (spec.type !== 'array') {
      return bad(`Parameter "${paramName}": a setup object is only allowed on array params.`);
    }
    if (spec.setup.mode !== 'count') {
      return bad(`Parameter "${paramName}": setup.mode must be "count".`);
    }
    if (spec.setup.label != null && typeof spec.setup.label !== 'string') {
      return bad(`Parameter "${paramName}": setup.label must be a string.`);
    }
    return [];
  }

  return bad(`Parameter "${paramName}": "setup" must be true or {"mode": "count"}.`);
}

// =======================================================================
// validateParams — does a teacher's submitted params satisfy the recipe?
// =======================================================================

/**
 * Validate a `{paramName: value}` object against a recipe's parameter
 * schema. Returns Diagnostic[] (empty array = valid).
 *
 * Note: this checks raw input. The compiler is responsible for applying
 * defaults and coercing form-string values; this function runs *after*
 * those passes on the normalized params.
 *
 * @param {Recipe} recipe
 * @param {Object<string, *>} params
 * @returns {import('./diagnostics.js').Diagnostic[]}
 */
export function validateParams(recipe, params) {
  const diags = [];
  const declared = recipe.parameters || {};

  if (params == null || typeof params !== 'object' || Array.isArray(params)) {
    diags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.PARAM_INVALID_TYPE,
      message: 'Recipe parameters must be a JSON object.',
      source: 'validator'
    }));
    return diags;
  }

  // Unknown params (typo guard — surfaces "questoin" vs "question")
  for (const key of Object.keys(params)) {
    if (!(key in declared)) {
      diags.push(mkDiagnostic({
        severity: 'warning',
        code: RECIPE_DIAGNOSTIC_CODES.PARAM_UNKNOWN,
        path: path('params', key),
        field: key,
        message: `Unknown parameter "${key}", recipe does not declare it.`,
        source: 'validator'
      }));
    }
  }

  // Required + type checks
  for (const [paramName, spec] of Object.entries(declared)) {
    const value = params[paramName];

    if (value == null) {
      if (spec.required) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_MISSING_REQUIRED,
          path: path('params', paramName),
          field: paramName,
          message: `Required parameter "${spec.label || paramName}" is missing.`,
          source: 'validator'
        }));
      }
      continue;
    }

    diags.push(...validateValue(paramName, spec, value));
  }

  return diags;
}

/**
 * Validate one (param, value) pair against its spec. Recursively
 * descends into array.item.
 */
function validateValue(paramName, spec, value) {
  const diags = [];
  const where = path('params', paramName);

  switch (spec.type) {
    case 'string':
    case 'templateString':
    case 'promptDeck': {
      if (typeof value !== 'string') {
        diags.push(typeMismatch(paramName, where, spec.type, value));
        return diags;
      }
      if (spec.minLength != null && value.length < spec.minLength) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_STRING_TOO_SHORT,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" must be at least ${spec.minLength} characters.`,
          source: 'validator'
        }));
      }
      if (spec.maxLength != null && value.length > spec.maxLength) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_STRING_TOO_LONG,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" must be at most ${spec.maxLength} characters.`,
          source: 'validator'
        }));
      }
      break;
    }

    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        diags.push(typeMismatch(paramName, where, spec.type, value));
        return diags;
      }
      if (spec.min != null && value < spec.min) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_INVALID_INTEGER_RANGE,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" must be at least ${spec.min}.`,
          source: 'validator'
        }));
      }
      if (spec.max != null && value > spec.max) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_INVALID_INTEGER_RANGE,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" must be at most ${spec.max}.`,
          source: 'validator'
        }));
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        diags.push(typeMismatch(paramName, where, spec.type, value));
      }
      break;
    }

    case 'enum': {
      if (!Array.isArray(spec.values) || !spec.values.includes(value)) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_INVALID_ENUM_VALUE,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" must be one of: ${(spec.values || []).join(', ')}.`,
          source: 'validator'
        }));
      }
      break;
    }

    case 'object': {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        diags.push(typeMismatch(paramName, where, spec.type, value));
        return diags;
      }
      for (const [fieldName, fieldSpec] of Object.entries(spec.fields || {})) {
        const fieldValue = value[fieldName];
        if (fieldValue == null) {
          if (fieldSpec.required) {
            diags.push(mkDiagnostic({
              severity: 'error',
              code: RECIPE_DIAGNOSTIC_CODES.PARAM_MISSING_REQUIRED,
              path: path(where, fieldName),
              field: paramName,
              message: `"${spec.label || paramName}" is missing its "${fieldSpec.label || fieldName}".`,
              source: 'validator'
            }));
          }
          continue;
        }
        diags.push(...validateValue(`${paramName}.${fieldName}`, fieldSpec, fieldValue));
      }
      break;
    }

    case 'array': {
      if (!Array.isArray(value)) {
        diags.push(typeMismatch(paramName, where, spec.type, value));
        return diags;
      }
      if (spec.minItems != null && value.length < spec.minItems) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_ARRAY_TOO_SHORT,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" needs at least ${spec.minItems} items (got ${value.length}).`,
          source: 'validator'
        }));
      }
      if (spec.maxItems != null && value.length > spec.maxItems) {
        diags.push(mkDiagnostic({
          severity: 'error',
          code: RECIPE_DIAGNOSTIC_CODES.PARAM_ARRAY_TOO_LONG,
          path: where,
          field: paramName,
          message: `Parameter "${spec.label || paramName}" can have at most ${spec.maxItems} items (got ${value.length}).`,
          source: 'validator'
        }));
      }
      // Per-item type check (only one level deep — arrays of arrays would
      // need recursion; YAGNI for the recipe layer)
      if (spec.item != null) {
        for (let i = 0; i < value.length; i++) {
          const itemDiags = validateValue(`${paramName}[${i}]`, spec.item, value[i]);
          diags.push(...itemDiags);
        }
      }
      break;
    }
  }

  return diags;
}

function typeMismatch(paramName, where, expected, value) {
  return mkDiagnostic({
    severity: 'error',
    code: RECIPE_DIAGNOSTIC_CODES.PARAM_INVALID_TYPE,
    path: where,
    field: paramName,
    message: `Parameter "${paramName}" must be a ${expected} (got ${actualTypeName(value)}).`,
    source: 'validator'
  });
}

function actualTypeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
