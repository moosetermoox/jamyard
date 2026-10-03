/**
 * A late joiner is seated on EVERY answer step (2026-10-03, cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass): before this, a vote,
 * rank, rate, wager, merge, or relay froze who may answer when it opened,
 * so a student who joined mid-step sat on "Waiting..." until it closed
 * (team-split, team-roles, checklist, match, and sort already seated them).
 *
 * Plays games/_sim-late-answer with two students on its own server. On
 * each step a fresh student joins after the step has opened and must get
 * the step's own screen (not the waiting line), count on the projector,
 * and have their answer taken. The merge newcomer joins the smallest
 * group; the relay newcomer gets the last turn.
 *
 * Usage: node scripts/simulate-late-answer.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, waitForEvent, drainEvent, makeReporter, wait } from './sim-harness.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const r = makeReporter();
const NAMES = ['Maya', 'Jordan'];

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
  let host; const players = []; let late = 0;
  try {
    host = await connect('HOST', url);
    host.emit('create-room', { gameId: '_sim-late-answer' });
    const room = await waitForEvent(host, 'room-created', 5000);
    const code = room.code;
    for (let i = 0; i < NAMES.length; i++) {
      const p = await connect('P' + (i + 1), url);
      p.emit('join-room', { code, name: NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }

    // A fresh student joins mid-step and the step's own event must reach them
    const joinLate = async (event) => {
      late++;
      const name = 'Late ' + late;
      const p = await connect('L' + late, url);
      const opened = waitForEvent(p, event, 3000);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
      let payload = null;
      try { payload = await opened; } catch (e) { /* reported below */ }
      r.check(payload != null, `${event}: the late joiner gets the step's own screen, not the waiting line`);
      return { p, name, payload };
    };

    // The host presses Next step until the wanted event lands on a screen
    const pressUntil = async (socket, event, phaseInstanceId) => {
      for (let press = 0; press < 4; press++) {
        host.emit('advance-phase', { code, phaseInstanceId });
        try { return await waitForEvent(socket, event, 2500); } catch (e) { /* a two-stage step needs a second press */ }
      }
      throw new Error(`never reached '${event}'`);
    };

    host.emit('start-game', { code });

    // --- vote ---
    let opened = await waitForEvent(players[0], 'vote-start', 5000);
    let inst = opened.phaseInstanceId;
    let counted = waitForEvent(host, 'vote-received', 3000);
    let L = await joinLate('vote-start');
    let count = await counted;
    r.check(count.total === 3, `vote: the projector's total grows to 3 (${count.total})`);
    counted = waitForEvent(host, 'vote-received', 3000);
    const cand = L.payload && L.payload.candidates && L.payload.candidates[0];
    L.p.emit('submit-vote', { code, choice: cand && cand.playerId ? cand.playerId : cand, phaseInstanceId: inst });
    count = await counted;
    r.check(count.count === 1 && count.total === 3, `vote: the late joiner's vote counts (${count.count} of ${count.total})`);

    // --- rank ---
    opened = await pressUntil(players[0], 'rank-start', inst);
    inst = opened.phaseInstanceId;
    counted = waitForEvent(host, 'rank-received', 3000);
    L = await joinLate('rank-start');
    count = await counted;
    r.check(count.total === 4, `rank: the projector's total grows to 4 (${count.total})`);
    counted = waitForEvent(host, 'rank-received', 3000);
    L.p.emit('rank-submit', { code, ranking: L.payload ? L.payload.candidates : [], phaseInstanceId: inst });
    count = await counted;
    r.check(count.count === 1 && count.total === 4, `rank: the late joiner's order counts (${count.count} of ${count.total})`);

    // --- rate ---
    opened = await pressUntil(players[0], 'rate-start', inst);
    inst = opened.phaseInstanceId;
    counted = waitForEvent(host, 'rate-received', 3000);
    L = await joinLate('rate-start');
    count = await counted;
    r.check(count.total === 5, `rate: the projector's total grows to 5 (${count.total})`);
    counted = waitForEvent(host, 'rate-received', 3000);
    L.p.emit('rate-submit', { code, ratings: { fresh: 4 }, phaseInstanceId: inst });
    count = await counted;
    r.check(count.count === 1 && count.total === 5, `rate: the late joiner's rating counts (${count.count} of ${count.total})`);

    // --- wager ---
    opened = await pressUntil(players[0], 'wager-start', inst);
    inst = opened.phaseInstanceId;
    counted = waitForEvent(host, 'wager-received', 3000);
    L = await joinLate('wager-start');
    count = await counted;
    r.check(count.total === 6, `wager: the projector's total grows to 6 (${count.total})`);
    r.check(L.payload && L.payload.availablePoints === 100, `wager: the late joiner gets the starting pool (${L.payload && L.payload.availablePoints})`);
    counted = waitForEvent(host, 'wager-received', 3000);
    L.p.emit('wager-submit', { code, option: 'Mop', amount: 10, phaseInstanceId: inst });
    count = await counted;
    r.check(count.count === 1 && count.total === 6, `wager: the late joiner's bet counts (${count.count} of ${count.total})`);

    // --- collect: everyone answers so the merge has seeds ---
    opened = await pressUntil(players[0], 'game-started', inst);
    inst = opened.phaseInstanceId;
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: 'Idea ' + (i + 1), phaseInstanceId: inst });
      await waitForEvent(players[i], 'response-accepted', 3000);
    }

    // --- merge ---
    opened = await pressUntil(players[0], 'merge-start', inst);
    inst = opened.phaseInstanceId;
    const others = players.slice();
    const statusSeen = Promise.any(others.map(p => waitForEvent(p, 'merge-status', 3000)));
    L = await joinLate('merge-start');
    const names = (L.payload && L.payload.memberNames) || [];
    r.check(names.length === 3 && names.includes(L.name), `merge: the late joiner sits with a pair, three names on the screen (${names.join(', ')})`);
    r.check(L.payload && L.payload.agreesNeeded === 3, `merge: the trio needs three agrees (${L.payload && L.payload.agreesNeeded})`);
    let status = null;
    try { status = await statusSeen; } catch (e) { /* reported below */ }
    r.check(status && status.agreesNeeded === 3, `merge: a member already in the group learns the count they need grew (${status && status.agreesNeeded})`);

    // --- relay ---
    opened = await pressUntil(players[0], 'relay-turn', inst);
    inst = opened.phaseInstanceId;
    r.check(/^1 \/ 7$/.test(opened.progress), `relay: seven turns before the late joiner (${opened.progress})`);
    L = await joinLate('relay-waiting');
    // the turn-start update is still buffered on the host; the next one is the one after the submit
    drainEvent([host], 'relay-update');
    const nextTurn = waitForEvent(host, 'relay-update', 3000);
    players[0].emit('relay-submit', { code, text: 'Once upon a time.', phaseInstanceId: inst });
    const update = await nextTurn;
    r.check(/^2 \/ 8$/.test(update.progress), `relay: the late joiner has the last turn, eight in all (${update.progress})`);

    await wait(300);
    r.check(serverErrors.length === 0, 'no server-side errors during the run' + (serverErrors.length ? ': ' + serverErrors[0].slice(0, 200) : ''));
  } finally {
    if (host) host.disconnect();
    for (const p of players) p.disconnect();
    child.kill();
  }
  r.summary('LATE ANSWER');
}

main().catch((err) => { console.error(err); process.exit(1); });
