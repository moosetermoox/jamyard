/**
 * A new name for a seat already in the room: the one check shared by the
 * console's Rename and a student's own "Change my name" (2026-09-28, the
 * owner: students wanted to fix their own names). The same rules a typed
 * join name meets: trimmed, at most 20 characters, at least two, through
 * the name filter, and never a name another seat already holds.
 *
 * checkNewName(players, playerId, raw, filterName) ->
 *   { ok: true, name } | { ok: false, reason: 'short' | 'blocked' | 'taken' | 'same' }
 */
export const NAME_MAX = 20;
export const NAME_MIN = 2;

export function checkNewName(players, playerId, raw, filterName) {
  const name = String(raw == null ? '' : raw).trim().slice(0, NAME_MAX);
  if (name.length < NAME_MIN) return { ok: false, reason: 'short' };
  if (typeof filterName === 'function' && filterName(name).blocked) return { ok: false, reason: 'blocked' };
  const list = Array.isArray(players) ? players : [];
  const me = list.find(p => p.id === playerId);
  if (me && me.name === name) return { ok: false, reason: 'same' };
  const taken = list.some(p => p.id !== playerId && String(p.name || '').toLowerCase() === name.toLowerCase());
  if (taken) return { ok: false, reason: 'taken' };
  return { ok: true, name };
}

// The student's own line for each refusal (English keys; the student
// screen passes them through UiLang.t, every language table has a row).
export const SELF_RENAME_MESSAGES = Object.freeze({
  short: 'A name needs at least two letters.',
  blocked: 'That name cannot go on the big screen. Use your first name.',
  taken: 'Someone in the room already has that name.',
  closed: 'Names can only change before the activity starts.'
});
