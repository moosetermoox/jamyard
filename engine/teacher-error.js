/**
 * A validator message in a teacher's words (2026-10-02, a reviewer saw
 * 'Game "vocab-match-...-28tzeh": phase "round1" (match) has "enzyme" on
 * the left side twice.' under the make page's buttons). The validator's
 * own lines name the activity's private id and the step's type for the
 * designer's logs; a save route hands the teacher this instead: no id,
 * the step by its name, the rest as written.
 *
 * Pure; used by the save routes in server.js.
 */

const GAME_PREFIX = /^Game "[^"]*":\s*/;
const GAME_SUBJECT = /^Game "[^"]*"\s+/;
const PHASE_SUBJECT = /^phase "([^"]*)"(?:\s*\([^)]*\))?\s*/i;

/**
 * @param {string} message a validator or save error
 * @returns {string} the same problem without ids and type tags
 */
export function teacherFacingError(message) {
  let m = String(message == null ? '' : message).trim();
  if (GAME_PREFIX.test(m)) m = m.replace(GAME_PREFIX, '');
  else if (GAME_SUBJECT.test(m)) m = m.replace(GAME_SUBJECT, 'This activity ');
  const phase = PHASE_SUBJECT.exec(m);
  if (phase) {
    const rest = m.slice(phase[0].length);
    // "phase "q1": something" and "phase "q1" (match) has ..." both read
    // as a sentence about the step
    m = rest.startsWith(':') ? `Step "${phase[1]}"${rest}` : `Step "${phase[1]}" ${rest}`;
  }
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Something in this activity could not be saved.';
}
