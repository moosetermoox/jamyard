/**
 * normalizeConfig — the first step in the validation pipeline.
 *
 * Spec: docs/PHASE-SCHEMA-SPEC.md §7.
 *
 * Pipeline stages, in order:
 *   1. Coerce form-string values to declared types where safe.
 *   2. Resolve legacy token aliases in template strings (emit
 *      LEGACY_TOKEN_FORM info diagnostics).
 *   3. (Optional) Apply field defaults — disabled by default to
 *      preserve saved-JSON shape; opt-in via { applyDefaults: true }.
 *   4. In ai-cleanup / legacy-import modes: drop unknown fields and
 *      emit UNKNOWN_FIELD_REMOVED warnings. (Strict mode leaves them
 *      so the validator can error.)
 *
 * Returns { config, diagnostics }. Never mutates the input.
 *
 * Design choices worth flagging for the next reviewer pass:
 *   - applyDefaults defaults to false. Baking defaults into saved
 *     configs changes their shape and disagrees with the schema if
 *     the default later changes. Today the validator and engine read
 *     defaults at lookup time. Phase F's editor migration may want
 *     to apply at form-render time (`{ applyDefaults: true }`).
 *   - The alias system (Phase E) only rewrites tokens whose target
 *     phase has an `aliases` map in its schema. Today only `vote`
 *     and `collect-choice` have aliases; behavior is a no-op for
 *     other phases.
 */

import {
  PHASE_SCHEMAS,
  getFields,
  getTransitions,
  getAliases
} from './phase-schemas.js';
import {
  mkDiagnostic,
  DIAGNOSTIC_CODES,
  VALIDATION_MODES,
  path
} from './diagnostics.js';

// Template fields the alias resolver scans. (Same set used by the
// existing template-scan validator in game-loader.js.)
const TEMPLATE_FIELDS = [
  'template', 'content', 'message', 'prompt',
  'instruction', 'hostTemplate', 'playerTemplate'
];

// =======================================================================
// Public API
// =======================================================================

/**
 * @param {any} rawConfig  - the game config as parsed JSON
 * @param {string} [mode]  - one of VALIDATION_MODES (default: STRICT)
 * @param {{ applyDefaults?: boolean, gameId?: string }} [opts]
 * @returns {{ config: any, diagnostics: import('./diagnostics.js').Diagnostic[] }}
 */
export function normalizeConfig(rawConfig, mode = VALIDATION_MODES.STRICT, opts = {}) {
  const config = deepClone(rawConfig);
  const diagnostics = [];
  const applyDefaults = !!opts.applyDefaults;

  if (!config || !config.phases || typeof config.phases !== 'object') {
    return { config, diagnostics };
  }

  // 1-3: per-phase normalization (coerce, defaults, drop-unknown)
  for (const [phaseId, phase] of Object.entries(config.phases)) {
    if (!phase || typeof phase !== 'object') continue;
    normalizePhase(phase, phaseId, mode, applyDefaults, diagnostics, { context: 'topLevel' });
    if (phase.type === 'foreach' && phase.subPhases && typeof phase.subPhases === 'object') {
      for (const [subId, sub] of Object.entries(phase.subPhases)) {
        if (!sub || typeof sub !== 'object') continue;
        normalizePhase(sub, `${phaseId}.subPhases.${subId}`, mode, applyDefaults, diagnostics, { context: 'foreach' });
      }
    }
  }

  // 4: alias resolution across all template strings
  resolveAliases(config, diagnostics);

  return { config, diagnostics };
}

// =======================================================================
// Per-phase normalization
// =======================================================================

function normalizePhase(phase, phasePath, mode, applyDefaults, diagnostics, { context }) {
  if (!phase.type || !PHASE_SCHEMAS[phase.type]) {
    // Unknown phase type — validator will report. Skip normalization.
    return;
  }
  // Schema lookup will only return fields if the phase type is allowed
  // in this context. If not, leave the phase alone — validator will error.
  if (!PHASE_SCHEMAS[phase.type].allowedIn.includes(context)) return;

  const fields      = getFields(phase.type, { context });
  const transitions = context === 'topLevel' ? getTransitions(phase.type) : {};
  const allowed     = new Set(['type', ...Object.keys(fields), ...Object.keys(transitions)]);
  // foreach has subPhases as a structural field, not in the field map
  if (phase.type === 'foreach') allowed.add('subPhases');

  // 1. Coerce form-string values
  for (const [fname, fdef] of Object.entries(fields)) {
    const v = phase[fname];
    if (v === undefined || v === null) continue;
    const result = coerce(v, fdef);
    if (result.changed) {
      phase[fname] = result.value;
      diagnostics.push(mkDiagnostic({
        severity: 'info',
        code: DIAGNOSTIC_CODES.COERCED_TYPE,
        path: path(phasePath, fname),
        field: fname,
        source: 'normalizer',
        message: `Coerced "${fname}" from string to ${fdef.type}.`
      }));
    }
  }

  // 2. Apply defaults (opt-in)
  if (applyDefaults) {
    for (const [fname, fdef] of Object.entries(fields)) {
      if (fdef.default === undefined) continue;
      if (phase[fname] !== undefined && phase[fname] !== null) continue;
      phase[fname] = fdef.default;
      diagnostics.push(mkDiagnostic({
        severity: 'info',
        code: DIAGNOSTIC_CODES.DEFAULT_APPLIED,
        path: path(phasePath, fname),
        field: fname,
        source: 'normalizer',
        message: `Applied default: ${fname} = ${JSON.stringify(fdef.default)}.`
      }));
    }
  }

  // 3. Drop unknown fields in non-strict modes
  if (mode === VALIDATION_MODES.AI_CLEANUP || mode === VALIDATION_MODES.LEGACY_IMPORT) {
    for (const fname of Object.keys(phase)) {
      if (allowed.has(fname)) continue;
      diagnostics.push(mkDiagnostic({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.UNKNOWN_FIELD_REMOVED,
        path: path(phasePath, fname),
        field: fname,
        source: mode === VALIDATION_MODES.AI_CLEANUP ? 'ai-cleanup' : 'normalizer',
        message: `Removed unsupported field "${fname}" from ${phase.type} step.`,
        autofix: { kind: 'removeField' }
      }));
      delete phase[fname];
    }
  }
}

// =======================================================================
// Coercion — only safe transforms (no truthy hacks, no number parsing
// of arbitrary strings). The goal is to absorb HTML form values, not
// to be a generic JSON repair tool.
// =======================================================================

function coerce(value, fdef) {
  if (fdef.type === 'integer' && typeof value === 'string' && value.trim() !== '') {
    // Strict integer: must be all digits (with optional leading minus)
    if (/^-?\d+$/.test(value.trim())) {
      const n = Number(value);
      if (!isNaN(n)) return { changed: true, value: n };
    }
  }
  if (fdef.type === 'boolean' && typeof value === 'string') {
    if (value === 'true')  return { changed: true, value: true };
    if (value === 'false') return { changed: true, value: false };
  }
  return { changed: false, value };
}

// =======================================================================
// Alias resolution — rewrites legacy synthetic-token forms.
//
// Today the only alias in the schema is on `vote`:
//   {{vote.barChart}} → {{vote.scores.barChart}}
// (vote stores `scores`, not `tally` like collect-choice does, so the
// bare {{X.barChart}} pattern wouldn't naturally work on vote.)
//
// Each rewrite emits a LEGACY_TOKEN_FORM info diagnostic so the editor
// can flag it for the teacher.
// =======================================================================

function resolveAliases(config, diagnostics) {
  const tokenRe = /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_]+)\s*\}\}/g;

  for (const [phaseId, phase] of Object.entries(config.phases)) {
    if (!phase || typeof phase !== 'object') continue;
    for (const tplField of TEMPLATE_FIELDS) {
      const tpl = phase[tplField];
      if (typeof tpl !== 'string') continue;

      const rewritten = tpl.replace(tokenRe, (match, refPhase, leaf) => {
        const targetPhase = config.phases[refPhase];
        if (!targetPhase) return match;
        const aliases = getAliases(targetPhase.type);
        const canonical = aliases[leaf];
        if (!canonical) return match;
        diagnostics.push(mkDiagnostic({
          severity: 'info',
          code: DIAGNOSTIC_CODES.LEGACY_TOKEN_FORM,
          path: path('phases', phaseId, tplField),
          phaseId,
          field: tplField,
          source: 'normalizer',
          message: `"{{${refPhase}.${leaf}}}" is a legacy form; rewrote to "{{${refPhase}.${canonical}}}".`,
          suggestion: `Update the template to use {{${refPhase}.${canonical}}}.`
        }));
        return `{{${refPhase}.${canonical}}}`;
      });

      if (rewritten !== tpl) phase[tplField] = rewritten;
    }
  }
}

// =======================================================================
// Utilities
// =======================================================================

function deepClone(obj) {
  if (obj == null) return obj;
  return JSON.parse(JSON.stringify(obj));
}
