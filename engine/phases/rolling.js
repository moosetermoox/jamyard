/**
 * Rolling start (`start: "rolling"` at the top of a config).
 *
 * A normal activity moves the class through its steps together: the
 * lobby waits, Start opens the first step for everyone at once, and the
 * projector is the stage. A ROLLING activity is for the first two minutes
 * of class (exit tickets, vibe checks, a self-paced quiz): hosting opens
 * the room straight into the working step, students land in it as they
 * arrive, the projector keeps the join code up the whole time, timers are
 * ignored (the teacher ends the step), and each student gets their own
 * "you're done" screen instead of the shared wait screen.
 *
 * Pure helpers, no I/O. The engine, server and screens all ask these.
 */
import { PHASE_SCHEMAS } from '../phase-schemas.js';

export const START_MODES = Object.freeze(['together', 'rolling']);

/** @param {object} config */
export function isRolling(config) {
  return !!config && config.start === 'rolling';
}

/**
 * Phase types whose behavior needs a fixed roster at the moment they run
 * (pairs, teams, chains, turn order). A rolling activity can still contain
 * them, but the validator warns: students arriving late will be left out
 * of the grouping. (team-split, team-roles and checklist seat a late
 * joiner on their own since 2026-09-14, engine/phases/late-seating.js,
 * in every start mode; the warning stays for the rest.)
 */
export const ROSTER_BOUND_TYPES = Object.freeze([
  'team-split', 'team-roles', 'merge', 'relay', 'turn', 'one-voice', 'checklist', 'foreach', 'eliminate', 'ai-eliminate', 'buzz'
]);

/** True when a phase config depends on who is present when it starts. */
export function isRosterBound(phase) {
  if (!phase || typeof phase !== 'object') return false;
  if (ROSTER_BOUND_TYPES.includes(phase.type)) return true;
  if (phase.type === 'collect' && (phase.assign === 'pairwise' || phase.rotateFrom)) return true;
  return false;
}

/**
 * Does anything after `phaseId` on the main next-chain still ask this
 * student for input? When nothing does, a student who has just submitted
 * is DONE with the activity and can be told so (exit ticket: answer, then
 * put the device away). Branches (nextByWinner, approve/reject) are
 * followed only through `next`; a cycle stops the walk.
 * @param {object} config
 * @param {string} phaseId
 * @returns {boolean} true when at least one input step is still ahead
 */
export function moreInputAhead(config, phaseId) {
  const phases = (config && config.phases) || {};
  const seen = new Set([phaseId]);
  let cur = phases[phaseId] ? phases[phaseId].next : null;
  while (cur && phases[cur] && !seen.has(cur)) {
    seen.add(cur);
    const type = phases[cur].type;
    const schema = PHASE_SCHEMAS[type];
    // vote is filed as a compute step in the schema (it tallies), but the
    // class still has to tap a ballot, so it counts as input here.
    if ((schema && schema.role === 'input') || type === 'vote') return true;
    cur = phases[cur].next;
  }
  return false;
}

/**
 * What a student sees the moment their last input lands in a rolling
 * activity. The phase can say it in its own words (`doneMessage`).
 * @param {object} phase
 * @returns {string}
 */
export function doneMessageFor(phase) {
  if (phase && typeof phase.doneMessage === 'string' && phase.doneMessage.trim()) {
    return phase.doneMessage.trim();
  }
  return 'Thanks, that is all we need from you. You can put your device away.';
}
