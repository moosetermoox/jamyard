/**
 * One Voice — scripted tap-timing simulation (Connection Pack Phase 4).
 *
 * Drives games/_sim-one-voice (target 6, collision window 400ms) with
 * 1 host + 4 players and SCRIPTED tap timings proving the spec's
 * adjudication rules end-to-end over real sockets
 * (docs/connection-pack-spec.md §4.4):
 *
 *   1. A counted tap broadcasts the new count, and only the tapper gets
 *      the personal "you said N" (no public attribution).
 *   2. Same-player-twice is rejected server-side.
 *   3. Two taps inside the window → collision reset (attempt++, bestRun
 *      recorded), with a post-reset lockout that rejects queued taps.
 *   4. Counting to the target → success broadcast + auto-advance to the
 *      stats reveal with the right numbers.
 *
 * Millisecond-exact boundary cases live in tests/engine/one-voice-pack.test.js
 * (pure adjudicator, injected clock) — sockets have jitter, so this script
 * uses comfortable margins around the 400ms window.
 *
 * Usage: node scripts/simulate-one-voice.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, drainEvent, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-one-voice';
const NUM_PLAYERS = 4;
const SAFE_GAP = 600;   // comfortably outside the 400ms window
const COLLIDE_GAP = 80; // comfortably inside it

const r = makeReporter();

async function run() {
  console.log('\n=== ONE VOICE SIMULATION (scripted tap timings) ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  const [p1, p2, p3, p4] = players;

  try {
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'announce', 8000);
    log('SIM', 'announce: rules');
    await wait(200);
    host.emit('advance-phase', { code });

    // --- phase start ---
    const starts = await waitForEventOnAll(players, 'one-voice-start', 8000);
    await waitForEvent(host, 'one-voice-start', 8000);
    console.log('\n--- count (target 6, window 400ms) ---');
    r.check(starts.every(s => s.target === 6 && s.count === 0), 'start: target 6, count 0 on every screen');

    // 1. P1 taps → count 1, personal confirmation only to P1
    p1.emit('one-voice-tap', { code });
    const c1 = await waitForEvent(host, 'one-voice-count', 5000);
    r.check(c1.count === 1, 'tap 1 counted');
    const you1 = await waitForEvent(p1, 'one-voice-you', 5000);
    r.check(you1.number === 1, "tapper got the personal 'you said 1'");
    await wait(300);
    r.check(!(p2._buffer['one-voice-you'] || []).length, 'nobody else got a personal confirmation');

    // 2. Same player again (well outside the window) → rejected
    await wait(SAFE_GAP);
    p1.emit('one-voice-tap', { code });
    const rej = await waitForEvent(p1, 'one-voice-reject', 5000);
    r.check(rej.reason === 'same-player', 'same-player-twice rejected server-side');
    await wait(200);
    r.check(!(host._buffer['one-voice-count'] || []).length, 'rejected tap did not change the count');

    // 3. P2 taps → count 2
    p2.emit('one-voice-tap', { code });
    const c2 = await waitForEvent(host, 'one-voice-count', 5000);
    r.check(c2.count === 2, 'tap 2 counted');

    // 4. Collision: P3 counts to 3, P4 jumps in 80ms later → reset
    await wait(SAFE_GAP);
    p3.emit('one-voice-tap', { code });
    await wait(COLLIDE_GAP);
    p4.emit('one-voice-tap', { code });
    const c3 = await waitForEvent(host, 'one-voice-count', 5000);
    r.check(c3.count === 3, "P3's tap counted first (count 3)");
    const reset = await waitForEvent(host, 'one-voice-reset', 5000);
    r.check(reset.attempt === 2 && reset.resets === 1, `collision reset → attempt 2 (got attempt ${reset.attempt}, resets ${reset.resets})`);
    r.check(reset.bestRun === 3, `best run recorded as 3 (got ${reset.bestRun})`);
    log('SIM', 'collision! back to one…');

    // 5. Lockout: tapping right after the reset is rejected
    await wait(150);
    p1.emit('one-voice-tap', { code });
    const lockRej = await waitForEvent(p1, 'one-voice-reject', 5000);
    r.check(lockRej.reason === 'lockout', 'post-reset lockout rejects queued taps');

    // 6. After the lockout, alternate players to 6 → success
    await wait(1000);
    drainEvent([host, ...players], 'one-voice-count');
    const order = [p1, p2, p3, p4, p1, p2];
    for (let i = 0; i < order.length; i++) {
      order[i].emit('one-voice-tap', { code });
      const ev = await waitForEvent(host, i < order.length - 1 ? 'one-voice-count' : 'one-voice-success', 5000);
      if (i < order.length - 1) {
        r.check(ev.count === i + 1, `count ${i + 1}`);
      } else {
        r.check(ev.count === 6 && ev.attempt === 2, `SUCCESS at 6 on attempt 2 (got count ${ev.count}, attempt ${ev.attempt})`);
        r.check(ev.bestRun === 6, 'best run is the target');
      }
      await wait(SAFE_GAP);
    }
    const successAll = await waitForEventOnAll(players, 'one-voice-success', 5000);
    r.check(successAll.length === NUM_PLAYERS, 'every player saw the celebration');

    // 7. Auto-advance to the stats reveal (≈4s celebration pause)
    log('SIM', 'waiting out the celebration…');
    const reveals = await waitForEventOnAll(players, 'show-results', 10000);
    console.log('\n--- story ---');
    const content = String(reveals[0].content || '');
    r.check(content.includes('Attempts: 2'), 'story: attempts = 2');
    r.check(content.includes('Restarts: 1'), 'story: restarts = 1');
    r.check(content.includes('Best run: 6'), 'story: best run = 6');
    r.check(names.every(n => !content.includes(n)), 'story: no names anywhere');
    await wait(200);
    host.emit('advance-phase', { code });

    try {
      await waitForEvent(p1, 'game-ended', 8000);
      r.check(true, 'game reached end');
    } catch {
      r.warn('game-ended not observed');
    }
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('ONE VOICE SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
