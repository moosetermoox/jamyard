/**
 * The console's Next step on an open wager, relay, or turn round is a
 * close, never a skip (2026-10-03, cause 4 of the architecture review: the
 * advance-phase switch had no case for the three, so the press blew past
 * the bets, the story, and the round's scores).
 *
 * Plays games/_sim-advance-closes with a console socket that only ever
 * presses advance-phase, and checks:
 *
 *   1. bet (wager, no correct option): the first press closes the bets and
 *      asks the host for a winner; the second moves on with every bet
 *      returned (the board shows everyone at 100).
 *   2. story (relay): the first student adds a line, the press stores the
 *      text so far and the reveal shows it, no raw token.
 *   3. round (turn): the press ends the round with its scores stored and
 *      the room reaches the end, never a skip past turn-complete.
 *
 * Usage: node scripts/simulate-advance-closes.js   (server running, or SIM_SERVER)
 */
import { wait, log, connect, waitForEvent, drainEvent, makeReporter } from './sim-harness.js';

const GAME_ID = '_sim-advance-closes';
const r = makeReporter();

async function nextTeacherPhase(teacher, timeout = 8000) {
  const p = await waitForEvent(teacher, 'teacher-phase', timeout);
  log('CONSOLE', `now on ${p.phaseId} (${p.phaseType})`);
  return p;
}

async function run() {
  console.log('\n=== CONSOLE NEXT STEP ON A WAGER, A RELAY, A TURN ===\n');
  const host = await connect('HOST');
  const names = ['Ava', 'Ben', 'Cal'];
  const players = [];
  for (const n of names) players.push(await connect(n));
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

    // --- 1. the wager ---
    host.emit('start-game', { code });
    let phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'bet' && phase.phaseType === 'wager', 'the wager is open');
    await waitForEvent(players[0], 'wager-start', 3000);
    players[0].emit('wager-submit', { code, option: 'Mop', amount: 30 });
    players[1].emit('wager-submit', { code, option: 'Broom', amount: 20 });
    await wait(400);

    drainEvent([teacher], 'teacher-phase');
    teacher.emit('advance-phase', { code });
    const need = await waitForEvent(host, 'wager-need-resolve', 3000).catch(() => null);
    r.check(!!need, 'the first press closes the bets and asks the host for a winner');
    await wait(300);
    r.check(((teacher._buffer['teacher-phase'] || []).length) === 0, 'the first press did not move the room');

    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'board', 'the second press moves on to the board');
    const board = await waitForEvent(host, 'leaderboard', 3000);
    const scores = (board.allStandings || board.standings || []).map(s => s.score);
    r.check(scores.length === players.length && scores.every(s => s === 100),
      `every bet came back, nobody gained or lost (${scores.join('/')})`);

    // --- 2. the relay ---
    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'story' && phase.phaseType === 'relay', 'the relay is open');
    await wait(400);
    const first = players.find(p => (p._buffer['relay-turn'] || []).length > 0);
    r.check(!!first, 'one student holds the first turn');
    if (first) {
      drainEvent([host], 'relay-update'); // the turn's own opening update
      first.emit('relay-submit', { code, text: 'Once upon a time, the mop won.' });
      // The line lands after the moderation ladder (slow with a real key); a
      // press before that is the ladder's documented race, not the switch's
      const landed = await waitForEvent(host, 'relay-update', 10000).catch(() => null);
      r.check(!!landed, 'the first line landed');
    }
    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'show', 'the press on the open relay lands on the reveal');
    const shown = await waitForEvent(host, 'show-results', 3000);
    const content = String(shown.content || '');
    log('HOST', `reveal: ${content.replace(/\s+/g, ' ').slice(0, 160)}`);
    r.check(!content.includes('{{'), 'the reveal carries no raw token');
    r.check(content.includes('the mop won'), 'the line written before the press is in the story');

    // --- 3. teams, phrases, then the turn round ---
    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'teams', 'on to the team split');
    await wait(400);
    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'phrases', 'the split closed and the phrases collect is open');
    for (let i = 0; i < players.length; i++) {
      players[i].emit('submit-response', { code, response: 'phrase ' + (i + 1) });
    }
    await wait(500);
    teacher.emit('advance-phase', { code });
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseId === 'round' && phase.phaseType === 'turn', 'the collect closed and the round is open');
    await waitForEvent(host, 'turn-start', 4000).catch(() => null);
    await wait(300);

    teacher.emit('advance-phase', { code });
    const done = await waitForEvent(host, 'turn-complete', 3000).catch(() => null);
    r.check(!!done && done.teamScores && Object.keys(done.teamScores).length === 2,
      'the press ends the round with its two teams\' scores stored');
    phase = await nextTeacherPhase(teacher);
    r.check(phase.phaseType === 'end', 'the room reaches the end');
  } finally {
    host.disconnect();
    teacher.disconnect();
    for (const p of players) p.disconnect();
  }

  r.summary();
  process.exit(r.errors ? 1 : 0);
}

run().catch(err => { console.error('SIM ERROR:', err); process.exit(1); });
