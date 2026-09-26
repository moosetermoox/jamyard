/**
 * A reviewer's phone-sized round (2026-09-26), proved on Draw Gallery
 * against a real server:
 *
 *   1. A student who refreshes mid-drawing (a new socket with the old
 *      token) gets the step back WITH the seconds left, and "A bit more
 *      time" pushes that deadline back too.
 *   2. The review list reaches the projector with a player id per drawing;
 *      a Hide from the projector re-sends the list to the projector AND
 *      the console without that drawing, marked as a refresh.
 *   3. A Reject tells every student why the step is up again (step-note)
 *      before the step restarts, and the restarted step has its full timer.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage).
 * Usage: node scripts/simulate-phone-round.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, drainEvent, makeReporter, wait } from './sim-harness.js';
import '../screens/shared/drawing.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan'];
const Draw = globalThis.Draw;

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
  let host; let teacher; const players = []; const tokens = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: 'art-gallery' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      const joined = await waitForEvent(p, 'join-success', 3000);
      tokens.push(joined.token);
      players.push(p);
    }
    teacher = await connect('TEACHER', url);
    teacher.emit('join-teacher', { code, pin: room.teacherPin });
    await waitForEvent(teacher, 'teacher-joined', 5000);

    host.emit('start-game', { code });
    await waitForEvent(host, 'phase-announce', 5000).catch(() => null);
    await wait(300);
    const drawStarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const draw = await drawStarted;
    r.check(draw.every(d => d.inputType === 'drawing' && d.timer === 90 && d.phaseId === 'draw'), '0. the drawing step opens with its 90 s clock on every screen');

    // 1. Jordan's phone locks mid-drawing: a fresh socket, the old token
    await wait(2100);
    players[1].disconnect();
    const back = await connect('P2b', url);
    back.emit('join-room', { code, name: NAMES[1], token: tokens[1] });
    const rejoined = await waitForEvent(back, 'join-success', 3000);
    r.check(rejoined.reconnected === true, '1. the refreshed student is seated again (reconnected)');
    const again = await waitForEvent(back, 'game-started', 3000);
    r.check(again.inputType === 'drawing' && again.phaseId === 'draw', '1. the drawing step comes back on the refreshed screen');
    r.check(typeof again.timer === 'number' && again.timer >= 80 && again.timer <= 88, '1. with the seconds left, not a blank clock: ' + again.timer);
    players[1] = back;

    // "A bit more time" pushes the remembered deadline too
    const extended = waitForEvent(host, 'timer-extended', 3000);
    host.emit('extend-timer', { code, phaseInstanceId: draw[0].phaseInstanceId });
    await extended;
    players[1].disconnect();
    const back2 = await connect('P2c', url);
    back2.emit('join-room', { code, name: NAMES[1], token: tokens[1] });
    await waitForEvent(back2, 'join-success', 3000);
    const afterMore = await waitForEvent(back2, 'game-started', 3000);
    r.check(typeof afterMore.timer === 'number' && afterMore.timer >= 108 && afterMore.timer <= 118, '1. after A bit more time the refreshed clock reads the longer deadline: ' + afterMore.timer);
    players[1] = back2;

    // Both draw and submit
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: { strokes: Draw.scribble() }, phaseInstanceId: draw[0].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }

    // 2. The review list reaches the projector with a player id per drawing
    const hostPreview = waitForEvent(host, 'preview-content', 8000);
    const teacherPreview = waitForEvent(teacher, 'preview-content', 8000);
    host.emit('close-submissions', { code });
    const preview = await hostPreview;
    await teacherPreview;
    const rows = preview.responses || [];
    r.check(rows.length === 2 && rows.every(x => x.playerId && Array.isArray(x.drawing)), '2. the projector\'s private list carries two drawings, each with a player id');
    r.check(!preview.refresh, '2. the first list is not a refresh (the projector shows the review screen)');

    const jordanRow = rows.find(x => x.name === 'Jordan');
    const hostAgain = waitForEvent(host, 'preview-content', 5000);
    const teacherAgain = waitForEvent(teacher, 'preview-content', 5000);
    host.emit('moderate-hide', { code, playerId: jordanRow.playerId, hidden: true });
    const refreshed = await hostAgain;
    const teacherRefreshed = await teacherAgain;
    r.check(refreshed.refresh === true && (refreshed.responses || []).length === 1 && refreshed.responses[0].name === 'Maya', '2. Hide from the projector re-sends its list as a refresh with only Maya');
    r.check(teacherRefreshed.refresh === true && (teacherRefreshed.responses || []).length === 1, '2. the console hears the same refresh');

    // 3. Reject: every student is told why, then the step restarts
    // (the harness reads buffered events: drop the first round's start)
    drainEvent(players, 'game-started');
    const notes = waitForEventOnAll(players, 'step-note', 5000);
    const restarted = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('preview-reject', { code });
    const noteSeen = await notes;
    r.check(noteSeen.every(n => n.message === 'Your teacher asked everyone to do this step again.'), '3. every student hears why the step is up again');
    const round2 = await restarted;
    r.check(round2.every(d => d.phaseId === 'draw' && d.timer === 90), '3. the drawing step restarts with its full clock');
    r.check(!JSON.stringify(noteSeen).match(/\bAI\b/), '3. the note never names the AI');
  } finally {
    if (host) host.disconnect();
    if (teacher) teacher.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('PHONE ROUND');
  process.exit(r.errors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
