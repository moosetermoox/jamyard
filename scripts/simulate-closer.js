/**
 * Closer — full-game simulation (Connection Pack Phase 2).
 *
 * Drives games/closer (compiled from recipes/closer.json defaults) with
 * 1 host + 5 players — an ODD class, so the triple path is exercised —
 * and asserts the spec's pairing guarantees (docs/connection-pack-spec.md §2):
 *
 *   1. Triple: with 5 players nobody sits out — one pair + one group of 3.
 *   2. Reuse: prompts 2-3 of a tier keep the same partner as prompt 1.
 *   3. Rotation: tier 2's pair (the 2-person group) is never a repeat of a
 *      tier-1 partnership.
 *   4. Pass: a tier-3 pass renders as the neutral listen-card for the
 *      partner; the projected ticker stays nameless.
 *   5. Checkout: the one-word reveal lists words without names.
 *
 * Usage: node scripts/simulate-closer.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';
import { pairKey } from '../engine/phases/pairing.js';

const GAME_ID = 'closer';
const NUM_PLAYERS = 5;

const r = makeReporter();

// Identify groups from a reveal: pair members receive identical content.
function groupsFromReveals(reveals) {
  const byContent = new Map();
  reveals.forEach((ev, i) => {
    const key = String(ev.content || '');
    if (!byContent.has(key)) byContent.set(key, []);
    byContent.get(key).push(i);
  });
  return [...byContent.values()];
}

function partnerKeysOf(groups) {
  const keys = new Set();
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) keys.add(pairKey(String(g[i]), String(g[j])));
    }
  }
  return keys;
}

async function advancePastAnnounce(host, players, code, label) {
  await waitForEventOnAll(players, 'announce', 8000);
  log('SIM', `announce: ${label}`);
  await wait(200);
  host.emit('advance-phase', { code });
}

async function run() {
  console.log('\n=== CLOSER SIMULATION (5 players — triple class) ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    host.emit('start-game', { code });
    await advancePastAnnounce(host, players, code, 'welcome');

    const tierGroups = {}; // roundId -> groups (arrays of player indices)

    // One pair round: everyone answers (or passerIdx passes), close, read
    // the pair reveal, advance. Returns the group partition.
    async function pairRound(roundId, expectedPromptPart, passerIdx = -1) {
      const started = await waitForEventOnAll(players, 'game-started', 10000);
      console.log(`\n--- ${roundId} ---`);
      r.check(started.length === NUM_PLAYERS, `${roundId}: all ${NUM_PLAYERS} players got a prompt (nobody benched)`);
      if (expectedPromptPart) {
        r.check(started.every(s => (s.prompt || '').includes(expectedPromptPart)),
          `${roundId}: prompt is "${expectedPromptPart}..."`);
      }
      r.check(started.every(s => s.passAllowed === true), `${roundId}: passAllowed on`);

      players.forEach((p, i) => {
        if (i === passerIdx) {
          p.emit('submit-response', { code, response: '', pass: true });
          log(names[i], 'PASSED');
        } else {
          p.emit('submit-response', { code, response: `My honest answer for ${roundId} from ${names[i]}.` });
        }
      });
      await wait(500);
      host.emit('close-submissions', { code });

      const reveals = await waitForEventOnAll(players, 'show-results', 10000);
      await waitForEvent(host, 'show-results', 10000);
      const groups = groupsFromReveals(reveals);
      tierGroups[roundId] = groups;

      await wait(200);
      host.emit('advance-phase', { code });
      return { started, reveals, groups };
    }

    // ---- Tier 1 ----
    await advancePastAnnounce(host, players, code, 'tier 1 intro');
    const t1q1 = await pairRound('t1q1', 'Window seat');
    {
      const sizes = t1q1.groups.map(g => g.length).sort();
      r.check(JSON.stringify(sizes) === JSON.stringify([2, 3]),
        `t1q1: one pair + one triple (got sizes ${sizes.join(',')})`);
    }
    const t1q2 = await pairRound('t1q2', 'class had a mascot');
    r.check(
      JSON.stringify(t1q1.groups.map(g => [...g].sort()).sort()) ===
      JSON.stringify(t1q2.groups.map(g => [...g].sort()).sort()),
      't1q2: same partners as t1q1 (reusePairsFrom)'
    );
    await pairRound('t1q3', 'teleport');

    // ---- Tier 2 ----
    await advancePastAnnounce(host, players, code, 'tier 2 intro');
    const t2q1 = await pairRound('t2q1', 'changed your mind');
    {
      const t1Keys = partnerKeysOf(t1q1.groups);
      const t2Pairs = t2q1.groups.filter(g => g.length === 2);
      const repeated = t2Pairs.filter(g => t1Keys.has(pairKey(String(g[0]), String(g[1]))));
      r.check(repeated.length === 0,
        't2q1: no tier-2 pair repeats a tier-1 partnership (rotatePairsFrom)');
    }
    await pairRound('t2q2', 'good friend');
    await pairRound('t2q3', 'compliment');

    // ---- Tier 3 (player 5 passes the first prompt) ----
    await advancePastAnnounce(host, players, code, 'tier 3 intro');
    const PASSER = 4; // Eve
    const t3q1 = await pairRound('t3q1', 'proud of', PASSER);
    {
      const passerName = names[PASSER];
      const passerGroup = t3q1.groups.find(g => g.includes(PASSER));
      const partnerIdx = passerGroup.find(i => i !== PASSER);
      const partnerContent = String(t3q1.reveals[partnerIdx].content || '');
      r.check(partnerContent.includes(`${passerName} chose to listen this round`),
        `t3q1: ${passerName}'s pass renders as the neutral listen-card`);
      // No other group sees the passer at all
      t3q1.groups.filter(g => !g.includes(PASSER)).forEach(g => {
        g.forEach(i => {
          r.check(!String(t3q1.reveals[i].content || '').includes(passerName),
            `t3q1: ${names[i]} (other group) sees nothing about ${passerName}`);
        });
      });
    }
    await pairRound('t3q2', 'thank one person');
    await pairRound('t3q3', 'remember in ten years');

    // ---- Checkout (whole class, anonymous list) ----
    const checkout = await waitForEventOnAll(players, 'game-started', 10000);
    console.log('\n--- checkout ---');
    r.check(checkout.every(s => (s.prompt || '').includes('one word')), 'checkout: prompt delivered');
    const words = ['connected', 'seen', 'calm', 'curious', 'lighter'];
    players.forEach((p, i) => p.emit('submit-response', { code, response: words[i] }));
    await wait(500);
    host.emit('close-submissions', { code });

    const checkoutReveals = await waitForEventOnAll(players, 'show-results', 10000);
    const checkoutContent = String(checkoutReveals[0].content || '');
    r.check(words.every(w => checkoutContent.includes(w)), 'checkout: all words shown');
    r.check(names.every(n => !checkoutContent.includes(n)), 'checkout: list is anonymous (no names)');
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
