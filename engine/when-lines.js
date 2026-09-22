// when-lines.js — `when` lines for activities that live in the database.
//
// `when` (2026-09-21) is the classroom moment an activity is for, the
// line the hover card shows in place of the description. Built-ins carry
// it in their config.json. An activity that lives only in the database
// (Guess Who: Rose, Bud, Thorn, made on the live site) has no editor
// field for it yet, so its line lives here, keyed by id, and the games
// list fills it in when the row has none. Owner's words, 2026-09-22.
// Remove a row here once the editor can set the field on the live copy.

export const WHEN_LINES = {
  'rose-bud-thorn': 'When your class needs to check in on each other and have fun doing it. Great for advisory.'
};

// The line for a listed activity: its own, else the one kept here, else nothing
export function whenLineFor(id, config) {
  if (config && typeof config.when === 'string' && config.when.trim()) return config.when;
  return WHEN_LINES[id] || '';
}
