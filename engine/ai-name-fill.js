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
