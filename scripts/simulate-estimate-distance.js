/**
 * simulate-estimate-distance.js — points for how close a guess is, with a
 * speed bonus (2026-10-01, owner: the area of Yemen) through a real room
 * on the hidden fixture games/_sim-estimate-distance, the estimate brick's
 * own compile: answer 527,968 km², scoring "distance", speedBonus, a
 * 10-second clock, and the standings after.
 *   Ana  527,968 at once          -> all 1000
 *   Ben  1,000,000 at once        -> 528 (about half: almost twice the answer)
 *   Cleo 527,968 five seconds in  -> about 750 (right, but slower)
 *   Dev  50,000 at once           -> 95 (far off, still something)
 *
 *   node scripts/simulate-estimate-distance.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-estimate-distance' });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 4000);
    }
    host.emit('start-game', { code });
    const starts = [];
    for (const p of players) starts.push(await waitForEvent(p, 'estimate-start', 6000));
    check('every student gets the question with its clock', starts.every(s => /Yemen/.test(s.prompt || '') && s.timer === 10));

    const send = (i, value) => players[i].emit('estimate-submit', { code, value, phaseInstanceId: starts[i].phaseInstanceId });
    send(0, 527968);
    send(1, 1000000);
    send(3, 50000);
    await wait(5000);
    send(2, 527968);
    await wait(400);
    host.emit('close-estimates', { code });

    const results = await waitForEvent(host, 'estimate-results', 8000);
    const score = Object.fromEntries((results.guesses || []).map(g => [g.name, g.score]));
    log('SIM', JSON.stringify(score));
    check('the right answer at once earns all 1000', score.Ana === 1000);
    check('almost twice the answer earns about half', score.Ben >= 500 && score.Ben <= 528);
    check('the right answer five seconds in earns less for the time (about 750)', score.Cleo >= 700 && score.Cleo <= 780);
    check('far off still earns something, the least', score.Dev > 0 && score.Dev < score.Ben);
    check('the projector reads the answer with its unit', results.answer === 527968 && results.unit === 'km²');

    host.emit('advance-phase', { code });
    const board = await waitForEvent(host, 'leaderboard', 8000);
    const order = (board.standings || []).map(s => s.name);
    check('the standings follow, Ana first, Dev last', order[0] === 'Ana' && order[order.length - 1] === 'Dev');
  } finally {
    teardown(host, players);
  }
  report.summary('POINTS FOR HOW CLOSE');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
