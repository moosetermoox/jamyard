/**
 * simulate-quiet.js — the quiet brick (2026-10-01, the mechanics
 * inventory's Part 3) through a real room on the hidden fixture
 * games/_sim-quiet (the brick's compile with a 10-second clock): both
 * screens count down, a student whose screen comes back mid-quiet gets
 * the time left, the step moves on by itself to the talk line, and the
 * talk line waits for the teacher.
 *
 *   node scripts/simulate-quiet.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-quiet' });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo'];
  const players = [];
  const tokens = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      const joined = await waitForEvent(p, 'join-success', 4000);
      tokens.push(joined.token);
    }
    const startedAt = Date.now();
    host.emit('start-game', { code });

    // 1. Both screens count down from the same clock
    const hostQuiet = await waitForEvent(host, 'announce', 5000);
    const quiet = [];
    for (const p of players) quiet.push(await waitForEvent(p, 'announce', 5000));
    check('the projector counts down the quiet', hostQuiet.timer === 10 && /Think quietly/.test(hostQuiet.message));
    check('every student screen counts down the same quiet', quiet.every(q => q.timer === 10 && /Think quietly/.test(q.message)));

    // 2. Ben's screen comes back four seconds in: the clock comes with it
    await wait(4000);
    players[1].disconnect();
    const back = await connect('BEN2');
    players[1] = back;
    back.emit('join-room', { code, name: 'Ben', token: tokens[1] });
    const rejoined = await waitForEvent(back, 'join-success', 4000);
    const resumed = await waitForEvent(back, 'announce', 4000);
    check('the returning student is seated again', rejoined.reconnected === true);
    check('the returning screen gets the time left, not a vanished clock', typeof resumed.timer === 'number' && resumed.timer >= 4 && resumed.timer <= 7);

    // 3. The quiet ends by itself and the talk line waits for the teacher
    const hostTalk = await waitForEvent(host, 'announce', 9000);
    const elapsed = (Date.now() - startedAt) / 1000;
    check('the quiet moves on by itself at its clock', /Turn to a partner/.test(hostTalk.message) && elapsed >= 9.5 && elapsed < 13);
    check('the talk line has no clock', !hostTalk.timer);
    const ended = await waitForEvent(host, 'game-ended', 3000).then(() => true, () => false);
    check('the talk line stays up until the teacher moves on', ended === false);
    host.emit('advance-phase', { code });
    const over = await waitForEvent(host, 'game-ended', 5000).then(() => true, () => false);
    check('the teacher\'s press ends it', over);
  } finally {
    teardown(host, players);
  }
  report.summary('QUIET TIME');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
