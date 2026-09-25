/**
 * Phase schema runtime hooks.
 *
 * The phase schema (engine/phase-schemas.js) references behavior by
 * name only — no inline functions. This module holds the actual
 * implementations:
 *
 * - DYNAMIC_OUTPUT_RESOLVERS: compute the output shape of a phase
 *   whose output depends on its config (e.g. ai-process with
 *   format: 'json' has different output than format: 'text').
 *   Schema entry: `output: { kind: 'dynamic', resolver: 'aiProcessOutput' }`
 *
 * This registry is server-side. The schema is browser-safe; this
 * file is not (it can import server-only utilities if needed).
 */

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

  // A return-to-author reveal (scope "own") stores every finished chain as
  // a response row keyed by its starter (engine/phases/chain-reveal.js),
  // so a later vote, reveal-one, or template reads it like a collect step.
  revealOutput(phase) {
    if (!phase || phase.scope !== 'own') return {};
    return {
      responses: {
        type: 'array',
        capability: 'responseArray',
        item: { shape: { playerId: 'string', name: 'string', text: 'string' } },
        renderers: {
          list: 'responseList',
          count: 'arrayCount',
          json: 'jsonPretty'
        }
      },
      chainList: { type: 'string', capability: 'renderable' }
    };
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
    const out = {
      responses: {
        type: 'array',
        capability: 'responseArray',
        item: { shape: itemShape },
        renderers: {
          list: 'responseList',
          count: 'arrayCount',
          json: 'jsonPretty'
        }
      },
      byPlayer: {
        type: 'object',
        renderers: { mine: 'perPlayerLookup' }
      }
    };
    // assigned only exists when this phase rotates from another
    if (phase.rotateFrom) {
      out.assigned = {
        type: 'object',
        renderers: { assigned: 'perPlayerLookup' }
      };
    }
    return out;
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
