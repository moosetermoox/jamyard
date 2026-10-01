/**
 * simulate-runoff.js — instant runoff (2026-10-01, the mechanics
 * inventory's Part 3) through a real room on the hidden fixture
 * games/_sim-runoff, the rank brick's own compile with runoff: true.
 * Nine students rank three lunches: Pizza leads the first choices 4 to 3
 * to 2, but Sushi's two ballots move to Tacos, so Tacos wins 5 of 9. The
 * projector shows the pick and both rounds; the class order stays stored.
 *
 *   node scripts/simulate-runoff.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

const BALLOTS = [
  ...Array(4).fill(['Pizza', 'Tacos', 'Sushi']),
  ...Array(3).fill(['Tacos', 'Sushi', 'Pizza']),
  ...Array(2).fill(['Sushi', 'Tacos', 'Pizza'])
];

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-runoff' });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy'];
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
    for (const p of players) starts.push(await waitForEvent(p, 'rank-start', 6000).catch(() => null));
    check('every student gets the three lunches to put in order', starts.every(s => s && Array.isArray(s.items || s.candidates) && (s.items || s.candidates).length === 3));
    players.forEach((p, i) => p.emit('rank-submit', { code, ranking: BALLOTS[i], phaseInstanceId: starts[i].phaseInstanceId }));

    // The last ballot closes the step; the reveal is the runoff
    const shown = await waitForEvent(host, 'show-results', 8000);
    const text = String(shown.content || '');
    check('the projector names the pick', /The class picked:\s+\*\*Tacos\*\*/.test(text));
    check('round one: Pizza leads, Sushi goes out', /Round 1: Pizza 4, Tacos 3, Sushi 2\. Sushi is out\./.test(text));
    check('round two: Sushi\'s ballots move to Tacos, who wins with a majority', /Round 2: Tacos 5, Pizza 4\. Tacos wins with 5 of 9\./.test(text));
    check('nothing names a student', !names.some(n => text.includes(n)));
    const studentShown = await waitForEvent(players[0], 'show-results', 4000).catch(() => null);
    check('the students see the same pick', studentShown && /Tacos/.test(String(studentShown.content || '')));
    await wait(200);
  } finally {
    teardown(host, players);
  }
  report.summary('INSTANT RUNOFF');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
