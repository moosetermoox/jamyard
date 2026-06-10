/**
 * Connection Pack — shared-infrastructure simulation.
 *
 * Drives games/_sim-connection-slice (pairwise collect with passAllowed +
 * simultaneousReveal → pair-scoped reveal) with 1 host + 4 players and
 * asserts the privacy/anonymity invariants from docs/connection-pack-spec.md:
 *
 *   1. The Pass button counts toward all-submitted (the step can close).
 *   2. A pass is never publicly attributable: the projected ticker carries
 *      no names while simultaneousReveal is on, and the passer renders as
 *      the same neutral card a missing answer would.
 *   3. Pair reveal: each player sees ONLY their own pair's answers.
 *   4. The host (projected) screen never shows pair-private answers.
 *
 * Usage: node scripts/simulate-connection-slice.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, drainEvent, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-connection-slice';
const NUM_PLAYERS = 4;
const PASSER_INDEX = 3; // Dana passes

const r = makeReporter();

async function run() {
  console.log('\n=== CONNECTION SLICE SIMULATION ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    // --- Start ---
    host.emit('start-game', { code });

    // --- Phase: seed (plain collect, everyone writes a question) ---
    const seedPrompts = await waitForEventOnAll(players, 'game-started', 8000);
    console.log('\n--- Phase: seed ---');
    r.check(seedPrompts.every(p => !p.passAllowed), 'seed: passAllowed not enabled');
    const questions = [
      'What is a small thing that made you smile this week?',
      'If you could instantly learn one skill, what would it be?',
      'What food could you eat every day without getting tired of it?',
      'What is the best class trip you can imagine?'
    ];
    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: questions[i] });
      log(names[i], 'submitted a question');
    });
    await wait(400);
    drainEvent([host], 'response-received');
    host.emit('close-submissions', { code });

    // --- Phase: answer (pairwise + passAllowed + simultaneousReveal) ---
    const answerPrompts = await waitForEventOnAll(players, 'game-started', 8000);
    console.log('\n--- Phase: answer ---');
    r.check(answerPrompts.every(p => p.passAllowed === true), 'answer: passAllowed flag delivered to players');
    r.check(answerPrompts.every(p => !p.prompt.includes('{{seed.assigned}}')),
      'answer: {{seed.assigned}} resolved per player (no literal token)');

    // 3 players answer, 1 passes
    const answers = [
      'Honestly, finishing my project early made me smile.',
      'I would learn to play the drums overnight.',
      'Tacos. Every single day. No regrets.'
    ];
    players.forEach((p, i) => {
      if (i === PASSER_INDEX) {
        p.emit('submit-response', { code, response: '', pass: true });
        log(names[i], 'PASSED');
      } else {
        p.emit('submit-response', { code, response: answers[i] });
        log(names[i], 'answered');
      }
    });
    await wait(600);

    // simultaneousReveal: every projected ticker event must be nameless,
    // and the pass must count toward 4/4.
    const tickerEvents = host._buffer['response-received'] || [];
    r.check(tickerEvents.length === NUM_PLAYERS, `ticker: ${tickerEvents.length}/${NUM_PLAYERS} events received`);
    r.check(tickerEvents.every(e => e.playerName == null), 'ticker: no names while simultaneousReveal is on');
    const finalCount = tickerEvents.length ? tickerEvents[tickerEvents.length - 1] : { count: 0, total: 0 };
    r.check(finalCount.count === NUM_PLAYERS && finalCount.total === NUM_PLAYERS,
      `pass counts toward all-submitted (${finalCount.count}/${finalCount.total})`);

    host.emit('close-submissions', { code });

    // --- Phase: share (pair-scoped reveal) ---
    console.log('\n--- Phase: share ---');
    const hostReveal = await waitForEvent(host, 'show-results', 8000);
    const playerReveals = await waitForEventOnAll(players, 'show-results', 8000);

    // Host screen is projected: must never contain any student answer or the
    // passer's status.
    const hostContent = String(hostReveal.content || '');
    r.check(!answers.some(a => hostContent.includes(a)), 'host screen shows no pair-private answers');
    r.check(!hostContent.includes('chose to listen'), 'host screen shows no pass status');

    // Work out the pairing from what each player sees: a player's content
    // names exactly the members of their own pair.
    const passerName = names[PASSER_INDEX];
    let partnerOfPasserIdx = -1;
    playerReveals.forEach((ev, i) => {
      if (i !== PASSER_INDEX && String(ev.content || '').includes(passerName)) {
        partnerOfPasserIdx = i;
      }
    });
    r.check(partnerOfPasserIdx >= 0, `someone is paired with ${passerName}`);

    if (partnerOfPasserIdx >= 0) {
      const partnerContent = String(playerReveals[partnerOfPasserIdx].content || '');
      r.check(partnerContent.includes(`${passerName} chose to listen this round`),
        "passer renders as the neutral 'chose to listen' card for their partner");
      r.check(!partnerContent.includes('{{_pair'), 'no literal {{_pair.*}} tokens in pair content');
      r.check(partnerContent.includes('Your pair\'s question:'), 'template text present ({{_pair.prompt}} substituted)');
    }

    // Cross-pair privacy: players NOT paired with the passer must see no
    // mention of the passer at all (no name, no listen-card).
    playerReveals.forEach((ev, i) => {
      if (i === PASSER_INDEX || i === partnerOfPasserIdx) return;
      const content = String(ev.content || '');
      r.check(!content.includes(passerName), `${names[i]} (other pair) sees nothing about ${passerName}`);
    });

    // Each non-passer's answer appears ONLY on their own pair's screens.
    // Pair members receive identical content, so content equality identifies
    // "same pair".
    playerReveals.forEach((ev, viewerIdx) => {
      const content = String(ev.content || '');
      answers.forEach((answer, authorIdx) => {
        const samePair = String(playerReveals[authorIdx].content || '') === content;
        const viewerSees = content.includes(answer);
        if (samePair) {
          r.check(viewerSees, `${names[viewerIdx]} sees own-pair answer from ${names[authorIdx]}`);
        } else {
          r.check(!viewerSees, `${names[viewerIdx]} does NOT see other-pair answer from ${names[authorIdx]}`);
        }
      });
    });

    // --- Advance to end ---
    host.emit('advance-phase', { code });
    try {
      await waitForEvent(players[0], 'game-ended', 8000);
      r.check(true, 'game reached end phase');
    } catch {
      r.warn('game-ended not observed (host advance may use a different event for this phase)');
    }
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('CONNECTION SLICE SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
