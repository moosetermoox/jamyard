/**
 * Teacher console — end-to-end simulation.
 *
 * Drives games/_sim-teacher (collect → preview → reveal) with 1 host,
 * 3 players, and a TEACHER CONSOLE socket, asserting:
 *
 *   1. The host receives a teacher PIN at room creation (delivered to the teacher via copy-link).
 *   2. A wrong PIN is rejected; the right PIN joins with a state snapshot.
 *   3. The console receives live entries (names + text) and counts.
 *   4. Hiding an entry from the console works — and the hidden entry is
 *      excluded from the preview/reveal content.
 *   5. A random non-teacher socket CANNOT moderate.
 *   6. The console can close submissions and approve the preview.
 *
 * Usage: node scripts/simulate-teacher-console.js   (server must be running)
 */

import {
  wait, log, connect,
  waitForEvent, waitForEventOnAll, drainEvent, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-teacher';
const r = makeReporter();

async function run() {
  console.log('\n=== TEACHER CONSOLE SIMULATION ===\n');

  const host = await connect('HOST');
  const players = [];
  for (let i = 0; i < 3; i++) players.push(await connect(`P${i + 1}`));
  const names = ['Ava', 'Ben', 'Cal'];
  const teacher = await connect('TEACHER');
  const intruder = await connect('INTRUDER');

  try {
    // --- Room creation: host gets the PIN ---
    host.emit('create-room', { gameId: GAME_ID });
    const roomData = await waitForEvent(host, 'room-created', 5000);
    const code = roomData.code;
    const pin = roomData.teacherPin;
    log('HOST', `Room ${code}, teacher PIN ${pin}`);
    r.check(typeof pin === 'string' && /^\d{4}$/.test(pin), 'host received a 4-digit teacher PIN');

    for (let i = 0; i < players.length; i++) {
      players[i].emit('join-room', { code, name: names[i] });
      await waitForEvent(players[i], 'join-success', 3000);
    }

    // --- Wrong PIN rejected ---
    teacher.emit('join-teacher', { code, pin: '0000' });
    const rejected = await waitForEvent(teacher, 'teacher-join-error', 5000);
    r.check(/PIN/i.test(rejected.message || ''), 'wrong PIN rejected with a helpful message');

    // --- Right PIN joins with a snapshot ---
    teacher.emit('join-teacher', { code, pin });
    const snap = await waitForEvent(teacher, 'teacher-joined', 5000);
    r.check(snap.code === code && snap.phaseType === 'lobby', 'console joined with a lobby snapshot');
    r.check(snap.playerCount === 3, `snapshot shows ${snap.playerCount} players`);

    // --- Flow control is teacher-only: a non-teacher socket can't start ---
    intruder.emit('start-game', { code });
    await wait(500);
    r.check((players[0]._buffer['game-started'] || []).length === 0,
      'non-teacher start-game is ignored');

    // --- Start → console tracks the phase ---
    host.emit('start-game', { code });
    const phase1 = await waitForEvent(teacher, 'teacher-phase', 5000);
    r.check(phase1.phaseType === 'collect', 'console notified: collect phase started');

    // --- ...nor close submissions or skip the phase mid-typing ---
    intruder.emit('close-submissions', { code, phaseInstanceId: phase1.phaseInstanceId });
    intruder.emit('advance-phase', { code, phaseInstanceId: phase1.phaseInstanceId });
    await wait(500);
    r.check(!(teacher._buffer['teacher-phase'] || []).some(p => p.phaseType !== 'collect'),
      'non-teacher close/advance did NOT move the phase');

    // --- Players submit → console sees names + text privately ---
    const lines = [
      'Once upon a time the projector unplugged itself.',
      'A perfectly innocent line for the story.',
      'Something rude that the teacher should hide.'
    ];
    players.forEach((p, i) => p.emit('submit-response', { code, response: lines[i] }));
    await wait(600);

    const updates = teacher._buffer['submissions-update'] || [];
    const lastUpdate = updates.length ? updates[updates.length - 1] : { submissions: [] };
    r.check(lastUpdate.submissions.length === 3, `console sees ${lastUpdate.submissions.length}/3 live entries`);
    r.check(lastUpdate.submissions.some(s => s.name === 'Cal' && s.text === lines[2]),
      'entries carry names + full text (private view)');
    const counts = teacher._buffer['response-received'] || [];
    r.check(counts.length > 0 && counts[counts.length - 1].count === 3, 'console gets the live count');

    // --- An intruder (knows the room code, not the PIN) cannot moderate ---
    const calId = lastUpdate.submissions.find(s => s.name === 'Cal').playerId;
    intruder.emit('moderate-hide', { code, playerId: calId, hidden: true });
    await wait(500);
    const afterIntruder = teacher._buffer['submissions-update'] || [];
    r.check(afterIntruder.length === 0 || !afterIntruder.some(u => u.submissions.some(s => s.hidden)),
      "a non-teacher socket's moderation attempt is ignored");

    // --- Teacher hides the bad entry from the console ---
    // (drain the per-submission updates buffered above so we read the
    // update CAUSED by the hide, not a stale one)
    drainEvent([teacher], 'submissions-update');
    teacher.emit('moderate-hide', { code, playerId: calId, hidden: true });
    const afterHide = await waitForEvent(teacher, 'submissions-update', 5000);
    r.check(afterHide.submissions.find(s => s.playerId === calId).hidden === true,
      'console hide works (entry flagged hidden)');

    // --- Console closes submissions → preview arrives on the console ---
    teacher.emit('close-submissions', { code });
    const phase2 = await waitForEvent(teacher, 'teacher-phase', 5000);
    r.check(phase2.phaseType === 'preview', 'console notified: preview phase');
    const preview = await waitForEvent(teacher, 'preview-content', 5000);
    r.check(preview.content.includes(lines[0]), 'preview content reached the console');
    r.check(!preview.content.includes(lines[2]), 'hidden entry is EXCLUDED from the preview');

    // --- Console approves → class sees the reveal (hidden entry still gone) ---
    teacher.emit('preview-approve', { code, phaseInstanceId: phase2.phaseInstanceId });
    const reveals = await waitForEventOnAll(players, 'show-results', 5000);
    r.check(reveals[0].content.includes(lines[1]), 'approve from the console advanced to the reveal');
    r.check(!reveals[0].content.includes(lines[2]), 'hidden entry never reached the class');

    // --- Console advances to the end ---
    const phase3 = await waitForEvent(teacher, 'teacher-phase', 5000);
    teacher.emit('advance-phase', { code, phaseInstanceId: phase3.phaseInstanceId });
    await waitForEvent(players[0], 'game-ended', 5000);
    r.check(true, 'console drove the game to the end');

    // --- Brute-force lockout: 5 wrong PINs freeze console joins for the
    // room — even the RIGHT PIN bounces until the lockout expires. Fresh
    // room so the main flow above stays clean.
    host.emit('create-room', { gameId: GAME_ID });
    const room2 = await waitForEvent(host, 'room-created', 5000);
    const attacker = await connect('ATTACKER');
    // Spam wrong PINs ('9999' can't match: sim guesses avoid the real pin below)
    const wrongPin = room2.teacherPin === '9999' ? '9998' : '9999';
    for (let i = 0; i < 5; i++) {
      attacker.emit('join-teacher', { code: room2.code, pin: wrongPin });
      await waitForEvent(attacker, 'teacher-join-error', 3000);
    }
    // Even a fresh socket with the CORRECT pin is now locked out
    const lateTeacher = await connect('LATE-TEACHER');
    lateTeacher.emit('join-teacher', { code: room2.code, pin: room2.teacherPin });
    const locked = await waitForEvent(lateTeacher, 'teacher-join-error', 5000);
    r.check(/locked/i.test(locked.message || ''), 'brute-forced room locks console joins (fresh socket, right PIN)');
    attacker.disconnect();
    lateTeacher.disconnect();
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('TEACHER CONSOLE SUMMARY');
    host.disconnect();
    teacher.disconnect();
    intruder.disconnect();
    for (const p of players) p.disconnect();
    await wait(300);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
