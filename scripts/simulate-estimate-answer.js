/**
 * Estimate answer from the console (2026-09-20, storyboard probe follow-up).
 *
 * Drives games/_sim-estimate-answer (an estimate step with NO answer, the
 * jar shape: the teacher counts after the guesses are in) and checks:
 *
 *  Room 1: the console types 100 before the close. The results carry
 *          answer 100, the closest guess takes the points, every console
 *          heard the answer, and the students saw nothing until the close.
 *  Room 2: a student sending the event is ignored (still a poll), and an
 *          answer typed AFTER the close is ignored too.
 *
 * Requires the server running: node scripts/simulate-estimate-answer.js
 */

import {
  connect, wait, log, teardown, waitForEvent, waitForEventOnAll, drainEvent, makeReporter, PLAYER_NAMES
} from './sim-harness.js';

const GAME_ID = '_sim-estimate-answer';
const r = makeReporter();

async function makeRoom(n) {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: GAME_ID });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  const teacher = await connect('TEACHER');
  teacher.emit('join-teacher', { code, pin: roomData.teacherPin });
  await waitForEvent(teacher, 'teacher-joined', 5000);
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = await connect(`P${i + 1}`);
    p.emit('join-room', { code, name: PLAYER_NAMES[i] });
    await waitForEvent(p, 'join-success', 3000);
    players.push(p);
  }
  log('SIM', `Room ${code} with ${n} players and a console`);
  return { host, teacher, players, code };
}

async function roomOne() {
  console.log('\n=== ROOM 1: the console types the answer before the close ===');
  const { host, teacher, players, code } = await makeRoom(4);
  try {
    host.emit('start-game', { code });
    const starts = await waitForEventOnAll(players, 'estimate-start', 8000);
    const phase = await waitForEvent(teacher, 'teacher-phase', 5000).catch(() => null);
    r.check(!!phase && phase.phaseType === 'estimate' && phase.estimateAnswer === null,
      `the console was told the guessing step is open with no answer yet (${phase && phase.estimateAnswer})`);
    const guesses = [40, 90, 130, 300];
    players.forEach((p, i) => p.emit('estimate-submit', { code, value: guesses[i], phaseInstanceId: starts[i].phaseInstanceId }));
    await wait(400);

    drainEvent(players, 'estimate-results');
    teacher.emit('estimate-set-answer', { code, answer: 100, phaseInstanceId: phase.phaseInstanceId });
    const heard = await waitForEvent(teacher, 'teacher-estimate-answer', 3000).catch(() => null);
    r.check(!!heard && heard.answer === 100, 'the console heard the answer land');
    const leaked = await waitForEvent(players[0], 'estimate-results', 800).catch(() => null);
    r.check(!leaked, 'nothing reached the students before the close');

    host.emit('close-estimates', { code, phaseInstanceId: phase.phaseInstanceId });
    const results = await waitForEventOnAll(players, 'estimate-results', 8000);
    const res = results[0];
    r.check(res.answer === 100, `the results reveal the typed answer (${res.answer})`);
    const byName = Object.fromEntries((res.guesses || []).map(g => [g.name, g]));
    const bob = byName[PLAYER_NAMES[1]];
    const others = (res.guesses || []).filter(g => g.name !== PLAYER_NAMES[1]);
    r.check(!!bob && bob.score > 0 && others.every(g => g.score === 0),
      `the closest guess (90) took the points, the rest scored nothing (${(res.guesses || []).map(g => g.value + ':' + g.score).join(', ')})`);
    r.check(res.stats && res.stats.count === 4, 'four guesses counted');
  } finally {
    await teardown(host, players);
    teacher.disconnect();
  }
}

async function roomTwo() {
  console.log('\n=== ROOM 2: a student cannot set it, and after the close it is too late ===');
  const { host, teacher, players, code } = await makeRoom(3);
  try {
    host.emit('start-game', { code });
    const starts = await waitForEventOnAll(players, 'estimate-start', 8000);
    const phase = await waitForEvent(teacher, 'teacher-phase', 5000).catch(() => null);
    players.forEach((p, i) => p.emit('estimate-submit', { code, value: 10 * (i + 1), phaseInstanceId: starts[i].phaseInstanceId }));
    await wait(300);

    players[0].emit('estimate-set-answer', { code, answer: 20, phaseInstanceId: starts[0].phaseInstanceId });
    const fromStudent = await waitForEvent(teacher, 'teacher-estimate-answer', 800).catch(() => null);
    r.check(!fromStudent, 'a student sending the event changes nothing');

    host.emit('close-estimates', { code, phaseInstanceId: phase.phaseInstanceId });
    const results = await waitForEventOnAll(players, 'estimate-results', 8000);
    r.check(results[0].answer === null, `with no answer the close is a poll (answer ${results[0].answer})`);
    r.check((results[0].guesses || []).every(g => g.score === 0), 'a poll scores nobody');

    teacher.emit('estimate-set-answer', { code, answer: 20, phaseInstanceId: phase.phaseInstanceId });
    const late = await waitForEvent(teacher, 'teacher-estimate-answer', 800).catch(() => null);
    r.check(!late, 'an answer typed after the close is ignored');
  } finally {
    await teardown(host, players);
    teacher.disconnect();
  }
}

async function run() {
  console.log('\n=== ESTIMATE ANSWER SIMULATION ===');
  await roomOne();
  await roomTwo();
  r.summary('ESTIMATE ANSWER SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
