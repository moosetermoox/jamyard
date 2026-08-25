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
export function armPhaseTimer(room, seconds, fire) {
  const state = room.phaseState;
  if (!state || !seconds) return;
  const captured = room.phaseInstanceId;
  state.timerEndsAt = Date.now() + seconds * 1000;
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
