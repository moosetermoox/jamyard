/**
 * pairBy — answer-keyed pairing simulation (2026-08-26 interop wave 2).
 *
 * Drives games/_sim-pairby (collect-choice split → pairwise collect with
 * pairBy mode "opposite" → pair-scoped reveal) twice:
 *
 *   Room 1 (even split, 3 Cats / 3 Dogs): every pair must be cross-answer.
 *   Room 2 (lopsided, 5 Cats / 1 Dog): exactly one cross pair, the
 *     leftover Cats pair with each other, and NOBODY sits out.
 *
 * Each bot's "why" answer encodes their pick ("I picked Cats ..."), so the
 * pair reveal content proves who got paired with whom.
 *
 * Usage: node scripts/simulate-pairby.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-pairby';
const NUM_PLAYERS = 6;

const r = makeReporter();

/**
 * Run one room with the given per-player picks and return each player's
 * pair-reveal content (parallel to `players`).
 */
async function runRoom(labelText, picks) {
  console.log(`\n=== ${labelText} ===`);
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  try {
    host.emit('start-game', { code });

    // --- Phase: pick (collect-choice) ---
    const pickPrompts = await waitForEventOnAll(players, 'game-started', 8000);
    r.check(pickPrompts.every(p => p.isChoice && Array.isArray(p.choices) && p.choices.length === 2),
      `${labelText}: choice ballots delivered`);
    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: picks[i] });
      log(names[i], `picked ${picks[i]}`);
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Phase: why (pairwise collect with pairBy) ---
    const whyPrompts = await waitForEventOnAll(players, 'game-started', 8000);
    r.check(whyPrompts.length === NUM_PLAYERS,
      `${labelText}: all ${NUM_PLAYERS} players got a partner (nobody sitting out)`);
    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `I picked ${picks[i]} and I stand by it (${names[i]}).` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Phase: swap (pair-scoped reveal) ---
    const reveals = await waitForEventOnAll(players, 'show-results', 8000);
    const contents = reveals.map(ev => String(ev.content || ''));
    r.check(contents.every(c => !c.includes('{{_pair')),
      `${labelText}: no literal {{_pair.*}} tokens`);

    host.emit('advance-phase', { code });
    try {
      await waitForEvent(players[0], 'game-ended', 8000);
      r.check(true, `${labelText}: game reached end phase`);
    } catch {
      r.warn(`${labelText}: game-ended not observed`);
    }
    return contents;
  } finally {
    await teardown(host, players);
  }
}

function pairMix(content) {
  return {
    cats: (content.match(/I picked Cats/g) || []).length,
    dogs: (content.match(/I picked Dogs/g) || []).length
  };
}

async function run() {
  console.log('\n=== PAIRBY SIMULATION ===');

  // --- Room 1: even split — every pair must be cross-answer ---
  const evenPicks = ['Cats', 'Dogs', 'Cats', 'Dogs', 'Cats', 'Dogs'];
  const evenContents = await runRoom('ROOM 1 (3 Cats / 3 Dogs)', evenPicks);
  evenContents.forEach((c, i) => {
    const mix = pairMix(c);
    r.check(mix.cats === 1 && mix.dogs === 1,
      `even split: player ${i} sees one Cats + one Dogs answer (got ${mix.cats}C/${mix.dogs}D)`);
  });

  // --- Room 2: lopsided — one cross pair, leftovers pair same-answer ---
  const lopPicks = ['Cats', 'Cats', 'Cats', 'Cats', 'Cats', 'Dogs'];
  const lopContents = await runRoom('ROOM 2 (5 Cats / 1 Dog)', lopPicks);
  const mixed = lopContents.filter(c => {
    const mix = pairMix(c);
    return mix.cats >= 1 && mix.dogs >= 1;
  });
  r.check(mixed.length === 2,
    `lopsided: exactly one cross pair (2 players see a mixed pair, got ${mixed.length})`);
  const dogContent = lopContents[5];
  const dogMix = pairMix(dogContent);
  r.check(dogMix.dogs === 1 && dogMix.cats === 1,
    'lopsided: the lone Dogs player is in the cross pair');
  lopContents.forEach((c, i) => {
    const mix = pairMix(c);
    r.check(mix.cats + mix.dogs === 2,
      `lopsided: player ${i} is in a full pair of 2 (got ${mix.cats + mix.dogs} answers)`);
  });

  r.summary('PAIRBY SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
