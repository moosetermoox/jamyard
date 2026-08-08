/**
 * Late-join invariant sim.
 *
 * A brand-new player joining AFTER the game has started must land in the
 * current phase, not the lobby. Found 2026-08-08 by two independent persona
 * testers: the join-room new-player branch never called sendCurrentState
 * (only reconnects got it), so a student joining two minutes late stared at
 * "Waiting to start..." while the class was mid-activity.
 *
 * Asserts:
 *  1. Late joiner receives the current collect prompt (game-started event)
 *  2. Late joiner can actually submit and is counted
 *  3. On-time players are unaffected (no duplicate phase emits)
 *
 * Requires the server running: node scripts/simulate-late-join.js
 */

import {
  connect, setupRoom, waitForEvent, waitForEventOnAll, teardown, wait, log, makeReporter
} from './sim-harness.js';

const GAME = 'weekend-poem'; // lobby → collect; no AI reached in this sim

async function run() {
  const r = makeReporter();
  const { host, players, code } = await setupRoom(GAME, 3);
  let late;

  try {
    // Start the game → everyone lands in collect
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'game-started', 10000);
    log('SIM', 'Game started; 3 on-time players are in the collect phase');

    // The late kid walks in
    late = await connect('LATE');
    late.emit('join-room', { code, name: 'Zoe' });
    const joined = await waitForEvent(late, 'join-success', 3000);
    r.check(!joined.reconnected, 'late joiner is a NEW player (not a reconnect)');

    // THE invariant: she gets the current phase, not lobby silence
    const started = await waitForEvent(late, 'game-started', 4000).catch(() => null);
    r.check(!!started, 'late joiner receives the current phase (game-started)');
    if (started) {
      r.check(
        typeof started.prompt === 'string' && started.prompt.length > 0,
        `late joiner sees the collect prompt ("${(started.prompt || '').slice(0, 40)}...")`
      );
      r.check(started.timer === null, 'late joiner gets no stale countdown (timer null, same as reconnect)');
    }

    // She can actually participate (response-received acks go to the host)
    late.emit('submit-response', { code, response: 'I got here late but I went hiking.' });
    const ack = await waitForEvent(host, 'response-received', 4000).catch(() => null);
    r.check(!!ack && ack.playerName === 'Zoe', 'late joiner\'s submission reaches the host');
    if (ack) {
      r.check(ack.total === 4, `late joiner is counted in the submission total (${ack.count}/${ack.total})`);
    }

    // On-time players undisturbed: no duplicate game-started re-emits
    await wait(500);
    const dupes = players.filter(p => (p._buffer['game-started'] || []).length > 0);
    r.check(dupes.length === 0, 'on-time players did not receive duplicate phase emits');
  } finally {
    await teardown(host, [...players, ...(late ? [late] : [])]);
  }

  r.summary('LATE-JOIN SIMULATION');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(`\nSim crashed: ${err.message}`);
  process.exit(1);
});
