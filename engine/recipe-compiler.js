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
 *   - "${name.path[0]}"     dotted/indexed paths into object/array params
 *   - "Foo ${name} bar"     interpolation: stringify the value into the surrounding text
 *   - Unknown placeholder   error: this is always a recipe-author bug
 *
 * Structural directives (declarative — recipes stay data, not code):
 *   - { "$if": "<cond>", ... }          drop this object (a phase, an array
 *                                       element, anything) when the condition
 *                                       is false. Conditions: "name", "!name",
 *                                       "name=value", "name!=value".
 *   - { "$if": c, "$value": v }         conditional FIELD: compiles to v when
 *                                       c is true, otherwise the field is
 *                                       dropped. v can hold placeholders and
 *                                       keeps its native type.
 *   - "$repeat" key inside "phases":    { "forEach": "<arrayParam>",
 *                                       "keyPattern": "q${i}", "phase": {...},
 *                                       "after": "<phaseId>" } expands to one
 *                                       phase per item. Inside the phase
 *                                       template: ${item...}, ${i} (1-based),
 *                                       ${n} (total), ${nextKey} (next
 *                                       generated phase, or "after" on the
 *                                       last one).
 *   - { "$map": "<arrayParam>", "value": v }   compiles to an array with one
 *                                       compiled v per item (same scope vars
 *                                       as $repeat) — e.g. a leaderboard
 *                                       summing every generated round.
 *
 * When $if drops a PHASE, any next/approveNext/rejectNext/loopBack that
 * pointed at it is rewired to the dropped phase's own "next" (following
 * chains of consecutive drops) — like unlinking a node from a list. A ref
 * with nowhere left to go is a compile error.
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

  // 4. Substitute placeholders + apply structural directives ($if/$repeat/
  //    $map). Both can produce errors (unknown ${placeholder}, bad condition,
  //    dangling ref through a dropped phase = recipe-author bugs).
  const subDiags = [];
  let config;
  try {
    const dropped = [];
    config = substituteAll(recipe.template, withDefaults, recipe, dropped);
    rewireDroppedPhases(config, dropped, recipe);
  } catch (err) {
    subDiags.push(mkDiagnostic({
      severity: 'error',
      code: RECIPE_DIAGNOSTIC_CODES.RECIPE_INVALID_PARAM_SPEC,
      message: err.message,
      source: 'validator'
    }));
    return { config: null, diagnostics: [...paramDiags, ...subDiags] };
  }

  // 5. Carry the recipe-level family flag into the compiled config so the
  //    game validator enforces the family's contract (e.g. "connection" =
  //    no winners/points/eliminations) on every save, forever.
  if (recipe.family != null && config && typeof config === 'object') {
    config.family = recipe.family;
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
    case 'object': {
      if (value != null && typeof value === 'object' && !Array.isArray(value) && spec.fields) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
          out[k] = spec.fields[k] ? coerceValue(spec.fields[k], v) : v;
        }
        return out;
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

// ${name}, ${name[0]}, ${name.field}, ${name.field[2].sub} — case-sensitive
// identifiers with an optional dotted/indexed path. No nested braces, no
// expressions. Restraint here is the point — recipes are templates, not
// scripts. Paths let a recipe place one element of an array parameter
// ("${tier1Prompts[0]}" — Closer's tiers) or a field of an object item
// ("${item.question}" — quiz-show's $repeat).
const PLACEHOLDER_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)((?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\])*)\}/g;

// Sentinel returned by walk() when a node's $if condition is false.
const DROP = Symbol('recipe-node-dropped');

/**
 * Resolve a placeholder name + optional path against the params.
 * Throws on unknown names and broken paths — all recipe-author bugs,
 * caught by the compile smoke tests.
 */
function lookupParam(params, recipe, name, pathStr) {
  if (!(name in params)) {
    throw new Error(`Recipe "${recipe.id}" references unknown parameter "${name}".`);
  }
  let value = params[name];
  if (!pathStr) return value;

  // Path grammar: ".field" and "[idx]" segments, e.g. ".choices[1]"
  const segments = pathStr.match(/\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\]/g) || [];
  let walked = name;
  for (const seg of segments) {
    if (seg.startsWith('[')) {
      const idx = parseInt(seg.slice(1, -1), 10);
      if (!Array.isArray(value)) {
        throw new Error(`Recipe "${recipe.id}" indexes "${walked}${seg}" but "${walked}" is not an array.`);
      }
      if (idx >= value.length) {
        throw new Error(`Recipe "${recipe.id}" references "${walked}${seg}" but "${walked}" only has ${value.length} item(s).`);
      }
      value = value[idx];
    } else {
      const field = seg.slice(1);
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Recipe "${recipe.id}" references "${walked}${seg}" but "${walked}" is not an object.`);
      }
      if (!(field in value)) {
        throw new Error(`Recipe "${recipe.id}" references "${walked}${seg}" but that field does not exist.`);
      }
      value = value[field];
    }
    walked += seg;
  }
  return value;
}

/**
 * Evaluate a $if condition string against params. Grammar (restrained
 * on purpose): "name" (truthy), "!name", "name=value", "name!=value".
 * Values compare as strings, so enums and booleans both work.
 */
function evaluateCondition(cond, params, recipe) {
  if (typeof cond !== 'string' || !cond.trim()) {
    throw new Error(`Recipe "${recipe.id}" has an invalid $if condition (${JSON.stringify(cond)}).`);
  }
  const m = /^\s*(!?)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:(!?=)\s*(.*?))?\s*$/.exec(cond);
  if (!m) {
    throw new Error(`Recipe "${recipe.id}" has an unparseable $if condition "${cond}". Use "name", "!name", "name=value", or "name!=value".`);
  }
  const [, bang, name, op, rhs] = m;
  if (!(name in params)) {
    // Declared-but-absent (optional param, no default, teacher left it
    // blank) is simply falsy. UNDECLARED is a recipe-author typo — throw.
    const declared = recipe.parameters && name in recipe.parameters;
    if (!declared && !['item', 'i', 'n', 'nextKey'].includes(name)) {
      throw new Error(`Recipe "${recipe.id}" $if condition "${cond}" references unknown parameter "${name}".`);
    }
  }
  const value = params[name];

  if (op) {
    if (bang) {
      throw new Error(`Recipe "${recipe.id}" $if condition "${cond}" can't combine "!" with "=". Use "name!=value".`);
    }
    const equal = String(value) === rhs;
    return op === '=' ? equal : !equal;
  }

  const truthy = !(value === undefined || value === null || value === false || value === 0 || value === '');
  return bang ? !truthy : truthy;
}

/**
 * Recursively walk a template, substituting ${param} placeholders and
 * applying structural directives. Whole-string placeholders ("${x}")
 * preserve the value's type; embedded placeholders interpolate as string.
 *
 * `dropped` collects {key, next} for phases removed by $if so the
 * compiler can rewire transitions afterwards.
 *
 * Throws on unknown placeholders — that's always a recipe-author bug.
 */
function substituteAll(template, params, recipe, dropped) {
  return walk(template, params, null);

  function walk(node, scope, parentKey) {
    if (typeof node === 'string') {
      return substituteString(node, scope, recipe);
    }
    if (Array.isArray(node)) {
      return node
        .map((el) => walk(el, scope, null))
        .filter((el) => el !== DROP);
    }
    if (node !== null && typeof node === 'object') {
      // {$map: param, value: tpl} — compiles to an array
      if (typeof node.$map === 'string') {
        return expandMap(node, scope);
      }

      // $if gate — drop the node, or strip the directive keys and continue
      if (node.$if !== undefined) {
        if (!evaluateCondition(node.$if, scope, recipe)) return DROP;
        if ('$value' in node) return walk(node.$value, scope, null);
        const { $if, ...rest } = node;
        return walk(rest, scope, parentKey);
      }

      const out = {};
      for (const [key, value] of Object.entries(node)) {
        // "$repeat" keys inside "phases" expand to N generated phases.
        // Prefix match so two repeats can coexist ("$repeat-rounds").
        if (parentKey === 'phases' && key.startsWith('$repeat')) {
          expandRepeat(value, scope, out);
          continue;
        }

        // Substitute in object KEYS too — lets recipes generate phase IDs
        // dynamically. Keys must compile to a string.
        const newKey = typeof key === 'string' && PLACEHOLDER_RE.test(key)
          ? interpolate(key, scope, recipe)
          : key;
        // Reset the regex's lastIndex (PLACEHOLDER_RE is /g, stateful)
        PLACEHOLDER_RE.lastIndex = 0;

        const walked = walk(value, scope, newKey);
        if (walked === DROP) {
          // A dropped PHASE leaves dangling next-refs; remember where it
          // would have gone so rewireDroppedPhases can skip through it.
          if (parentKey === 'phases') {
            dropped.push({ key: newKey, next: droppedPhaseNext(value, scope) });
          }
          continue;
        }
        out[newKey] = walked;
      }
      return out;
    }
    return node; // numbers, booleans, null
  }

  // The compiled "next" of a phase that was dropped (for rewiring).
  function droppedPhaseNext(node, scope) {
    if (node && typeof node.next === 'string') {
      const next = substituteString(node.next, scope, recipe);
      return typeof next === 'string' ? next : undefined;
    }
    return undefined;
  }

  function expandRepeat(spec, scope, out) {
    if (!spec || typeof spec !== 'object' || typeof spec.forEach !== 'string' ||
        typeof spec.keyPattern !== 'string' || spec.phase == null) {
      throw new Error(`Recipe "${recipe.id}" has an invalid $repeat — needs "forEach", "keyPattern", and "phase".`);
    }
    const arr = lookupParam(scope, recipe, spec.forEach, '');
    if (!Array.isArray(arr)) {
      throw new Error(`Recipe "${recipe.id}" $repeat forEach "${spec.forEach}" must be an array parameter.`);
    }
    for (let idx = 0; idx < arr.length; idx++) {
      const iterScope = { ...scope, item: arr[idx], i: idx + 1, n: arr.length };
      const key = interpolate(spec.keyPattern, iterScope, recipe);
      // ${nextKey}: the next generated phase, or "after" on the last one.
      if (idx < arr.length - 1) {
        iterScope.nextKey = interpolate(
          spec.keyPattern, { ...scope, item: arr[idx + 1], i: idx + 2, n: arr.length }, recipe
        );
      } else if (spec.after !== undefined) {
        iterScope.nextKey = substituteString(String(spec.after), scope, recipe);
      }
      const compiled = walk(spec.phase, iterScope, key);
      if (compiled !== DROP) out[key] = compiled;
    }
  }

  function expandMap(node, scope) {
    const arr = lookupParam(scope, recipe, node.$map, '');
    if (!Array.isArray(arr)) {
      throw new Error(`Recipe "${recipe.id}" $map "${node.$map}" must name an array parameter.`);
    }
    if (node.value === undefined) {
      throw new Error(`Recipe "${recipe.id}" $map needs a "value" template.`);
    }
    return arr.map((item, idx) =>
      walk(node.value, { ...scope, item, i: idx + 1, n: arr.length }, null)
    ).filter((el) => el !== DROP);
  }
}

/**
 * Re-point transitions that referenced $if-dropped phases. Each dropped
 * phase declared where it would have gone (its own "next"); pointers to
 * it skip through, like unlinking a node from a list. Chains of
 * consecutive drops are followed. A ref with nowhere to go throws.
 */
const PHASE_REF_FIELDS = ['next', 'approveNext', 'rejectNext', 'loopBack'];

function rewireDroppedPhases(config, dropped, recipe) {
  if (!dropped.length || !config || typeof config !== 'object' || !config.phases) return;
  const droppedNext = new Map(dropped.map(d => [d.key, d.next]));

  const resolve = (target, fromPhase) => {
    const seen = new Set();
    while (droppedNext.has(target)) {
      if (seen.has(target)) {
        throw new Error(`Recipe "${recipe.id}": conditionally-removed phases form a loop at "${target}".`);
      }
      seen.add(target);
      const next = droppedNext.get(target);
      if (!next) {
        throw new Error(
          `Recipe "${recipe.id}": phase "${fromPhase}" points to conditionally-removed phase "${target}", which has no "next" to skip to.`
        );
      }
      target = next;
    }
    return target;
  };

  for (const [name, phase] of Object.entries(config.phases)) {
    if (!phase || typeof phase !== 'object') continue;
    for (const field of PHASE_REF_FIELDS) {
      if (typeof phase[field] === 'string' && droppedNext.has(phase[field])) {
        phase[field] = resolve(phase[field], name);
      }
    }
  }
}

/**
 * Substitute placeholders in a string. If the string is exactly
 * "${name}" (with optional path), return the underlying value
 * (preserving array/number types). Otherwise interpolate as a string.
 */
function substituteString(str, params, recipe) {
  // Whole-string placeholder — return the value with its native type.
  // This is what lets `"choices": "${choices}"` produce an array, not
  // the string "[A,B,C]".
  const wholeMatch = /^\$\{([a-zA-Z_][a-zA-Z0-9_]*)((?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\])*)\}$/.exec(str);
  if (wholeMatch) {
    return lookupParam(params, recipe, wholeMatch[1], wholeMatch[2]);
  }

  // Embedded — interpolate. Reset lastIndex because PLACEHOLDER_RE is
  // /g, so leftover state can break repeat calls.
  PLACEHOLDER_RE.lastIndex = 0;
  return interpolate(str, params, recipe);
}

function interpolate(str, params, recipe) {
  return str.replace(PLACEHOLDER_RE, (match, name, pathStr) => {
    const value = lookupParam(params, recipe, name, pathStr);
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
