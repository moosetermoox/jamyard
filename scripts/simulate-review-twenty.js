/**
 * simulate-review-twenty.js — a twentieth outside review (2026-09-29):
 * a swear word spaced out letter by letter is refused in an answer, a
 * classmate's name next to an insult is refused before the AI check, a
 * threat with no swear word is refused, and a kind line with the same
 * name is accepted. Exit Ticket (rolling start: the room opens straight
 * into its two boxes).
 *
 *   node scripts/simulate-review-twenty.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, drainEvent, teardown, makeReporter, log } from './sim-harness.js';

const gameId = 'exit-ticket';
const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code} (${gameId})`);
  const players = [];
  try {
    const console1 = await connect('CONSOLE');
    players.push(console1);
    console1.emit('join-teacher', { code, pin: roomData.teacherPin });
    await waitForEvent(console1, 'teacher-joined', 4000);
    const ben = await connect('BEN');
    const ana = await connect('ANA');
    players.push(ben, ana);
    ben.emit('join-room', { code, name: 'Ben' });
    await waitForEvent(ben, 'join-success', 4000);
    ana.emit('join-room', { code, name: 'Ana Lopez' });
    await waitForEvent(ana, 'join-success', 4000);
    const started = await waitForEvent(ana, 'game-started', 6000);
    const phaseInstanceId = started.phaseInstanceId;

    async function send(text) {
      ana.emit('submit-response', { code, response: { q1: text, q2: 'nothing' }, phaseInstanceId });
      return Promise.race([
        waitForEvent(ana, 'response-rejected', 4000).then(r => ({ rejected: r })),
        waitForEvent(ana, 'response-accepted', 4000).then(a => ({ accepted: a }))
      ]);
    }

    let r = await send('I have a f u c k i n g cat');
    check('a swear word spaced out letter by letter is refused', !!r.rejected && r.rejected.reason === 'inappropriate_content');

    drainEvent([console1], 'teacher-blocked');
    r = await send('Ben is a loser');
    check('a classmate\'s name next to an insult is refused', !!r.rejected && r.rejected.reason === 'about_classmate');
    check('the refusal names nothing back', !!r.rejected && !/ben|loser/i.test(r.rejected.message) && /classmates/.test(r.rejected.message));
    const told = await waitForEvent(console1, 'teacher-blocked', 3000).catch(() => null);
    check('the console hears who and why', !!told && told.name === 'Ana Lopez' && told.reason === 'about_classmate');

    r = await send('nobody likes Ben lol');
    check('the insult before the name is refused too', !!r.rejected && r.rejected.reason === 'about_classmate');

    r = await send('kys');
    check('a threat with no swear word is refused', !!r.rejected && r.rejected.reason === 'inappropriate_content');

    r = await send('Ben is great at soccer and I learned fractions');
    check('a kind line with the same name is accepted', !!r.accepted);
  } finally {
    teardown(host, players);
  }
  report.summary('REVIEW TWENTY');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
