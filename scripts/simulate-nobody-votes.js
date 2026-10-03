/**
 * A vote nobody can cast tallies itself (2026-10-03, cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass): one student, a vote
 * over the class's answers that leaves out your own, so the only voter
 * has nothing to pick. Before this the room sat on "0 of 1 voted" until
 * the teacher pressed; now the step passes itself the way the last vote
 * would, and the step after it comes up.
 *
 * Plays games/_sim-nobody-votes with one student on its own server.
 *
 * Usage: node scripts/simulate-nobody-votes.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();

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
  let host; let maya;
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: '_sim-nobody-votes' });
    const { code } = await waitForEvent(host, 'room-created', 5000);
    maya = await connect('P1', url);
    maya.emit('join-room', { code, name: 'Maya' });
    await waitForEvent(maya, 'join-success', 3000);
    host.emit('start-game', { code });
    const opened = await waitForEvent(maya, 'game-started', 5000);
    maya.emit('submit-response', { code, response: 'Holes', phaseInstanceId: opened.phaseInstanceId });
    await waitForEvent(maya, 'response-accepted', 3000);

    // Close the answers: the vote opens with Maya's own answer as the only
    // entry, which she may not pick, so the vote passes itself and the
    // step after it is what the screens get
    const hostNext = waitForEvent(host, 'announce', 6000).catch(() => null);
    const mayaNext = waitForEvent(maya, 'announce', 6000).catch(() => null);
    host.emit('advance-phase', { code, phaseInstanceId: opened.phaseInstanceId });
    const [h, m] = await Promise.all([hostNext, mayaNext]);
    r.check(h != null && /The vote is in/.test(h.message || ''), 'the projector gets the step after the vote without a press');
    r.check(m != null, 'the student screen gets the step after the vote without a press');

    await wait(300);
    r.check(serverErrors.length === 0, 'no server-side errors during the run' + (serverErrors.length ? ': ' + serverErrors[0].slice(0, 200) : ''));
  } finally {
    if (host) host.disconnect();
    if (maya) maya.disconnect();
    child.kill();
  }
  r.summary('NOBODY CAN VOTE');
}

main().catch((err) => { console.error(err); process.exit(1); });
