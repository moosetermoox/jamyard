/**
 * The vote over drawings (2026-09-20, storyboard probe follow-up).
 *
 * Drives games/_sim-drawing-vote (draw > teacher preview > gallery > vote >
 * crown, compiled by the draw and vote bricks) with four students whose
 * drawings differ in stroke count, and checks:
 *
 *  1. every ballot carries the OTHER students' drawings as thin strokes
 *     (never the voter's own, never the "[drawing]" placeholder alone)
 *  2. a long stroke arrives thinned (at most 24 points per stroke)
 *  3. three votes for Ada: the crown names Ada and the winner-announced
 *     payload carries her FULL drawing (every point), for the projector
 *  4. the room reaches the end
 *
 * Requires the server running: node scripts/simulate-drawing-vote.js
 */

import {
  wait, log, setupRoom, teardown, waitForEvent, waitForEventOnAll, drainEvent, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-drawing-vote';
const NUM_PLAYERS = 4;
const r = makeReporter();

// A drawing with `strokes` strokes; the first stroke is long (100 points)
// so the ballot's thinning is visible.
function drawingOf(strokes) {
  const out = [];
  for (let s = 0; s < strokes; s++) {
    const n = s === 0 ? 100 : 6;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([0.1 + (0.8 * i) / n, 0.2 + 0.1 * s]);
    out.push({ points: pts, color: '#e53935', width: 4 });
  }
  return out;
}

async function run() {
  console.log('\n=== DRAWING VOTE SIMULATION ===');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  try {
    host.emit('start-game', { code });

    // --- draw ---
    await waitForEventOnAll(players, 'game-started', 8000);
    const strokeCounts = [3, 4, 5, 6]; // Ada has 3 strokes
    players.forEach((p, i) => p.emit('submit-response', { code, response: { strokes: drawingOf(strokeCounts[i]) } }));
    await wait(600);
    host.emit('close-submissions', { code });

    // --- teacher preview ---
    const preview = await waitForEvent(host, 'preview-content', 8000);
    r.check((preview.responses || []).length === NUM_PLAYERS, `the preview holds ${NUM_PLAYERS} drawings`);
    await wait(300);
    host.emit('preview-approve', { code });

    // --- gallery: skip through it ---
    await waitForEvent(host, 'reveal-one-start', 8000).catch(() => null);
    await wait(300);
    host.emit('advance-phase', { code });

    // --- vote: the ballots ---
    const ballots = await waitForEventOnAll(players, 'vote-start', 8000);
    r.check(ballots.every(b => b.mode === 'pick-one'), 'a pick-one vote opened for everyone');
    ballots.forEach((b, i) => {
      const cands = b.candidates || [];
      const ids = cands.map(c => c.playerId);
      r.check(cands.length === NUM_PLAYERS - 1 && !ids.includes(players[i].id),
        `${names[i]}'s ballot holds the other ${NUM_PLAYERS - 1} drawings, not their own`);
      r.check(cands.every(c => Array.isArray(c.drawing) && c.drawing.length > 0),
        `${names[i]}'s ballot carries strokes for every candidate`);
      r.check(cands.every(c => c.drawing.every(s => s.points.length <= 24)),
        `${names[i]}'s ballot strokes are thinned to 24 points or fewer`);
    });

    // Everyone but Ada votes for Ada; Ada votes for Bob.
    const adaId = players[0].id;
    const bobId = players[1].id;
    players.forEach((p, i) => p.emit('submit-vote', { code, choice: i === 0 ? bobId : adaId }));

    // --- crown ---
    const crown = await waitForEvent(host, 'winner-announced', 10000);
    r.check(crown.winnerName === names[0], `the crown names ${names[0]} (got ${crown.winnerName})`);
    const entry = (crown.winnerEntries || []).find(e => e.playerId === adaId);
    r.check(!!entry && Array.isArray(entry.drawing), 'the winning entry carries a drawing');
    r.check(!!entry && entry.drawing.length === 3 && entry.drawing[0].points.length === 100,
      'the projector gets the FULL drawing (3 strokes, the long one with all 100 points)');
    r.check(Array.isArray(crown.winnerDrawing) && crown.winnerDrawing[0].points.length === 100, 'winnerDrawing rides on the payload too');
    r.check(!crown.winnerEntry, 'no "[drawing]" placeholder text is announced');

    // --- end ---
    try {
      await waitForEvent(players[0], 'game-ended', 15000);
      r.check(true, 'the room reached the end');
    } catch {
      r.warn('game-ended not observed');
    }
  } finally {
    await teardown(host, players);
  }
  r.summary('DRAWING VOTE SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
