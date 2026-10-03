/**
 * The clock survives a refresh on EVERY timed step (2026-10-03, cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md): before this, only collect, announce,
 * and estimate sent a refreshed student the seconds left; the eleven other
 * timed handlers re-sent `timer: null`, so the screen showed no clock while
 * the server (or the projector) still closed the step on time.
 *
 * Plays games/_sim-clock (every timed step type in a row) with two
 * students on its own server. On each step: the step opens with its full
 * clock, one student's socket drops and rejoins with its token a moment
 * later, and the re-sent step carries the time left, not null and not a
 * restarted clock. The relay's turn clock is checked on the active
 * student; the collect's deadline is checked after "A bit more time".
 *
 * Usage: node scripts/simulate-clock-refresh.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan'];
const TIMER = 60;

// step id → the event the student screen opens it with, and who to refresh
const STEPS = [
  ['poll', 'game-started', 1],
  ['pick', 'vote-start', 1],
  ['order', 'rank-start', 1],
  ['pairs', 'match-start', 1],
  ['buckets', 'sort-start', 1],
  ['rate-it', 'rate-start', 1],
  ['bet', 'wager-start', 1],
  ['tasks', 'checklist-start', 1],
  ['ask', 'game-started', 1],
  ['combine', 'merge-start', 1],
  ['story', 'relay-turn', 0],
  ['guess', 'estimate-start', 1],
  ['gallery', 'reveal-one-start', 1]
];

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
  let host; const players = []; const tokens = [];
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: '_sim-clock' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      const joined = await waitForEvent(p, 'join-success', 3000);
      tokens.push(joined.token);
      players.push(p);
    }
    host.emit('start-game', { code });

    // A refresh: the socket drops, a new one rejoins the seat with the token
    const refresh = async (i) => {
      players[i].disconnect();
      const back = await connect('P' + (i + 1) + 'b', url);
      back.emit('join-room', { code, name: NAMES[i], token: tokens[i] });
      const rejoined = await waitForEvent(back, 'join-success', 3000);
      players[i] = back;
      return rejoined;
    };

    // The host presses Next step until the wanted event lands on a screen
    const pressUntil = async (socket, event, phaseInstanceId) => {
      for (let press = 0; press < 4; press++) {
        host.emit('advance-phase', { code, phaseInstanceId });
        try { return await waitForEvent(socket, event, 2500); } catch (e) { /* a two-stage step needs a second press */ }
      }
      throw new Error(`never reached '${event}'`);
    };

    let lastInstance = null;
    for (let s = 0; s < STEPS.length; s++) {
      const [id, event, who] = STEPS[s];
      const opened = s === 0
        ? await waitForEvent(players[who], event, 5000)
        : await pressUntil(players[who], event, lastInstance);
      lastInstance = opened.phaseInstanceId;
      r.check(opened.timer === TIMER, `${id}: opens with its full ${TIMER} s clock (${opened.timer})`);

      if (id === 'ask') {
        // both answer, so the merge has seeds and the gallery has items
        for (let i = 0; i < players.length; i++) {
          players[i].emit('submit-response', { code, response: 'Idea ' + (i + 1), phaseInstanceId: lastInstance });
          await waitForEvent(players[i], 'response-accepted', 3000);
        }
        // a refreshed student who answered gets their waiting screen, so the
        // deadline is read off the extend path instead
        const extended = waitForEvent(host, 'timer-extended', 3000);
        host.emit('extend-timer', { code, phaseInstanceId: lastInstance });
        const more = await extended;
        r.check(more.addSeconds > 0, `${id}: A bit more time pushed the deadline back (${more.addSeconds} s)`);
        continue;
      }

      if (id === 'guess') {
        // a guess sent before the refresh comes back with the screen (the
        // owner's re-check 2026-10-03: the box came back empty)
        players[who].emit('estimate-submit', { code, value: 500, phaseInstanceId: lastInstance });
        await wait(300);
      }
      await wait(1500);
      const rejoined = await refresh(who);
      r.check(rejoined.reconnected === true, `${id}: the refreshed student is seated again`);
      const again = await waitForEvent(players[who], event, 4000);
      const left = again.timer;
      r.check(typeof left === 'number' && left >= TIMER - 10 && left <= TIMER - 1,
        `${id}: the re-sent step carries the time left, not null and not a restarted clock (${left})`);
      if (id === 'guess') {
        r.check(again.myGuess === 500 && again.count === 1, `${id}: the refreshed screen gets its own guess back and the count still holds it (${again.myGuess}, ${again.count} guessed)`);
      }
    }

    r.check(serverErrors.length === 0, 'no server-side errors during the run' + (serverErrors.length ? ': ' + serverErrors[0].slice(0, 200) : ''));
  } finally {
    if (host) host.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('CLOCK REFRESH');
}

main().catch((err) => { console.error(err); process.exit(1); });
