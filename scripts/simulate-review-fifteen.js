/**
 * simulate-review-fifteen.js — a fifteenth outside review (2026-09-27):
 * a rude name is refused at the door, the console renames a student and
 * every screen follows, a removed student stays out, a closed projector
 * comes back with the teacher PIN, and the console hears the step's words.
 *
 *   node scripts/simulate-review-fifteen.js [gameId]    (server running on :3000)
 *
 * The default activity is Exit Ticket (rolling start: the room opens
 * straight into a question, so the console's snapshot carries its words).
 */
import { connect, waitForEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const gameId = process.argv[2] || 'exit-ticket';
const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code} (${gameId}), pin ${roomData.teacherPin}`);
  const extras = [];
  try {
    // 1. A rude name never gets a seat; a clean one on the same screen does
    const rude = await connect('RUDE');
    extras.push(rude);
    rude.emit('join-room', { code, name: 'shithead' });
    const refused = await waitForEvent(rude, 'join-error', 4000).catch(() => null);
    check('a rude name is refused at the door', !!refused && /big screen/.test(refused.message));
    check('the refusal never repeats the word', !!refused && !/shit/i.test(refused.message));
    rude.emit('join-room', { code, name: 'Sam' });
    const seated = await waitForEvent(rude, 'join-success', 4000).catch(() => null);
    check('the same screen joins with a clean name', !!seated && seated.name === 'Sam');

    // 2. A second student, then the teacher renames the first from the host
    //    (the host socket is a teacher socket, same as a console)
    const other = await connect('OTHER');
    extras.push(other);
    other.emit('join-room', { code, name: 'Maximiliano Fernandez' });
    const otherIn = await waitForEvent(other, 'join-success', 4000);
    check('a twenty-letter name is seated whole', otherIn.name === 'Maximiliano Fernande');
    const samId = rude.id;
    host.emit('moderate-rename', { code, playerId: samId, name: 'Samir' });
    const renamed = await waitForEvent(rude, 'renamed', 4000).catch(() => null);
    check("the student's screen hears the new name", !!renamed && renamed.name === 'Samir');
    const rosterAfter = await waitForEvent(host, 'player-reconnected', 4000).catch(() => null);
    check('the projector roster carries the new name', !!rosterAfter && rosterAfter.players.some(p => p.name === 'Samir') && !rosterAfter.players.some(p => p.name === 'Sam'));

    // 3. A rename to a rude name, or a taken one, is refused with a reason
    host.emit('moderate-rename', { code, playerId: samId, name: 'fuckface' });
    const badRename = await waitForEvent(host, 'teacher-rename-error', 4000).catch(() => null);
    check('a rude rename is refused', !!badRename && badRename.playerId === samId);
    host.emit('moderate-rename', { code, playerId: samId, name: 'maximiliano fernande' });
    const dupRename = await waitForEvent(host, 'teacher-rename-error', 4000).catch(() => null);
    check('a taken name is refused', !!dupRename && /already/.test(dupRename.message));

    // 4. The console joins with the PIN and gets the words on the projector
    const console1 = await connect('CONSOLE');
    extras.push(console1);
    console1.emit('join-teacher', { code, pin: roomData.teacherPin });
    const snap = await waitForEvent(console1, 'teacher-joined', 4000).catch(() => null);
    check('the console snapshot carries the step text', !!snap && typeof snap.stepText === 'string' && snap.stepText.length > 5);
    log('CONSOLE', `step text: "${snap && snap.stepText}"`);

    // 5. Remove a student: they cannot come back with their token
    drainEvent([other], 'join-error');
    host.emit('moderate-kick', { code, playerId: other.id });
    const kicked = await waitForEvent(other, 'kicked', 4000).catch(() => null);
    check('the removed student is told', !!kicked);
    other.emit('join-room', { code, name: 'Max', token: otherIn.token });
    const blocked = await waitForEvent(other, 'join-error', 4000).catch(() => null);
    check('the removed student cannot rejoin with the same token', !!blocked && /removed/.test(blocked.message));

    // 6. The projector closes. A fresh /host with the wrong PIN is refused;
    //    with the right PIN it takes the room back and the console is told
    drainEvent([console1], 'teacher-roster');
    host.disconnect();
    await wait(300);
    const rosterGone = await waitForEvent(console1, 'teacher-roster', 4000).catch(() => null);
    check('the console hears the projector is gone', !!rosterGone && rosterGone.hostConnected === false);
    const wrong = await connect('HOST-WRONG');
    extras.push(wrong);
    wrong.emit('host-rejoin', { code, pin: '0000' });
    const wrongAnswer = await waitForEvent(wrong, 'host-rejoin-error', 4000).catch(() => null);
    check('a wrong PIN does not take the room', !!wrongAnswer && /PIN/.test(wrongAnswer.message));
    drainEvent([console1], 'teacher-roster');
    const host2 = await connect('HOST2');
    extras.push(host2);
    host2.emit('host-rejoin', { code, pin: roomData.teacherPin });
    const back = await waitForEvent(host2, 'room-created', 6000).catch(() => null);
    check('the right PIN brings the projector back on the same room', !!back && back.code === code && back.restored === true && back.hostToken === roomData.hostToken);
    const rosterBack = await waitForEvent(console1, 'teacher-roster', 4000).catch(() => null);
    check('the console hears the projector is connected again', !!rosterBack && rosterBack.hostConnected === true);
    // the student who stayed is still seated on the step
    const stillThere = await waitForEvent(host2, 'player-joined', 4000).catch(() => null);
    check('the students are still in the room', !!stillThere && stillThere.players.some(p => p.name === 'Samir'));
    teardown(host2, []);
  } finally {
    teardown(null, extras);
    try { host.disconnect(); } catch { /* already gone */ }
  }
  report.summary('REVIEW FIFTEEN');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
