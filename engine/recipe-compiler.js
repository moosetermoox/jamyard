/**
 * Recipe compiler — turns a recipe + parameter values into a game config.
 *
 * Pipeline:
 *
 *   raw params
 *     ↓ coerceParams        form-string "30" → 30, "true" → true
 *     ↓ applyDefaults       fill in missing values from spec defaults
 *     ↓ validateParams      reject if anything still invalid
 *     ↓ substitute          walk the template, replace ${param} placeholders
 *     ↓ result              { config, diagnostics }
 *
 * Substitution rules:
 *   - "${name}"             whole-value: replace with params.name (preserves type)
 *                           e.g. "choices": "${choices}" → "choices": ["A","B"]
 *   - "Foo ${name} bar"     interpolation: stringify the value into the surrounding text
 *   - Unknown placeholder   error: this is always a recipe-author bug
 *
 * Recipes use ${param} syntax (not {{param}}) deliberately, so they
 * don't collide with the engine's runtime template tokens
 * ({{phaseId.field}}). After compilation, the resulting game config
 * still contains {{...}} tokens — those are resolved at runtime by
 * engine/game-engine.js, not here.
 */

import { validateParams, RECIPE_DIAGNOSTIC_CODES } from './recipe-schema.js';
import { mkDiagnostic } from './diagnostics.js';

// =======================================================================
// Public API
// =======================================================================

/**
 * Compile a recipe + parameter values into a game config.
 *
 * @param {import('./recipe-schema.js').Recipe} recipe
 * @param {Object<string, *>} rawParams  Parameter values from the editor/UI.
 *                                       Strings/numbers/booleans accepted —
 *                                       this function coerces form-string
 *                                       values to declared types.
 * @returns {{ config: Object | null, diagnostics: import('./diagnostics.js').Diagnostic[] }}
 */
export function compileRecipe(recipe, rawParams = {}) {
  // 1. Coerce form-string inputs ("30" → 30, "true" → true) before
  //    validation. This avoids spurious type-mismatch errors on params
  //    that came from an HTML form.
  const coerced = coerceParams(recipe, rawParams);

  // 2. Apply defaults for params the caller didn't provide.
  const withDefaults = applyDefaults(recipe, coerced);

  // 3. Validate the normalized params against the spec.
  const paramDiags = validateParams(recipe, withDefaults);
  const errors = paramDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { config: null, diagnostics: paramDiags };
  }

  // 4. Substitute placeholders in the template. Substitution can also
  //    produce errors (unknown ${placeholder} = recipe-author bug).
  const subDiags = [];
  let config;
  try {
    config = substituteAll(recipe.template, withDefaults, recipe);
  } catch (err) {
    subDiags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
      message: err.message,
      source: 'validator'
    }));
    return { config: null, diagnostics: [...paramDiags, ...subDiags] };
  }

  return { config, diagnostics: [...paramDiags, ...subDiags] };
}

// =======================================================================
// Type coercion (form strings → declared types)
// =======================================================================

/**
 * Coerce raw param values to their declared types where it's safe to
 * do so. HTML forms produce strings; the recipe schema declares
 * integers and booleans. Without coercion, the validator would reject
 * a teacher's "60" as "not an integer."
 *
 * Coercion is strict: only converts in the obvious direction (string
 * "30" → 30, but never lossy). Anything ambiguous is left alone for
 * the validator to flag.
 *
 * @param {import('./recipe-schema.js').Recipe} recipe
 * @param {Object<string, *>} rawParams
 * @returns {Object<string, *>}
 */
export function coerceParams(recipe, rawParams) {
  const out = {};
  const declared = recipe.parameters || {};

  for (const [key, value] of Object.entries(rawParams)) {
    const spec = declared[key];
    if (!spec) {
      out[key] = value; // unknown — pass through; validator will flag
      continue;
    }
    out[key] = coerceValue(spec, value);
  }
  return out;
}

function coerceValue(spec, value) {
  if (value == null || value === '') return value; // leave for required-check

  switch (spec.type) {
    case 'integer': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
        return parseInt(value, 10);
      }
      return value; // validator rejects
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }
    case 'array': {
      if (Array.isArray(value)) {
        // Coerce each item too if item-spec exists
        if (spec.item) return value.map(v => coerceValue(spec.item, v));
        return value;
      }
      return value;
    }
    default:
      return value;
  }
}

// =======================================================================
// Default application
// =======================================================================

/**
 * Fill in default values for params the caller didn't provide. The
 * recipe spec's `default` is used; if absent, the param stays missing
 * (and the validator will flag it if `required: true`).
 *
 * Returns a new object — does not mutate input.
 *
 * @param {import('./recipe-schema.js').Recipe} recipe
 * @param {Object<string, *>} params
 * @returns {Object<string, *>}
 */
export function applyDefaults(recipe, params) {
  const out = { ...params };
  for (const [key, spec] of Object.entries(recipe.parameters || {})) {
    if (out[key] == null && spec.default !== undefined) {
      // Deep-clone defaults so callers can't mutate the recipe spec
      out[key] = deepClone(spec.default);
    }
  }
  return out;
}

// =======================================================================
// Template substitution
// =======================================================================

// ${name} — case-sensitive, simple identifiers only. No nested braces,
// no expressions. Restraint here is the point — recipes are templates,
// not scripts.
const PLACEHOLDER_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Recursively walk a template, substituting ${param} placeholders with
 * values from `params`. Whole-string placeholders ("${x}") preserve the
 * value's type; embedded placeholders ("Foo ${x}") interpolate as string.
 *
 * Throws on unknown placeholders — that's always a recipe-author bug.
 */
function substituteAll(template, params, recipe) {
  return walk(template);

  function walk(node) {
    if (typeof node === 'string') {
      return substituteString(node, params, recipe);
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        // Substitute in object KEYS too — lets recipes generate phase IDs
        // dynamically (e.g. "${prefix}-vote": {...}). Keys must compile to
        // a string; whole-value type preservation doesn't make sense here.
        const newKey = typeof key === 'string' && PLACEHOLDER_RE.test(key)
          ? interpolate(key, params, recipe)
          : key;
        // Reset the regex's lastIndex (PLACEHOLDER_RE is /g, stateful)
        PLACEHOLDER_RE.lastIndex = 0;
        out[newKey] = walk(value);
      }
      return out;
    }
    return node; // numbers, booleans, null
  }
}

/**
 * Substitute placeholders in a string. If the string is exactly
 * "${name}", return the underlying value (preserving array/number
 * types). Otherwise interpolate as a string.
 */
function substituteString(str, params, recipe) {
  // Whole-string placeholder — return the value with its native type.
  // This is what lets `"choices": "${choices}"` produce an array, not
  // the string "[A,B,C]".
  const wholeMatch = /^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/.exec(str);
  if (wholeMatch) {
    const name = wholeMatch[1];
    if (!(name in params)) {
      throw new Error(`Recipe "${recipe.id}" references unknown parameter "${name}".`);
    }
    return params[name];
  }

  // Embedded — interpolate. Reset lastIndex because PLACEHOLDER_RE is
  // /g, so leftover state can break repeat calls.
  PLACEHOLDER_RE.lastIndex = 0;
  return interpolate(str, params, recipe);
}

function interpolate(str, params, recipe) {
  return str.replace(PLACEHOLDER_RE, (match, name) => {
    if (!(name in params)) {
      throw new Error(`Recipe "${recipe.id}" references unknown parameter "${name}".`);
    }
    const value = params[name];
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    // Arrays/objects in interpolated context: stringify cleanly.
    // Recipes should prefer whole-string substitution for non-string
    // values; this fallback keeps the output sane if someone forgets.
    if (Array.isArray(value)) return value.join(', ');
    return JSON.stringify(value);
  });
}

// =======================================================================
// Helpers
// =======================================================================

function deepClone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
  return out;
}
