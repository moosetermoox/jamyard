/**
 * simulate-estimate-refresh.js — a guessing step's clock survives a
 * refreshed student screen (2026-10-02): the estimate step keeps its
 * deadline (`timerEndsAt`), so a screen that comes back mid-guess gets the
 * time left, where it used to get `timer: null` and lose the countdown.
 * Runs on the hidden fixture games/_sim-estimate-answer (a 60-second
 * guess).
 *
 *   node scripts/simulate-estimate-refresh.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-estimate-answer' });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben'];
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
    host.emit('start-game', { code });

    const first = [];
    for (const p of players) first.push(await waitForEvent(p, 'estimate-start', 5000));
    check('every student gets the guess with its clock', first.every(s => s && s.timer === 60));

    // Ben's screen comes back three seconds in
    await wait(3000);
    players[1].disconnect();
    const back = await connect('BEN2');
    players[1] = back;
    back.emit('join-room', { code, name: 'Ben', token: tokens[1] });
    const rejoined = await waitForEvent(back, 'join-success', 4000);
    const resumed = await waitForEvent(back, 'estimate-start', 4000);
    check('the returning student is seated again', rejoined.reconnected === true);
    check('the returning screen gets the time left, not a vanished clock',
      typeof resumed.timer === 'number' && resumed.timer >= 55 && resumed.timer <= 58);
    check('the returning screen carries the step id (never dropped as stale)', resumed.phaseInstanceId !== undefined);
  } finally {
    teardown(host, players);
  }
  report.summary('ESTIMATE CLOCK ON A REFRESH');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
