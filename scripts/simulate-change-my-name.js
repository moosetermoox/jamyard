/**
 * simulate-change-my-name.js — a student changes their own name in the
 * lobby (2026-09-28, the owner: students asked for it). The new name
 * meets the join checks (rude, taken, too short), every screen follows
 * (the student, the projector roster, the lobby roster), and once the
 * activity starts the name is fixed.
 *
 *   node scripts/simulate-change-my-name.js [gameId]    (server running; SIM_SERVER=http://localhost:3014 for another port)
 *
 * The default activity is Doodle Bluff (it waits in a lobby).
 */
import { connect, waitForEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const gameId = process.argv[2] || 'doodle-bluff';
const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code} (${gameId})`);
  const students = [];
  try {
    const maya = await connect('MAYA');
    students.push(maya);
    maya.emit('join-room', { code, name: 'Mya' });
    const mayaIn = await waitForEvent(maya, 'join-success', 4000);
    check('the join says the room is not anonymous', mayaIn.anonymous === false);
    const jordan = await connect('JORDAN');
    students.push(jordan);
    jordan.emit('join-room', { code, name: 'Jordan' });
    await waitForEvent(jordan, 'join-success', 4000);

    // 1. A fix in the lobby: every screen follows
    drainEvent([host], 'player-reconnected');
    drainEvent([jordan], 'room-roster');
    const lobbyP = waitForEvent(jordan, 'room-roster', 4000).catch(() => null);
    maya.emit('rename-self', { code, name: 'Maya' });
    const renamed = await waitForEvent(maya, 'renamed', 4000).catch(() => null);
    check("the student's own screen hears the new name", !!renamed && renamed.name === 'Maya' && !renamed.message);
    const projector = await waitForEvent(host, 'player-reconnected', 4000).catch(() => null);
    check('the projector roster carries it', !!projector && projector.players.some(p => p.name === 'Maya') && !projector.players.some(p => p.name === 'Mya'));
    let lobby = await lobbyP;
    // an earlier roster (Jordan's own join) may still be queued: read on
    for (let i = 0; i < 3 && lobby && !lobby.names.includes('Maya'); i++) lobby = await waitForEvent(jordan, 'room-roster', 2000).catch(() => null);
    check("a classmate's lobby roster carries it", !!lobby && lobby.names.includes('Maya'));

    // 2. The join checks hold
    maya.emit('rename-self', { code, name: 'shithead' });
    const rude = await waitForEvent(maya, 'rename-error', 4000).catch(() => null);
    check('a rude name is refused', !!rude && /big screen/.test(rude.message) && !/shit/i.test(rude.message));
    maya.emit('rename-self', { code, name: 'JORDAN' });
    const taken = await waitForEvent(maya, 'rename-error', 4000).catch(() => null);
    check("a classmate's name is refused", !!taken && /already/.test(taken.message));
    maya.emit('rename-self', { code, name: ' M ' });
    const short = await waitForEvent(maya, 'rename-error', 4000).catch(() => null);
    check('a one-letter name is refused', !!short && /two letters/.test(short.message));

    // 3. A student cannot rename a classmate (the event names no seat)
    jordan.emit('rename-self', { code, name: 'Jordan B' });
    const own = await waitForEvent(jordan, 'renamed', 4000).catch(() => null);
    check('rename-self only ever renames the sender', !!own && own.name === 'Jordan B');

    // 4. Once the activity starts, the name is fixed
    host.emit('start-game', { code });
    await wait(1200);
    maya.emit('rename-self', { code, name: 'Maya R' });
    const closed = await waitForEvent(maya, 'rename-error', 4000).catch(() => null);
    check('after Start the name stays', !!closed && /before the activity starts/.test(closed.message));
  } finally {
    teardown(host, students);
  }
  report.summary('CHANGE MY NAME');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
