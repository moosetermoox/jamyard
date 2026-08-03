/**
 * Diagnostic objects — the structured shape every validator returns.
 *
 * Replaces the old "validator emits strings" pattern. Adopting this
 * up front (rather than retrofitting later) is the right call because
 * the editor, AI fixer, docs, and tests all benefit from stable
 * machine codes + paths instead of brittle string matching.
 *
 * Spec: docs/PHASE-SCHEMA-SPEC.md §4 (Diagnostic shape, codes).
 *
 * Adoption is incremental:
 *   - Phase B (this PR): introduce the type, helpers, and code
 *     constants. Convert validator emissions to mkDiagnostic() calls.
 *     Backward compat: .errors / .warnings arrays still expose
 *     `.message` so old string-consuming code keeps working.
 *   - Phase C onward: editor and AI fixer start consuming
 *     `.code` and `.path` directly.
 */

// =======================================================================
// Diagnostic typedef
// =======================================================================

/**
 * @typedef {'error' | 'warning' | 'info'} Severity
 *
 * @typedef {Object} Diagnostic
 * @property {Severity} severity        How serious. Errors block save; warnings are advisory; info is FYI (e.g. legacy syntax).
 * @property {string}   code            Stable machine code from DIAGNOSTIC_CODES below.
 * @property {string}   message         Human-readable, teacher-friendly. Plain English, no jargon.
 * @property {string}   [path]          Dotted JSON path to the offending value, e.g. "phases.vote.mode".
 * @property {string}   [phaseId]       The phase ID this diagnostic is about, if any.
 * @property {string}   [field]         The field name within that phase, if any.
 * @property {string}   [suggestion]    Suggested fix the editor can show inline.
 * @property {string}   [source]        Where the diagnostic came from: 'validator' | 'normalizer' | 'ai-cleanup' | 'graph-pass'.
 * @property {Object}   [autofix]       Optional auto-applicable patch. Shape TBD; today: { kind: 'setField'|'removeField', value? }.
 */

// =======================================================================
// Diagnostic codes — initial set, extend as needed.
//
// Add new codes here so they're discoverable and grep-able. Codes never
// change once a release cycle has shipped; old codes become deprecated
// rather than renamed.
// =======================================================================

export const DIAGNOSTIC_CODES = {
  // Per-field validation
  MISSING_REQUIRED_FIELD:    'MISSING_REQUIRED_FIELD',
  UNKNOWN_FIELD:             'UNKNOWN_FIELD',
  INVALID_ENUM_VALUE:        'INVALID_ENUM_VALUE',
  INVALID_INTEGER_RANGE:     'INVALID_INTEGER_RANGE',
  INVALID_FIELD_TYPE:        'INVALID_FIELD_TYPE',

  // Reference checks
  MISSING_PHASE_REF:         'MISSING_PHASE_REF',
  MISSING_DATA_REF:          'MISSING_DATA_REF',
  DATA_REF_TYPE_MISMATCH:    'DATA_REF_TYPE_MISMATCH',
  UNKNOWN_PHASE_TYPE:        'UNKNOWN_PHASE_TYPE',

  // Template / renderer checks
  RAW_ARRAY_IN_TEMPLATE:     'RAW_ARRAY_IN_TEMPLATE',
  UNKNOWN_RENDERER:          'UNKNOWN_RENDERER',
  LEGACY_TOKEN_FORM:         'LEGACY_TOKEN_FORM',
  SPECIAL_SCOPE_OUT_OF_CONTEXT: 'SPECIAL_SCOPE_OUT_OF_CONTEXT',

  // Graph-level
  UNREACHABLE_PHASE:         'UNREACHABLE_PHASE',
  CYCLE_DETECTED:            'CYCLE_DETECTED',
  MISSING_LOBBY:             'MISSING_LOBBY',
  MISSING_END:               'MISSING_END',

  // Normalizer / cleanup
  UNKNOWN_FIELD_REMOVED:     'UNKNOWN_FIELD_REMOVED',
  COERCED_TYPE:              'COERCED_TYPE',
  DEFAULT_APPLIED:           'DEFAULT_APPLIED',

  // Design-hole warnings (semantic, not structural)
  WAGER_NO_RESOLUTION_BASIS: 'WAGER_NO_RESOLUTION_BASIS',
  TEAM_SPLIT_UNUSED:         'TEAM_SPLIT_UNUSED',
  SCORING_NEVER_AWARDS:      'SCORING_NEVER_AWARDS',

  // Connection pack (docs/connection-pack-spec.md)
  PAIR_SOURCE_NOT_ON_ALL_PATHS: 'PAIR_SOURCE_NOT_ON_ALL_PATHS',
  CONNECTION_FAMILY_VIOLATION:  'CONNECTION_FAMILY_VIOLATION'
};

// =======================================================================
// Validation modes
// =======================================================================

/**
 * Validator + normalizer behavior modes (see spec §5).
 *
 * - strict (default): unknown fields are errors. Used by tests, direct API
 *   saves, developer tools.
 * - ai-cleanup: unknown fields are removed but each removal becomes a
 *   warning diagnostic. Used for AI-generated/-revised configs.
 * - legacy-import: unknown fields removed with warnings. Used during
 *   schema migrations on already-saved games.
 *
 * The key invariant: nothing is dropped silently.
 */
export const VALIDATION_MODES = /** @type {const} */ ({
  STRICT:        'strict',
  AI_CLEANUP:    'ai-cleanup',
  LEGACY_IMPORT: 'legacy-import'
});

// =======================================================================
// Helpers
// =======================================================================

/**
 * Build a Diagnostic with sensible defaults. The most common call site
 * is in validator hooks.
 *
 * @param {Partial<Diagnostic> & { severity: Severity, code: string, message: string }} fields
 * @returns {Diagnostic}
 */
export function mkDiagnostic(fields) {
  return {
    severity: fields.severity,
    code: fields.code,
    message: fields.message,
    ...(fields.path != null     && { path: fields.path }),
    ...(fields.phaseId != null  && { phaseId: fields.phaseId }),
    ...(fields.field != null    && { field: fields.field }),
    ...(fields.suggestion != null && { suggestion: fields.suggestion }),
    ...(fields.source != null   && { source: fields.source }),
    ...(fields.autofix != null  && { autofix: fields.autofix })
  };
}

/**
 * Build a path string from segments (e.g. ['phases', 'vote', 'mode']
 * → "phases.vote.mode"). Centralized so we can change the format
 * (slashes vs dots vs JSON Pointer) without grepping every hook.
 */
export function path(...segments) {
  return segments.filter(s => s != null && s !== '').join('.');
}

/**
 * Filter a diagnostics array by severity. Common pattern in callers
 * that want errors vs warnings separately.
 */
export function bySeverity(diagnostics, severity) {
  return diagnostics.filter(d => d.severity === severity);
}

/**
 * Build a result envelope in the shape Phase B's validate() will
 * return. Saves callers from constructing it themselves.
 *
 * @param {Diagnostic[]} diagnostics
 * @param {any} [config] - the (possibly normalized) config
 * @returns {{ config: any, diagnostics: Diagnostic[], errors: Diagnostic[], warnings: Diagnostic[] }}
 */
export function buildResult(diagnostics, config) {
  return {
    config,
    diagnostics,
    errors:   bySeverity(diagnostics, 'error'),
    warnings: bySeverity(diagnostics, 'warning')
  };
}
