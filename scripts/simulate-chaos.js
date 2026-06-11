/**
 * Chaos suite — school-wifi conditions against every phase type.
 *
 * Runs the robot playtest with chaos mode on (services/simulator.js):
 * players randomly drop and reconnect mid-phase, ghosts join with dead
 * tokens, stale/malformed/duplicate events are sprayed at the server —
 * and the games must STILL complete with every reconnect recognized.
 *
 * The game list deliberately covers all interactive phase types without
 * AI calls (chaos repetition + real Anthropic spend don't mix):
 *   lightning-round  buzz, estimate, leaderboard
 *   story-quest      branching votes, announce
 *   snowball         collect, merge, reveal
 *   one-voice        one-voice
 *   dream-vacation   collect, rank, team-split, relay, wager, leaderboard
 *   charades-bowl    collect ×3, team-split, turn ×3
 *
 * Usage (server must be running):
 *   node scripts/simulate-chaos.js                 # full suite
 *   node scripts/simulate-chaos.js lightning-round # one game
 *   node scripts/simulate-chaos.js --players 20
 */

import { simulateGame } from '../services/simulator.js';

const SERVER = process.env.SIM_SERVER || 'http://localhost:3000';

const DEFAULT_SUITE = [
  'lightning-round',
  'story-quest',
  'snowball',
  'one-voice',
  'dream-vacation',
  'charades-bowl'
];

// Some games are legitimately long under chaos (server-authoritative turn
// timers × 12 players × 3 rounds for charades; 30s estimate timers ×2).
const TIME_BUDGETS = {
  'charades-bowl': 480000,
  'lightning-round': 300000
};
const DEFAULT_BUDGET = 150000;

// Per-game overrides for chaos rate / roster size, when a game genuinely
// needs them. (Charades turned out NOT to: its 480s "timeout" was a sim
// bug — duplicate phrases deduped by a once-key — and it now finishes in
// ~25s under full chaos.)
const CHAOS_INTERVALS = {};
const PLAYER_OVERRIDES = {};

const args = process.argv.slice(2);
const playersIdx = args.indexOf('--players');
const NUM_PLAYERS = playersIdx !== -1 ? parseInt(args[playersIdx + 1], 10) : 12;
const games = args.filter(a => !a.startsWith('--') && a !== String(NUM_PLAYERS));
const SUITE = games.length ? games : DEFAULT_SUITE;

let totalErrors = 0;
let totalWarnings = 0;

console.log(`\n=== CHAOS SUITE (${NUM_PLAYERS} flaky players) ===`);

for (const gameId of SUITE) {
  console.log(`\n--- ${gameId} ---`);
  const t0 = Date.now();
  let result;
  try {
    result = await simulateGame({
      serverUrl: SERVER,
      gameId,
      numPlayers: PLAYER_OVERRIDES[gameId] || NUM_PLAYERS,
      timeLimitMs: TIME_BUDGETS[gameId] || DEFAULT_BUDGET,
      stallMs: 15000,
      chaos: true,
      chaosIntervalMs: CHAOS_INTERVALS[gameId] || 600
    });
  } catch (err) {
    console.log(`\x1b[31m  ✗ Simulation itself crashed: ${err.message}\x1b[0m`);
    totalErrors++;
    continue;
  }

  const cs = result.chaosStats || {};
  console.log(`  ${result.completed ? '\x1b[32m✓ completed\x1b[0m' : '\x1b[31m✗ DID NOT COMPLETE\x1b[0m'} in ${Math.round(result.durationMs / 1000)}s — ` +
    `${result.phaseLog.length} phases | reconnects ${cs.reconnects || 0} (failed ${cs.reconnectFailures || 0}), ` +
    `ghosts ${cs.ghosts || 0}, stale ${cs.staleSpam || 0}, malformed ${cs.malformed || 0}`);

  if (!result.completed) totalErrors++;

  for (const f of result.findings) {
    if (f.severity === 'error') {
      totalErrors++;
      console.log(`  \x1b[31m✗ ${f.message}\x1b[0m`);
    } else {
      totalWarnings++;
      console.log(`  \x1b[33m⚠ ${f.message}\x1b[0m`);
    }
  }

  // Server still healthy after the abuse?
  try {
    const r = await fetch(`${SERVER}/api/games`);
    if (!r.ok) throw new Error(`status ${r.status}`);
  } catch (e) {
    totalErrors++;
    console.log(`  \x1b[31m✗ SERVER UNHEALTHY after ${gameId}: ${e.message}\x1b[0m`);
    break;
  }
  void t0;
}

console.log(`\n================================`);
console.log(`CHAOS RESULT: ${totalErrors} errors, ${totalWarnings} warnings`);
if (totalErrors > 0) {
  console.log('\x1b[31m✗ The server did not survive school wifi\x1b[0m');
  process.exit(1);
}
console.log('\x1b[32m✓ Every game completed under chaos\x1b[0m');
process.exit(0);
