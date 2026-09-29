/**
 * simulate-review-eighteen.js — the gameplay findings of an eighteenth
 * outside review, played on a live server.
 *
 *   SIM_SERVER=http://localhost:3013 node scripts/simulate-review-eighteen.js
 *
 * 1. Solo Quiz: a right answer, then a wrong one, must read as wrong
 *    (the student screen said "Correct!").
 * 2. Vocab Match: no right-column item starts beside its match, and a
 *    student who joins mid-round gets the board, never the waiting line.
 * 3. Snowball with three students: the trio's merge instruction speaks to
 *    a group, the pair's (none here) to a partner.
 */
import { setupRoom, connect, waitForEvent, wait, teardown, makeReporter, log, DEFAULT_SERVER } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function soloQuiz() {
  const { host, players, code } = await setupRoom('solo-quiz', 1);
  const [p] = players;
  try {
    const q1 = await waitForEvent(p, 'solo-quiz-question', 8000);
    // Canberra is right for question 1
    p.emit('solo-quiz-answer', { code, index: 0, choice: 'Canberra', phaseInstanceId: q1.phaseInstanceId });
    const f1 = await waitForEvent(p, 'solo-quiz-feedback', 5000);
    check('a right answer reads as right', f1.right === true);
    const wrong = f1.choices.find(c => c !== 'Mercury');
    p.emit('solo-quiz-answer', { code, index: f1.index, choice: wrong, phaseInstanceId: f1.phaseInstanceId });
    const f2 = await waitForEvent(p, 'solo-quiz-feedback', 5000);
    check('a wrong answer after a right one reads as wrong (right=' + f2.right + ')', f2.right === false);
    check('the running count still says one right', f2.correct === 1);
  } finally {
    teardown(host, players);
  }
}

async function vocabMatch() {
  const { host, players, code } = await setupRoom('vocab-match', 2);
  const late = await connect('LATE');
  try {
    host.emit('start-game', { code });
    const board = await waitForEvent(players[0], 'match-start', 20000);
    const cfg = await (await fetch(DEFAULT_SERVER + '/api/games/vocab-match')).json();
    const game = cfg.config || cfg;
    const pairs = game.phases.round1.pairs;
    const lefts = board.leftItems;
    const rightOf = new Map(pairs.map(pr => [pr.left, pr.right]));
    const beside = board.rightItems.filter((r, i) => rightOf.get(lefts[i]) === r).length;
    check('no item starts beside its match (' + beside + ' did)', beside === 0);

    late.emit('join-room', { code, name: 'Late Lu' });
    await waitForEvent(late, 'join-success', 5000);
    const lateBoard = await waitForEvent(late, 'match-start', 5000).catch(() => null);
    check('a student who joins mid-round gets the board', !!lateBoard && Array.isArray(lateBoard.rightItems));
    check('the late board carries the step id', !!lateBoard && typeof lateBoard.phaseInstanceId === 'number');
    await wait(200);
    const counts = host._buffer['match-received'] || [];
    const last = counts[counts.length - 1];
    check('the projector counts three matchers', !!last && last.total === 3);
    if (lateBoard) {
      host._buffer['match-received'] = [];
      late.emit('match-submit', { code, matching: lateBoard.rightItems, phaseInstanceId: lateBoard.phaseInstanceId });
      const got = await waitForEvent(host, 'match-received', 5000).catch(() => null);
      check('the late student\'s matches count (' + (got ? got.count + ' of ' + got.total : 'none') + ')', !!got && got.count === 1 && got.total === 3);
    }
  } finally {
    teardown(host, [...players, late]);
  }
}

async function snowballTrio() {
  const { host, players, code } = await setupRoom('snowball', 3);
  try {
    host.emit('start-game', { code });
    // intro announce is host-paced
    await waitForEvent(host, 'announce', 8000).catch(() => null);
    host.emit('advance-phase', { code });
    const started = await Promise.all(players.map(p => waitForEvent(p, 'game-started', 8000)));
    players.forEach((p, i) => p.emit('submit-response', { code, response: 'Equal parts of a whole ' + i, phaseInstanceId: started[i].phaseInstanceId }));
    await Promise.all(players.map(p => waitForEvent(p, 'response-accepted', 5000)));
    host.emit('close-submissions', { code });
    const merges = await Promise.all(players.map(p => waitForEvent(p, 'merge-start', 8000)));
    const trio = merges.find(m => m.memberNames.length === 3);
    check('three students make one group of three', !!trio);
    if (trio) {
      log('SIM', 'trio instruction: ' + trio.instruction);
      check('the trio is told to sit with the group', /sit with your group/i.test(trio.instruction) && !/partner/i.test(trio.instruction));
    }
  } finally {
    teardown(host, players);
  }
}

async function main() {
  await soloQuiz();
  await vocabMatch();
  await snowballTrio();
  report.summary('REVIEW EIGHTEEN');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.stack); process.exit(1); });
