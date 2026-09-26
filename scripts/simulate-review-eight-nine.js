/**
 * Two reviewer rounds (2026-09-26), proved on a fresh mock server:
 *
 *   Anonymous Feedback: the teacher's summary reaches the console (and the
 *   projector's hidden card) and never a student; the class reads only the
 *   group-level version after the teacher approves.
 *
 *   Idea Chain: four rounds pass each idea along, every student gets their
 *   own chain back with every hop numbered, and the projector's gallery
 *   shows every chain start to finish.
 *
 * Usage: node scripts/simulate-review-eight-nine.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, waitForEventOnAll, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan', 'Sam', 'Priya'];

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

async function openRoom(url, gameId, n) {
  const host = await connect('HOST', url);
  host.emit('create-room', { gameId });
  const room = await waitForEvent(host, 'room-created', 5000);
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = await connect('P' + (i + 1), url);
    p.emit('join-room', { code: room.code, name: NAMES[i] });
    await waitForEvent(p, 'join-success', 3000);
    players.push(p);
  }
  const teacher = await connect('TEACHER', url);
  teacher.emit('join-teacher', { code: room.code, pin: room.teacherPin });
  await waitForEvent(teacher, 'teacher-joined', 5000);
  return { host, players, teacher, code: room.code };
}

async function anonymousFeedback(url) {
  const { host, players, teacher, code } = await openRoom(url, '_sim-anonymous-feedback', 3);
  try {
    host.emit('start-game', { code });
    await wait(300);
    const asked = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const ask = await asked;
    r.check(ask.every(ev => typeof ev.audience === 'string' && /summed up/.test(ev.audience)), 'AF: students are told their answers get summed up for the class');
    const LINES = ['The group work helps me but I hesitate to ask questions.', 'Instructions could be clearer, ' + NAMES[1], 'Slow down a little when it gets hard, ' + NAMES[2]];
    for (let i = 0; i < 3; i++) {
      players[i].emit('submit-response', { code, response: LINES[i], phaseInstanceId: ask[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }
    // Students must never get a show-results before the teacher approves
    let earlyResult = null;
    players.forEach(p => p.once('show-results', (ev) => { earlyResult = ev; }));
    const previewSeen = waitForEvent(teacher, 'preview-content', 15000);
    host.emit('close-submissions', { code });
    const preview = await previewSeen;
    r.check(typeof preview.content === 'string' && preview.content.length > 0, 'AF: the teacher console gets the summary as a preview');
    r.check(!Array.isArray(preview.responses) || preview.responses.length === 0, 'AF: the preview carries no raw answers with names (showResponses false)');
    await wait(400);
    r.check(earlyResult === null, 'AF: no student screen got the teacher\'s summary');
    const classSeen = waitForEventOnAll(players, 'show-results', 15000);
    host.emit('preview-approve', { code });
    const shown = await classSeen;
    r.check(shown.every(ev => typeof ev.content === 'string' && ev.content.includes('What we said')), 'AF: after approval every student reads the class version under "What we said"');
    r.check(shown.every(ev => !/Actionable|next steps|Thanks for gathering/i.test(ev.content)), 'AF: the class version carries no advice to the teacher (mock text)');
    r.check(shown.every(ev => !ev.content.includes('*How')), 'AF: the question is quoted, never wrapped in stars');
  } finally {
    for (const s of [host, teacher, ...players]) { try { s.disconnect(); } catch (e) { /* gone */ } }
  }
}

async function ideaChain(url) {
  const { host, players, teacher, code } = await openRoom(url, '_sim-idea-chain', 4);
  try {
    host.emit('start-game', { code });
    await wait(300);
    const started = waitForEventOnAll(players, 'game-started', 8000);
    host.emit('advance-phase', { code });
    const starter = await started;
    for (let i = 0; i < 4; i++) {
      players[i].emit('submit-response', { code, response: 'START by ' + NAMES[i], phaseInstanceId: starter[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }
    let prevWords = NAMES.map(n => 'START by ' + n);
    for (let round = 1; round <= 4; round++) {
      const nextRound = waitForEventOnAll(players, 'game-started', 10000);
      host.emit('close-submissions', { code });
      await wait(200);
      host.emit('advance-phase', { code }); // past the round intro
      const ev = await nextRound;
      const prompts = ev.map(e => String(e.prompt || ''));
      r.check(prompts.every(p => !p.includes('{{')), `IC round ${round}: no raw tokens`);
      r.check(prompts.every((p, i) => !p.includes(prevWords[i])), `IC round ${round}: nobody receives their own last version`);
      r.check(prompts.every(p => prevWords.some(w => p.includes(w))), `IC round ${round}: everyone receives a classmate's latest version`);
      for (let i = 0; i < 4; i++) {
        players[i].emit('submit-response', { code, response: `R${round} by ${NAMES[i]}`, phaseInstanceId: ev[i].phaseInstanceId });
        await waitForEvent(players[i], 'response-accepted', 3000);
      }
      prevWords = NAMES.map(n => `R${round} by ${n}`);
    }
    const own = waitForEventOnAll(players, 'show-results', 10000);
    const chains = waitForEvent(teacher, 'teacher-chains', 10000);
    host.emit('close-submissions', { code });
    const reveals = await own;
    const texts = reveals.map(e => String(e.content || ''));
    r.check(texts.every((t, i) => t.includes('You started with:') && t.includes('START by ' + NAMES[i])), 'IC reveal: every student gets their own starter back');
    r.check(texts.every(t => /1\. R1 by/.test(t) && /4\. R4 by/.test(t)), 'IC reveal: every hop is numbered, first to fourth');
    r.check(texts.every(t => !t.includes('wifi')), 'IC reveal: no chain went missing');
    const list = await chains;
    r.check(Array.isArray(list.chains) && list.chains.length === 4, 'IC console: the Finished chains list holds four chains');
    const wall = waitForEvent(host, 'reveal-one-start', 10000);
    host.emit('advance-phase', { code });
    const gallery = await wall;
    r.check(gallery.total === 4, `IC gallery: the projector shows four chains start to finish (got ${gallery.total})`);
    const first = waitForEvent(host, 'reveal-one-item', 5000);
    host.emit('reveal-next', { code });
    const item = await first;
    const text = JSON.stringify(item);
    r.check(text.includes('START by') && text.includes('R4 by') && text.includes('→'), 'IC gallery: a chain reads start to finish with arrows');
  } finally {
    for (const s of [host, teacher, ...players]) { try { s.disconnect(); } catch (e) { /* gone */ } }
  }
}

async function main() {
  const { child, url } = await startServer();
  try {
    await anonymousFeedback(url);
    await ideaChain(url);
  } finally {
    child.kill();
  }
  r.summary('REVIEW EIGHT AND NINE');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
