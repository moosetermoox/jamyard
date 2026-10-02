/**
 * A pass-along chain with two students (a reviewer's Story Builder,
 * 2026-10-02: at the second pass each student got the story they started,
 * under "A new story lands in your hands"), proved on the Idea Chain
 * fixture (a starter and four rounds):
 *
 *   1. No round hands a student the chain they started.
 *   2. The projector's round prompt has no "The version you received:"
 *      heading over nothing.
 *   3. The gallery goes up one chain at a time, one hop per line.
 *
 * Usage: node scripts/simulate-two-student-chain.js   (server running;
 * SIM_SERVER=http://localhost:3810 to point it elsewhere)
 */
import { setupRoom, waitForEvent, waitForEventOnAll, teardown, makeReporter, wait, drainAll } from './sim-harness.js';

const r = makeReporter();
const STARTERS = ['Maya, 12, afraid of ladders', 'Jordan, 40, collects spoons'];

async function main() {
  const { host, players, code } = await setupRoom('_sim-idea-chain', 2);
  try {
    host.emit('start-game', { code });
    // The starter (after a timed intro)
    let opened = await waitForEventOnAll(players, 'game-started', 20000);
    for (let i = 0; i < 2; i++) {
      players[i].emit('submit-response', { code, response: STARTERS[i], phaseInstanceId: opened[i].phaseInstanceId });
      await waitForEvent(players[i], 'response-accepted', 5000);
    }
    host.emit('close-submissions', { code });

    for (let round = 1; round <= 4; round++) {
      drainAll([host]);
      const hostStart = waitForEvent(host, 'game-started', 20000);
      opened = await waitForEventOnAll(players, 'game-started', 20000);
      const hostPrompt = String((await hostStart).prompt || '');
      for (let i = 0; i < 2; i++) {
        const prompt = String(opened[i].prompt || '');
        r.check(!prompt.includes(STARTERS[i]), `1. round ${round}: student ${i + 1} is not handed their own chain`);
      }
      r.check(!/The version you received:/.test(hostPrompt), `2. round ${round}: the projector has no empty heading (${JSON.stringify(hostPrompt.slice(0, 60))})`);
      for (let i = 0; i < 2; i++) {
        players[i].emit('submit-response', { code, response: `twist ${round} by ${i + 1}`, phaseInstanceId: opened[i].phaseInstanceId });
        await waitForEvent(players[i], 'response-accepted', 5000);
      }
      host.emit('close-submissions', { code });
    }

    // The return-to-author reveal, then the gallery
    await waitForEvent(host, 'show-results', 15000);
    await wait(300);
    drainAll([host]);
    const start = waitForEvent(host, 'reveal-one-start', 10000);
    host.emit('advance-phase', { code });
    const g = await start;
    r.check(g.oneAtATime === true, '3. the gallery goes up one chain at a time');
    const item = waitForEvent(host, 'reveal-one-item', 5000);
    host.emit('reveal-next', { code, phaseInstanceId: g.phaseInstanceId });
    const card = await item;
    const lines = String(card.item || '').split('\n');
    r.check(lines.length === 5 && lines.slice(1).every(l => l.startsWith('→ ')), '3. a chain card has one hop per line: ' + JSON.stringify(card.item));
    // The chain never came home before the end: every hop on it is the
    // other student's, never the starter's own
    const starter = STARTERS.indexOf(lines[0]) + 1;
    r.check(starter > 0 && lines.slice(1).every(l => !l.endsWith('by ' + starter)), '1. no hop on a chain was written by the student who started it');
  } finally {
    await teardown(host, players);
  }
  r.summary('TWO-STUDENT CHAIN');
  process.exit(r.errors ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
