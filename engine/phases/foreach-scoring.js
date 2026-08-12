/**
 * Per-iteration scoring for foreach. Extracted from advanceForeach
 * (server.js) so the modes are unit-testable.
 *
 *   correct (default) — GUESSERS earn pointsCorrect for matching
 *     correctAnswer (literal, `_current.*` ref, or one of the special
 *     item shortcuts), pointsDecoy otherwise. Powers Who Said It,
 *     Human vs AI.
 *   tally — the ITEM'S AUTHOR earns pointMap[choice] per response.
 *     Powers rate-my-thing rounds.
 *   scores — adopt the sub-phase's own computed score map. A bluff-vote
 *     collect-choice already grades truth-spotting AND foolPoints when it
 *     closes; this mode accumulates those per-round maps (Doodle Bluff).
 *
 * Mutates and returns `scores` ({playerId: points}).
 */
export function applyIterationScoring({ scores, scoring, subData, item, resolve, players }) {
  const mode = (scoring && scoring.mode) || 'correct';
  const responses = (subData && subData.responses) || [];

  if (mode === 'scores') {
    const subScores = (subData && subData.scores) || {};
    for (const [pid, pts] of Object.entries(subScores)) {
      scores[pid] = (scores[pid] || 0) + pts;
    }
    return scores;
  }

  if (mode === 'tally') {
    const authorId = item && item.playerId;
    const pointMap = scoring.pointMap || {};
    if (authorId) {
      if (!scores[authorId]) scores[authorId] = 0;
      for (const r of responses) {
        const choice = r.choice || r.text;
        const points = pointMap[choice] !== undefined ? pointMap[choice] : 0;
        scores[authorId] += points;
      }
    }
    return scores;
  }

  // Correct mode (default): award points to the GUESSER for correct guesses
  const correctRef = scoring && scoring.correctAnswer;
  let correctAnswer;
  if (correctRef === '_current.playerId') {
    correctAnswer = item.playerId;
  } else if (correctRef === '_current.playerName') {
    correctAnswer = item.playerName;
  } else if (correctRef === '_current.isHuman') {
    correctAnswer = item.isAI ? 'AI' : 'Human';
  } else if (correctRef === '_current.aiPosition') {
    correctAnswer = item.aiPosition;
  } else if (correctRef === '_current.humanPosition') {
    correctAnswer = item.humanPosition;
  } else if (correctRef && correctRef.startsWith('_current.')) {
    correctAnswer = resolve(correctRef);
  } else {
    correctAnswer = correctRef;
  }

  const pointsCorrect = (scoring && scoring.pointsCorrect) || 100;
  const pointsDecoy = (scoring && scoring.pointsDecoy) || 0;

  for (const r of responses) {
    if (!scores[r.playerId]) scores[r.playerId] = 0;
    const playerChoice = r.choice || r.text;
    const chosenPlayer = players.find(p => p.name === playerChoice);
    const isCorrect = (playerChoice === correctAnswer) ||
                      (chosenPlayer && chosenPlayer.id === correctAnswer);
    scores[r.playerId] += isCorrect ? pointsCorrect : pointsDecoy;
  }
  return scores;
}
