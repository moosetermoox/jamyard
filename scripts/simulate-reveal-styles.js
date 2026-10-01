/**
 * simulate-reveal-styles.js — the reveal styles (2026-09-30, the mechanics
 * inventory part three) through a real room on the hidden fixture
 * games/_sim-styles: a sized word cloud, every answer as a card, one
 * answer at random, one student at random, each a template suffix the
 * projector receives as a text shape.
 *
 *   node scripts/simulate-reveal-styles.js    (server running on :3000, or SIM_SERVER)
 */
import { connect, waitForEvent, waitForAnyPlayerEvent, drainEvent, wait, teardown, makeReporter, log } from './sim-harness.js';

const report = makeReporter();
const check = (description, condition) => report.check(condition, description);

async function main() {
  const host = await connect('HOST');
  host.emit('create-room', { gameId: '_sim-styles' });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  log('HOST', `Room ${code}`);
  const names = ['Ana', 'Ben', 'Cleo'];
  const words = ['tired but hopeful', 'hopeful', 'hopeful and nervous'];
  const players = [];
  try {
    for (const name of names) {
      const p = await connect(name.toUpperCase());
      players.push(p);
      p.emit('join-room', { code, name });
      await waitForEvent(p, 'join-success', 4000);
    }
    host.emit('start-game', { code });
    const started = await waitForAnyPlayerEvent(players, 'game-started', 6000);
    players.forEach((p, i) => p.emit('submit-response', { code, response: words[i], phaseInstanceId: started.phaseInstanceId }));
    await wait(400);
    drainEvent(players, 'game-started');
    host.emit('close-submissions', { code });

    // 1. The cloud: "hopeful ×3" first, the stopword gone
    const cloud = await waitForEvent(host, 'show-results', 8000);
    const cloudText = String(cloud.content || '');
    check('the cloud lists the most common word first with its count', /^hopeful ×3$/m.test(cloudText));
    check('the cloud keeps the other words and drops the glue', /^tired ×1$/m.test(cloudText) && /^nervous ×1$/m.test(cloudText) && !/\bbut\b|\band\b/.test(cloudText.replace(/^How we feel:/, '')));
    host.emit('advance-phase', { code });

    // 2. The cards: every answer, a card each
    const cards = await waitForEvent(host, 'show-results', 8000);
    const cardText = String(cards.content || '');
    check('every answer is a card', words.every(w => cardText.includes('◆ ' + w)));
    host.emit('advance-phase', { code });

    // 3. One answer and one student at random
    const draw = await waitForEvent(host, 'show-results', 8000);
    const drawText = String(draw.content || '');
    const pickedAnswer = words.some(w => drawText.includes('One of ours: ' + w));
    const pickedName = names.some(n => drawText.includes('Drawn to go first: ' + n));
    check('one of the answers is drawn', pickedAnswer);
    check('one of the students is drawn by name', pickedName);
    check('nothing is drawn as a token', !/\{\{/.test(drawText));
  } finally {
    teardown(host, players);
  }
  report.summary('REVEAL STYLES');
  process.exit(report.errors ? 1 : 0);
}

main().catch(err => { log('SIM', 'ERROR ' + err.message); process.exit(1); });
