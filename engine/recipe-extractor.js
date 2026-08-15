/**
 * Recipe extractor — turn a built game into a reusable recipe.
 *
 * R5 of the recipe layer. Two operations:
 *
 *   extractCandidates(gameConfig)
 *     Walks the config and finds every field that *could* become a
 *     parameter — strings, templates, integers, booleans, enums,
 *     arrays. Skips structural fields (dataRef, phaseRef) since those
 *     are graph wiring, not content. Returns a list with auto-suggested
 *     names + labels so the modal has something sensible to render.
 *
 *   buildUserRecipe(gameConfig, paramSpecs, metadata)
 *     Given the user's finalized choices (which paths to parameterize,
 *     with what names + labels) and recipe metadata, produces a
 *     validated Recipe object that can be saved to recipes/user/.
 *     Substitutes ${name} placeholders into the template at the chosen
 *     paths.
 *
 * Path format throughout: dotted strings like "phases.ask.prompt" or
 * top-level "name". Used by getValueAtPath/setValueAtPath helpers.
 */

import { PHASE_SCHEMAS, getFields } from './phase-schemas.js';
import { validateRecipe } from './recipe-schema.js';
import { mkDiagnostic } from './diagnostics.js';

// =======================================================================
// Field-type filter — what counts as a parameter candidate?
// =======================================================================

const PARAMETERIZABLE_TYPES = new Set([
  'string',
  'templateString',
  'integer',
  'boolean',
  'enum',
  'array'
]);

// Fields skipped even if their type is parameterizable. These are
// either structural (set by the AI generator, never tweaked by humans)
// or covered by a different mixin and best left at default.
const SKIP_FIELDS = new Set([
  'hostShow', 'playerShow', 'hostTemplate', 'playerTemplate',  // screen-control
  'loopBack', 'loopCount'  // structural transitions
]);

// =======================================================================
// extractCandidates — walk a config, list parameter candidates
// =======================================================================

/**
 * @typedef {Object} RecipeCandidate
 * @property {string} path           Dotted path: "phases.ask.prompt" or "name"
 * @property {string} [phaseId]      For per-phase candidates, the phase id
 * @property {string} fieldName      Field name (e.g. "prompt")
 * @property {string} fieldType      Type from phase schema: "string"|"integer"|...
 * @property {*} currentValue        The value currently at this path
 * @property {string} suggestedName  Auto-generated parameter name
 * @property {string} suggestedLabel Auto-generated UI label
 * @property {boolean} required      From schema (or true for top-level name)
 * @property {Object} schemaSpec     The original field schema spec (for type-specific properties like enum.values)
 */

/**
 * @param {Object} gameConfig
 * @returns {RecipeCandidate[]}
 */
export function extractCandidates(gameConfig) {
  const candidates = [];

  // Top-level: name + description are almost always parameters.
  if (typeof gameConfig.name === 'string') {
    candidates.push({
      path: 'name',
      phaseId: null,
      fieldName: 'name',
      fieldType: 'templateString',
      currentValue: gameConfig.name,
      suggestedName: 'gameName',
      suggestedLabel: 'Game name',
      required: true,
      schemaSpec: { type: 'templateString' }
    });
  }
  if (typeof gameConfig.description === 'string') {
    candidates.push({
      path: 'description',
      phaseId: null,
      fieldName: 'description',
      fieldType: 'string',
      currentValue: gameConfig.description,
      suggestedName: 'gameDescription',
      suggestedLabel: 'Game description',
      required: false,
      schemaSpec: { type: 'string' }
    });
  }

  // Per-phase fields
  if (gameConfig.phases && typeof gameConfig.phases === 'object') {
    // First pass: collect candidates with their preferred names
    const perPhase = [];
    for (const [phaseId, phase] of Object.entries(gameConfig.phases)) {
      if (!phase || typeof phase !== 'object') continue;
      const phaseType = phase.type;
      const schema = PHASE_SCHEMAS[phaseType];
      if (!schema) continue;

      const allFields = getFields(phaseType);
      for (const [fieldName, fieldSpec] of Object.entries(allFields)) {
        if (SKIP_FIELDS.has(fieldName)) continue;
        if (!PARAMETERIZABLE_TYPES.has(fieldSpec.type)) continue;
        if (phase[fieldName] === undefined) continue;

        const value = phase[fieldName];
        // Skip values that are already template tokens (e.g. {{X.field}})
        // — they're computed at runtime, not configurable.
        if (typeof value === 'string' && /^\{\{[^}]+\}\}$/.test(value.trim())) continue;

        perPhase.push({
          path: `phases.${phaseId}.${fieldName}`,
          phaseId,
          fieldName,
          fieldType: fieldSpec.type,
          currentValue: value,
          required: !!fieldSpec.required,
          schemaSpec: fieldSpec,
          // Preferred name: just the field name when there's no collision
          // across phases; we resolve collisions in pass 2.
          preferredName: fieldName
        });
      }
    }

    // Second pass: resolve naming collisions. If multiple phases have a
    // "prompt" field, prefix with phase id ("ask-prompt", "vote-prompt").
    const nameCounts = {};
    for (const c of perPhase) {
      nameCounts[c.preferredName] = (nameCounts[c.preferredName] || 0) + 1;
    }
    for (const c of perPhase) {
      const collides = nameCounts[c.preferredName] > 1;
      const baseName = collides
        ? `${c.phaseId}-${c.preferredName}`
        : c.preferredName;
      c.suggestedName = sanitizeParamName(baseName);
      c.suggestedLabel = humanizeLabel(c.fieldName, c.phaseId);
      delete c.preferredName;
      candidates.push(c);
    }
  }

  return candidates;
}

// =======================================================================
// buildUserRecipe — construct + validate a finalized recipe
// =======================================================================

/**
 * @typedef {Object} ParamSpec  User-finalized choice for one parameter.
 * @property {string} path           Dotted path in the original config
 * @property {string} name           Parameter name (must be unique within recipe)
 * @property {string} [label]
 * @property {string} [helper]
 * @property {boolean} [required]    Override the schema-derived default
 */

/**
 * @typedef {Object} RecipeMetadata
 * @property {string} id             Filename-safe identifier
 * @property {string} name
 * @property {string} [icon]
 * @property {string} description
 * @property {string} [tagline]
 */

/**
 * @param {Object} gameConfig
 * @param {ParamSpec[]} paramSpecs
 * @param {RecipeMetadata} metadata
 * @returns {{ recipe: Object | null, diagnostics: import('./diagnostics.js').Diagnostic[] }}
 */
export function buildUserRecipe(gameConfig, paramSpecs, metadata) {
  const diagnostics = [];

  // Sanity check inputs
  if (!gameConfig || typeof gameConfig !== 'object') {
    return errorDiag(diagnostics, 'No game config provided.');
  }
  if (!metadata || typeof metadata !== 'object') {
    return errorDiag(diagnostics, 'Recipe metadata is required.');
  }
  if (!metadata.id || typeof metadata.id !== 'string') {
    return errorDiag(diagnostics, 'Recipe id is required.');
  }
  if (!/^[a-z0-9-]+$/i.test(metadata.id)) {
    return errorDiag(diagnostics, `Recipe id "${metadata.id}" must be alphanumeric (with optional dashes).`);
  }
  if (!metadata.name || typeof metadata.name !== 'string') {
    return errorDiag(diagnostics, 'Recipe name is required.');
  }
  if (!metadata.description || typeof metadata.description !== 'string') {
    return errorDiag(diagnostics, 'Recipe description is required.');
  }

  // Detect duplicate parameter names
  const seenNames = new Set();
  for (const spec of paramSpecs || []) {
    if (!spec.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(spec.name)) {
      return errorDiag(diagnostics, `Parameter name "${spec.name}" must start with a letter or underscore and contain only letters, numbers, and underscores.`);
    }
    if (seenNames.has(spec.name)) {
      return errorDiag(diagnostics, `Duplicate parameter name "${spec.name}".`);
    }
    seenNames.add(spec.name);
  }

  // Build the parameters block + the modified template (deep clone first)
  const template = deepClone(gameConfig);
  // A recipe-born config carries a provenance stamp; a stale copy baked
  // into a new template would be overwritten at compile time anyway, but
  // keep templates clean of it.
  delete template.recipe;
  const parameters = {};

  // We need the candidate list to know each path's field type + schema
  // (so we know how to express the param spec).
  const allCandidates = extractCandidates(gameConfig);
  const byPath = new Map(allCandidates.map(c => [c.path, c]));

  for (const spec of paramSpecs || []) {
    const candidate = byPath.get(spec.path);
    if (!candidate) {
      return errorDiag(diagnostics, `No candidate field at path "${spec.path}".`);
    }

    parameters[spec.name] = buildParamSpec(spec, candidate);

    // Substitute ${name} into the template at this path
    setValueAtPath(template, spec.path, '${' + spec.name + '}');
  }

  const recipe = {
    id: metadata.id,
    name: metadata.name,
    icon: metadata.icon || '🎯',
    description: metadata.description,
    tagline: metadata.tagline || undefined,
    version: '1',
    parameters,
    template
  };

  // Strip undefined fields (icon may be unset, tagline often is)
  for (const key of Object.keys(recipe)) {
    if (recipe[key] === undefined) delete recipe[key];
  }

  // Validate the final recipe shape
  const validationDiags = validateRecipe(recipe);
  diagnostics.push(...validationDiags);
  const errors = validationDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { recipe: null, diagnostics };
  }

  return { recipe, diagnostics };
}

// =======================================================================
// Helpers
// =======================================================================

function buildParamSpec(spec, candidate) {
  const out = {
    type: candidate.fieldType,
    label: spec.label || candidate.suggestedLabel
  };

  // Only set a default when the original value is meaningful. A `null`
  // timer (or any null value) shouldn't pre-fill the form with "null"
  // — leave the field empty so teachers see what they need to fill in.
  if (candidate.currentValue != null && candidate.currentValue !== '') {
    out.default = deepClone(candidate.currentValue);
  }

  if (spec.helper) out.helper = spec.helper;
  if (spec.required != null) {
    if (spec.required) out.required = true;
  } else if (candidate.required) {
    out.required = true;
  }

  // Type-specific properties pulled through from the schema spec
  const orig = candidate.schemaSpec || {};
  if (out.type === 'enum' && Array.isArray(orig.values)) {
    out.values = [...orig.values];
  }
  if (out.type === 'array' && orig.item) {
    out.item = { type: orig.item.type || 'string' };
    if (orig.minItems != null) out.minItems = orig.minItems;
    if (orig.maxItems != null) out.maxItems = orig.maxItems;
  }
  if (out.type === 'integer') {
    if (orig.min != null) out.min = orig.min;
    if (orig.max != null) out.max = orig.max;
  }
  if ((out.type === 'string' || out.type === 'templateString')) {
    if (orig.minLength != null) out.minLength = orig.minLength;
    if (orig.maxLength != null) out.maxLength = orig.maxLength;
  }

  return out;
}

function sanitizeParamName(name) {
  // Convert "ask-prompt" → "askPrompt" for camelCase, more JS-friendly
  // when teachers see it later. Also strips invalid chars.
  return name
    .replace(/[^a-zA-Z0-9_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, '');
}

function humanizeLabel(fieldName, phaseId) {
  const FRIENDLY = {
    prompt: 'Question to ask',
    message: 'Message to show',
    instruction: 'Instructions for AI',
    template: 'Display template',
    content: 'Content',
    timer: 'Time limit (seconds)',
    choices: 'Answer choices',
    percent: 'Percent to eliminate',
    rounds: 'Number of rounds',
    teamCount: 'Number of teams',
    decoyCount: 'Decoy choices',
    voters: 'Who votes',
    from: 'Who participates',
    mode: 'Voting style',
    method: 'Method',
    style: 'Display style',
    order: 'Turn order'
  };
  if (FRIENDLY[fieldName]) {
    return phaseId
      ? `${FRIENDLY[fieldName]} (${phaseId})`
      : FRIENDLY[fieldName];
  }
  // Fallback: humanize from camelCase / kebab-case
  const humanized = fieldName
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
  return phaseId ? `${humanized} (${phaseId})` : humanized;
}

function getValueAtPath(obj, path) {
  return path.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

function setValueAtPath(obj, path, value) {
  const segments = path.split('.');
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = cur[segments[i]];
    if (cur == null) return;
  }
  cur[segments[segments.length - 1]] = value;
}

function deepClone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
  return out;
}

function errorDiag(diagnostics, message) {
  diagnostics.push(mkDiagnostic({
    severity: 'error',
    code: 'RECIPE_BUILD_ERROR',
    message,
    source: 'validator'
  }));
  return { recipe: null, diagnostics };
}
