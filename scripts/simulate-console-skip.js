/**
 * Console "next step" on an open answer step — regression proof.
 *
 * The teacher console showed "Next step" beside "Close submissions" while a
 * collect was open. Pressing the first one skipped the gather: every answer
 * was lost, and in Doodle Bluff the rounds ran over zero drawings, so the
 * activity jumped from the drawing step straight to the end (2026-09-18).
 *
 * Replays the slip on the real Doodle Bluff config with a console socket
 * that only ever presses advance-phase, and asserts the answers still land:
 *
 *   1. phrases: advance-phase stores the phrases (the draw prompt carries one).
 *   2. draw: advance-phase stores the drawings (the preview lists all four).
 *   3. approve: the rounds START (first sub-step), the room does not end.
 *   4. titles: advance-phase stores the fakes (the ballot has more than the truth).
 *   5. A double press (advance + close) gathers once.
 *
 * Usage: node scripts/simulate-console-skip.js   (server must be running)
 */

import {
  wait, log, connect,
  waitForEvent, waitForEventOnAll, drainEvent, makeReporter
} from './sim-harness.js';

const GAME_ID = 'doodle-bluff';
const r = makeReporter();

function fakeDrawing(seed) {
  const pts = [];
  for (let k = 0; k < 6; k++) pts.push([0.1 + k * 0.1 + seed * 0.02, 0.3 + (k % 2) * 0.15]);
  return { strokes: [{ points: pts, color: '#e53935', width: 4 }] };
}

async function nextTeacherPhase(teacher, timeout = 8000) {
  const p = await waitForEvent(teacher, 'teacher-phase', timeout);
  log('CONSOLE', `now on ${p.phaseId} (${p.phaseType})`);
  return p;
}

function started(player) {
  return player._buffer['game-started'] || [];
}

async function run() {
  console.log('\n=== CONSOLE NEXT-STEP ON AN OPEN ANSWER STEP ===\n');

  const host = await connect('HOST');
  const names = ['Ava', 'Ben', 'Cal', 'Dee'];
  const players = [];
  for (let i = 0; i < names.length; i++) players.push(await connect(names[i]));
  const teacher = await connect('TEACHER');

  try {
    host.emit('create-room', { gameId: GAME_ID });
    const roomData = await waitForEvent(host, 'room-created', 5000);
    const code = roomData.code;
    log('HOST', `Room ${code}`);

    for (let i = 0; i < players.length; i++) {
      players[i].emit('join-room', { code, name: names[i] });
      await waitForEvent(players[i], 'join-success', 3000);
    }
    teacher.emit('join-teacher', { code, pin: roomData.teacherPin });
    await waitForEvent(teacher, 'teacher-joined', 5000);

    // --- Start: intro announce, then the phrases collect ---
    host.emit('start-game', { code });
    let phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseType === 'announce', 'intro announce is up');
    drainEvent(players, 'game-started');
    teacher.emit('advance-phase', { code, phaseInstanceId: phase.phaseInstanceId });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'phrases' && phase.phaseType === 'collect', 'phrases collect is open');
    await waitForEventOnAll(players, 'game-started', 5000);

    // --- 1. Phrases: every student answers, the console presses NEXT STEP ---
    const phrases = names.map(n => n + ' and the nervous volcano');
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: phrases[i], phaseInstanceId: phase.phaseInstanceId });
    }
    await waitForEventOnAll(players, 'response-accepted', 5000);
    drainEvent(players, 'game-started');
    teacher.emit('advance-phase', { code, phaseInstanceId: phase.phaseInstanceId });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'draw', 'next step from the phrases collect lands on draw');
    const drawStarts = await waitForEventOnAll(players, 'game-started', 5000);
    const drawPrompts = drawStarts.map(d => d.prompt || '');
    r.check(drawPrompts.every(p => !p.includes('{{')), 'draw prompts carry no raw token');
    r.check(drawPrompts.every(p => phrases.some(ph => p.includes(ph))),
      'every draw prompt carries a classmate phrase (the phrases were stored)');

    // --- 2. Draw: every student draws, the console presses NEXT STEP ---
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: fakeDrawing(i), phaseInstanceId: phase.phaseInstanceId });
    }
    await waitForEventOnAll(players, 'response-accepted', 5000);
    teacher.emit('advance-phase', { code, phaseInstanceId: phase.phaseInstanceId });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseType === 'preview', 'next step from the draw collect lands on the preview');
    const preview = await waitForEvent(teacher, 'preview-content', 5000);
    r.check(Array.isArray(preview.responses) && preview.responses.length === players.length,
      `preview lists ${preview.responses ? preview.responses.length : 0} of ${players.length} drawings`);

    // --- 3. Approve: the rounds start, the room does not end ---
    drainEvent(players, 'game-started');
    teacher.emit('preview-approve', { code, phaseInstanceId: phase.phaseInstanceId });
    phase = await nextTeacherPhase(teacher);
    // The rounds orchestrator announces itself, then its first sub-step.
    if (phase.phaseType === 'foreach') phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === '_fe:rounds:titles', `after approve the first round opens (got ${phase.phaseId})`);
    r.check(phase.phaseType !== 'end' && phase.phaseType !== 'leaderboard', 'the activity did not end early');

    // --- 4. Titles: the eligible students write fakes, the console presses NEXT STEP ---
    await wait(600);
    const titlers = players.filter(p => started(p).length > 0);
    r.check(titlers.length === players.length - 2,
      `${titlers.length} students can write a title (drawer + phrase author sit out)`);
    for (let i = 0; i < titlers.length; i++) {
      titlers[i].emit('submit-response', { code, response: 'fake title ' + i, phaseInstanceId: phase.phaseInstanceId });
    }
    await waitForEventOnAll(titlers, 'response-accepted', 5000);
    drainEvent(players, 'game-started');
    // 5. The slip AND the right button, back to back: one gather, one move.
    teacher.emit('advance-phase', { code, phaseInstanceId: phase.phaseInstanceId });
    teacher.emit('close-submissions', { code, phaseInstanceId: phase.phaseInstanceId });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === '_fe:rounds:guess', 'next step from the titles collect lands on the guess');
    await wait(600);
    const guessers = players.filter(p => started(p).length > 0);
    const ballots = guessers.map(p => started(p)[0].choices || []);
    r.check(ballots.length > 0 && ballots.every(b => b.length >= 2),
      `every ballot has the truth plus the fakes (${ballots.map(b => b.length).join('/')})`);
    await wait(800);
    const extra = (teacher._buffer['teacher-phase'] || []).length;
    r.check(extra === 0, 'the double press moved the room exactly once');
  } finally {
    host.disconnect();
    teacher.disconnect();
    for (const p of players) p.disconnect();
  }

  r.summary();
  process.exit(r.errors ? 1 : 0);
}

run().catch(err => {
  console.error('SIM ERROR:', err);
  process.exit(1);
});
