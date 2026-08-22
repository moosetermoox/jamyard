/**
 * Merge pen — one-writer-at-a-time acceptance run.
 *
 * Drives games/snowball (collect -> merge) with 1 host + 4 players (two
 * pairs) and asserts the pen contract on the shared draft:
 *
 *   1. Writing claims the pen: the partner is told who holds it.
 *   2. A raced write while the pen is fresh is REJECTED: the group draft
 *      is unchanged and the racer's box gets snapped back to the truth.
 *   3. merge-take-pen while the holder is fresh is denied.
 *   4. After the idle window, merge-take-pen is granted and the new
 *      holder's writes go through.
 *   5. Agreeing releases the pen immediately (no idle wait for a partner
 *      to refine), and the refine-then-both-agree flow still submits.
 *
 * Usage: node scripts/simulate-merge-pen.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = 'snowball';
const NUM_PLAYERS = 4;
const PEN_IDLE_MS = 2500; // mirrors MERGE_PEN_IDLE_MS in server.js

const r = makeReporter();

async function expectNoEvent(socket, event, label, ms = 700) {
  await wait(ms);
  const got = (socket._buffer[event] || []).length;
  r.check(got === 0, label);
  socket._buffer[event] = [];
}

async function run() {
  console.log('\n=== MERGE PEN SIMULATION (snowball, 4 players) ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'announce', 8000);
    await wait(200);
    host.emit('advance-phase', { code });

    // --- solo collect: everyone answers so merge has seeds ---
    await waitForEventOnAll(players, 'game-started', 8000);
    players.forEach((p, i) => p.emit('submit-response', { code, response: `Idea number ${i + 1} from ${names[i]}.` }));
    await wait(500);
    host.emit('close-submissions', { code });

    // --- merge: find one pair via matching memberNames ---
    const starts = await waitForEventOnAll(players, 'merge-start', 8000);
    console.log('\n--- merge (pen contract) ---');
    const groupOf = i => starts[i].memberNames.slice().sort().join('|');
    const a = 0;
    const b = players.findIndex((p, i) => i !== a && groupOf(i) === groupOf(a));
    r.check(b > 0, `players ${names[a]} and ${names[b]} are one group`);
    const [pa, pb] = [players[a], players[b]];

    // 1. Writing claims the pen
    pa.emit('merge-draft', { code, text: 'First draft from the scribe.' });
    const update1 = await waitForEvent(pb, 'merge-draft-update', 5000);
    r.check(update1.draft === 'First draft from the scribe.', 'partner received the draft');
    const pen1 = await waitForEvent(pb, 'merge-pen', 5000);
    r.check(pen1.held === true && pen1.mine === false && pen1.holderName === names[a],
      `partner told ${names[a]} holds the pen`);
    const pen1a = await waitForEvent(pa, 'merge-pen', 5000);
    r.check(pen1a.mine === true, 'writer told the pen is theirs');

    // 2. Raced write while the pen is fresh: rejected + snapped back
    pb.emit('merge-draft', { code, text: 'Interrupting text that must not land.' });
    const snap = await waitForEvent(pb, 'merge-draft-update', 5000);
    r.check(snap.draft === 'First draft from the scribe.', 'racer snapped back to the shared truth');
    const snapPen = await waitForEvent(pb, 'merge-pen', 5000); // rejection restates who holds it
    r.check(snapPen.held && !snapPen.mine, 'rejection restates the pen holder');
    await expectNoEvent(pa, 'merge-draft-update', 'holder never saw the rejected write');

    // 3. Take-pen while fresh: denied
    pa.emit('merge-draft', { code, text: 'First draft from the scribe, extended.' });
    await waitForEvent(pb, 'merge-draft-update', 5000);
    pb.emit('merge-take-pen', { code });
    const denied = await waitForEvent(pb, 'merge-pen', 5000);
    r.check(denied.held === true && denied.mine === false, 'take-pen while the holder is fresh is denied');

    // 4. After the idle window, take-pen is granted and writes go through
    log('SIM', `waiting out the ${PEN_IDLE_MS}ms idle window...`);
    await wait(PEN_IDLE_MS + 300);
    pb.emit('merge-take-pen', { code });
    const granted = await waitForEvent(pb, 'merge-pen', 5000);
    r.check(granted.mine === true, 'take-pen after idle is granted');
    const handoff = await waitForEvent(pa, 'merge-pen', 5000); // old holder learns too
    r.check(handoff.held && !handoff.mine && handoff.holderName === names[b],
      'old holder told the pen moved');
    pb.emit('merge-draft', { code, text: 'Now the partner refines the draft.' });
    const update2 = await waitForEvent(pa, 'merge-draft-update', 5000);
    r.check(update2.draft === 'Now the partner refines the draft.', 'new holder\'s writes go through');

    // 5. Agree releases the pen immediately; refine + both agree submits
    pb.emit('merge-agree', { code });
    const released = await waitForEvent(pa, 'merge-pen', 5000);
    r.check(released.held === false, 'agreeing releases the pen for the partner');
    pa.emit('merge-draft', { code, text: 'Final shared answer, no idle wait needed.' });
    const update3 = await waitForEvent(pb, 'merge-draft-update', 5000);
    r.check(update3.draft === 'Final shared answer, no idle wait needed.',
      'released pen: partner writes immediately (no idle wait)');
    pa.emit('merge-agree', { code });
    pb.emit('merge-agree', { code });
    const done = await waitForEvent(pa, 'waiting', 5000);
    r.check(/Merged/.test(done.message || ''), 'both agreed after the pen dance, group submitted');
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('MERGE PEN SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
