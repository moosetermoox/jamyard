/**
 * Shared server-side phase timer — the countdown that closes a timed phase
 * when the class runs out of time (merge, rank, match, sort, rate,
 * checklist, wager).
 *
 * Two jobs:
 *  - armPhaseTimer: what every handler's inline setTimeout used to be,
 *    with the strong staleness guard (phaseInstanceId capture — rate.js's
 *    pattern, now everywhere) and a recorded deadline so the timer can be
 *    stretched later.
 *  - extendPhaseTimer: "A bit more time" support. Pushes the recorded
 *    deadline back and re-arms; clients shift their own countdowns via the
 *    timer-extended broadcast, this keeps the server's backstop honest
 *    (without it the server would still close at the original deadline).
 *
 * The handle lives on room.phaseState.timer, exactly where the handlers
 * kept it before: every phaseState cleanup() and every manual close's
 * clearTimeout keeps working unchanged. timerFire/timerEndsAt ride along
 * on phaseState too — phaseState is never serialized into snapshots, and
 * the id-migration walker skips functions, so both are safe there.
 */
/**
 * Remember when this step's clock runs out (host-clock steps: the
 * projector closes them, the server only keeps the deadline so a refreshed
 * student gets the time left). armPhaseTimer records it too. The phase
 * context records it from any enter payload that carries a `timer`
 * (phase-context.js), so a handler only calls this itself when its clock
 * restarts inside one step (a relay's turns).
 * @returns {number|null} the deadline, or null when there is no clock
 */
export function recordDeadline(room, seconds, now = Date.now()) {
  const state = room && room.phaseState;
  if (!state || !(typeof seconds === 'number' && seconds > 0)) return null;
  state.timerEndsAt = now + seconds * 1000;
  return state.timerEndsAt;
}

/**
 * Seconds left on this step's clock for a screen that comes back
 * mid-step, or null when there is no clock to show: no deadline (rolling
 * start, no timer), the step already closed (its results are up), or the
 * deadline passed (the close is about to land).
 */
export function secondsLeft(room, now = Date.now()) {
  const state = room && room.phaseState;
  const ends = state && state.timerEndsAt;
  if (!ends || state.closed) return null;
  const left = Math.ceil((ends - now) / 1000);
  return left > 0 ? left : null;
}

export function armPhaseTimer(room, seconds, fire) {
  const state = room.phaseState;
  if (!state || !seconds) return;
  const captured = room.phaseInstanceId;
  recordDeadline(room, seconds);
  state.timerFire = fire;
  state.timer = setTimeout(async () => {
    if (room.phaseInstanceId !== captured || room.phaseState !== state) return;
    await fire();
  }, seconds * 1000);
}

export function extendPhaseTimer(room, addSeconds) {
  const state = room.phaseState;
  if (!state || !state.timer || !state.timerEndsAt || typeof state.timerFire !== 'function') {
    return false;
  }
  clearTimeout(state.timer);
  const captured = room.phaseInstanceId;
  state.timerEndsAt += addSeconds * 1000;
  state.timer = setTimeout(async () => {
    if (room.phaseInstanceId !== captured || room.phaseState !== state) return;
    await state.timerFire();
  }, Math.max(0, state.timerEndsAt - Date.now()));
  return true;
}
