/**
 * Hide after the close (an outside reviewer's sixth round, 2026-09-26): a
 * backhanded line passed the filter in Someone's Got You and the teacher
 * had no way to keep it off the wall. Proved against a real server on the
 * built-in:
 *
 *   1. A blocked message tells the console who sent it (never the words).
 *   2. On the review step the console's list carries player ids; a Hide
 *      from the console re-sends the list without that line.
 *   3. Approving then goes to the return-to-author reveal; the wall (a
 *      one-by-one reveal) counts one fewer and never shows the hidden line.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage).
 * Usage: node scripts/simulate-hide-after-close.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam'];
// The blocklist stops profanity on its own; the live site's AI moderation
// also reads meaner lines, which this mock server cannot
const MEAN = 'you are terrible at guitar, just quit, this is bullshit';
const BACKHANDED = 'wow finally something you might not be bad at lol';

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

async function main() {
  const { child, url } = await startServer();
  let host; let teacher; const players = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: 'someones-got-you' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < 3; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    teacher = await connect('TEACHER', url);
    teacher.emit('join-teacher', { code, pin: room.teacherPin });
    await waitForEvent(teacher, 'teacher-joined', 5000);

    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);
    const notesStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const notes = await notesStarted;
    for (let i = 0; i < 3; i++) {
      players[i].emit('submit-response', { code, response: 'I am learning guitar and it is slow going, ' + NAMES[i], phaseInstanceId: notes[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }

    const boostStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('close-submissions', { code });
    const boost = await boostStarted;
    // 1. The plainly mean line is stopped, and the console hears who
    const blockedSeen = waitForEvent(teacher, 'teacher-blocked', 5000);
    players[1].emit('submit-response', { code, response: MEAN, phaseInstanceId: boost[1].phaseInstanceId });
    const rejected = await waitForEvent(players[1], 'response-rejected', 3000);
    const blocked = await blockedSeen;
    r.check(rejected && rejected.reason, '1. the plainly mean line is rejected: ' + (rejected && rejected.reason));
    r.check(blocked && blocked.name === 'Jordan' && !JSON.stringify(blocked).includes('guitar'), '1. the console hears who was stopped, never the words');

    // The backhanded line passes (the filter cannot read tone), so the
    // review step is where the teacher stops it
    players[0].emit('submit-response', { code, response: 'Keep going, slow is still going. ' + NAMES[0], phaseInstanceId: boost[0].phaseInstanceId });
    await waitForEvent(players[0], 'response-accepted', 3000);
    players[1].emit('submit-response', { code, response: BACKHANDED, phaseInstanceId: boost[1].phaseInstanceId });
    await waitForEvent(players[1], 'response-accepted', 3000);
    players[2].emit('submit-response', { code, response: 'Every song was hard once. ' + NAMES[2], phaseInstanceId: boost[2].phaseInstanceId });
    await waitForEvent(players[2], 'response-accepted', 3000);

    const previewSeen = waitForEvent(teacher, 'preview-content', 8000);
    host.emit('close-submissions', { code });
    const preview = await previewSeen;
    const rows = preview.responses || [];
    r.check(rows.length === 3 && rows.every(x => x.playerId), '2. the review list carries every line with a player id');
    const meanRow = rows.find(x => x.response === BACKHANDED);
    r.check(!!meanRow, '2. the backhanded line reached the review list (the filter cannot read tone)');

    // 2. Hide it from the console: the list comes back without it
    const previewAgain = waitForEvent(teacher, 'preview-content', 5000);
    teacher.emit('moderate-hide', { code, playerId: meanRow.playerId, hidden: true });
    const after = await previewAgain;
    r.check((after.responses || []).length === 2 && !(after.responses || []).some(x => x.response === BACKHANDED), '2. after Hide the review list has two lines and no backhanded one');

    // 3. Approve: the private reveal, then the wall counts one fewer
    const wallStart = waitForEvent(host, 'reveal-one-start', 10000);
    host.emit('preview-approve', { code });
    await waitForEvent(host, 'show-results', 8000).catch(() => null);
    await wait(300);
    host.emit('advance-phase', { code });
    const wall = await wallStart;
    r.check(wall.total === 2, '3. the wall has two items, not three (got ' + wall.total + ')');
    const shown = [];
    for (let i = 0; i < 2; i++) {
      const itemSeen = waitForEvent(host, 'reveal-one-item', 5000);
      host.emit('reveal-next', { code });
      shown.push(await itemSeen);
    }
    const wallText = JSON.stringify(shown);
    r.check(!wallText.includes(BACKHANDED), '3. the wall never shows the hidden line');
    r.check(wallText.includes('Keep going') && wallText.includes('Every song'), '3. the wall shows the two kind lines');
  } finally {
    for (const s of [host, teacher, ...players]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
  }
  r.summary('HIDE AFTER THE CLOSE');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
