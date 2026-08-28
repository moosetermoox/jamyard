/**
 * Holding-screen invariant sim (2026-08-08 field test: every wait screen was
 * a static void — all three persona testers flagged it).
 *
 * Asserts:
 *  1. Lobby: every player receives the live room-roster (names + count) as
 *     classmates join — and the roster stops broadcasting once the game starts
 *  2. Collect: a submission broadcasts room-progress {count, total} to the
 *     whole room — counts only, NEVER names (no who's-slow pressure)
 *  3. Rank (standing in for the 2026-08-27 meadow wave: rank/sort/match/
 *     rate/wager/estimate now broadcast too): same counts-only payload
 *     reaches every player, so the meadow fills on those waits as well
 *
 * Requires the server running: node scripts/simulate-holding.js
 */

import {
  setupRoom, waitForEvent, waitForEventOnAll, teardown, wait, log, makeReporter
} from './sim-harness.js';

const GAME = 'weekend-poem'; // lobby → collect; no AI reached in this sim

async function run() {
  const r = makeReporter();
  const { host, players, names, code } = await setupRoom(GAME, 3);

  try {
    // --- Lobby roster ---
    // The last join triggers a roster broadcast to everyone already in.
    await wait(300);
    const rosters = players.map(p => {
      const buf = p._buffer['room-roster'] || [];
      return buf.length ? buf[buf.length - 1] : null;
    });
    r.check(rosters.every(Boolean), 'every player received a lobby roster');
    const full = rosters.filter(Boolean).every(ro =>
      ro.count === 3 && Array.isArray(ro.names) && names.every(n => ro.names.includes(n)));
    r.check(full, 'final roster shows all 3 classmates by name');

    // --- Game starts: collect phase ---
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'game-started', 10000);
    for (const p of players) p._buffer['room-roster'] = [];
    for (const p of players) p._buffer['room-progress'] = [];

    // --- Submission progress ---
    players[0].emit('submit-response', { code, response: 'Went hiking with my dog.' });
    const progress = await waitForEvent(players[1], 'room-progress', 4000).catch(() => null);
    r.check(!!progress, 'a classmate\'s wait screen receives room-progress');
    if (progress) {
      r.check(progress.count === 1 && progress.total === 3,
        `progress counts are right (${progress.count} of ${progress.total})`);
      const keys = Object.keys(progress).sort().join(',');
      r.check(keys === 'count,total',
        `progress payload carries counts ONLY, no names (keys: ${keys})`);
    }
    const p3progress = await waitForEvent(players[2], 'room-progress', 2000).catch(() => null);
    r.check(!!p3progress, 'every waiting player gets the progress tick, not just one');

    // --- Roster stays lobby-only ---
    await wait(300);
    const midGameRosters = players.some(p => (p._buffer['room-roster'] || []).length > 0);
    r.check(!midGameRosters, 'no roster broadcasts once the game is running (lobby-only)');
  } finally {
    await teardown(host, players);
  }

  // --- Rank progress (meadow wave): host-clock phases broadcast too ---
  const rankRoom = await setupRoom('_sim-rank-own', 3);
  try {
    rankRoom.host.emit('start-game', { code: rankRoom.code });
    const rankData = await waitForEvent(rankRoom.players[0], 'rank-start', 10000);
    for (const p of rankRoom.players) p._buffer['room-progress'] = [];

    rankRoom.players[0].emit('rank-submit', {
      code: rankRoom.code, ranking: [...rankData.candidates]
    });
    const rp = await waitForEvent(rankRoom.players[1], 'room-progress', 4000).catch(() => null);
    r.check(!!rp, 'a rank submission broadcasts room-progress to waiting classmates');
    if (rp) {
      r.check(rp.count === 1 && rp.total === 3,
        `rank progress counts are right (${rp.count} of ${rp.total})`);
      const rankKeys = Object.keys(rp).sort().join(',');
      r.check(rankKeys === 'count,total',
        `rank progress carries counts ONLY, no names (keys: ${rankKeys})`);
    }
  } finally {
    await teardown(rankRoom.host, rankRoom.players);
  }

  r.summary('HOLDING-SCREEN SIMULATION');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(`\nSim crashed: ${err.message}`);
  process.exit(1);
});
