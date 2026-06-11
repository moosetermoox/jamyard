/**
 * Player-id migration — keeps live game state pointing at a player across
 * reconnects.
 *
 * Players are keyed by socket id, and a reconnect rebinds them to a NEW
 * socket id (PlayerRegistry.reconnect). Every structure that captured the
 * old id — phase state (turn describer, relay turn order, vote
 * eligibility, merge groups, buzz lockouts…) and completed-phase data
 * (score maps that feed leaderboards) — must follow, or the player is
 * orphaned: dead buttons, dropped votes, vanishing scores. The chaos
 * simulator found all of those.
 *
 * Deep in-place rewrite (the structures are live — timers and closures
 * hold references to them):
 *   - string values equal to oldId      → newId
 *   - object keys equal to oldId        → re-keyed
 *   - Set membership / Map keys         → re-keyed
 * Only plain objects, arrays, Sets, and Maps are walked; class instances
 * (sockets, timers) and functions are left alone. Socket ids are 20-char
 * random strings, so content collisions are not a real concern.
 */
export function migrateIdsInPlace(root, oldId, newId) {
  if (root == null || !oldId || !newId || oldId === newId) return;
  const seen = new Set();

  function walk(node) {
    if (node == null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node instanceof Set) {
      if (node.has(oldId)) {
        node.delete(oldId);
        node.add(newId);
      }
      for (const item of node) walk(item);
      return;
    }

    if (node instanceof Map) {
      if (node.has(oldId)) {
        const v = node.get(oldId);
        node.delete(oldId);
        node.set(newId, v);
      }
      for (const v of node.values()) walk(v);
      return;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] === oldId) node[i] = newId;
        else walk(node[i]);
      }
      return;
    }

    // Plain objects only — never poke around inside sockets/timers/etc.
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return;

    if (Object.prototype.hasOwnProperty.call(node, oldId)) {
      node[newId] = node[oldId];
      delete node[oldId];
    }
    for (const key of Object.keys(node)) {
      if (node[key] === oldId) node[key] = newId;
      else walk(node[key]);
    }
  }

  walk(root);
}
