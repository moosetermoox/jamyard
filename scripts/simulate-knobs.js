/**
 * simulate-knobs.js — the knobs (2026-09-30, the mechanics inventory part
 * two) through a real room, on the hidden fixture games/_sim-knobs:
 * groups by answer (team-split byAnswer), a poll's .least in a message,
 * a vote over the students (candidates "players"), the most-voted out
 * (eliminate most-votes), a graded order (rank correctOrder), and a
 * self-paced quiz built from the class's own questions (solo-quiz
 * questionsFrom).
 *
 *   node scripts/simulate-knobs.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, waitForAnyPlayerEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';
import { EVENTS } from '../engine/events.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-knobs' });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      const joined = await waitForEvent(p, 'join-success', 4000);
      p._id = joined.playerId || p.id;
      p._name = name;
    }
    host.emit('start-game', { code });

    // 1. The poll: Cats, Cats, Dogs, and Dev stays quiet
    const pollStart = await waitForAnyPlayerEvent(players, 'game-started', 6000);
    const pollInstance = pollStart.phaseInstanceId;
    players[0].emit('submit-response', { code, response: 'Cats', phaseInstanceId: pollInstance });
    players[1].emit('submit-response', { code, response: 'Cats', phaseInstanceId: pollInstance });
    players[2].emit('submit-response', { code, response: 'Dogs', phaseInstanceId: pollInstance });
    await wait(400);
    drainEvent(players, 'game-started');
    host.emit('close-submissions', { code });

    // 2. Groups by answer: Cats and Dogs, the quiet one in the smallest group
    const split = await waitForEvent(host, 'team-split', 6000);
    const teamNames = Object.keys(split.teams || {});
    check('one group per answer, named by the answer', teamNames.length === 2 && teamNames.includes('Cats') && teamNames.includes('Dogs'));
    check('the Cats group holds the two who picked Cats', !!split.teams.Cats && split.teams.Cats.map(m => m.name).sort().join() === 'Ana,Ben');
    check('a student with no answer joins the smallest group', !!split.teams.Dogs && split.teams.Dogs.some(m => m.name === 'Dev'));
    drainEvent(players, 'team-split');
    host.emit('advance-phase', { code });

    // 3. The announce reads the poll's least picked
    const sides = await waitForEvent(host, 'announce', 6000);
    check('the message names the least picked choice', /Dogs goes first/.test(sides.message || ''));
    host.emit('advance-phase', { code });

    // 4. A vote over the students: everyone picks Ana, Ana picks Ben
    const voteStart = await waitForAnyPlayerEvent(players, 'vote-start', 6000);
    const ballots = players.map(p => (p._buffer['vote-start'] && p._buffer['vote-start'][0]) || voteStart);
    const anaBallot = ballots[0].candidates || [];
    check('the ballot lists the students by name', anaBallot.every(c => c && c.playerId && c.text) && anaBallot.some(c => c.text === 'Ben'));
    check('nobody sees themselves on the ballot', !anaBallot.some(c => c.playerId === players[0]._id));
    const anaId = players[0]._id;
    const benId = players[1]._id;
    players[0].emit('submit-vote', { code, choice: benId, phaseInstanceId: voteStart.phaseInstanceId });
    for (let i = 1; i < players.length; i++) {
      players[i].emit('submit-vote', { code, choice: anaId, phaseInstanceId: voteStart.phaseInstanceId });
    }
    await wait(400);
    drainEvent(players, 'vote-start');
    host.emit('close-voting', { code });

    // 5. The most-voted student is out of the round
    const outcome = await waitForEvent(host, EVENTS.ELIMINATION_RESULTS, 8000).catch(() => null);
    check('the most-voted student is out', !!outcome && Array.isArray(outcome.eliminatedNames) && outcome.eliminatedNames.join() === 'Ana');
    check('three remain', !!outcome && outcome.remaining === 3);

    // 6. A graded order (the rank opens by itself after the pause)
    const rankStart = await waitForAnyPlayerEvent(players, 'rank-start', 8000);
    const shown = rankStart.candidates || [];
    check('the items reach the students shuffled', shown.length === 3 && shown.join() !== 'Ice,Water,Steam');
    drainEvent(players, 'rank-start');
    const right = ['Ice', 'Water', 'Steam'];
    players[1].emit('rank-submit', { code, ranking: right.slice() });
    players[2].emit('rank-submit', { code, ranking: right.slice().reverse() });
    players[3].emit('rank-submit', { code, ranking: ['Water', 'Ice', 'Steam'] });
    await wait(400);
    host.emit('close-ranking', { code });
    const results = await waitForEvent(host, 'show-results', 8000);
    const content = String(results.content || '');
    check('the reveal shows the class order, the right order, and the slot count', /1\. Water/.test(content) && /The right order:\n1\. Ice\n2\. Water\n3\. Steam/.test(content) && /put 1 of 3 in the right slot/.test(content));
    check('the reveal names who presents first', /First to present: Ana\./.test(content));
    host.emit('advance-phase', { code });

    // 7. The class writes the quiz: two complete questions, one without a wrong answer
    const writeStart = await waitForAnyPlayerEvent(players, 'game-started', 6000);
    const writeInstance = writeStart.phaseInstanceId;
    drainEvent(players, 'game-started');
    players[1].emit('submit-response', { code, response: { question: 'Capital of France?', correct: 'Paris', wrong1: 'Rome' }, phaseInstanceId: writeInstance });
    players[2].emit('submit-response', { code, response: { question: 'Two plus two?', correct: '4', wrong1: '' }, phaseInstanceId: writeInstance });
    players[3].emit('submit-response', { code, response: { question: 'Biggest planet?', correct: 'Jupiter', wrong1: 'Mars' }, phaseInstanceId: writeInstance });
    await wait(500);
    host.emit('close-submissions', { code });

    // 8. The quiz runs over the two complete questions
    const quizStart = await waitForEvent(host, 'solo-quiz-start', 8000);
    check('the quiz holds every complete question the class wrote', quizStart.questionCount === 2);
    const q1 = await waitForEvent(players[1], 'solo-quiz-question', 6000);
    check('a student gets a classmate\'s question with its choices', !!q1 && Array.isArray(q1.choices) && q1.choices.length === 2);
    players[1].emit('solo-quiz-answer', { code, index: q1.index || 0, choice: q1.choices[0], phaseInstanceId: q1.phaseInstanceId });
    const fb = await waitForEvent(players[1], 'solo-quiz-feedback', 6000).catch(() => null);
    check('the answer is graded', !!fb && typeof fb.right === 'boolean');
    host.emit('close-solo-quiz', { code });
    const board = await waitForEvent(host, 'solo-quiz-results', 8000).catch(() => null);
    check('the quiz closes to a board', !!board);
  } finally {
    teardown(host, players);
  }
  report.summary('KNOBS');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
