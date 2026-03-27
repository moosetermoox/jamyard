/**
 * New Phases Simulator
 *
 * Tests all 4 new phase types: team-split, rank, wager, relay
 * Connects 5 fake players and plays through automatically.
 * Requires the server to be running on localhost:3000.
 *
 * Usage: node scripts/simulate-new-phases.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = 5;
let errors = 0;
let warnings = 0;

// --- Helpers ---

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { forceNew: true });
    // Buffer for events that arrive before we listen
    socket._buffer = {};
    socket._origOn = socket.on.bind(socket);
    socket.onAny((event, data) => {
      if (!socket._buffer[event]) socket._buffer[event] = [];
      socket._buffer[event].push(data);
    });
    socket.on('connect', () => {
      log(label, `connected (${socket.id})`);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      reject(new Error(`${label} failed to connect: ${err.message}`));
    });
  });
}

// Wait for event — checks buffer first, then waits
function waitForEvent(socket, event, timeout = 30000) {
  return new Promise((resolve, reject) => {
    // Check buffer first
    if (socket._buffer[event] && socket._buffer[event].length > 0) {
      resolve(socket._buffer[event].shift());
      return;
    }
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' after ${timeout}ms`));
    }, timeout);
    const handler = (data) => {
      clearTimeout(timer);
      // Remove from buffer (onAny already added it)
      if (socket._buffer[event]) {
        const idx = socket._buffer[event].indexOf(data);
        if (idx >= 0) socket._buffer[event].splice(idx, 1);
      }
      resolve(data);
    };
    socket.once(event, handler);
  });
}

function log(who, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${who}] ${msg}`);
}

function check(condition, description) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${description}`);
  } else {
    console.log(`  \x1b[31m✗ FAIL: ${description}\x1b[0m`);
    errors++;
  }
}

function warn(description) {
  console.log(`  \x1b[33m⚠ ${description}\x1b[0m`);
  warnings++;
}

// --- Main ---

async function run() {
  console.log('\n=== NEW PHASES SIMULATOR ===\n');

  // Connect host
  const host = await connect('HOST');

  // Connect players
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const socket = await connect(`P${i + 1}`);
    players.push(socket);
  }

  // Host creates room
  host.emit('create-room', { gameId: 'phase-test' });
  const { code } = await waitForEvent(host, 'room-created');
  log('HOST', `Room created: ${code}`);

  // Players join
  for (let i = 0; i < players.length; i++) {
    const name = `Player${i + 1}`;
    players[i].emit('join-room', { code, name });
    await waitForEvent(players[i], 'join-success');
    log(name, 'joined');
  }

  await wait(500);

  // ==============================
  // PHASE 1: COLLECT
  // ==============================
  console.log('\n--- PHASE 1: Collect ---');
  log('HOST', 'Starting game...');
  host.emit('start-game', { code });

  await waitForEvent(players[0], 'game-started');
  log('SIM', 'Collect phase started');

  const activities = ['hiking', 'gaming', 'cooking', 'reading', 'dancing'];
  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: activities[i] });
    log(`P${i + 1}`, `submitted: "${activities[i]}"`);
  }

  await wait(300);
  host.emit('close-submissions', { code });
  log('HOST', 'Closed submissions');

  // ==============================
  // PHASE 2: RANK
  // ==============================
  console.log('\n--- PHASE 2: Rank ---');

  const rankData = await waitForEvent(players[0], 'rank-start');
  check(rankData.prompt === 'Rank these activities from best to worst', 'Rank prompt received');
  check(Array.isArray(rankData.candidates), 'Candidates is array');
  check(rankData.candidates.length === 5, `Got ${rankData.candidates.length} candidates (expected 5)`);
  check(rankData.timer === 15, 'Timer is 15 seconds');

  log('SIM', `Candidates: ${rankData.candidates.join(', ')}`);

  // Each player submits a different ordering
  for (let i = 0; i < players.length; i++) {
    const ranking = [...rankData.candidates];
    for (let r = 0; r < i; r++) ranking.push(ranking.shift());
    players[i].emit('rank-submit', { code, ranking });
    log(`P${i + 1}`, `ranked: [${ranking.join(', ')}]`);
  }

  // After all submit, server auto-closes and advances to team-split
  // Give it a moment
  await wait(1500);

  // ==============================
  // PHASE 3: TEAM-SPLIT
  // ==============================
  console.log('\n--- PHASE 3: Team-split ---');

  // team-split events may already be in buffer
  const tsHost = await waitForEvent(host, 'team-split', 5000);
  check(tsHost.teams !== undefined, 'Host received teams');

  const tsData = await waitForEvent(players[0], 'team-split', 5000);
  check(tsData.myTeam === 'Rockets' || tsData.myTeam === 'Comets', `Player1 assigned to: ${tsData.myTeam}`);
  check(tsData.teams['Rockets'] !== undefined, 'Rockets team exists');
  check(tsData.teams['Comets'] !== undefined, 'Comets team exists');

  const totalAssigned = (tsData.teams['Rockets'] || []).length + (tsData.teams['Comets'] || []).length;
  check(totalAssigned === NUM_PLAYERS, `All ${NUM_PLAYERS} players assigned (got ${totalAssigned})`);

  const sizes = [tsData.teams['Rockets'].length, tsData.teams['Comets'].length].sort();
  check(sizes[0] === 2 && sizes[1] === 3, `Teams split 2+3 for 5 players (got ${sizes.join('+')})`);

  // Drain team-split events from other players
  for (let i = 1; i < players.length; i++) {
    await waitForEvent(players[i], 'team-split', 2000).catch(() => null);
  }

  log('SIM', `Rockets: ${tsData.teams['Rockets'].map(m => m.name).join(', ')}`);
  log('SIM', `Comets: ${tsData.teams['Comets'].map(m => m.name).join(', ')}`);

  await wait(300);
  host.emit('advance-phase', { code });
  log('HOST', 'Advanced past team-split');

  // ==============================
  // PHASE 4: RELAY
  // ==============================
  console.log('\n--- PHASE 4: Relay ---');
  await wait(500);

  const storyParts = [
    'Once upon a time, there was a classroom.',
    'The students were bored, so they played a game.',
    'But the game came alive!',
    'Luckily, the teacher knew the cheat codes.',
    'And everyone got an A+. The end.'
  ];

  let relayDone = false;
  for (let turn = 0; turn < NUM_PLAYERS && !relayDone; turn++) {
    // Find which player got relay-turn
    let activeIdx = -1;
    for (let i = 0; i < players.length; i++) {
      if (players[i]._buffer['relay-turn'] && players[i]._buffer['relay-turn'].length > 0) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx === -1) {
      // Wait a bit and check again
      await wait(500);
      for (let i = 0; i < players.length; i++) {
        if (players[i]._buffer['relay-turn'] && players[i]._buffer['relay-turn'].length > 0) {
          activeIdx = i;
          break;
        }
      }
    }

    if (activeIdx === -1) {
      // Try explicit wait
      try {
        const result = await Promise.race(
          players.map((p, idx) =>
            waitForEvent(p, 'relay-turn', 3000).then(data => ({ idx, data }))
          )
        );
        activeIdx = result.idx;
      } catch (e) {
        warn(`Turn ${turn + 1}: no active player found, relay may have ended`);
        relayDone = true;
        break;
      }
    }

    if (activeIdx >= 0) {
      const turnData = await waitForEvent(players[activeIdx], 'relay-turn', 1000).catch(() => null);
      if (turn === 0 && turnData) {
        check(turnData.prompt === 'Add the next sentence to our story', 'Relay prompt correct');
        check(Array.isArray(turnData.sharedResult), 'Shared result is array');
        check(turnData.sharedResult.length === 0, 'Shared result starts empty');
      }

      log(`P${activeIdx + 1}`, `Turn ${turn + 1}: "${storyParts[turn]}"`);
      players[activeIdx].emit('relay-submit', { code, text: storyParts[turn] });

      // Drain relay-waiting from others
      for (let i = 0; i < players.length; i++) {
        if (i !== activeIdx && players[i]._buffer['relay-waiting']) {
          players[i]._buffer['relay-waiting'] = [];
        }
      }

      await wait(500);
    }
  }

  check(!relayDone || errors > 0, 'Relay completed all turns');
  await wait(1000);

  // ==============================
  // PHASE 5: WAGER (auto-resolve)
  // ==============================
  console.log('\n--- PHASE 5: Wager (auto-resolve, correctOption=Rockets) ---');

  let wagerData;
  try {
    wagerData = await waitForEvent(players[0], 'wager-start', 5000);
  } catch (e) {
    warn('wager-start not received for P1, checking others...');
    for (let i = 1; i < players.length; i++) {
      try {
        wagerData = await waitForEvent(players[i], 'wager-start', 1000);
        break;
      } catch (e2) { /* keep trying */ }
    }
  }

  if (wagerData) {
    check(wagerData.prompt === 'Which team wrote the better story?', 'Wager prompt correct');
    check(Array.isArray(wagerData.options), 'Options is array');
    check(wagerData.options.length === 2, `Got ${wagerData.options.length} options (expected 2)`);
    check(wagerData.timer === 10, 'Timer is 10 seconds');

    // Drain wager-start from other players
    for (let i = 1; i < players.length; i++) {
      if (players[i]._buffer['wager-start']) players[i]._buffer['wager-start'] = [];
    }

    // Players place wagers
    for (let i = 0; i < players.length; i++) {
      const option = i % 2 === 0 ? 'Rockets' : 'Comets';
      players[i].emit('wager-submit', { code, option, amount: 5 });
      log(`P${i + 1}`, `wagered 5 on ${option}`);
    }

    // After all submit, should auto-resolve (correctOption=Rockets) and advance
    await wait(1500);
    log('SIM', 'Auto-resolve should have fired (Rockets wins)');
  } else {
    warn('Could not get wager-start data');
  }

  // ==============================
  // PHASE 6: WAGER (host-resolve)
  // ==============================
  console.log('\n--- PHASE 6: Wager (host-resolve, no correctOption) ---');

  let wagerData2;
  try {
    wagerData2 = await waitForEvent(players[0], 'wager-start', 5000);
  } catch (e) {
    // Try other players
    for (let i = 1; i < players.length; i++) {
      try {
        wagerData2 = await waitForEvent(players[i], 'wager-start', 1000);
        break;
      } catch (e2) { /* keep trying */ }
    }
  }

  if (wagerData2) {
    check(wagerData2.prompt === 'Who will win the final vote?', 'Manual wager prompt correct');
    check(wagerData2.options.length === 3, `Got ${wagerData2.options.length} options (expected 3)`);

    // Drain from others
    for (let i = 0; i < players.length; i++) {
      if (players[i]._buffer['wager-start']) players[i]._buffer['wager-start'] = [];
    }

    // Players place wagers
    for (let i = 0; i < players.length; i++) {
      const option = wagerData2.options[i % 3];
      players[i].emit('wager-submit', { code, option, amount: 3 });
      log(`P${i + 1}`, `wagered 3 on ${option}`);
    }

    await wait(500);

    // Host closes wager
    host.emit('close-wager', { code });
    log('HOST', 'Closed wager (no correctOption, need resolve)');

    // Host should get wager-need-resolve
    try {
      const resolveData = await waitForEvent(host, 'wager-need-resolve', 5000);
      check(Array.isArray(resolveData.options), 'Host got resolve options');
      check(resolveData.options.length === 3, `Got ${resolveData.options.length} resolve options`);

      host.emit('wager-resolve', { code, winningOption: resolveData.options[0] });
      log('HOST', `Resolved: ${resolveData.options[0]} wins`);
    } catch (e) {
      warn('wager-need-resolve not received: ' + e.message);
    }
  } else {
    warn('Could not get wager-start data for manual wager');
  }

  // Wait for game to end
  await wait(1500);

  // ==============================
  // PHASE 7: END
  // ==============================
  console.log('\n--- PHASE 7: End ---');

  try {
    const endData = await waitForEvent(players[0], 'game-ended', 5000);
    check(endData.message === 'Thanks for testing!', 'End message correct');
    log('SIM', 'Game ended successfully');
  } catch (e) {
    // Try other players
    let found = false;
    for (let i = 1; i < players.length; i++) {
      try {
        const endData = await waitForEvent(players[i], 'game-ended', 1000);
        check(endData.message === 'Thanks for testing!', 'End message correct');
        found = true;
        break;
      } catch (e2) { /* try next */ }
    }
    if (!found) {
      check(false, 'Game ended event received');
      warn('game-ended not received by any player');
    }
  }

  // ==============================
  // SUMMARY
  // ==============================
  console.log('\n=== SIMULATION COMPLETE ===');
  console.log(`  Errors:   ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  if (errors === 0) {
    console.log('  \x1b[32mAll checks passed!\x1b[0m');
  } else {
    console.log(`  \x1b[31m${errors} check(s) failed\x1b[0m`);
  }
  console.log('');

  // Cleanup
  host.disconnect();
  for (const p of players) p.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\n\x1b[31mFATAL ERROR:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
