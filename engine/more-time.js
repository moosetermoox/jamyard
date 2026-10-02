/**
 * "A bit more time" has a ceiling (2026-10-02, an outside reviewer pressed
 * it forty times and a 45-second step ran to 20:42).
 *
 * The extra time one step can gain is three times its own timer, never
 * less than 90 seconds (three presses of 30) and never more than five
 * minutes. A press that would pass the ceiling is refused; the press that
 * reaches it tells every screen to hide the button.
 */

export const MORE_TIME_FLOOR = 90;
export const MORE_TIME_CEILING = 300;

/** The most extra seconds a step with this timer may gain. */
export function extraTimeCap(timerSeconds) {
  const t = Number(timerSeconds) || 0;
  return Math.min(MORE_TIME_CEILING, Math.max(MORE_TIME_FLOOR, 3 * t));
}

/**
 * One press against what this step has already gained.
 * @returns {{ok: boolean, used: number, atCap: boolean}} `used` after the
 *   press; `atCap` when no further press fits.
 */
export function pressMoreTime(usedSeconds, timerSeconds, addSeconds) {
  const used = Number(usedSeconds) || 0;
  const add = Number(addSeconds) || 0;
  const cap = extraTimeCap(timerSeconds);
  if (used + add > cap) return { ok: false, used, atCap: true };
  const next = used + add;
  return { ok: true, used: next, atCap: next + add > cap };
}
