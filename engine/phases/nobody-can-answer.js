/**
 * A step nobody can answer passes itself.
 *
 * With two students in Doodle Bluff every round's phrase author and drawer
 * both sit out, so nobody is left to write a fake title or to guess, and
 * the teacher pressed continue through six blank steps a round (the
 * small-class sweep, 2026-10-02). The rule: a collect or collect-choice
 * that opens with students in the room and none of them able to answer
 * closes at once, through the same close the teacher's press would run,
 * so later steps read an empty list and the room moves on.
 *
 * Never in a rolling room: there the step is open to students who have
 * not joined yet. Never with no students at all: the lobby's job.
 */

/**
 * @param {{config?: {start?: string}, players: {list(): Array}}} engine
 * @param {number} answerable  how many students can answer this step
 * @returns {boolean}
 */
export function nobodyCanAnswer(engine, answerable) {
  if (!engine || !engine.players) return false;
  if (engine.config && engine.config.start === 'rolling') return false;
  if (engine.players.list().length === 0) return false;
  return answerable === 0;
}
