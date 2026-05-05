/**
 * Renderer registry — actual functions that turn output values into
 * displayable strings.
 *
 * The phase schema (engine/phase-schemas.js) references renderers by
 * name only (e.g. `renderers: { list: 'responseList' }`). This module
 * holds the implementations.
 *
 * Why a separate module: the schema must stay browser-safe and purely
 * declarative. Renderers may depend on engine internals (e.g. shared
 * formatters) and are server-side primarily.
 *
 * Migration note: most of these functions are placeholders that defer
 * to existing code in engine/game-engine.js (formatList,
 * formatBarChart). Phase E of the migration plan will fully move
 * those implementations here.
 */

/**
 * Each entry: function (value) -> string
 * Names are referenced from PHASE_SCHEMAS[type].output.fields.X.renderers
 */
export const RENDERER_REGISTRY = {

  // Numbered list of items. Accepts an array of strings or array of
  // objects (uses .text > .name > .response > JSON fallback).
  responseList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.map((item, i) => {
      const text = typeof item === 'string'
        ? item
        : (item && (item.text || item.name || item.response)) || JSON.stringify(item);
      return `${i + 1}. ${text}`;
    }).join('\n');
  },

  // Same as responseList for now — kept distinct in the schema in case
  // ranking lists need positional info ("avg #2.3") later.
  rankingList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.map((item, i) => {
      const text = typeof item === 'string'
        ? item
        : (item && (item.item || item.text || item.name)) || JSON.stringify(item);
      return `${i + 1}. ${text}`;
    }).join('\n');
  },

  arrayCount(arr) {
    return Array.isArray(arr) ? String(arr.length) : '0';
  },

  jsonPretty(val) {
    return JSON.stringify(val, null, 2);
  },

  // ASCII bar chart of a tally / scoreMap. Real implementation lives in
  // engine/game-engine.js as `formatBarChart`. Phase E will move it here.
  // For now this is a marker that the registry knows the name.
  tallyBarChart(_tally) {
    // TODO Phase E: import formatBarChart from game-engine.js (or move it here)
    return '';
  },

  // Per-player AI output is resolved at the template layer per-recipient
  // (see resolvePerPlayerTemplate in server.js). Listed here so the
  // validator knows `.mine` is a recognized suffix.
  perPlayerLookup(_byPlayer) {
    return '';
  }
};

/**
 * Resolves a renderer function by name. Returns null if unknown so the
 * validator can emit UNKNOWN_RENDERER for typos.
 */
export function getRendererFn(name) {
  return RENDERER_REGISTRY[name] || null;
}

/**
 * Returns the set of registered renderer names. Used by the validator
 * to check that every `renderers: { suffix: 'name' }` reference in the
 * schema points to an existing function.
 */
export function getRegisteredRendererNames() {
  return new Set(Object.keys(RENDERER_REGISTRY));
}
