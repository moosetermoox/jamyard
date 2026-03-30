/**
 * Smoke Test All Games
 *
 * Runs the universal simulator against every game in the /games folder.
 * Reports pass/fail for each game with a summary at the end.
 *
 * Usage:
 *   node scripts/test-all-games.js              # 4 players each (default)
 *   node scripts/test-all-games.js 6            # 6 players each
 *   node scripts/test-all-games.js 4 corn-story # only run corn-story with 4 players
 *
 * Requires server running on localhost:3000
 */

import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = parseInt(process.argv[2]) || 4;
const ONLY_GAME = process.argv[3] || null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIM_SCRIPT = path.join(__dirname, 'simulate-any-game.js');

function runSimulator(gameId, numPlayers) {
  return new Promise((resolve) => {
    var start = Date.now();
    var child = execFile('node', [SIM_SCRIPT, gameId, String(numPlayers)], {
      timeout: 300000, // 5 min per game (AI calls can be slow)
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      var elapsed = ((Date.now() - start) / 1000).toFixed(1);
      var output = stdout + (stderr || '');
      var errorCount = 0;
      var warningCount = 0;
      var phasesVisited = 0;

      // Parse result from output
      var errorMatch = output.match(/(\d+) errors?/);
      var warnMatch = output.match(/(\d+) warnings?/);
      var phaseMatch = output.match(/Phases visited: (\d+)/);
      if (errorMatch) errorCount = parseInt(errorMatch[1]);
      if (warnMatch) warningCount = parseInt(warnMatch[1]);
      if (phaseMatch) phasesVisited = parseInt(phaseMatch[1]);

      // Check for crash
      if (error && error.killed) {
        resolve({ gameId, status: 'timeout', elapsed, errors: 1, warnings: 0, phases: 0, output });
      } else if (error && !errorMatch) {
        resolve({ gameId, status: 'crash', elapsed, errors: 1, warnings: 0, phases: 0, output });
      } else if (errorCount > 0) {
        resolve({ gameId, status: 'fail', elapsed, errors: errorCount, warnings: warningCount, phases: phasesVisited, output });
      } else if (warningCount > 0) {
        resolve({ gameId, status: 'warn', elapsed, errors: 0, warnings: warningCount, phases: phasesVisited, output });
      } else {
        resolve({ gameId, status: 'pass', elapsed, errors: 0, warnings: 0, phases: phasesVisited, output });
      }
    });
  });
}

async function main() {
  // Fetch game list
  var resp;
  try {
    resp = await fetch(`${SERVER}/api/games`);
  } catch (e) {
    console.error('\x1b[31mCannot connect to server. Is it running on port 3000?\x1b[0m');
    console.error('Start it with: npm start');
    process.exit(1);
  }
  var data = await resp.json();
  var games = data.games || [];

  if (ONLY_GAME) {
    games = games.filter(g => g.id === ONLY_GAME);
    if (games.length === 0) {
      console.error(`\x1b[31mGame "${ONLY_GAME}" not found.\x1b[0m`);
      process.exit(1);
    }
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║       SMOKE TEST ALL GAMES               ���`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  Games: ${games.length}`);
  console.log(`  Players per game: ${NUM_PLAYERS}`);
  console.log(`  Timeout per game: 300s\n`);

  var results = [];

  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var label = `[${i + 1}/${games.length}]`;
    process.stdout.write(`${label} ${game.id.padEnd(40)} `);

    var result = await runSimulator(game.id, NUM_PLAYERS);
    results.push(result);

    if (result.status === 'pass') {
      console.log(`\x1b[32m✓ PASS\x1b[0m  (${result.phases} phases, ${result.elapsed}s)`);
    } else if (result.status === 'warn') {
      console.log(`\x1b[33m⚠ WARN\x1b[0m  (${result.warnings} warnings, ${result.phases} phases, ${result.elapsed}s)`);
    } else if (result.status === 'timeout') {
      console.log(`\x1b[31m✗ TIMEOUT\x1b[0m  (killed after ${result.elapsed}s)`);
    } else if (result.status === 'crash') {
      console.log(`\x1b[31m✗ CRASH\x1b[0m  (${result.elapsed}s)`);
    } else {
      console.log(`\x1b[31m✗ FAIL\x1b[0m  (${result.errors} errors, ${result.phases} phases, ${result.elapsed}s)`);
    }
  }

  // Summary
  var passed = results.filter(r => r.status === 'pass').length;
  var warned = results.filter(r => r.status === 'warn').length;
  var failed = results.filter(r => r.status !== 'pass' && r.status !== 'warn').length;

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  RESULTS: ${passed} passed, ${warned} warned, ${failed} failed`);
  console.log(`═══���══════════════════════════════════════`);

  // Show details for failures
  var failures = results.filter(r => r.status !== 'pass' && r.status !== 'warn');
  if (failures.length > 0) {
    console.log(`\n--- FAILURE DETAILS ---\n`);
    for (var f of failures) {
      console.log(`\x1b[31m=== ${f.gameId} (${f.status}) ===\x1b[0m`);
      // Show last 20 lines of output
      var lines = f.output.split('\n');
      var tail = lines.slice(Math.max(0, lines.length - 20));
      console.log(tail.join('\n'));
      console.log('');
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\x1b[31mTest runner crashed:\x1b[0m', err.message);
  process.exit(1);
});
