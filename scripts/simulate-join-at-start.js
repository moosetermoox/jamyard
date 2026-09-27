/**
 * simulate-join-at-start.js — a student who joins in the same instant the
 * teacher presses Start is seated on the first step and counted (2026-09-27:
 * a reviewer's two pretend students sat on the lobby screen at "2 of us
 * here" while the projector said "0 of 2 submitted").
 *
 *   node scripts/simulate-join-at-start.js [gameId]      (server running on :3000)
 *
 * Two students join in the lobby; Start is pressed and two more join in the
 * same tick, before the first step has entered. Every student must get the
 * first step's screen, and the projector's count must grow to four.
 */
import { setupRoom, connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const gameId = process.argv[2] || 'doodle-bluff';
const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const { host, players, code } = await setupRoom(gameId, 2);
  const late = [await connect('P3'), await connect('P4')];
  try {
    // Start and the late joins in the same tick: the joins land while the
    // first step is still entering.
    host.emit('start-game', { code });
    late[0].emit('join-room', { code, name: 'Late One' });
    late[1].emit('join-room', { code, name: 'Late Two' });

    // The first step is an announce (Doodle Bluff's intro, timed); the
    // collect follows it. Every student must see both.
    const early = await Promise.all(players.map(p => waitForEvent(p, 'announce', 8000)));
    check('the two early students get the first step', early.every(e => e && typeof e.message === 'string'));
    const lateJoined = await Promise.all(late.map(p => waitForEvent(p, 'join-success', 8000)));
    check('the two late joiners are let in', lateJoined.every(Boolean));
    const lateStarted = await Promise.all(late.map(p => waitForEvent(p, 'announce', 8000).catch(() => null)));
    check('the two late joiners get the first step too, never the lobby screen', lateStarted.every(e => e && typeof e.message === 'string'));
    check('all four see the same words', new Set([...early, ...lateStarted].map(e => e && e.message)).size === 1);
    // The timed intro moves on by itself; the answer step must reach all four
    const collect = await Promise.all([...players, ...late].map(p => waitForEvent(p, 'game-started', 30000).catch(() => null)));
    check('the answer step reaches all four students', collect.every(e => e && e.phaseId));

    // The projector's count follows them: the total is four within a moment
    await wait(600);
    const counts = (host._buffer['submission-count'] || []).concat(host._buffer['game-started'] || []);
    const last = counts.filter(c => c && typeof c.total === 'number').sort((a, b) => 0).pop();
    check('the projector counts four students on the step (got ' + (last ? last.total : 'no count') + ')', !!last && last.total === 4);

    // The late joiners never saw a lobby roster after the start (the "2 of
    // us here" screen the reviewer described)
    const rosters = late.map(p => (p._buffer['room-roster'] || []).length);
    check('no lobby roster reached the late joiners after Start', rosters.every(n => n === 0));
  } finally {
    teardown(host, [...players, ...late]);
  }
  report.summary('JOIN AT START');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
