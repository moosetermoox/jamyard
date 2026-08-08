/**
 * Shared resolver grammar.
 *
 * Spec: docs/PHASE-SCHEMA-SPEC.md §6.
 *
 * Single source of truth for the {{...}} token syntax used in templates
 * and data references. Both the validator (engine/game-loader.js) and
 * the engine resolver (engine/game-engine.js) parse refs through this
 * module so the two can't drift on what's a valid token.
 *
 * Three exports:
 *   parseTemplateTokens(template)
 *     Find all {{...}} occurrences in a string. Returns positions so
 *     the validator can underline the right span.
 *
 *   parseRef(ref)
 *     Parse a single ref ("vote.scores.barChart", "_loop.X.iteration",
 *     "_current.text") into a structured shape: kind + segments + suffix.
 *
 *   classifyRef(parsed, schemas, allPhases)
 *     Walk the parsed ref against the phase schemas and figure out what
 *     it produces (type, capability) and whether it's renderable as a
 *     string. Used by the typed-dataflow validator (Phase E) to decide
 *     if {{X.field}} is OK in a templateString context.
 */

import { PHASE_SCHEMAS } from './phase-schemas.js';
import { resolveOutputSpec } from './phase-schema-runtime.js';

// =======================================================================
// Vocabulary
// =======================================================================

/**
 * Known synthetic suffixes — these are renderers that turn an output
 * value into a string. Order: longest first to disambiguate (none of
 * these prefix-collide today, but be safe).
 */
export const KNOWN_SUFFIXES = new Set([
  'list',
  'count',
  'json',
  'barChart', 'pieChart', 'chart',  // chart family — all read .tally / scoreMap
  'mine',                             // per-player AI lookup
  'assigned'                          // per-player rotation lookup (rotateFrom)
]);

/**
 * Built-in scope identifiers — refs starting with these don't point at
 * phase data; they point at engine/orchestration state.
 */
export const BUILTIN_SCOPES = new Set([
  'remaining', 'eliminated', 'players',
  '_current', '_foreach', '_candidates', '_loop', '_pair'
]);

// =======================================================================
// parseTemplateTokens — locate every {{...}} in a string
// =======================================================================

/**
 * @typedef {Object} TemplateToken
 * @property {string} raw       The full match including braces, e.g. "{{X.y}}"
 * @property {string} ref       The inner content trimmed, e.g. "X.y"
 * @property {number[]} range  [start, end) char offsets in the source
 */

/**
 * @param {string} template
 * @returns {TemplateToken[]}
 */
export function parseTemplateTokens(template) {
  if (typeof template !== 'string' || template.length === 0) return [];
  const tokens = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    tokens.push({
      raw: m[0],
      ref: m[1].trim(),
      range: [m.index, m.index + m[0].length]
    });
  }
  return tokens;
}

// =======================================================================
// parseRef — structural parse of a single ref string
// =======================================================================

/**
 * @typedef {Object} ParsedRef
 * @property {'phaseField'|'builtin'|'foreachItem'|'foreachScope'|'foreachCandidates'|'loopScope'|'pairScope'|'unknown'} kind
 * @property {string[]} segments   The dotted parts (excluding any suffix)
 * @property {string|null} suffix  A KNOWN_SUFFIXES entry if the last segment is one, else null
 * @property {string} raw          Original ref string
 */

/**
 * Parse a ref like "phaseId.field.list" into segments + optional suffix.
 *
 * Special-cases the orchestration scopes (_current, _foreach, _candidates,
 * _loop) and the built-in player lists (remaining, eliminated, players).
 *
 * @param {string} ref
 * @returns {ParsedRef}
 */
export function parseRef(ref) {
  if (typeof ref !== 'string') {
    return { kind: 'unknown', segments: [], suffix: null, raw: String(ref) };
  }
  const parts = ref.split('.');
  if (parts.length === 0 || parts[0] === '') {
    return { kind: 'unknown', segments: [], suffix: null, raw: ref };
  }

  const head = parts[0];

  // Orchestration scopes
  if (head === '_current') {
    return { kind: 'foreachItem', segments: parts, suffix: null, raw: ref };
  }
  if (head === '_foreach') {
    return { kind: 'foreachScope', segments: parts, suffix: null, raw: ref };
  }
  if (head === '_candidates') {
    return { kind: 'foreachCandidates', segments: parts, suffix: null, raw: ref };
  }
  if (head === '_loop') {
    return { kind: 'loopScope', segments: parts, suffix: null, raw: ref };
  }
  if (head === '_pair') {
    // Pair-scoped reveal tokens ({{_pair.answers}}, {{_pair.prompt}}) —
    // resolved per-recipient by the reveal handler, not engine.resolve().
    return { kind: 'pairScope', segments: parts, suffix: null, raw: ref };
  }

  // Built-ins
  if (BUILTIN_SCOPES.has(head)) {
    return { kind: 'builtin', segments: parts, suffix: null, raw: ref };
  }

  // Phase data ref. Strip a trailing renderer suffix if present.
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && KNOWN_SUFFIXES.has(last)) {
    return {
      kind: 'phaseField',
      segments: parts.slice(0, -1),
      suffix: last,
      raw: ref
    };
  }

  return { kind: 'phaseField', segments: parts, suffix: null, raw: ref };
}

// =======================================================================
// classifyRef — type-aware classification
// =======================================================================

/**
 * @typedef {Object} ClassifiedRef
 * @property {string} kind             Same as ParsedRef.kind
 * @property {string[]} segments
 * @property {string|null} suffix
 * @property {string} raw
 * @property {string|null} phaseId     For phaseField refs, the target phase ID
 * @property {string|null} fieldName   For phaseField refs, the leaf field
 *                                     within that phase (after segments[0])
 * @property {string|null} producedType   'string' | 'array' | 'scoreMap' | 'object' | 'integer' | 'boolean' | null (unknown)
 * @property {string|null} capability     Output capability if declared (e.g. 'responseArray')
 * @property {boolean} renderable      True if rendering this token in a
 *                                     templateString context produces a string
 *                                     without a [object Object] hazard
 * @property {string|null} canonicalForm  If this ref is an alias, the
 *                                        canonical form (e.g.
 *                                        "vote.scores.barChart"); else null
 * @property {{ code: string, message: string } | null} problem
 *                                     Static-analysis problem detected, or null
 */

/**
 * Walk a parsed ref against the phase schemas to figure out what it
 * produces. Catches three problem classes statically:
 *   - MISSING_PHASE_REF — phaseId doesn't exist in the game
 *   - UNKNOWN_RENDERER  — suffix not in KNOWN_SUFFIXES
 *   - RAW_ARRAY_IN_TEMPLATE — phaseField produces array/object/scoreMap
 *                              with no renderer suffix
 *
 * Does NOT throw; problems are returned in `.problem`.
 *
 * @param {ParsedRef} parsed
 * @param {Object} allPhases  config.phases map
 * @returns {ClassifiedRef}
 */
export function classifyRef(parsed, allPhases) {
  const out = {
    ...parsed,
    phaseId: null,
    fieldName: null,
    producedType: null,
    capability: null,
    renderable: false,
    canonicalForm: null,
    problem: null
  };

  // Orchestration / built-in scopes — assume valid; not type-tracked yet.
  // (Phase E refinement could add dynamic types for _current/_foreach.)
  if (parsed.kind !== 'phaseField') {
    out.renderable = true; // optimistic — runtime will catch real problems
    return out;
  }

  if (parsed.segments.length === 0) {
    out.problem = { code: 'UNKNOWN_REF', message: `Empty reference.` };
    return out;
  }

  const phaseId = parsed.segments[0];
  out.phaseId = phaseId;
  const targetPhase = allPhases[phaseId];

  if (!targetPhase) {
    out.problem = { code: 'MISSING_PHASE_REF', message: `Reference to "${phaseId}" but no such step exists.` };
    return out;
  }

  // Is the suffix a known renderer?
  if (parsed.suffix && !KNOWN_SUFFIXES.has(parsed.suffix)) {
    out.problem = { code: 'UNKNOWN_RENDERER', message: `Unknown renderer "${parsed.suffix}".` };
    return out;
  }

  // Look up the producing schema's outputs to find what type the field
  // resolves to. If output is dynamic, resolve against the actual phase
  // config so e.g. ai-process with format:json reports differently than
  // text mode.
  const targetSchema = PHASE_SCHEMAS[targetPhase.type];
  if (!targetSchema) {
    out.renderable = true;
    return out;
  }

  // Apply alias if any. Aliases are declared on the producing phase's
  // schema. e.g. vote.aliases: { barChart: 'scores.barChart' }
  const aliases = targetSchema.aliases || {};
  // Bare {{X.suffix}} where suffix matches an alias key → expand
  if (parsed.segments.length === 1 && parsed.suffix && aliases[parsed.suffix]) {
    out.canonicalForm = `${phaseId}.${aliases[parsed.suffix]}`;
  }
  // {{X.field}} where field matches an alias key (no suffix) → expand
  else if (parsed.segments.length === 2 && !parsed.suffix && aliases[parsed.segments[1]]) {
    out.canonicalForm = `${phaseId}.${aliases[parsed.segments[1]]}`;
  }

  // Identify the leaf field within the phase output.
  const outputs = resolveOutputSpec(targetSchema, targetPhase) || {};
  // Pattern A: {{X.field}}    — segments = [X, field], suffix = null
  // Pattern B: {{X.field.suffix}} — segments = [X, field], suffix = 'list'/'json'/etc.
  // Pattern C: {{X.suffix}}   — segments = [X],   suffix = 'barChart'/'mine'/etc.
  //   (e.g. bare {{vote.barChart}} which aliases to scores.barChart, or
  //   {{collect-choice.barChart}} which the engine resolver auto-pulls
  //   from .tally)

  let leafFieldName = null;
  let outputDef = null;

  if (parsed.segments.length === 1 && parsed.suffix) {
    // Pattern C — no explicit field, suffix on bare phase ref
    // Output isn't directly known; assume it'll resolve at runtime via
    // the engine's bare-suffix shortcut. Mark renderable.
    out.fieldName = null;
    out.producedType = 'string';
    out.renderable = true;
    return out;
  }

  if (parsed.segments.length >= 2) {
    leafFieldName = parsed.segments[1];
    outputDef = outputs[leafFieldName];
  }

  out.fieldName = leafFieldName;

  if (!outputDef) {
    // Field isn't declared in schema output. Could still resolve at
    // runtime — engine.resolve walks the data dynamically. Mark unknown
    // type but renderable so we don't false-positive on things like
    // .winnerName on winner phase that the schema declares.
    out.producedType = null;
    out.renderable = true;
    return out;
  }

  out.producedType = outputDef.type;
  out.capability = outputDef.capability || null;

  // Is the value renderable as a string?
  // - string → yes (always renderable)
  // - integer / boolean → yes (toString is fine)
  // - array / scoreMap / object — NOT renderable directly; needs a renderer suffix
  if (outputDef.type === 'string' || outputDef.type === 'integer' || outputDef.type === 'boolean') {
    out.renderable = true;
  } else if (parsed.suffix) {
    // Has a suffix — renderable if the schema declares this suffix on
    // this output, OR if it's a global suffix (mine on per-player output).
    const declaredRenderers = outputDef.renderers || {};
    if (declaredRenderers[parsed.suffix]) {
      out.renderable = true;
    } else if (parsed.suffix === 'mine' || parsed.suffix === 'assigned') {
      // mine/assigned work on per-player outputs (resolved by server-side
      // helpers before the engine resolver runs).
      out.renderable = true;
    } else {
      out.problem = {
        code: 'RAW_ARRAY_IN_TEMPLATE',
        message: `"${parsed.raw}" uses suffix .${parsed.suffix} but ${phaseId}.${leafFieldName} doesn't support it.`
      };
    }
  } else {
    // Array/scoreMap/object with no suffix — would render as
    // "[object Object],..." — flag it.
    out.problem = {
      code: 'RAW_ARRAY_IN_TEMPLATE',
      message: `"${parsed.raw}":${leafFieldName} is a list and will display as "[object Object],...". Add a suffix like .list or .barChart to format it.`
    };
  }

  return out;
}

// =======================================================================
// dataRef compatibility check (for non-template fields like vote.candidates)
// =======================================================================

/**
 * Given a parsed ref and a field's `accepts: [{type, capability?}, ...]`,
 * return null if compatible or { code, message } if not.
 *
 * Used by the typed-dataflow validator on dataRef fields.
 *
 * @param {ParsedRef} parsed
 * @param {Array<{type: string, capability?: string}>} accepts
 * @param {Object} allPhases
 * @returns {{ code: string, message: string } | null}
 */
export function checkDataRefCompat(parsed, accepts, allPhases) {
  if (!accepts || accepts.length === 0) return null;
  if (parsed.kind !== 'phaseField') return null;
  if (parsed.segments.length < 1) return null;

  const phaseId = parsed.segments[0];
  const targetPhase = allPhases[phaseId];
  if (!targetPhase) return null; // existence check is a separate diagnostic

  const targetSchema = PHASE_SCHEMAS[targetPhase.type];
  if (!targetSchema) return null;

  const outputs = resolveOutputSpec(targetSchema, targetPhase) || {};
  const leaf = parsed.segments[1];
  const outputDef = leaf ? outputs[leaf] : null;

  if (!outputDef) {
    // Field not declared — can't check capability. Don't false-positive.
    return null;
  }

  // Match: { type } must agree, and capability (if `accepts` requires
  // one) must match.
  for (const spec of accepts) {
    if (spec.type !== outputDef.type) continue;
    if (!spec.capability) return null;  // no capability requirement
    if (spec.capability === outputDef.capability) return null;
  }

  // None of the accepted shapes matched.
  const wanted = accepts.map(a =>
    a.capability ? `${a.type}/${a.capability}` : a.type
  ).join(' or ');
  const got = outputDef.capability
    ? `${outputDef.type}/${outputDef.capability}`
    : outputDef.type;
  return {
    code: 'DATA_REF_TYPE_MISMATCH',
    message: `${parsed.raw} produces ${got} but the field needs ${wanted}.`
  };
}
