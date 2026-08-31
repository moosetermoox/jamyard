/**
 * Shared-meadow sync — the server half of "everyone's in the same space"
 * (owner ask 2026-08-30).
 *
 * The meadow's base layout was always deterministic (index tones + the
 * golden-angle scatter), so making it a genuinely shared space only takes
 * agreeing on WHO is which block and relaying nudges. Rules:
 *
 *   - Every submitted player gets a canonical index in submission order,
 *     assigned once per phase (`meadowIndexFor`). Block i is the i-th
 *     submitter on every screen; your own index wears the "you" paint.
 *   - Nudges relay as { index, fx, fy } — normalized field fractions, so
 *     a narrow Chromebook and a wide one agree. NEVER a name or player
 *     id: blocks stay anonymous (counts-only doctrine). A student can
 *     wiggle their block to tell a neighbor "that's me" — that is
 *     self-disclosure, and the system itself never attributes.
 *   - The server enforces the same 3s cooldown the client shows, so a
 *     modified client cannot flood the room.
 *
 * State lives at `room.meadowState` and is included in the reconnect
 * id-migration walk (order/lastNudge are keyed by player id).
 */

export const MEADOW_NUDGE_COOLDOWN_MS = 3000;
const EDGE_MARGIN = 0.04;

/**
 * Lazily (re)build the per-phase meadow state: same phase instance keeps
 * it, a new phase starts clean so stale blocks never leak forward.
 */
export function ensureMeadowState(state, phaseInstanceId) {
  if (state && state.phaseInstanceId === phaseInstanceId) return state;
  return { phaseInstanceId, order: {}, next: 0, lastNudge: {} };
}

/**
 * Canonical block index for a player: assigned once, in submission order.
 */
export function meadowIndexFor(state, playerId) {
  if (state.order[playerId] === undefined) {
    state.order[playerId] = state.next++;
  }
  return state.order[playerId];
}

/**
 * Server-side nudge gate: true (and stamps the clock) when the player's
 * cooldown has passed.
 */
export function allowNudge(state, playerId, now) {
  const last = state.lastNudge[playerId];
  if (last !== undefined && now - last < MEADOW_NUDGE_COOLDOWN_MS) return false;
  state.lastNudge[playerId] = now;
  return true;
}

/**
 * Clamp a normalized coordinate into the field with an edge margin;
 * anything unreadable lands at the center.
 */
export function clampFrac(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(EDGE_MARGIN, Math.min(1 - EDGE_MARGIN, n));
}
