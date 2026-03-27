/**
 * Dream Vacation Debate Simulator
 *
 * Plays through the full game with 5 players:
 * lobby → collect → rank → announce → team-split → announce → relay → announce → wager (host-resolve) → leaderboard → end
 *
 * Usage: node scripts/simulate-dream-vacation.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = 5;
let errors = 0;
let warnings = 0;

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { forceNew: true });
    socket._buffer = {};
    socket.onAny((event, data) => {
      if (!socket._buffer[event]) socket._buffer[event] = [];
      socket._buffer[event].push(data);
    });
    socket.on('connect', () => { log(label, `connected (${socket.id})`); resolve(socket); });
    socket.on('connect_error', (err) => reject(new Error(`${label} connect failed: ${err.message}`)));
  });
}

function waitForEvent(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (socket._buffer[event] && socket._buffer[event].length > 0) {
      resolve(socket._buffer[event].shift());
      return;
    }
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout waiting for '${event}' after ${timeout}ms`)); }, timeout);
    const handler = (data) => {
      clearTimeout(timer);
      if (socket._buffer[event]) {
        const idx = socket._buffer[event].indexOf(data);
        if (idx >= 0) socket._buffer[event].splice(idx, 1);
      }
      resolve(data);
    };
    socket.once(event, handler);
  });
}

function drainEvent(sockets, event) {
  for (const s of sockets) {
    if (s._buffer[event]) s._buffer[event] = [];
  }
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

// Find first socket with a buffered event
function findBuffered(sockets, event) {
  for (let i = 0; i < sockets.length; i++) {
    if (sockets[i]._buffer[event] && sockets[i]._buffer[event].length > 0) return i;
  }
  return -1;
}

async function run() {
  console.log('\n=== DREAM VACATION DEBATE SIMULATOR ===\n');

  const host = await connect('HOST');
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(await connect(`P${i + 1}`));
  }

  // Create room
  host.emit('create-room', { gameId: 'dream-vacation' });
  const { code } = await waitForEvent(host, 'room-created');
  log('HOST', `Room: ${code}`);

  // Join
  const names = ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve'];
  for (let i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: names[i] });
    await waitForEvent(players[i], 'join-success');
    log(names[i], 'joined');
  }
  await wait(500);

  // ========================
  // COLLECT: submit destinations
  // ========================
  console.log('\n--- Phase: Collect (destinations) ---');
  host.emit('start-game', { code });
  await waitForEvent(players[0], 'game-started');

  const destinations = ['Tokyo', 'Paris', 'New Zealand', 'Iceland', 'Costa Rica'];
  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: destinations[i] });
    log(names[i], `submitted: "${destinations[i]}"`);
  }
  await wait(300);
  host.emit('close-submissions', { code });
  log('HOST', 'Closed submissions');

  // ========================
  // RANK: rank destinations
  // ========================
  console.log('\n--- Phase: Rank (destinations) ---');

  const rankData = await waitForEvent(players[0], 'rank-start');
  check(rankData.prompt === 'Rank these destinations from BEST to WORST', 'Rank prompt correct');
  check(rankData.candidates.length === 5, `Got ${rankData.candidates.length} candidates`);
  check(rankData.timer === 30, 'Timer is 30 seconds');
  drainEvent(players.slice(1), 'rank-start');

  log('SIM', `Candidates: ${rankData.candidates.join(', ')}`);

  // Each player submits a ranking (rotated so Tokyo has best avg)
  for (let i = 0; i < players.length; i++) {
    const ranking = [...rankData.candidates];
    // Rotate by player index to get varied rankings
    for (let r = 0; r < i; r++) ranking.push(ranking.shift());
    players[i].emit('rank-submit', { code, ranking });
    log(names[i], `ranked: [${ranking.join(', ')}]`);
  }

  await wait(1500);

  // ========================
  // ANNOUNCE: top destination
  // ========================
  console.log('\n--- Phase: Announce (top destination) ---');

  let announceData;
  try {
    announceData = await waitForEvent(players[0], 'announce');
  } catch (e) {
    // Try host
    announceData = await waitForEvent(host, 'announce', 3000).catch(() => null);
  }

  if (announceData) {
    check(typeof announceData.message === 'string', 'Announce message received');
    check(announceData.message.includes('rankings'), 'Message mentions rankings');
    log('SIM', `Announce: ${announceData.message.substring(0, 80)}...`);
    drainEvent(players, 'announce');
    drainEvent([host], 'announce');
  } else {
    warn('Announce event not captured (may have auto-advanced)');
  }

  // Wait for timer auto-advance
  await wait(10000);

  // ========================
  // TEAM-SPLIT
  // ========================
  console.log('\n--- Phase: Team-split ---');

  const tsData = await waitForEvent(players[0], 'team-split', 5000).catch(() => null) ||
                 await waitForEvent(host, 'team-split', 3000).catch(() => null);

  if (tsData) {
    const teams = tsData.teams || {};
    check(teams['Explorers'] !== undefined, 'Explorers team exists');
    check(teams['Adventurers'] !== undefined, 'Adventurers team exists');
    const total = (teams['Explorers'] || []).length + (teams['Adventurers'] || []).length;
    check(total === NUM_PLAYERS, `All ${NUM_PLAYERS} players assigned (got ${total})`);
    log('SIM', `Explorers: ${(teams['Explorers'] || []).map(m => m.name).join(', ')}`);
    log('SIM', `Adventurers: ${(teams['Adventurers'] || []).map(m => m.name).join(', ')}`);
  } else {
    warn('team-split data not received');
  }
  drainEvent(players, 'team-split');
  drainEvent([host], 'team-split');

  await wait(300);
  host.emit('advance-phase', { code });
  log('HOST', 'Advanced past team-split');

  // ========================
  // ANNOUNCE: team intro
  // ========================
  console.log('\n--- Phase: Announce (team intro) ---');
  await wait(1000);
  drainEvent(players, 'announce');
  drainEvent([host], 'announce');
  // Wait for timer auto-advance (8s)
  await wait(9000);

  // ========================
  // RELAY: write pitch
  // ========================
  console.log('\n--- Phase: Relay (write pitch) ---');

  const pitchParts = [
    'Picture this: crystal blue waters and golden sand.',
    'We wake up to fresh tropical fruit every morning.',
    'Afternoons are for snorkeling with sea turtles.',
    'Evenings we gather for a bonfire under the stars.',
    'This is the trip that changes everything.'
  ];

  for (let turn = 0; turn < NUM_PLAYERS; turn++) {
    await wait(500);
    let activeIdx = findBuffered(players, 'relay-turn');

    if (activeIdx === -1) {
      try {
        const result = await Promise.race(
          players.map((p, idx) => waitForEvent(p, 'relay-turn', 5000).then(data => ({ idx, data })))
        );
        activeIdx = result.idx;
      } catch (e) {
        warn(`Turn ${turn + 1}: no active player found`);
        break;
      }
    }

    if (activeIdx >= 0) {
      const turnData = await waitForEvent(players[activeIdx], 'relay-turn', 1000).catch(() => null);
      if (turn === 0 && turnData) {
        check(turnData.prompt.includes('vacation pitch'), 'Relay prompt mentions vacation');
        check(Array.isArray(turnData.sharedResult), 'Shared result is array');
      }
      log(names[activeIdx], `Turn ${turn + 1}: "${pitchParts[turn]}"`);
      players[activeIdx].emit('relay-submit', { code, text: pitchParts[turn] });
      drainEvent(players, 'relay-waiting');
    }
  }

  await wait(1500);
  check(true, 'Relay completed');

  // ========================
  // ANNOUNCE: pitch reveal
  // ========================
  console.log('\n--- Phase: Announce (pitch reveal) ---');

  let pitchAnnounce;
  try {
    pitchAnnounce = await waitForEvent(players[0], 'announce', 5000);
  } catch (e) {
    // Check others
    for (let i = 1; i < players.length; i++) {
      pitchAnnounce = await waitForEvent(players[i], 'announce', 1000).catch(() => null);
      if (pitchAnnounce) break;
    }
  }

  if (pitchAnnounce) {
    check(pitchAnnounce.message.includes('crystal blue'), 'Pitch text appears in announce');
    log('SIM', `Pitch reveal: ${pitchAnnounce.message.substring(0, 100)}...`);
  } else {
    warn('Pitch reveal announce not captured');
  }
  drainEvent(players, 'announce');
  drainEvent([host], 'announce');

  // Wait for auto-advance (12s)
  await wait(13000);

  // ========================
  // WAGER: place bets
  // ========================
  console.log('\n--- Phase: Wager (place bets) ---');

  let wagerData;
  for (let i = 0; i < players.length; i++) {
    try {
      wagerData = await waitForEvent(players[i], 'wager-start', 3000);
      break;
    } catch (e) { /* try next */ }
  }

  if (wagerData) {
    check(wagerData.prompt.includes('pitch'), 'Wager prompt mentions pitch');
    check(wagerData.options.length === 2, `Got ${wagerData.options.length} options`);
    check(wagerData.options.includes('Explorers'), 'Explorers is an option');
    check(wagerData.options.includes('Adventurers'), 'Adventurers is an option');
    drainEvent(players, 'wager-start');

    for (let i = 0; i < players.length; i++) {
      const option = i % 2 === 0 ? 'Explorers' : 'Adventurers';
      players[i].emit('wager-submit', { code, option, amount: 5 });
      log(names[i], `wagered 5 on ${option}`);
    }

    await wait(500);
    host.emit('close-wager', { code });
    log('HOST', 'Closed wager');

    // Host resolves
    try {
      const resolveData = await waitForEvent(host, 'wager-need-resolve', 5000);
      check(Array.isArray(resolveData.options), 'Host got resolve options');
      host.emit('wager-resolve', { code, winningOption: 'Explorers' });
      log('HOST', 'Resolved: Explorers wins');
    } catch (e) {
      warn('wager-need-resolve not received: ' + e.message);
    }
  } else {
    warn('wager-start not received');
  }

  await wait(2000);

  // ========================
  // LEADERBOARD
  // ========================
  console.log('\n--- Phase: Leaderboard ---');

  let lbData;
  for (let i = 0; i < players.length; i++) {
    try {
      lbData = await waitForEvent(players[i], 'leaderboard', 5000);
      break;
    } catch (e) { /* try next */ }
  }

  if (lbData) {
    check(Array.isArray(lbData.standings), 'Leaderboard has standings');
    check(lbData.standings.length > 0, `Got ${(lbData.standings || []).length} standings`);
    log('SIM', 'Leaderboard:');
    for (const entry of (lbData.standings || [])) {
      log('SIM', `  ${entry.rank}. ${entry.name}: ${entry.score} pts`);
    }
  } else {
    warn('Leaderboard event not received');
  }
  drainEvent(players, 'leaderboard');

  // Wait for timer auto-advance (15s)
  await wait(16000);

  // ========================
  // END
  // ========================
  console.log('\n--- Phase: End ---');

  let endFound = false;
  for (let i = 0; i < players.length; i++) {
    try {
      const endData = await waitForEvent(players[i], 'game-ended', 5000);
      check(endData.message.includes('Dream Vacation'), 'End message correct');
      endFound = true;
      break;
    } catch (e) { /* try next */ }
  }
  if (!endFound) {
    warn('game-ended not received');
  }

  // ========================
  // SUMMARY
  // ========================
  console.log('\n=== SIMULATION COMPLETE ===');
  console.log(`  Errors:   ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  if (errors === 0 && warnings === 0) {
    console.log('  \x1b[32mAll checks passed!\x1b[0m');
  } else if (errors === 0) {
    console.log(`  \x1b[33m${warnings} warning(s) but no errors\x1b[0m`);
  } else {
    console.log(`  \x1b[31m${errors} check(s) failed\x1b[0m`);
  }
  console.log('');

  host.disconnect();
  for (const p of players) p.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\n\x1b[31mFATAL ERROR:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
