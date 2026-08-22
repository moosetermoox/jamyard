/**
 * "A bit more time" — extend-timer acceptance run.
 *
 * Drives games/snowball (first phase "solo" is a collect with timer: 90)
 * with 1 host + 3 players + 1 teacher console and asserts:
 *
 *   1. Host press: every player AND the host receive timer-extended
 *      { addSeconds: 30 } (player clocks do real work at 0, so the
 *      broadcast is the whole feature).
 *   2. Console press: same broadcast, plus the console's own copy via the
 *      teachers channel (its button-flash confirmation).
 *   3. A PLAYER emitting extend-timer is ignored (teacher-only control).
 *   4. In the lobby (no timer running) a host press is ignored.
 *   5. After close-submissions, a host press is ignored (inputs closed).
 *
 * Usage: node scripts/simulate-extend-timer.js   (server must be running)
 */

import {
  wait, log, connect, teardown,
  waitForEvent, waitForEventOnAll, makeReporter, PLAYER_NAMES
} from './sim-harness.js';

const GAME_ID = 'snowball';
const NUM_PLAYERS = 3;

const r = makeReporter();

// "No broadcast happened": give the server a beat, then check buffers.
async function expectNoExtension(sockets, label) {
  await wait(800);
  const leaked = sockets.filter(s => (s._buffer['timer-extended'] || []).length > 0);
  r.check(leaked.length === 0, label);
  for (const s of sockets) s._buffer['timer-extended'] = [];
}

async function run() {
  console.log('\n=== EXTEND-TIMER SIMULATION (snowball, 3 players + console) ===\n');
  let host = null;
  let players = [];
  let teacher = null;

  try {
    // Manual room setup: setupRoom() consumes room-created, and we need
    // the teacher PIN from it for the console leg.
    host = await connect('HOST');
    host.emit('create-room', { gameId: GAME_ID });
    const roomData = await waitForEvent(host, 'room-created', 5000);
    const code = roomData.code;
    const pin = roomData.teacherPin;
    log('HOST', `Room ${code}, teacher PIN ${pin}`);

    for (let i = 0; i < NUM_PLAYERS; i++) {
      const p = await connect(`P${i + 1}`);
      p.emit('join-room', { code, name: PLAYER_NAMES[i] });
      await waitForEvent(p, 'join-success', 3000);
      players.push(p);
    }
    log('SIM', `Joined ${NUM_PLAYERS} players`);

    teacher = await connect('CONSOLE');
    teacher.emit('join-teacher', { code, pin });
    const snap = await waitForEvent(teacher, 'teacher-joined', 5000);
    r.check(snap.phaseType === 'lobby', 'console joined during the lobby');

    // --- 4. Lobby: no timer running, host press is ignored ---
    host.emit('extend-timer', { code });
    await expectNoExtension([host, ...players, teacher], 'lobby: extend-timer is ignored (no timer running)');

    // --- Start: past the intro announce, onto the timered collect ---
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'announce', 8000);
    const introPhase = await waitForEvent(teacher, 'teacher-phase', 5000);
    r.check(introPhase.phaseType === 'announce' && !introPhase.timer,
      'console: intro announce carries no timer');
    await wait(200);
    host.emit('advance-phase', { code });
    const prompts = await waitForEventOnAll(players, 'game-started', 10000);
    r.check(prompts.every(p => p.timer === 90), 'collect delivered with its 90s timer');
    const phaseData = await waitForEvent(teacher, 'teacher-phase', 5000);
    r.check(phaseData.timer === 90, 'console told the step has a timer (teacher-phase.timer)');

    // --- 3. A player cannot extend ---
    players[0].emit('extend-timer', { code });
    await expectNoExtension([host, ...players, teacher], 'player press: ignored (teacher-only control)');

    // --- 1. Host press: everyone's clock shifts ---
    host.emit('extend-timer', { code });
    const playerExts = await waitForEventOnAll(players, 'timer-extended', 5000);
    const hostExt = await waitForEvent(host, 'timer-extended', 5000);
    r.check(playerExts.every(e => e.addSeconds === 30), 'host press: every player received +30s');
    r.check(hostExt.addSeconds === 30, 'host press: projector received +30s');
    await waitForEvent(teacher, 'timer-extended', 5000);
    log('SIM', 'host press confirmed on all screens');

    // --- 2. Console press: same broadcast, console confirmation included ---
    teacher.emit('extend-timer', { code });
    const playerExts2 = await waitForEventOnAll(players, 'timer-extended', 5000);
    const teacherExt = await waitForEvent(teacher, 'timer-extended', 5000);
    r.check(playerExts2.every(e => e.addSeconds === 30), 'console press: every player received +30s');
    r.check(teacherExt.addSeconds === 30, 'console press: console received its confirmation');

    // --- 5. After close (snowball advances to merge, not extendable) ---
    for (const s of [host, ...players, teacher]) s._buffer['timer-extended'] = [];
    host.emit('close-submissions', { code });
    await wait(600);
    host.emit('extend-timer', { code });
    await expectNoExtension([host, ...players, teacher], 'after close: extend-timer is ignored (merge is server-timed)');
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('EXTEND-TIMER SUMMARY');
    if (teacher) teacher.disconnect();
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
