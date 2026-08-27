/**
 * Pairs/teams bridges simulation (2026-08-26 interop wave 3).
 *
 * Drives games/_sim-groups-bridge with 1 host + 6 players and proves the
 * grouping carries through THREE systems unchanged:
 *
 *   team-split (random, groupSize 2)
 *     → pairwise collect reusePairsFrom:"teams"   (bridge A)
 *     → reveal scope:"pair"                       (existing pair consumer)
 *     → merge groupsFrom:"share"                  (bridge B)
 *     → checklist teamsFrom:"share"               (bridge C: pairs share a list)
 *
 * Checks: every player's pair-reveal partner IS their team-split teammate,
 * every player's merge group IS that same pair (member names + each
 * member's own answer as a named seed), and the pair shares one checklist
 * labeled by both names.
 *
 * Usage: node scripts/simulate-groups-bridge.js   (server must be running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = '_sim-groups-bridge';
const NUM_PLAYERS = 6;

const r = makeReporter();

async function run() {
  console.log('\n=== GROUPS BRIDGE SIMULATION ===\n');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);

  try {
    host.emit('start-game', { code });

    // --- Phase: teams (team-split random, groups of 2) ---
    console.log('\n--- Phase: teams ---');
    const teamEvents = await waitForEventOnAll(players, 'team-split', 8000);
    const teammateOf = {}; // player index -> teammate name
    teamEvents.forEach((ev, i) => {
      const mine = ev.teams[ev.myTeam] || [];
      const partner = mine.find(m => m.name !== names[i]);
      teammateOf[i] = partner ? partner.name : null;
    });
    r.check(teamEvents.every((ev, i) => (ev.teams[ev.myTeam] || []).length === 2),
      'teams: 6 players split into 3 groups of 2');
    host.emit('advance-phase', { code });

    // --- Phase: share (pairwise collect reusing the teams) ---
    console.log('\n--- Phase: share ---');
    const sharePrompts = await waitForEventOnAll(players, 'game-started', 8000);
    r.check(sharePrompts.length === NUM_PLAYERS,
      'share: every player got a prompt (nobody sitting out)');
    players.forEach((p, i) => {
      p.emit('submit-response', { code, response: `Answer from ${names[i]}.` });
    });
    await wait(500);
    host.emit('close-submissions', { code });

    // --- Phase: swap (pair reveal) — partner must be the TEAMMATE ---
    console.log('\n--- Phase: swap ---');
    const reveals = await waitForEventOnAll(players, 'show-results', 8000);
    reveals.forEach((ev, i) => {
      const content = String(ev.content || '');
      r.check(content.includes(`Answer from ${names[i]}.`),
        `${names[i]} sees their own answer`);
      if (teammateOf[i]) {
        r.check(content.includes(`Answer from ${teammateOf[i]}.`),
          `${names[i]}'s reveal partner is their teammate ${teammateOf[i]} (bridge A)`);
        const others = names.filter(n => n !== names[i] && n !== teammateOf[i]);
        r.check(others.every(n => !content.includes(`Answer from ${n}.`)),
          `${names[i]} sees nobody outside their pair`);
      }
    });
    host.emit('advance-phase', { code });

    // --- Phase: write (merge adopting the same groups) ---
    console.log('\n--- Phase: write ---');
    const mergeStarts = await waitForEventOnAll(players, 'merge-start', 8000);
    mergeStarts.forEach((ev, i) => {
      const members = (ev.memberNames || []).slice().sort();
      const expected = [names[i], teammateOf[i]].filter(Boolean).sort();
      r.check(JSON.stringify(members) === JSON.stringify(expected),
        `${names[i]}'s merge group is the same pair (bridge B): [${members.join(', ')}]`);
      const seedTexts = (ev.seeds || []).map(s => s.text);
      r.check(seedTexts.includes(`Answer from ${names[i]}.`),
        `${names[i]}'s merge seeds include their own share answer`);
    });

    // agreeMode "any": one member per group drafts and agrees.
    const drafted = new Set();
    players.forEach((p, i) => {
      const key = [names[i], teammateOf[i]].sort().join('|');
      if (drafted.has(key)) return;
      drafted.add(key);
      p.emit('merge-draft', { code, text: `We agree: ${names[i]} and ${teammateOf[i]} had a good week.` });
      p.emit('merge-agree', { code });
      log(names[i], 'drafted + agreed for their pair');
    });

    // --- Phase: tasks (checklist shared per pair — bridge C) ---
    console.log('\n--- Phase: tasks ---');
    const checklists = await waitForEventOnAll(players, 'checklist-start', 8000);
    checklists.forEach((ev, i) => {
      const lbl = String((ev.group && ev.group.label) || '');
      r.check(lbl.includes(names[i]) && (!teammateOf[i] || lbl.includes(teammateOf[i])),
        `${names[i]}'s checklist is shared with ${teammateOf[i]} (bridge C): "${lbl}"`);
    });

    // --- End --- (first advance closes the checklist into its summary,
    // the second moves on — same host-paced pattern as sort/match)
    host.emit('advance-phase', { code });
    try {
      await waitForEvent(players[0], 'game-ended', 5000);
      r.check(true, 'game reached end phase');
    } catch {
      host.emit('advance-phase', { code });
      await waitForEvent(players[0], 'game-ended', 8000);
      r.check(true, 'game reached end phase (after checklist summary)');
    }
  } catch (err) {
    console.error(`\x1b[31mSimulation error: ${err.message}\x1b[0m`);
    r.errors++;
  } finally {
    r.summary('GROUPS BRIDGE SUMMARY');
    await teardown(host, players);
    process.exit(r.errors > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
