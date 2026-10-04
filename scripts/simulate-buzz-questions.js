/**
 * Proof: a buzzer round with its own questions (2026-10-04).
 *
 * A host, a teacher console, and three students on games/_sim-buzz-questions
 * (three listed questions). Checks: every screen gets the question's words
 * and the count, no class-facing payload ever carries an answer, the console
 * gets each answer, Next walks the list and stops at the last, a judged
 * buzz scores, and the standings follow Finish. (A refreshed screen's
 * question is covered in tests/engine/buzz-questions.test.js.)
 *
 *   node scripts/simulate-buzz-questions.js     (server running; SIM_SERVER to point elsewhere)
 */
import { connect, waitForEvent, makeReporter, wait, DEFAULT_SERVER } from './sim-harness.js';

const r = makeReporter();
const ok = (description, condition, seen) => r.check(!!condition, description + (seen !== undefined ? '  [' + seen + ']' : ''));
const ANSWERS = ['carbon dioxide', 'mitochondria', 'Mercury'];

async function main() {
  const host = await connect('HOST', DEFAULT_SERVER);
  const classSeen = [];   // every payload a class-facing socket got, to scan for answers
  const consoleSeen = [];
  host.onAny((event, p) => classSeen.push({ who: 'host', event, p }));
  host.emit('create-room', { gameId: '_sim-buzz-questions', pretend: true });
  const room = await waitForEvent(host, 'room-created', 5000);
  const { code, teacherPin, teacherKey } = room;

  const teacher = await connect('CONSOLE', DEFAULT_SERVER);
  teacher.onAny((event, p) => consoleSeen.push({ event, p }));
  teacher.emit('join-teacher', { code, pin: teacherPin, key: teacherKey });
  await waitForEvent(teacher, 'teacher-joined', 4000);

  const names = ['Maya', 'Jordan', 'Sofia'];
  const players = [];
  for (const name of names) {
    const p = await connect(name, DEFAULT_SERVER);
    p.onAny((event, payload) => classSeen.push({ who: name, event, p: payload }));
    p.emit('join-room', { code, name });
    await waitForEvent(p, 'join-success', 3000);
    players.push(p);
  }

  const starts = players.map(p => waitForEvent(p, 'buzz-start', 5000));
  const hostStart = waitForEvent(host, 'buzz-start', 5000);
  const firstAnswer = waitForEvent(teacher, 'teacher-buzz-question', 5000);
  host.emit('start-game', { code });
  const [h, ...ps] = await Promise.all([hostStart, ...starts]);
  const t1 = await firstAnswer;
  ok('the projector shows question 1 of 3 with its words', h.question === 1 && h.total === 3 && h.questionText === 'What gas do plants take in?', h.questionText);
  ok('every student screen shows the same question', ps.every(p => p.questionText === 'What gas do plants take in?' && p.total === 3));
  ok('the console gets the first answer', t1.answer === 'carbon dioxide' && t1.number === 1 && t1.total === 3, t1.answer);

  // Maya buzzes, the teacher marks it right
  const locked = waitForEvent(host, 'buzz-locked', 3000);
  players[0].emit('buzz-tap', { code });
  await locked;
  const result = waitForEvent(host, 'buzz-result', 3000);
  host.emit('buzz-judge', { code, correct: true });
  const res = await result;
  ok('a right answer scores', res.correct === true && Object.values(res.scores || {}).includes(10));

  // Next walks the list
  const open2 = waitForEvent(host, 'buzz-open', 3000);
  const ans2 = waitForEvent(teacher, 'teacher-buzz-question', 3000);
  host.emit('buzz-next', { code });
  const o2 = await open2; const a2 = await ans2;
  ok('Next brings question 2 to the projector', o2.question === 2 && o2.questionText === 'What is the powerhouse of the cell?', o2.questionText);
  ok('and its answer to the console', a2.answer === 'mitochondria' && a2.number === 2);

  const open3 = waitForEvent(host, 'buzz-open', 3000);
  host.emit('buzz-next', { code });
  const o3 = await open3;
  ok('question 3 is the string form, split on the bar', o3.questionText === 'Which planet is closest to the sun?' && o3.total === 3, o3.questionText);

  // Next on the last question is dropped
  let extra = false;
  host.once('buzz-open', () => { extra = true; });
  host.emit('buzz-next', { code });
  await wait(800);
  ok('Next on the last question does nothing', !extra);

  // No class-facing payload ever carried an answer
  const leaks = classSeen.filter(e => ANSWERS.some(a => JSON.stringify(e.p || '').includes(a)));
  ok('no answer ever reached the projector or a student', leaks.length === 0, leaks.map(l => l.who + ':' + l.event).join(','));
  ok('the console got all three answers', ANSWERS.every(a => consoleSeen.some(e => e.event === 'teacher-buzz-question' && e.p.answer === a)));

  // Finish moves on to the standings
  const lb = waitForEvent(host, 'leaderboard', 4000).catch(() => null);
  host.emit('buzz-finish', { code });
  ok('Finish moves on to the standings', !!(await lb));

  for (const s of [host, teacher, ...players]) s.disconnect();
}

main()
  .then(() => { r.summary(); process.exit(r.errors > 0 ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
