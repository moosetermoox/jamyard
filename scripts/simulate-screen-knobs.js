/**
 * simulate-screen-knobs.js — the screen knobs (2026-09-30, the mechanics
 * inventory part four) through a real room on the hidden fixture
 * games/_sim-screen-knobs: several picks on one ballot (maxPicks), a
 * graded open answer (correctAnswer), and a line per group (stations).
 *
 *   node scripts/simulate-screen-knobs.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, waitForAnyPlayerEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-screen-knobs' });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
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

    // 1. Several picks: the ballot carries the limit; picks beyond it are dropped
    const pollStart = await waitForAnyPlayerEvent(players, 'game-started', 6000);
    check('the ballot carries the pick limit', pollStart.maxPicks === 2);
    const inst = pollStart.phaseInstanceId;
    players[0].emit('submit-response', { code, response: ['Red', 'Green'], phaseInstanceId: inst });
    players[1].emit('submit-response', { code, response: ['Green', 'Blue', 'Red'], phaseInstanceId: inst });
    players[2].emit('submit-response', { code, response: 'Blue', phaseInstanceId: inst });
    players[3].emit('submit-response', { code, response: ['Red', 'Red'], phaseInstanceId: inst });
    await wait(400);
    drainEvent(players, 'game-started');
    await waitForEvent(host, 'live-tally', 4000).catch(() => null);
    const tallies = host._buffer['live-tally'] || [];
    const tally = tallies[tallies.length - 1] || null;
    const counts = tally && tally.rows ? Object.fromEntries(tally.rows.map(r => [r.label, r.count])) : {};
    check('the live tally counts every pick, each student once, and never a pick over the cap', !!tally && tally.answered === 4 && counts.Red === 2 && counts.Green === 2 && counts.Blue === 2);
    host.emit('close-submissions', { code });

    // 2. A graded open answer
    const askStart = await waitForAnyPlayerEvent(players, 'game-started', 6000);
    const askInst = askStart.phaseInstanceId;
    drainEvent(players, 'game-started');
    const answers = ['paris', 'Paris.', 'Rome', 'Paris, France'];
    players.forEach((p, i) => p.emit('submit-response', { code, response: answers[i], phaseInstanceId: askInst }));
    await wait(400);
    host.emit('close-submissions', { code });
    const shown = await waitForEvent(host, 'show-results', 8000);
    const content = String(shown.content || '');
    check('the chart counts the picks (Red 2)', /Red[^\n]*\b2 \(\d+%\)/.test(content) && /Green[^\n]*\b2 \(\d+%\)/.test(content));
    check('the reveal reads the answer and the counts', /The answer was Paris\. 3 of 4 had it\./.test(content));
    host.emit('advance-phase', { code });

    // 3. A line per group
    const split = await waitForEvent(host, 'team-split', 6000);
    const teamOf = {};
    for (const [team, members] of Object.entries(split.teams || {})) for (const m of members) teamOf[m.name] = team;
    drainEvent(players, 'team-split');
    host.emit('advance-phase', { code });
    const hostAnnounce = await waitForEvent(host, 'announce', 6000);
    check('the projector reads a placeholder, never one group\'s line', /their group's own text/.test(hostAnnounce.message || '') && !/Measure the water/.test(hostAnnounce.message || ''));
    const seen = {};
    for (let i = 0; i < players.length; i++) {
      const a = await waitForEvent(players[i], 'announce', 6000).catch(() => null);
      seen[names[i]] = a ? a.message : '';
    }
    const teamNames = Object.keys(split.teams || {});
    const lineFor = (t) => ['Measure the water', 'Graph the readings'][teamNames.indexOf(t)];
    check('every student reads their own group\'s line', names.every(n => seen[n] === 'Your station: ' + lineFor(teamOf[n])));
    check('the two groups read different lines', new Set(Object.values(seen)).size === 2);
  } finally {
    teardown(host, players);
  }
  report.summary('SCREEN KNOBS');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
