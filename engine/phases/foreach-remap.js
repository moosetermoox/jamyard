/**
 * Rewrite sibling sub-phase references inside one foreach iteration's cloned
 * sub-config. Extracted from setupForeachIteration (server.js).
 *
 * Each iteration injects its sub-phases under virtual `_fe:<foreach>:<name>`
 * ids, so any field where one sub-phase names a sibling ("titles.responses"
 * in the same round) must be rewritten to the virtual id or it would read
 * the ORIGINAL (nonexistent) phase id. Covered fields:
 *
 *   - message / prompt: `{{titles.responses}}`-style template tokens
 *   - input / content: bare dataRef strings
 *   - choicePool[].from + excludeAuthored: the bluff-vote pattern, a
 *     collect-choice pooling a sibling collect's fakes (Doodle Bluff)
 *
 * Refs that name phases OUTSIDE the foreach pass through untouched.
 * Mutates subConfig in place (it is already a per-iteration clone).
 */
/**
 * Eagerly resolve `{{_current.*}}` tokens in a cloned sub-config, using the
 * live iteration item. Runs at iteration setup, BEFORE any runtime template
 * pass, because the per-player resolver special-cases refs like
 * "x.assigned" and would turn "{{_current.assigned}}" into a placeholder
 * instead of the item's value (the truth silently vanished from Doodle
 * Bluff's ballots this way). Unresolvable tokens stay for runtime.
 *
 * Covers the fields where an item value can appear: message, prompt,
 * correctAnswer, and choicePool literals. Mutates subConfig in place.
 */
export function resolveCurrentRefsInSubConfig(subConfig, resolve) {
  const resolveCurrent = (str) =>
    str.replace(/\{\{(_current[^}]*)\}\}/g, (match, ref) => {
      const value = resolve(ref.trim());
      return value !== undefined ? String(value) : match;
    });

  for (const field of ['message', 'prompt', 'correctAnswer']) {
    if (typeof subConfig[field] === 'string') subConfig[field] = resolveCurrent(subConfig[field]);
  }
  if (Array.isArray(subConfig.choicePool)) {
    // Copy-on-write: the caller's subConfig is a SHALLOW clone, so the
    // choicePool entry objects are shared with the original config. Baking
    // this iteration's value into them would make every later iteration
    // reuse it (round 2's "truth" would be round 1's phrase).
    subConfig.choicePool = subConfig.choicePool.map(src => (src && typeof src === 'object' ? { ...src } : src));
    for (const src of subConfig.choicePool) {
      if (src && typeof src.literal === 'string') src.literal = resolveCurrent(src.literal);
    }
  }
}

export function remapForeachSubConfig(subConfig, subNames, foreachPhaseId) {
  const virtualize = (ref) => {
    const parts = String(ref).split('.');
    if (!subNames.includes(parts[0])) return null;
    return `_fe:${foreachPhaseId}:${parts[0]}` + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
  };

  const remapTemplates = (str) =>
    str.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
      const mapped = virtualize(ref.trim());
      return mapped ? `{{${mapped}}}` : match;
    });

  if (subConfig.message) subConfig.message = remapTemplates(subConfig.message);
  if (subConfig.prompt) subConfig.prompt = remapTemplates(subConfig.prompt);

  if (typeof subConfig.input === 'string') {
    const mapped = virtualize(subConfig.input);
    if (mapped) subConfig.input = mapped;
  }
  if (typeof subConfig.content === 'string') {
    const mapped = virtualize(subConfig.content);
    if (mapped) subConfig.content = mapped;
  }

  if (Array.isArray(subConfig.choicePool)) {
    // Copy-on-write (see resolveCurrentRefsInSubConfig): never mutate the
    // original config's entry objects.
    subConfig.choicePool = subConfig.choicePool.map(src => (src && typeof src === 'object' ? { ...src } : src));
    for (const src of subConfig.choicePool) {
      if (src && typeof src.from === 'string') {
        const mapped = virtualize(src.from);
        if (mapped) src.from = mapped;
      }
    }
  }
  if (typeof subConfig.excludeAuthored === 'string') {
    const mapped = virtualize(subConfig.excludeAuthored);
    if (mapped) subConfig.excludeAuthored = mapped;
  }
}
