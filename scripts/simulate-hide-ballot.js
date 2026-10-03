/**
 * A Hide during an open vote leaves the ballot (2026-10-03, cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass): before this a hidden
 * answer stayed on every student's ballot until the tally.
 *
 * Plays games/_sim-hide-ballot with three students on its own server:
 * three answers, the vote opens, the host hides one student's answer, and
 * the two students who have not voted get the ballot again with two
 * entries; a student who already voted is left alone.
 *
 * Usage: node scripts/simulate-hide-ballot.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, drainEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam'];

async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', DATABASE_URL: '', OPENAI_API_KEY: '', POSTHOG_KEY: '', AI_DAILY_CAP: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverErrors = [];
  child.stderr.on('data', (d) => { serverErrors.push(String(d)); process.stderr.write('[server] ' + d); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
  });
  return { child, url: `http://127.0.0.1:${port}`, serverErrors };
}

async function main() {
  const { child, url, serverErrors } = await startServer();
  let host; const players = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: '_sim-hide-ballot' });
    const { code } = await waitForEvent(host, 'room-created', 5000);
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    host.emit('start-game', { code });
    const opened = await waitForEvent(players[0], 'game-started', 5000);
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: 'Book ' + (i + 1), phaseInstanceId: opened.phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }
    host.emit('advance-phase', { code, phaseInstanceId: opened.phaseInstanceId });
    const ballots = await Promise.all(players.map(p => waitForEvent(p, 'vote-start', 5000)));
    r.check(ballots.every(b => b.candidates.length === 3), `the vote opens with three entries (${ballots.map(b => b.candidates.length).join(', ')})`);
    const inst = ballots[0].phaseInstanceId;

    // Sam votes before the Hide; Maya and Jordan have not
    players[2].emit('submit-vote', { code, choice: players[0].id, phaseInstanceId: inst });
    await waitForEvent(host, 'vote-received', 3000);
    drainEvent(players, 'vote-start');

    // The host hides Jordan's answer mid-vote
    const again = [waitForEvent(players[0], 'vote-start', 3000), waitForEvent(players[1], 'vote-start', 3000)];
    let samAgain = false;
    waitForEvent(players[2], 'vote-start', 1500).then(() => { samAgain = true; }).catch(() => {});
    host.emit('moderate-hide', { code, playerId: players[1].id, hidden: true });
    const [maya, jordan] = await Promise.all(again);
    r.check(maya.candidates.length === 2 && !maya.candidates.some(c => c.playerId === players[1].id),
      `Maya gets the ballot again without the hidden entry (${maya.candidates.length} entries)`);
    r.check(jordan.candidates.length === 2, `Jordan too (${jordan.candidates.length} entries)`);
    await wait(1600);
    r.check(samAgain === false, 'Sam, who already voted, is left alone');

    // Maya votes for the remaining entry; the tally runs with two voters' picks
    players[0].emit('submit-vote', { code, choice: players[2].id, phaseInstanceId: inst });
    players[1].emit('submit-vote', { code, choice: players[0].id, phaseInstanceId: inst });
    // the tally moves the room to the end step (host-paced steps would wait)
    const ended = await waitForEvent(host, 'game-ended', 5000).catch(() => null);
    r.check(ended != null, 'the vote tallies once everyone left has voted, and the room moves on');

    await wait(300);
    r.check(serverErrors.length === 0, 'no server-side errors during the run' + (serverErrors.length ? ': ' + serverErrors[0].slice(0, 200) : ''));
  } finally {
    if (host) host.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('HIDE REACHES THE BALLOT');
}

main().catch((err) => { console.error(err); process.exit(1); });
