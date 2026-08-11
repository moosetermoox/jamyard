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
  'collect-choice': 'Start the question',
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
 * Convenience: resolve the label for a phase's `next` reference from a
 * config's phase map (virtual foreach sub-phases are injected into the same
 * map at runtime, so this covers them too).
 * @param {{ next?: string }} phase
 * @param {Record<string, { type?: string }>} phases
 */
export function continueLabelForPhase(phase, phases) {
  const nextId = phase && phase.next;
  const next = nextId && phases ? phases[nextId] : null;
  return continueLabelFor(next && next.type);
}
