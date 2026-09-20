/**
 * What a visitor's games list should hold (2026-09-20, the snappiness pass).
 *
 * `GET /api/games` used to send every teacher's saved activity to every
 * visitor: 96 of the 143 rows on the live site, 60 of the 92 KB, and the
 * home, make, Create, and Try it out pages all fetch it on load. A visitor
 * can only ever see their own copies (`MyGames`, ids kept in their browser)
 * and the ones the owner featured, the same rule `screens/shared/
 * game-visibility.js` applies on the client. So the client now says which
 * ids are its own (`?mine=a,b,c`) and the server sends built-ins, featured
 * user rows, and those ids, nothing else. No `mine` at all (the owner's
 * library console, an old tab) still means everything.
 *
 * The response also carries every id on the server (`ids`, a few KB), the
 * one thing the pages still needed the full list for: picking a copy id
 * nobody has taken (the server refuses a duplicate with a 409).
 */

const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const MAX_IDS = 200;

/**
 * The `mine` query value as a list of ids, or null when the caller wants
 * everything (no `mine` parameter at all). An empty `mine=` is a visitor
 * with no copies yet: a list, just an empty one.
 * @param {unknown} raw req.query.mine
 * @returns {string[]|null}
 */
export function parseMine(raw) {
  if (raw === undefined || raw === null) return null;
  const text = Array.isArray(raw) ? raw.join(',') : String(raw);
  const seen = new Set();
  for (const part of text.split(',')) {
    const id = part.trim();
    if (!id || !ID_SHAPE.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (seen.size >= MAX_IDS) break;
  }
  return [...seen];
}

/**
 * The user ids a visitor's list must include: their own plus every user
 * game the owner featured through an override (id -> boolean). A user row
 * featured by its own config (a saved `featured: true`) is the other way
 * in; the database query and the route's filesystem filter read that flag
 * themselves, since it lives inside the config.
 * @param {string[]} mine
 * @param {Record<string, boolean>} overrides
 * @returns {string[]}
 */
export function wantedUserIds(mine, overrides) {
  const ids = new Set(mine || []);
  for (const [id, featured] of Object.entries(overrides || {})) {
    if (featured) ids.add(id);
  }
  return [...ids];
}

/**
 * Filter rows (any objects with an `id`) down to the wanted ids, keeping
 * their order. Used for the filesystem user games when there is no
 * database; the database path asks for the ids directly.
 * @template T extends {id: string}
 * @param {T[]} rows
 * @param {string[]} ids
 * @returns {T[]}
 */
export function onlyWanted(rows, ids) {
  const want = new Set(ids || []);
  return (rows || []).filter(r => r && want.has(r.id));
}
