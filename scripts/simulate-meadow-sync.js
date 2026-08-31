/**
 * Shared-meadow sync sim (2026-08-30: "everyone's in the same space").
 *
 * Asserts:
 *  1. Each submitter privately receives their canonical block index
 *     (meadow-you) in submission order — and nobody else's.
 *  2. A nudge broadcasts meadow-moved {index, fx, fy} to the WHOLE room —
 *     anonymous payload, exactly those three keys, never a name or id.
 *  3. The server cooldown eats an immediate second nudge, then allows one
 *     after 3s.
 *  4. Out-of-range coordinates are clamped into the field.
 *  5. A player who hasn't submitted this phase cannot move anything.
 *
 * Requires the server running: node scripts/simulate-meadow-sync.js
 */

import {
  setupRoom, waitForEvent, waitForEventOnAll, teardown, wait, log, makeReporter
} from './sim-harness.js';

const GAME = '_sim-teacher'; // lobby -> collect; no AI reached in this sim

async function run() {
  const r = makeReporter();
  const { host, players, code } = await setupRoom(GAME, 4);
  const [p1, p2, p3, p4] = players;

  try {
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'game-started', 10000);

    // --- 1. Canonical indexes in submission order (p4 never submits) ---
    p1.emit('submit-response', { code, response: 'first in the field' });
    const you1 = await waitForEvent(p1, 'meadow-you', 4000);
    p2.emit('submit-response', { code, response: 'second in the field' });
    const you2 = await waitForEvent(p2, 'meadow-you', 4000);
    p3.emit('submit-response', { code, response: 'third in the field' });
    const you3 = await waitForEvent(p3, 'meadow-you', 4000);

    r.check(you1.index === 0 && you2.index === 1 && you3.index === 2,
      `indexes follow submission order (got ${you1.index}, ${you2.index}, ${you3.index})`);
    r.check(!(p2._buffer['meadow-you'] || []).some(e => e.index === 0),
      'nobody receives a classmate\'s index');

    // --- 2. A nudge reaches the whole room, anonymously ---
    for (const p of players) p._buffer['meadow-moved'] = [];
    p1.emit('meadow-nudge', { code, fx: 0.8, fy: 0.5 });
    const moved = await waitForEventOnAll(players, 'meadow-moved', 4000);
    r.check(moved.every(m => m.index === 0 && m.fx === 0.8 && m.fy === 0.5),
      'every screen (p4\'s watch-only wait included) saw block 0 walk to (0.8, 0.5)');
    const keys = Object.keys(moved[0]).sort().join(',');
    r.check(keys === 'fx,fy,index',
      `payload carries exactly index+fx+fy, no names or ids (got: ${keys})`);

    // --- 3. Server cooldown ---
    for (const p of players) p._buffer['meadow-moved'] = [];
    p1.emit('meadow-nudge', { code, fx: 0.2, fy: 0.2 });
    await wait(600);
    r.check((p2._buffer['meadow-moved'] || []).length === 0,
      'an immediate second nudge is eaten by the 3s cooldown');
    await wait(2600);
    p1.emit('meadow-nudge', { code, fx: 0.3, fy: 0.6 });
    const after = await waitForEvent(p2, 'meadow-moved', 4000).catch(() => null);
    r.check(!!after && after.fx === 0.3, 'the cooldown re-arms after 3s');

    // --- 4. Clamping ---
    await wait(400); // step 3's broadcast is still landing on the other sockets
    for (const p of players) p._buffer['meadow-moved'] = [];
    p2.emit('meadow-nudge', { code, fx: 42, fy: -3 });
    const clamped = await waitForEvent(p3, 'meadow-moved', 4000);
    r.check(clamped.index === 1 && clamped.fx <= 0.97 && clamped.fy >= 0.03,
      `wild coordinates are clamped into the field (got ${clamped.fx}, ${clamped.fy})`);

    // --- 5. Only submitters may move ---
    await wait(400); // let step 4's broadcast finish landing everywhere
    for (const p of players) p._buffer['meadow-moved'] = [];
    p4.emit('meadow-nudge', { code, fx: 0.5, fy: 0.5 });
    await wait(600);
    r.check((p1._buffer['meadow-moved'] || []).length === 0,
      'a player who hasn\'t submitted cannot move any block');
  } finally {
    await teardown(host, players);
  }

  r.summary();
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('simulate-meadow-sync failed:', err);
  process.exit(1);
});
