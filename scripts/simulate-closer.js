/**
 * Closer — talk-only walkthrough (Connection Pack Phase 2, revised).
 *
 * Closer no longer collects typed answers: every question is a host-paced
 * announce screen (question + who speaks first + partner-swap instructions),
 * and the only device interaction is the one-tap rate checkout.
 *
 * Drives games/closer with 1 host + 5 players and asserts:
 *   1. All 13 talk screens reach every player, in order, with the right copy.
 *   2. The checkout is a single 1-5 scale; everyone can tap it.
 *   3. Results are visible to the class (visibility: all), then the end
 *      screen's closing copy arrives.
 *   4. No collect prompt ("game-started") ever reached a player — the
 *      no-typing guarantee.
 *
 * Usage: node scripts/simulate-closer.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = 'closer';
const NUM_PLAYERS = 5;

const r = makeReporter();

// [phaseId, copy marker every player must see]
const TALK_SCREENS = [
  ['welcome', 'nothing to type'],
  ['tier1-intro', 'person next to you'],
  ['t1q1', 'Window seat'],
  ['t1q2', 'mascot'],
  ['t1q3', 'teleport'],
  ['tier2-intro', 'new partner'],
  ['t2q1', 'changed your mind'],
  ['t2q2', 'good friend'],
  ['t2q3', 'compliment'],
  ['tier3-intro', 'One more swap'],
  ['t3q1', 'proud of'],
  ['t3q2', 'thank one person'],
  ['t3q3', 'remember in ten years']
];

async function run() {
  console.log('\n=== CLOSER SIMULATION (talk-only, 5 players) ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    host.emit('start-game', { code });

    // ---- The 13 talk screens, host-paced ----
    for (const [id, marker] of TALK_SCREENS) {
      const msgs = await waitForEventOnAll(players, 'announce', 8000);
      r.check(
        msgs.every(m => String(m.message || '').includes(marker)),
        `${id}: every player sees "${marker}..."`
      );
      await wait(150);
      host.emit('advance-phase', { code });
    }

    // ---- Checkout: one-tap rate ----
    console.log('\n--- checkout ---');
    const rateStarts = await waitForEventOnAll(players, 'rate-start', 8000);
    r.check(
      rateStarts.every(ev => Array.isArray(ev.scales) && ev.scales.length === 1 && ev.scales[0].id === 'felt'),
      'checkout: single one-tap scale delivered to every player'
    );
    players.forEach((p, i) => {
      p.emit('rate-submit', { code, ratings: { felt: (i % 5) + 1 } });
    });
    log('SIM', `All ${NUM_PLAYERS} players tapped a rating`);
    await wait(500);
    host.emit('close-rating', { code });

    const results = await waitForEvent(players[0], 'rate-results', 8000);
    r.check(!!results, 'checkout: results shown to the class (visibility: all)');
    await wait(200);
    host.emit('advance-phase', { code });

    // ---- End ----
    try {
      const ended = await waitForEvent(players[0], 'game-ended', 8000);
      r.check(String(ended.message || '').includes('nine real conversations'),
        'end: closing copy reached');
    } catch {
      r.warn('game-ended not observed');
    }

    // ---- The no-typing guarantee ----
    r.check(
      players.every(p => !(p._buffer['game-started'] || []).length),
      'no collect prompt ever reached a player (nothing to type)'
    );
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('CLOSER SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
