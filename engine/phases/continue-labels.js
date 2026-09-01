/**
 * Descriptive continue-button labels — the host button says what happens
 * NEXT ("Start the voting") instead of a generic "Continue" (2026-07-26 UI
 * review: repeated Continue buttons hide the shape of the activity from
 * the teacher).
 *
 * Pure: type in, label out. Falls back to "Continue" for anything unknown
 * so a new phase type can never break a button.
 */

const LABELS = {
  announce: 'Show the message',
  collect: 'Send the question to students',
  'collect-choice': 'Next question',
  vote: 'Start the voting',
  reveal: 'Reveal the results',
  'reveal-one': 'Start revealing',
  preview: 'Review before the class sees it',
  leaderboard: 'Show the standings',
  winner: 'Crown the winner',
  rank: 'Start ranking',
  rate: 'Start rating',
  estimate: 'Start guessing',
  match: 'Start matching',
  sort: 'Start sorting',
  buzz: 'Open the buzzers',
  merge: 'Start the pair work',
  'one-voice': 'Start counting together',
  turn: 'Start the round',
  relay: 'Start the relay',
  'team-split': 'Split into teams',
  wager: 'Open the bets',
  checklist: 'Start the checklist',
  eliminate: 'Run the elimination',
  'ai-eliminate': 'Run the elimination',
  'ai-process': 'Let the AI work',
  foreach: 'Start the first round',
  end: 'Finish up'
};

/**
 * @param {string|null|undefined} nextType — the phase type the game moves to
 * @returns {string} a teacher-facing button label
 */
export function continueLabelFor(nextType) {
  return LABELS[nextType] || 'Continue';
}

/**
 * Two-stage phases: closing shows results on the projector BEFORE the game
 * moves on. While such a phase is open, the console's button closes it (it
 * does not advance), so the button must say the CLOSE action. Types not
 * listed here have no separate close stage (or their own dedicated button).
 */
const CLOSE_LABELS = {
  rate: 'End the ratings',
  estimate: 'Lock in the guesses',
  match: 'Reveal the answers',
  sort: 'Reveal the answers',
  checklist: 'End work time'
};

/**
 * @param {string|null|undefined} phaseType — the phase currently running
 * @returns {string|null} close-action label, or null when one click advances
 */
export function closeLabelFor(phaseType) {
  return CLOSE_LABELS[phaseType] || null;
}

/**
 * Whether a multiple-choice question sits at or before `phase` on the main
 * next-chain. Decides "Start the first question" vs "Next question". The
 * current phase itself counts (a question leading into another question is
 * never the first). A phase the chain never reaches reports false, which
 * errs toward the friendlier "Start the first question".
 */
function questionRanBefore(phase, phases) {
  const ids = Object.keys(phases);
  const seen = new Set();
  let cur = phases.lobby ? 'lobby' : ids[0];
  while (cur && phases[cur] && !seen.has(cur)) {
    if (phases[cur].type === 'collect-choice') return true;
    if (phases[cur] === phase) return false;
    seen.add(cur);
    cur = phases[cur].next;
  }
  return false;
}

/**
 * Convenience: resolve the label for a phase's `next` reference from a
 * config's phase map (virtual foreach sub-phases are injected into the same
 * map at runtime, so this covers them too).
 *
 * A phase's own `continueLabel` config field (Simple-view "Next button"
 * setting) wins over the generated wording — every surface that shows an
 * advance label (announce/reveal projector buttons, the teacher console's
 * next-step button) resolves through here, so the override covers them all.
 * @param {{ next?: string, continueLabel?: string }} phase
 * @param {Record<string, { type?: string }>} phases
 */
export function continueLabelForPhase(phase, phases) {
  if (phase && typeof phase.continueLabel === 'string' && phase.continueLabel.trim()) {
    return phase.continueLabel.trim();
  }
  const nextId = phase && phase.next;
  const next = nextId && phases ? phases[nextId] : null;
  if (next && next.type === 'collect-choice' && !questionRanBefore(phase, phases)) {
    return 'Start the first question';
  }
  return continueLabelFor(next && next.type);
}
