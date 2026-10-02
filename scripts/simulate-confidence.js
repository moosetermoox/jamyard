/**
 * simulate-confidence.js — confidence after the answer (2026-10-01, the
 * mechanics inventory's Part 3) through real rooms on two hidden fixtures,
 * each the quiz brick's own compile with confidence: true:
 *   games/_sim-confidence     two questions in English
 *   games/_sim-confidence-es  one question, language "es"
 * After each question every student says how sure they were BEFORE the
 * answer shows; the answer card then splits the class's confidence by who
 * got it right, and a Spanish room asks and answers in Spanish.
 *
 *   node scripts/simulate-confidence.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function room(gameId, names) {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const { code } = await waitForEvent(host, 'room-created', 5000);
  log('HOST', `Room ${code} (${gameId})`);
  const players = [];
  for (const name of names) {
    const p = await connect(name.toUpperCase());
    players.push(p);
    p.emit('join-room', { code, name });
    await waitForEvent(p, 'join-success', 4000);
  }
  return { host, code, players };
}

async function everyone(players, event) {
  const out = [];
  for (const p of players) out.push(await waitForEvent(p, event, 8000).catch(() => null));
  return out;
}

async function answerAll(code, players, starts, picks) {
  players.forEach((p, i) => p.emit('submit-response', { code, response: picks[i], phaseInstanceId: starts[i].phaseInstanceId }));
  await wait(400);
}

async function english() {
  const names = ['Ana', 'Ben', 'Cleo', 'Dev'];
  const { host, code, players } = await room('_sim-confidence', names);
  try {
    host.emit('start-game', { code });
    // Question one: Ana and Ben right, Cleo and Dev wrong
    const q1 = await everyone(players, 'game-started');
    check('the first question goes out', q1.every(s => s && /water vapor/.test(s.prompt || '')));
    await answerAll(code, players, q1, ['Condensation', 'Condensation', 'Evaporation', 'Evaporation']);
    host.emit('close-submissions', { code });

    // How sure, before any answer shows
    const sure = await everyone(players, 'game-started');
    check('every student is asked how sure they are', sure.every(s => s && s.prompt === 'How sure are you of your answer?'));
    check('the four levels, least to most sure', sure.every(s => JSON.stringify(s.choices) === JSON.stringify(['Just guessing', 'Not sure', 'Pretty sure', 'Certain'])));
    const leaked = (host._buffer.announce || []).some(a => /The answer was/.test(a.message || ''));
    check('the answer has not shown yet', !leaked);
    // Ana certain (right), Ben not sure (right), Cleo certain (wrong), Dev guessing (wrong)
    await answerAll(code, players, sure, ['Certain', 'Not sure', 'Certain', 'Just guessing']);
    host.emit('close-submissions', { code });

    const card = await waitForEvent(host, 'announce', 8000);
    const msg = String(card.message || '');
    check('the answer card shows the answer', /The answer was: Condensation!/.test(msg));
    // Ana Certain, Ben Not sure, Cleo Certain, Dev Just guessing = 11 / 4
    check('the card carries the dial of the class average, 2.8 of 4, nearest Pretty sure', /How sure the class was\n◔ 2\.8\/4 \| Just guessing \| Certain\nPretty sure on average/.test(msg));
    check('one line about the sure ones: one of the two sure students was wrong', /Sure but wrong: 1 of 2\./.test(msg));
    const studentCard = await waitForEvent(players[0], 'announce', 4000).catch(() => null);
    check('the students see the same card', studentCard && /◔ 2\.8\/4/.test(studentCard.message || ''));

    // Question two: everyone right, everyone certain
    host.emit('advance-phase', { code });
    const q2 = await everyone(players, 'game-started');
    await answerAll(code, players, q2, ['Precipitation', 'Precipitation', 'Precipitation', 'Precipitation']);
    host.emit('close-submissions', { code });
    const sure2 = await everyone(players, 'game-started');
    await answerAll(code, players, sure2, ['Certain', 'Certain', 'Certain', 'Certain']);
    host.emit('close-submissions', { code });
    const card2 = await waitForEvent(host, 'announce', 8000);
    check('the second card reads its own question only: all certain, all right', /◔ 4\.0\/4/.test(card2.message || '') && /Everyone who was sure got it right\./.test(card2.message || ''));
  } finally {
    teardown(host, players);
  }
}

async function spanish() {
  const names = ['Lucía', 'Mateo', 'Sofía'];
  const { host, code, players } = await room('_sim-confidence-es', names);
  try {
    host.emit('start-game', { code });
    const q = await everyone(players, 'game-started');
    await answerAll(code, players, q, ['Condensación', 'Evaporación', 'Condensación']);
    host.emit('close-submissions', { code });
    const sure = await everyone(players, 'game-started');
    check('a Spanish room asks in Spanish', sure.every(s => s && s.prompt === '¿Qué tan seguro estás de tu respuesta?'));
    check('with the levels in Spanish', sure.every(s => JSON.stringify(s.choices) === JSON.stringify(['Solo adivino', 'No estoy seguro', 'Bastante seguro', 'Totalmente seguro'])));
    await answerAll(code, players, sure, ['Totalmente seguro', 'Totalmente seguro', 'Solo adivino']);
    host.emit('close-submissions', { code });
    const card = await waitForEvent(host, 'announce', 8000);
    const msg = String(card.message || '');
    check('the dial and the line are in Spanish', /Qué tan segura estaba la clase\n◔ 3\.0\/4 \| Solo adivino \| Totalmente seguro\nBastante seguro, en promedio/.test(msg) && /Seguros pero equivocados: 1 de 2\./.test(msg));
  } finally {
    teardown(host, players);
  }
}

async function main() {
  await english();
  await spanish();
  report.summary('CONFIDENCE AFTER THE ANSWER');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
