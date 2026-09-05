/**
 * In-flight submissions a close has to wait for.
 *
 * submit-response is async: a typed answer goes through the moderation
 * ladder (OpenAI, then maybe Haiku) before it is stored on the player. The
 * teacher's Close can land inside that gap. The gather then misses the
 * answers still in flight, and anything downstream that keys off the list
 * inherits the hole: a rotation dealt from a short list leaves some players
 * unassigned, so their Doodle Bluff round had no real title to vote for
 * (found by the universal sim, 2026-09-04).
 *
 * The handler takes a hold for the duration of its await and releases it
 * once the answer is stored (or dropped). close-submissions settles every
 * hold first, then re-checks it is still closing the same step.
 *
 * Holds live in a WeakMap keyed by the room object, never on the room
 * itself, so snapshots and id migration never see them.
 */

const HOLDS = new WeakMap();

/** Default cap so a wedged moderation call can never freeze a Close. */
export const SETTLE_TIMEOUT_MS = 10000;

/**
 * Register one in-flight submission. Returns an idempotent release function.
 * @param {object} room
 * @returns {() => void}
 */
export function holdPendingSubmit(room) {
  if (!room || typeof room !== 'object') return () => {};
  let set = HOLDS.get(room);
  if (!set) {
    set = new Set();
    HOLDS.set(room, set);
  }
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  set.add(hold);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set.delete(hold);
    release();
  };
}

/** How many submissions are mid-flight for this room right now. */
export function pendingSubmitCount(room) {
  const set = room && HOLDS.get(room);
  return set ? set.size : 0;
}

/**
 * Wait for every hold taken so far to release (or for the timeout).
 * Resolves to the number of holds that were waited on; 0 means the caller
 * can proceed knowing nothing was in flight.
 * @param {object} room
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<number>}
 */
export async function settlePendingSubmits(room, opts = {}) {
  const set = room && HOLDS.get(room);
  if (!set || set.size === 0) return 0;
  const pending = [...set];
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : SETTLE_TIMEOUT_MS;
  let timer = null;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      console.warn(`[pending-submits] ${pending.length} submission(s) still in flight after ${timeoutMs}ms, closing anyway`);
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([Promise.all(pending), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return pending.length;
}
