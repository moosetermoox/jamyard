/**
 * Submit race — four students, slow moderation, an impatient Close.
 *
 * The reviewer's 2026-09-06 report: in the simulator, Bot Fill left the host
 * at "2 of 4 submitted" while all four student panels said "Answer
 * submitted", and the pairs step then held one contribution per pair. Two
 * mechanisms are on trial here:
 *
 *   1. A Close must wait for answers still inside the moderation ladder
 *      (engine/pending-submits.js), so four students always produce four
 *      stored responses and the host count reaches 4 of 4.
 *   2. A student's screen says "submitted" only after the server's
 *      'response-accepted' ack, never before (screens/player/player.js).
 *
 * Self-contained: spawns a fake OpenAI moderations endpoint that answers
 * every second request slowly, and its own server pointed at it, so the
 * race is forced rather than hoped for. No API keys needed (mock AI).
 *
 * Usage: node scripts/simulate-submit-race.js
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_ID = 'snowball';
const NUM_PLAYERS = 4;
const SLOW_MS = 3000;

const r = makeReporter();

// Every second request stalls for SLOW_MS; all come back clean.
function startModerationStub() {
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      n += 1;
      const reply = () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ results: [{ category_scores: { harassment: 0.01, violence: 0.01 } }] }));
      };
      if (n % 2 === 0) setTimeout(reply, SLOW_MS); else reply();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function startServer(stubPort) {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      OPENAI_API_KEY: 'sim-stub',
      OPENAI_MODERATION_URL: `http://127.0.0.1:${stubPort}/moderations`,
      ANTHROPIC_API_KEY: '',
      DATABASE_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return { child, port, logs };
    } catch { /* not up yet */ }
    await wait(250);
  }
  child.kill();
  throw new Error('server never came up:\n' + logs.join(''));
}

async function run() {
  console.log('\n=== SUBMIT RACE (4 students, slow moderation, immediate Close) ===\n');
  const stub = await startModerationStub();
  const srv = await startServer(stub.port);
  const serverUrl = `http://127.0.0.1:${srv.port}`;
  log('SIM', `server on ${serverUrl}, moderation stub on :${stub.port} (every 2nd answer +${SLOW_MS}ms)`);

  let host = null;
  let players = [];
  try {
    const room = await setupRoom(GAME_ID, NUM_PLAYERS, { server: serverUrl });
    host = room.host; players = room.players;
    const { code, names } = room;

    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'announce', 8000);
    host.emit('advance-phase', { code });
    await waitForEventOnAll(players, 'game-started', 8000);

    // Four distinct answers at once, then the Close lands while two are
    // still inside moderation (the simulator's Skip Timer sends this same
    // close-submissions on a collect step).
    const answers = names.map((n) => `Norm from ${n}: listen before answering.`);
    players.forEach((p, i) => p.emit('submit-response', { code, response: answers[i] }));
    await wait(150);
    host.emit('close-submissions', { code });

    // 1. Every student hears back exactly once, and nobody is rejected.
    const acks = await waitForEventOnAll(players, 'response-accepted', SLOW_MS + 5000);
    r.check(acks.length === NUM_PLAYERS, `every student got response-accepted (${acks.length}/${NUM_PLAYERS})`);
    const rejected = players.filter((p) => (p._buffer['response-rejected'] || []).length > 0).length;
    r.check(rejected === 0, `no student was rejected (${rejected})`);

    // 2. The pairs step sees all four answers.
    const mergeStarts = await waitForEventOnAll(players, 'merge-start', 8000);
    const seedCounts = mergeStarts.map((m) => (m.seeds || []).length);
    r.check(seedCounts.every((c) => c === 2), `each pair carries 2 seeds (got ${seedCounts.join(',')})`);
    const seen = new Set();
    mergeStarts.forEach((m) => (m.seeds || []).forEach((s) => seen.add(s.text)));
    r.check(answers.every((a) => seen.has(a)), `all 4 answers reached a pair (${seen.size} distinct)`);

    // 3. The host's live count reached 4 of 4 before the step moved on.
    const counts = host._buffer['response-received'] || [];
    const last = counts[counts.length - 1] || {};
    r.check(last.count === NUM_PLAYERS && last.total === NUM_PLAYERS,
      `host count reached ${NUM_PLAYERS} of ${NUM_PLAYERS} (last: ${last.count} of ${last.total})`);
    r.check(acks.length === counts.length,
      `one ack per host count update (${acks.length} acks, ${counts.length} updates)`);

    // 4. The server waited rather than closing over the held answers.
    const joined = srv.logs.join('');
    r.check(/Waited for \d+ in-flight submission/.test(joined), 'server log shows the Close waiting for in-flight answers');
    r.check(/Stored 4 responses for phase 'solo'/.test(joined), "server log shows 4 responses stored for 'solo'");
  } catch (err) {
    r.check(false, `crashed: ${err.message}`);
  } finally {
    await teardown(host, players);
    srv.child.kill();
    stub.server.close();
  }

  r.summary();
  process.exit(r.errors > 0 ? 1 : 0);
}

run();
