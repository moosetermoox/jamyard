/**
 * Kahoot-style speed scoring for collect-choice phases with a correctAnswer.
 *
 * Formula (matches Kahoot's documented behavior):
 *   - Wrong answer or no answer: 0 points
 *   - No timer set: full `pointsCorrect` for any correct answer (no decay)
 *   - Timer set: linear decay from 100% (instant) to 50% (timer expiry).
 *       score = round(pointsCorrect * (1 - (elapsed / timer) / 2))
 *     A submission past the timer is still capped at 50% (auto-submit on
 *     timeout should land here too).
 *
 * Comparison is case-insensitive on trimmed text — same dedupe key shape
 * used by collect-choice's choicePool, so 'Paris' and 'paris ' both count.
 */
export function scoreResponse({ choice, correctAnswer, elapsedMs, timerSeconds, pointsCorrect = 1000, speedBonus = true }) {
  if (choice == null || correctAnswer == null) return 0;
  const norm = (s) => String(s).trim().toLowerCase();
  if (norm(choice) !== norm(correctAnswer)) return 0;

  if (!speedBonus || !timerSeconds || timerSeconds <= 0) return pointsCorrect;

  const elapsedSec = Math.max(0, (elapsedMs || 0) / 1000);
  // Clamp to timer so post-expiry never goes below 50%
  const ratio = Math.min(1, elapsedSec / timerSeconds);
  const factor = 1 - ratio / 2; // 1.0 -> 0.5
  return Math.round(pointsCorrect * factor);
}

/**
 * Score every response in a phase against the resolved correct answer.
 *
 * `responses` is the standard collect-choice array `[{playerId, text, choice, responseAt}, ...]`.
 * `phaseStartAt` is the ms timestamp when the phase opened.
 * Returns `{playerId: points}` keyed by player.
 */
export function scoreResponses({ responses, correctAnswer, phaseStartAt, timerSeconds, pointsCorrect, speedBonus }) {
  const scores = {};
  for (const r of responses) {
    if (!r || !r.playerId) continue;
    const elapsedMs = r.responseAt && phaseStartAt ? r.responseAt - phaseStartAt : 0;
    scores[r.playerId] = scoreResponse({
      choice: r.choice || r.text,
      correctAnswer,
      elapsedMs,
      timerSeconds,
      pointsCorrect,
      speedBonus
    });
  }
  return scores;
}
