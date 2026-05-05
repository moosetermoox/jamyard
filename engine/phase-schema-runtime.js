/**
 * Phase schema runtime hooks.
 *
 * The phase schema (engine/phase-schemas.js) references behavior by
 * name only — no inline functions. This module holds the actual
 * implementations:
 *
 * - VALIDATOR_HOOKS: schema-level cross-field validators.
 *   Schema entry: `validate: 'wagerNoResolutionBasis'`
 *
 * - DYNAMIC_OUTPUT_RESOLVERS: compute the output shape of a phase
 *   whose output depends on its config (e.g. ai-process with
 *   format: 'json' has different output than format: 'text').
 *   Schema entry: `output: { kind: 'dynamic', resolver: 'aiProcessOutput' }`
 *
 * Both registries are server-side. The schema is browser-safe; this
 * file is not (it can import server-only utilities if needed).
 *
 * Diagnostic shape returned by validators:
 *   { severity: 'error'|'warning'|'info', code, message, suggestion? }
 *
 * Phase B of the migration plan (see docs/PHASE-SCHEMA-SPEC.md §12)
 * formalizes the Diagnostic shape and adds path/phaseId/field to every
 * diagnostic. These hooks return the bare-bones shape for now.
 */

// -----------------------------------------------------------------------
// VALIDATOR_HOOKS — schema-level cross-field validators
// -----------------------------------------------------------------------

export const VALIDATOR_HOOKS = {

  // eliminate: bottom-percent needs percent; hook needs hook name
  eliminateMethodFields(phase) {
    const errs = [];
    if (phase.method === 'bottom-percent' && phase.percent == null) {
      errs.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'bottom-percent method requires "Percent to eliminate".'
      });
    }
    if (phase.method === 'hook' && !phase.hook) {
      errs.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'hook method requires a hook function name.'
      });
    }
    return errs;
  },

  // preview: must have either content or template
  previewContentOrTemplate(phase) {
    if (!phase.content && !phase.template) {
      return [{
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Either content or template must be set on a preview step.'
      }];
    }
    return [];
  },

  // reveal: must have either template or content
  revealContentOrTemplate(phase) {
    if (!phase.template && !phase.content) {
      return [{
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Either template or content must be set on a reveal step.'
      }];
    }
    return [];
  },

  // team-split: balanced method requires balanceFrom
  teamSplitBalancedNeedsScores(phase) {
    if (phase.method === 'balanced' && !phase.balanceFrom) {
      return [{
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'balanced method requires "Scores to balance against".'
      }];
    }
    return [];
  },

  // wager: warn when neither correctOption nor scoresFrom is set
  // (host has to manually pick winner, players bet meaninglessly)
  wagerNoResolutionBasis(phase) {
    if (!phase.scoresFrom && !phase.correctOption) {
      return [{
        severity: 'warning',
        code: 'WAGER_NO_RESOLUTION_BASIS',
        message: 'Players will start with default points and the host will pick the winner manually. Set "Correct answer" or "Players\' available points" if you want it to auto-resolve.'
      }];
    }
    return [];
  },

  // foreach: scoring config validation
  foreachScoringValid(phase) {
    const errs = [];
    if (phase.scoring) {
      if (!phase.scoring.subPhase) {
        errs.push({
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Scoring must specify which sub-phase to score on.'
        });
      }
      if (phase.scoring.mode === 'tally' && !phase.scoring.pointMap) {
        errs.push({
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Tally scoring requires a pointMap (e.g. {1: 1, 2: 2, 3: 3}).'
        });
      }
      if (phase.scoring.mode !== 'tally' && !phase.scoring.correctAnswer) {
        errs.push({
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Correct-answer scoring requires "correctAnswer".'
        });
      }
    }
    if (phase.pairMode && !phase.aiInject) {
      errs.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'pairMode requires aiInject (need AI items to pair with).'
      });
    }
    return errs;
  }
};

export function getValidatorHook(name) {
  return VALIDATOR_HOOKS[name] || null;
}

// -----------------------------------------------------------------------
// DYNAMIC_OUTPUT_RESOLVERS — compute output shape from phase config
// -----------------------------------------------------------------------

/**
 * Each resolver receives the phase config and returns an output spec
 * in the same shape as a static `output.fields` block:
 *   { fieldName: { type, capability?, renderers? } }
 */
export const DYNAMIC_OUTPUT_RESOLVERS = {

  // ai-process output depends on format and perPlayer
  aiProcessOutput(phase) {
    const out = {};
    if (phase.format === 'json') {
      // result is the parsed JSON value (array or object) — no static type
      out.result = { type: 'object', capability: null };
    } else {
      out.result = { type: 'string', capability: 'renderable' };
    }
    if (phase.perPlayer) {
      out.byPlayer = {
        type: 'object',
        renderers: { mine: 'perPlayerLookup' }
      };
    }
    return out;
  },

  // collect output depends on whether multi-field is enabled
  collectOutput(phase) {
    const itemShape = {
      playerId: 'string',
      name: 'string',
      text: 'string'
    };
    if (Array.isArray(phase.fields) && phase.fields.length > 0) {
      itemShape.fields = { type: 'object' };
    }
    return {
      responses: {
        type: 'array',
        capability: 'responseArray',
        item: { shape: itemShape },
        renderers: {
          list: 'responseList',
          count: 'arrayCount',
          json: 'jsonPretty'
        }
      }
    };
  }
};

export function getDynamicOutputResolver(name) {
  return DYNAMIC_OUTPUT_RESOLVERS[name] || null;
}

/**
 * Resolve the output spec of a phase, whether static or dynamic.
 * Returns the resolved field map; consumers iterate over it the same
 * way regardless of kind.
 */
export function resolveOutputSpec(schemaEntry, phaseConfig) {
  const out = schemaEntry.output;
  if (!out) return {};
  if (out.kind === 'dynamic') {
    const resolver = getDynamicOutputResolver(out.resolver);
    return resolver ? resolver(phaseConfig) : {};
  }
  return out.fields || {};
}
