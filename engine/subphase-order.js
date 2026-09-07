/**
 * subphase-order.js — put a foreach's sub-phases back in the order they
 * were written.
 *
 * Sub-phases run in the key order of `subPhases`. Anything that rebuilds
 * the object can lose that order: Postgres jsonb (which sorts keys by
 * length, so Doodle Bluff's copies came back guess, titles, reveal and
 * the vote ran before the fakes, 2026-09-06), or a model rewriting a
 * config. Given a reference config with the intended order (a fresh
 * compile of the activity's own recipe stamp, or the config before an AI
 * edit), restore it wherever the SET of sub-phases still matches; a real
 * restructure (added or removed sub-phase) is left alone.
 *
 * Mutates `config` in place and returns the ids of the foreach phases it
 * reordered (empty when nothing changed).
 */
export function restoreSubPhaseOrder(config, reference) {
  const fixed = [];
  if (!config || !reference || !config.phases || !reference.phases) return fixed;
  for (const [id, phase] of Object.entries(config.phases)) {
    const ref = reference.phases[id];
    if (!phase || !ref || phase.type !== 'foreach' || ref.type !== 'foreach') continue;
    if (!isPlainObject(phase.subPhases) || !isPlainObject(ref.subPhases)) continue;
    const wanted = Object.keys(ref.subPhases);
    const have = Object.keys(phase.subPhases);
    if (wanted.length !== have.length || wanted.some(k => !have.includes(k))) continue;
    if (wanted.every((k, i) => have[i] === k)) continue;
    const ordered = {};
    for (const k of wanted) ordered[k] = phase.subPhases[k];
    phase.subPhases = ordered;
    fixed.push(id);
  }
  return fixed;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
