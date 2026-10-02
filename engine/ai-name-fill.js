/**
 * COPPA/FERPA data minimization, output side. Student names are never sent
 * to the AI (prompts carry pseudonymous playerIds only — see
 * AIService._buildUserMessage). But shipped and AI-generated games ask the
 * model to return per-player objects whose `playerName` feeds reveal
 * templates ({{_current.playerName}}). This walker re-fills those names
 * SERVER-side after the AI responds: for any object carrying a playerId we
 * recognize, `playerName` is set to the real name from the player registry.
 *
 * Truth improves too: the model can no longer garble an echoed name — the
 * registry's spelling always wins. Unknown playerIds are left untouched
 * (AI-invented entries stay whatever the AI said, and get filtered by the
 * existing downstream lookups).
 */

/**
 * Deep-fill playerName on any object with a recognized playerId. Mutates
 * in place and returns the value (JSON.parse output is acyclic, so a
 * plain recursive walk is safe).
 *
 * @param {*} value                     parsed AI output (any JSON shape)
 * @param {(id: string) => string|null} lookupName  playerId → real name (or null)
 * @returns {*} the same value, names filled
 */
export function fillPlayerNames(value, lookupName) {
  if (Array.isArray(value)) {
    for (const item of value) fillPlayerNames(item, lookupName);
    return value;
  }
  if (value && typeof value === 'object') {
    if (typeof value.playerId === 'string') {
      const name = lookupName(value.playerId);
      if (name) value.playerName = name;
    }
    for (const v of Object.values(value)) fillPlayerNames(v, lookupName);
    return value;
  }
  return value;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The prompts label each answer "[playerId: abc123]" so judge and compare
 * steps can point back at a student. A prose reply must never carry one:
 * a reviewer's One More Thing summary put "(from playerId 43I2B8I0bv...)"
 * on the projector with names hidden (2026-10-02). Strips the labelled
 * forms and any known id standing bare in the words; a quoted id (a JSON
 * key or value the server reads back) stays. Run on every process()
 * reply before it is stored.
 *
 * @param {string} text           the model's reply
 * @param {string[]} [knownIds]   the playerIds that went out in the prompt
 * @returns {string}
 */
export function stripPlayerIdRefs(text, knownIds = []) {
  if (typeof text !== 'string' || text === '') return text;
  let out = text
    // "(from playerId X)", "[playerId: X]", "(player id X)"
    .replace(/[ \t]*[([]\s*(?:from\s+|by\s+)?(?:player\s*id|playerid)\s*:?\s*[A-Za-z0-9_-]{4,}\s*[)\]]/gi, '')
    // the same unbracketed: "from playerId X" (never the JSON key, whose
    // name is followed by a quote)
    .replace(/[ \t]*\b(?:from\s+|by\s+)?(?:player\s*id|playerid):?\s+[A-Za-z0-9_-]{4,}/gi, '');
  // A bare id goes too, unless it sits in quotes: that is a JSON value or
  // key ({"winner": "abc123"}) the server reads back
  for (const id of knownIds) {
    if (typeof id !== 'string' || id.length < 6) continue;
    const e = escapeRe(id);
    out = out
      .replace(new RegExp(`[ \\t]*[([]\\s*(?:from\\s+|by\\s+)?${e}\\s*[)\\]]`, 'g'), '')
      .replace(new RegExp(`[ \\t]*(?:from\\s+|by\\s+)?(?<!["'\\w-])${e}(?![\\w"'-])`, 'g'), '');
  }
  return out
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    // "One list, from playerId X, named..." leaves a doubled comma
    .replace(/,(?=[.,;:!?])/g, '');
}
