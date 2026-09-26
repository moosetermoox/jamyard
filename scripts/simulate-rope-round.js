/**
 * Both Sides of the Rope, a reviewer's round (2026-09-26), proved on a
 * real server with five students, one joining during the first vote:
 *
 *   1. The projector's counter grows when a student joins mid-step
 *      ("0 of 4" with five in the room was the complaint).
 *   2. The class sees where it starts: a reveal after the first vote with
 *      every choice in the scale's order, zeros included.
 *   3. The ending is one paired chart (same order, both counts per row)
 *      and "N of M students changed their minds." over the students who
 *      voted both times (Theo joined during the first vote and voted in
 *      both, so he counts).
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage).
 * Usage: node scripts/simulate-rope-round.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, drainEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya'];
const SCALE = ['Yes', 'Lean yes', 'Not sure', 'Lean no', 'No'];

async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', DATABASE_URL: '', OPENAI_API_KEY: '', POSTHOG_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function submitAll(players, code, answers, phaseInstanceId) {
  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: answers[i], phaseInstanceId });
    await waitForEvent(players[i], 'response-accepted', 3000);
  }
}

async function main() {
  const { child, url } = await startServer();
  let host; const players = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: 'both-sides-rope' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }

    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);
    const voteStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const vote1 = await voteStarted;
    const hostVote1 = await waitForEvent(host, 'game-started', 3000);
    r.check(hostVote1.isChoice && hostVote1.total === 4, '0. the first vote opens with 0 of 4 on the projector');

    // 1. A fifth student joins mid-vote: the projector's counter grows now
    const countSeen = waitForEvent(host, 'submission-count', 3000);
    const late = await connect('P5', url);
    late.emit('join-room', { code, name: 'Theo' });
    await waitForEvent(late, 'join-success', 3000);
    const count = await countSeen;
    r.check(count.total === 5 && count.count === 0, '1. the projector hears 0 of 5 the moment Theo joins: ' + JSON.stringify({ count: count.count, total: count.total }));
    const lateVote = await waitForEvent(late, 'game-started', 3000);
    r.check(lateVote.isChoice, '1. Theo lands in the open vote');
    players.push(late);

    // Everyone votes: Maya Yes, Jordan No, Sam Not sure, Priya Lean no, Theo Yes
    await submitAll(players, code, ['Yes', 'No', 'Not sure', 'Lean no', 'Yes'], vote1[0].phaseInstanceId);

    // 2. Where we start: every choice in order, zeros kept, on the reveal
    const startSeen = waitForEvent(host, 'show-results', 8000);
    host.emit('close-submissions', { code });
    const start = await startSeen;
    const startText = String(start.content || '');
    const rows = startText.split('\n').filter(l => /[█░]/.test(l)).map(l => l.split('  ')[0].trim());
    r.check(rows.join(',') === SCALE.join(','), '2. the first vote lists every choice in the scale\'s order: ' + rows.join(', '));
    r.check(/Lean yes\s+░{20}\s+0 \(0%\)/.test(startText), '2. a choice nobody picked shows as a zero row');
    r.check(/Yes\s+█{20}\s+2 \(40%\)/.test(startText), '2. the counts are right (Yes 2 of 5)');

    // The rope: evidence (two fields), the AI summary (mock), the reveal, the what-ifs, the reveal
    drainEvent(players, 'game-started');
    const evidenceStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const evidence = await evidenceStarted;
    r.check(Array.isArray(evidence[0].fields) && evidence[0].fields.length === 2, '2. after the start reveal the class builds the rope (two fields)');
    await submitAll(players, code, players.map((_, i) => ({ yes: 'yes evidence ' + i, no: 'no evidence ' + i })), evidence[0].phaseInstanceId);
    host.emit('close-submissions', { code });
    await waitForEvent(host, 'show-results', 20000); // the rope reveal (mock AI)
    await wait(300);
    drainEvent(players, 'game-started');
    const whatifStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const whatif = await whatifStarted;
    await submitAll(players, code, players.map((_, i) => 'What if ' + i + '?'), whatif[0].phaseInstanceId);
    drainEvent([host], 'show-results');
    host.emit('close-submissions', { code });
    await waitForEvent(host, 'show-results', 8000); // the what-ifs
    await wait(300);

    // 3. The second vote: Maya Yes (same), Jordan Lean no (moved), Sam Yes (moved), Priya Lean no (same), Theo No (moved)
    drainEvent(players, 'game-started');
    const vote2Started = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const vote2 = await vote2Started;
    r.check(vote2.every(v => v.isChoice), '3. the second vote opens for all five');
    await submitAll(players, code, ['Yes', 'Lean no', 'Yes', 'Lean no', 'No'], vote2[0].phaseInstanceId);
    drainEvent([host], 'show-results');
    const deltaSeen = waitForEvent(host, 'show-results', 8000);
    host.emit('close-submissions', { code });
    const delta = await deltaSeen;
    const text = String(delta.content || '');
    const pairRows = text.split('\n').filter(l => /→/.test(l));
    r.check(pairRows.map(l => l.split('  ')[0].trim()).join(',') === SCALE.join(','), '3. one paired chart, every choice in the scale\'s order: ' + pairRows.length + ' rows');
    r.check(/^Yes\s+█+░*\s+2 → █+░*\s+2$/.test(pairRows[0]), '3. Yes reads 2 → 2');
    r.check(/^Lean yes\s+░+\s+0 → ░+\s+0$/.test(pairRows[1]), '3. Lean yes reads 0 → 0 (zeros kept)');
    r.check(/^No\s+█+░*\s+1 → █+░*\s+1$/.test(pairRows[4]), '3. No reads 1 → 1');
    r.check(text.includes('3 of 5 students changed their minds.'), '3. the moved line counts Jordan, Sam, and Theo: ' + (text.match(/[^\n]*changed their mind[^\n]*/) || ['(none)'])[0]);
    r.check(!/WHERE WE STARTED/.test(text), '3. the two separate lists are gone');
  } finally {
    if (host) host.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('ROPE ROUND');
  process.exit(r.errors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
