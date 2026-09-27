/**
 * Guess who, with a gate (a reviewer's Rose, Bud, Thorn round, 2026-09-26:
 * a student's private struggle went straight onto the projector with the
 * class asked to guess who wrote it). Proved on the built-in Who Said It?
 * against a real server with three students:
 *
 *   1. The answer box says the class will guess who wrote it, after the
 *      teacher reviews it.
 *   2. A heavy line ("my parents are getting divorced and I can't sleep")
 *      is stored, never blocked, and reaches the console's review list
 *      marked "Needs a look" BEFORE any round; nothing has gone to the
 *      projector yet.
 *   3. The teacher hides it; approve opens the rounds over the two left.
 *   4. In a round the author's screen reads "Waiting for the others...",
 *      never "This one is yours!", and the projector's count starts at
 *      1 of 3 (the author already in), never 0 of 2.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage).
 * Usage: node scripts/simulate-guess-who-gate.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, drainEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam'];
const HEAVY = "My parents are getting divorced and I can't sleep.";

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
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } if (process.env.SIM_SERVER_LOG) process.stderr.write('[server] ' + d); });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function main() {
  const { child, url } = await startServer();
  let host; let teacher; const players = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: 'who-said-it' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    teacher = await connect('TEACHER', url);
    teacher.emit('join-teacher', { code, pin: room.teacherPin });
    await waitForEvent(teacher, 'teacher-joined', 5000);

    host.emit('start-game', { code });
    // the intro announce (its own timer would advance it: wait for it to land, then move on)
    await waitForEventOnAll(players, 'announce', 5000).catch(() => null);
    await wait(300);
    const askStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const ask = await askStarted;
    // 1. the answer box says what will happen
    r.check(ask[0].audience === 'Your class will see this and try to guess who wrote it, after your teacher reviews it.', '1. the answer box says the class will guess who wrote it, after the teacher reviews it: ' + ask[0].audience);

    // 2. a heavy line is stored (never blocked) and flagged for the teacher
    const flagged = waitForEvent(teacher, 'submissions-update', 5000);
    players[1].emit('submit-response', { code, response: HEAVY, phaseInstanceId: ask[1].phaseInstanceId });
    const accepted = await waitForEvent(players[1], 'response-accepted', 3000).catch(() => null);
    r.check(!!accepted, '2. the heavy line is accepted, never blocked');
    const subs = await flagged;
    const jordanRow = (subs.submissions || []).find(s => s.name === 'Jordan');
    r.check(!!(jordanRow && jordanRow.flagged), '2. the console marks it Needs a look as it lands');
    players[0].emit('submit-response', { code, response: 'A cricket taco.', phaseInstanceId: ask[0].phaseInstanceId });
    await waitForEvent(players[0], 'response-accepted', 3000);
    players[2].emit('submit-response', { code, response: 'Sea urchin.', phaseInstanceId: ask[2].phaseInstanceId });
    await waitForEvent(players[2], 'response-accepted', 3000);

    // the close lands on the review step, not a round
    const previewSeen = waitForEvent(teacher, 'preview-content', 8000);
    host.emit('close-submissions', { code });
    const preview = await previewSeen;
    const rows = preview.responses || [];
    r.check(rows.length === 3, '2. the review list carries all three answers before any round');
    const heavyRow = rows.find(x => x.response === HEAVY);
    r.check(!!(heavyRow && heavyRow.flagged && heavyRow.playerId), '2. the heavy line is on the review list, flagged, with its player id');
    r.check(!(host._buffer['game-started'] || []).some(g => g.isChoice), '2. nothing has reached the projector as a round yet');
    const waitingLines = players.map(p => (p._buffer.waiting || []).map(w => w.message).pop());
    r.check(waitingLines.every(m => /checking the answers/.test(m || '')), '2. every student reads that the teacher is checking the answers');

    // 3. Hide it, then approve: the rounds run over the two left
    const previewAgain = waitForEvent(teacher, 'preview-content', 5000);
    teacher.emit('moderate-hide', { code, playerId: heavyRow.playerId, hidden: true });
    const after = await previewAgain;
    r.check((after.responses || []).length === 2 && !(after.responses || []).some(x => x.response === HEAVY), '3. after Hide the review list has two answers and no heavy line');
    drainEvent([host], 'game-started');
    drainEvent(players, 'game-started');
    drainEvent(players, 'waiting');
    host.emit('preview-approve', { code });
    // the round's "show" announce moves into the guess by its own 5 s timer
    const guess = await waitForEvent(host, 'game-started', 12000);
    r.check(guess.isChoice && guess.total === 3 && guess.count === 1, '4. the projector count starts at 1 of 3, the author already in: ' + guess.count + ' of ' + guess.total);
    r.check(!JSON.stringify(guess).includes(HEAVY), '3. the round never shows the hidden line');
    await wait(300);
    // 4. the author's screen reads like everyone else's waiting screen
    const authorWaiting = players.map(p => (p._buffer.waiting || []).map(w => w.message).pop()).filter(Boolean);
    r.check(authorWaiting.length === 1 && authorWaiting[0] === 'Waiting for the others...', '4. the author\'s screen reads "Waiting for the others...", never "This one is yours!": ' + JSON.stringify(authorWaiting));
    const ballots = players.filter(p => (p._buffer['game-started'] || []).some(g => g.isChoice));
    r.check(ballots.length === 2, '4. the other two get the ballot');
    // a vote lands: the count reads 2 of 3, still never one short of the room
    drainEvent([host], 'response-received');
    const counted = waitForEvent(host, 'response-received', 5000);
    const voter = ballots[0];
    const ballot = (voter._buffer['game-started'] || []).filter(g => g.isChoice).pop();
    const pick = ballot.choices[0];
    voter.emit('submit-response', { code, response: typeof pick === 'string' ? pick : (pick.text || pick.name), phaseInstanceId: ballot.phaseInstanceId });
    const c = await counted;
    r.check(c.total === 3 && c.count === 2, '4. after one vote the projector reads 2 of 3: ' + c.count + ' of ' + c.total);
  } finally {
    if (host) host.disconnect();
    if (teacher) teacher.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('GUESS WHO GATE');
  process.exit(r.errors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
