/**
 * Ready-made trust: three things an outside reviewer hit on the first
 * complete activity (2026-09-24), proved against a real server.
 *
 *   1. A Live Poll question edited on the make page shows on the RESULTS
 *      screen too (the recipe wrote it into the results step's own
 *      template; the edit used to rewrite only the answering step).
 *   2. A student who comes back with the seat's token (what a refreshed
 *      student screen now sends by itself) is reconnected, never a
 *      second player.
 *   3. A Close pressed from a socket the server does not know as the host
 *      is answered ('close-ignored', not-host), never dropped in silence;
 *      the real host's Close still closes.
 *
 * Self-contained: spawns its own server (mock AI, filesystem storage) on a
 * random port and cleans up its saved copy.
 *
 * Usage: node scripts/simulate-ready-made-trust.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';
import { connect, waitForEvent, log, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const QUESTION = 'How confident are you about spotting a reliable source?';
const COPY_ID = 'sim-trust-poll-' + Math.floor(Math.random() * 1e6);

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
  let host; let p1; let p1again; let stranger;
  try {
    // 1. The make page's question edit, saved as a copy
    const made = await fetch(`${url}/api/games/live-poll/make`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: QUESTION })
    }).then((x) => x.json());
    const cfg = made.config;
    r.check(cfg.phases.ask.prompt === QUESTION, 'make: the answering step carries the new question');
    r.check((cfg.phases.results.template || '').includes(QUESTION), 'make: the results step carries it too');
    r.check(!(cfg.phases.results.template || '').includes("today's lesson"), 'make: the results step lost the default');
    const saved = await fetch(`${url}/api/games`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: COPY_ID, config: { ...cfg, name: 'Sim trust poll' } })
    });
    r.check(saved.ok, 'make: the copy saves');

    // Host it, one student answers, the host closes
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: COPY_ID });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    log('HOST', `room ${code}, start ${room.start}`);
    p1 = await connect('P1', url);
    p1.emit('join-room', { code, name: 'Maya' });
    const joined = await waitForEvent(p1, 'join-success', 3000);
    const started = await waitForEvent(p1, 'game-started', 5000);
    r.check(started.prompt === QUESTION, 'room: the student sees the new question');
    p1.emit('submit-response', { code, response: started.choices[0], phaseInstanceId: started.phaseInstanceId });
    await waitForEvent(p1, 'response-accepted', 3000);

    // 3a. A stranger's Close is answered, not swallowed
    stranger = await connect('STRANGER', url);
    stranger.emit('close-submissions', { code });
    const ignored = await waitForEvent(stranger, 'close-ignored', 3000).catch(() => null);
    r.check(!!ignored && ignored.reason === 'not-host', 'close: a non-host press gets close-ignored (not-host)');
    await wait(200);

    // 3b. The host's Close still closes, and the results screen reads the edit
    const resultsOnHost = waitForEvent(host, 'show-results', 8000);
    const resultsOnP1 = waitForEvent(p1, 'show-results', 8000);
    host.emit('close-submissions', { code });
    const [hr, pr] = await Promise.all([resultsOnHost, resultsOnP1]);
    const hostText = String(hr.content || hr.aiResult || '');
    const p1Text = String(pr.content || pr.aiResult || '');
    r.check(hostText.includes(QUESTION), 'results: the projector shows the new question');
    r.check(!hostText.includes("today's lesson"), 'results: the projector lost the default');
    r.check(p1Text.includes(QUESTION), 'results: the student screen shows the new question');

    // 2. The refreshed student: a new socket, the saved token and name
    p1.disconnect();
    await wait(300);
    p1again = await connect('P1again', url);
    p1again.emit('join-room', { code, name: 'Maya', token: joined.token });
    const back = await waitForEvent(p1again, 'join-success', 3000);
    r.check(back.reconnected === true && back.name === 'Maya', 'refresh: the seat comes back as a reconnect');
    const results2 = await waitForEvent(p1again, 'show-results', 3000).catch(() => null);
    r.check(!!results2 && String(results2.content || '').includes(QUESTION), 'refresh: the results screen is re-sent to the returning student');
  } finally {
    for (const s of [host, p1, p1again, stranger]) { try { s && s.disconnect(); } catch (e) { /* gone */ } }
    child.kill();
    await rm(join(ROOT, 'games', 'user', COPY_ID), { recursive: true, force: true }).catch(() => {});
  }
  r.summary('READY-MADE TRUST');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
