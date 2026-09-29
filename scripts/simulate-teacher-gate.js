/**
 * simulate-teacher-gate.js — the two security findings of review eighteen
 * (2026-09-28), proved against a real server:
 *
 *  1. A student guessing PINs off the projector's room code can no longer
 *     lock the teacher out: twenty wrong PINs pause TYPED PINs for the room,
 *     but the console, the report, and a reopened projector holding the
 *     teacher key (engine/teacher-auth.js gateTeacher) still get in. The
 *     guesser is still stopped: after five wrong tries even the right PIN
 *     is refused to them, from any socket.
 *  2. Nobody can list other teachers' activities: GET /api/games without
 *     the owner password sends built-ins and featured rows only, no `ids`,
 *     the host picker's socket list is scoped the same way, and a first save
 *     with `dedupe: true` steps past a taken id by itself.
 *
 * Starts its own server on :3016 (SITE_PASSWORD set, no database, mock AI):
 *   node scripts/simulate-teacher-gate.js
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, waitForEvent, wait, log, makeReporter } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 3016;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const OWNER_PASSWORD = 'proof-owner-' + Math.floor(Math.random() * 1e6);
const OWNER_AUTH = 'Basic ' + Buffer.from('owner:' + OWNER_PASSWORD).toString('base64');
const COPY_BASE = 'proof-gate-' + Math.floor(Math.random() * 1e6);
const r = makeReporter();

async function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SITE_PASSWORD: OWNER_PASSWORD, ANTHROPIC_API_KEY: '', DATABASE_URL: '', OPENAI_API_KEY: '', POSTHOG_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
  });
  return child;
}

async function joinTeacher(label, payload) {
  const s = await connect(label, URL_BASE);
  s.emit('join-teacher', payload);
  const result = await Promise.race([
    waitForEvent(s, 'teacher-joined', 4000).then(() => ({ ok: true })),
    waitForEvent(s, 'teacher-join-error', 4000).then(e => ({ ok: false, message: e.message }))
  ]).catch(() => ({ ok: false, message: 'timeout' }));
  s.disconnect();
  return result;
}

async function main() {
  const server = await startServer();
  const sockets = [];
  try {
    // --- 1. The PIN lockout can no longer deny the teacher ---
    const host = await connect('HOST', URL_BASE);
    sockets.push(host);
    host.emit('create-room', { gameId: 'exit-ticket' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const { code, teacherPin, teacherKey } = room;
    log('HOST', `Room ${code}, pin ${teacherPin}, key ${String(teacherKey).slice(0, 6)}…`);
    r.check(typeof teacherKey === 'string' && teacherKey.length >= 32, '1. the projector receives a long teacher key at room create');

    const student = await connect('STUDENT', URL_BASE);
    sockets.push(student);
    const wrong = [];
    for (let i = 0; wrong.length < 20; i++) {
      const guess = String(1000 + i);
      if (guess === teacherPin) continue;
      student.emit('join-teacher', { code, pin: guess });
      wrong.push((await waitForEvent(student, 'teacher-join-error', 4000)).message);
    }
    log('STUDENT', `20 wrong PINs; the 5th said: "${wrong[4]}"; the 20th: "${wrong[19]}"`);
    r.check(wrong.slice(0, 4).every(m => /^Wrong PIN/.test(m)), '1. the first four wrong PINs are just wrong');
    r.check(/paused/.test(wrong[4]) && wrong.slice(5).every(m => /paused/.test(m)), '1. from the fifth on, typed PINs are paused for the room');

    student.emit('join-teacher', { code, pin: teacherPin });
    const guesserRight = await waitForEvent(student, 'teacher-join-error', 4000).catch(() => null);
    r.check(!!guesserRight, '1. the guesser is stopped: even the RIGHT PIN is refused to them now');
    const freshSocket = await joinTeacher('GUESSER-2', { code, pin: teacherPin });
    r.check(!freshSocket.ok, '1. a fresh socket gains nothing: the right typed PIN is still paused');

    const teacherConsole = await joinTeacher('CONSOLE', { code, pin: teacherPin, key: teacherKey });
    r.check(teacherConsole.ok, "1. the teacher's console (PIN + key from the projector) still connects");
    const keyOnly = await joinTeacher('CONSOLE-KEY', { code, key: teacherKey });
    r.check(keyOnly.ok, '1. the key alone is enough (the teacher link carries it)');
    const wrongKey = await joinTeacher('FAKE-KEY', { code, key: 'not-the-key' });
    r.check(!wrongKey.ok, '1. a made-up key gets nowhere');

    const reportPin = await fetch(`${URL_BASE}/api/rooms/${code}/report?pin=${teacherPin}`);
    r.check(reportPin.status === 403, '1. the report refuses a typed PIN while paused (it took unlimited guesses before)');
    const reportKey = await fetch(`${URL_BASE}/api/rooms/${code}/report?key=${teacherKey}`);
    r.check(reportKey.status === 200, "1. the report opens with the teacher's key");
    const reportOwner = await fetch(`${URL_BASE}/api/rooms/${code}/report`, { headers: { authorization: OWNER_AUTH } });
    r.check(reportOwner.status === 200, '1. the owner password opens it too');

    // A closed projector tab comes back with the key while typed PINs are paused
    host.disconnect();
    await wait(300);
    const projector = await connect('PROJECTOR-2', URL_BASE);
    sockets.push(projector);
    projector.emit('host-rejoin', { code, pin: teacherPin, key: teacherKey });
    const rebound = await waitForEvent(projector, 'room-created', 4000).catch(() => null);
    r.check(!!rebound && rebound.restored === true && rebound.code === code, '1. "Open the projector again" (PIN + key) rebinds the projector during the pause');

    // --- 2. No enumeration of teachers' activities ---
    const template = await (await fetch(`${URL_BASE}/api/games/exit-ticket`)).json();
    const cfg = { ...template, name: 'Proof gate copy' };
    delete cfg.featured;
    const save = async () => {
      const res = await fetch(`${URL_BASE}/api/games`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: COPY_BASE, config: cfg, dedupe: true })
      });
      return { status: res.status, body: await res.json() };
    };
    const first = await save();
    const second = await save();
    log('SAVE', `first ${first.body.id}, second ${second.body.id}`);
    r.check(first.status === 200 && first.body.id === COPY_BASE, '2. a first save keeps the id it asked for');
    r.check(second.status === 200 && second.body.id === COPY_BASE + '-2', '2. a second save of the same id is stepped past by the server');
    const noDedupe = await fetch(`${URL_BASE}/api/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: COPY_BASE, config: cfg })
    });
    r.check(noDedupe.status === 409, '2. without dedupe a taken id is still refused');

    const bare = await (await fetch(`${URL_BASE}/api/games`)).json();
    r.check(!('ids' in bare), '2. the list carries no `ids` any more');
    r.check(!bare.games.some(g => g.id.startsWith(COPY_BASE)), "2. a bare list shows no teacher's saved activity");
    r.check(bare.games.some(g => g.id === 'exit-ticket'), '2. a bare list still shows the built-ins');
    const mine = await (await fetch(`${URL_BASE}/api/games?mine=${COPY_BASE}`)).json();
    r.check(mine.games.some(g => g.id === COPY_BASE) && !mine.games.some(g => g.id === COPY_BASE + '-2'), '2. ?mine= shows exactly the copies the browser names');
    const ownerList = await (await fetch(`${URL_BASE}/api/games`, { headers: { authorization: OWNER_AUTH } })).json();
    r.check(ownerList.games.some(g => g.id === COPY_BASE) && ownerList.games.some(g => g.id === COPY_BASE + '-2'), '2. the owner console still gets every row');
    const byId = await fetch(`${URL_BASE}/api/games/${COPY_BASE}`);
    r.check(byId.status === 200, '2. fetch by id still works (share links)');

    const picker = await connect('PICKER', URL_BASE);
    sockets.push(picker);
    picker.emit('get-games');
    const plain = await waitForEvent(picker, 'games-list', 4000);
    r.check(!plain.games.some(g => g.id.startsWith(COPY_BASE)) && plain.games.some(g => g.id === 'exit-ticket'), "2. the host picker's socket list shows no one else's activities");
    picker.emit('get-games', { mine: [], game: COPY_BASE + '-2' });
    const linked = await waitForEvent(picker, 'games-list', 4000);
    r.check(linked.games.some(g => g.id === COPY_BASE + '-2') && !linked.games.some(g => g.id === COPY_BASE), '2. a ?game= link brings exactly its own activity into the picker');
  } finally {
    for (const s of sockets) { try { s.disconnect(); } catch { /* gone */ } }
    for (const id of [COPY_BASE, COPY_BASE + '-2']) {
      await rm(join(ROOT, 'games', 'user', id), { recursive: true, force: true });
    }
    server.kill();
  }
  r.summary('TEACHER GATE + NO ENUMERATION');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
