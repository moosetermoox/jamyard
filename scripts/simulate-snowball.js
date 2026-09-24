/**
 * Snowball — full-game simulation (Connection Pack Phase 3).
 *
 * Drives games/snowball with 1 host + 5 players (odd class → one triple)
 * and asserts the merge phase's contract (docs/connection-pack-spec.md §3):
 *
 *   1. Everyone answers alone first; merge groups then carry each member's
 *      own seed (with their name) into the shared screen.
 *   2. Live draft sync: one member types, the others receive the text
 *      (last-write-wins).
 *   3. Editing after an Agree resets the agreement.
 *   4. agreeMode "both": a group submits only when every member agrees.
 *   5. Host force-close: a stalled group's current draft still submits.
 *   6. The class reveal lists merged answers without player names.
 *
 * Usage: node scripts/simulate-snowball.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = 'snowball';
const NUM_PLAYERS = 5;

const r = makeReporter();

async function run() {
  console.log('\n=== SNOWBALL SIMULATION (5 players — pair + triple) ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    host.emit('start-game', { code });

    // --- intro announce ---
    await waitForEventOnAll(players, 'announce', 8000);
    log('SIM', 'announce: intro');
    await wait(200);
    host.emit('advance-phase', { code });

    // --- solo collect ---
    const soloPrompts = await waitForEventOnAll(players, 'game-started', 8000);
    console.log('\n--- solo ---');
    r.check(soloPrompts.every(p => (p.prompt || '').includes('most important idea')), 'solo: prompt delivered');
    const soloAnswers = names.map(n => `Norm idea from ${n}: respect speaking turns.`);
    players.forEach((p, i) => p.emit('submit-response', { code, response: soloAnswers[i] }));
    await wait(500);
    host.emit('close-submissions', { code });

    // --- merge ---
    const mergeStarts = await waitForEventOnAll(players, 'merge-start', 8000);
    const hostProgress = await waitForEvent(host, 'merge-progress', 8000);
    console.log('\n--- pairs (merge) ---');
    r.check(hostProgress.totalGroups === 2, `host sees 2 groups (got ${hostProgress.totalGroups})`);

    // Group partition from memberNames
    const groupKeyOf = i => [...(mergeStarts[i].memberNames || [])].sort().join('+');
    const groupsByKey = new Map();
    mergeStarts.forEach((ev, i) => {
      const k = groupKeyOf(i);
      if (!groupsByKey.has(k)) groupsByKey.set(k, []);
      groupsByKey.get(k).push(i);
    });
    const groups = [...groupsByKey.values()];
    const sizes = groups.map(g => g.length).sort();
    r.check(JSON.stringify(sizes) === JSON.stringify([2, 3]),
      `merge groups: one pair + one triple (got sizes ${sizes.join(',')})`);

    // 1. Seeds carry each member's own answer with their name
    let seedsOk = true;
    mergeStarts.forEach((ev, i) => {
      const mySeed = (ev.seeds || []).find(s => s.author === names[i]);
      if (!mySeed || !mySeed.text.includes(`from ${names[i]}`)) seedsOk = false;
    });
    r.check(seedsOk, 'merge: every member sees their own seed with their name');

    const pairIdx = groups.find(g => g.length === 2);
    const tripleIdx = groups.find(g => g.length === 3);
    const [pa, pb] = pairIdx;

    // 2. Draft sync: pa types, pb receives the update
    const pairDraft = 'Respect speaking turns and start on time.';
    players[pa].emit('merge-draft', { code, text: pairDraft });
    const update = await waitForEvent(players[pb], 'merge-draft-update', 5000);
    r.check(update.draft === pairDraft, 'draft sync: partner received the shared text');

    // 3 + 4. Agree flow: pa agrees (1 of 2) → pb edits (reset) → both agree → submitted
    players[pa].emit('merge-agree', { code });
    const status1 = await waitForEvent(players[pb], 'merge-status', 5000);
    r.check(status1.agreedCount === 1 && status1.agreesNeeded === 2,
      `agree: 1 of 2 after first agree (got ${status1.agreedCount}/${status1.agreesNeeded})`);

    const editedDraft = pairDraft + ' And help each other.';
    players[pb].emit('merge-draft', { code, text: editedDraft });
    const resetUpdate = await waitForEvent(players[pa], 'merge-draft-update', 5000);
    r.check(resetUpdate.agreedCount === 0, 'agree: editing the draft resets agreements');

    players[pa].emit('merge-agree', { code });
    players[pb].emit('merge-agree', { code });
    const pairWaiting = await waitForEvent(players[pa], 'waiting', 5000);
    r.check(/Merged/.test(pairWaiting.message || ''), 'agree: both agreed → pair submitted');
    const progress1 = await waitForEvent(host, 'merge-progress', 5000);
    r.check(progress1.submittedGroups === 1, `host progress: 1 of 2 groups merged`);

    // 5. The triple writes a draft but never fully agrees — host force-closes
    const tripleDraft = 'Listen first, then speak — all three of us agree on that.';
    players[tripleIdx[0]].emit('merge-draft', { code, text: tripleDraft });
    await wait(300);
    players[tripleIdx[0]].emit('merge-agree', { code }); // 1 of 3 — stalled
    await wait(300);
    log('HOST', 'force-closing merge (one group stalled)');
    host.emit('close-merge', { code });

    // --- share (reveal) ---
    const reveals = await waitForEventOnAll(players, 'show-results', 8000);
    console.log('\n--- share ---');
    const content = String(reveals[0].content || '');
    r.check(content.includes(editedDraft), 'reveal: the pair\'s agreed answer appears');
    r.check(content.includes(tripleDraft), 'reveal: the force-closed triple\'s draft appears');
    r.check(names.every(n => !content.includes(n)), 'reveal: merged answers are anonymous (no names)');
    r.check(reveals.every(ev => String(ev.content || '') === content), 'reveal: whole class sees the same list');
    await wait(200);
    host.emit('advance-phase', { code });

    // --- end ---
    try {
      const ended = await waitForEvent(players[0], 'game-ended', 8000);
      r.check(String(ended.message || '').includes('built by all of us'), 'end: closing copy reached');
    } catch {
      r.warn('game-ended not observed');
    }
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('SNOWBALL SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
