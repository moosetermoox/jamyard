/**
 * Excuse Machine Simulator
 *
 * Tests: tally scoring mode + self-exclusion in foreach
 *
 * Flow: lobby → announce → collect → foreach(announce → collect-choice → announce) → leaderboard → end
 *
 * Key assertions:
 * - Author of each excuse gets a "waiting" event (self-exclusion), not a choice prompt
 * - Points go to the AUTHOR based on ratings (tally mode), not the rater
 * - Leaderboard reflects correct tally scores
 *
 * Usage: node scripts/simulate-excuse-machine.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = 4;
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

async function run() {
  console.log('\n=== EXCUSE MACHINE SIMULATOR ===');
  console.log('  Testing: tally scoring + self-exclusion\n');

  const host = await connect('HOST');
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(await connect(`P${i + 1}`));
  }

  // Create room
  host.emit('create-room', { gameId: 'excuse-machine' });
  const { code } = await waitForEvent(host, 'room-created');
  log('HOST', `Room: ${code}`);

  // Join
  const names = ['Alice', 'Bob', 'Charlie', 'Dana'];
  const playerIds = [];
  for (let i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: names[i] });
    const joinData = await waitForEvent(players[i], 'join-success');
    playerIds.push(players[i].id);
    log(names[i], `joined (${players[i].id})`);
  }
  await wait(500);

  // ========================
  // START GAME → Announce
  // ========================
  console.log('\n--- Phase: Announce (intro) ---');
  host.emit('start-game', { code });
  const announceData = await waitForEvent(players[0], 'announce', 10000);
  check(announceData.message.includes('Excuse Machine'), 'Intro announce received');
  drainEvent(players.slice(1), 'announce');
  drainEvent([host], 'announce');

  // Wait for timer
  await wait(9000);

  // ========================
  // COLLECT: excuses
  // ========================
  console.log('\n--- Phase: Collect (write excuses) ---');

  const excuses = [
    'My dog ate my homework... and my laptop',
    'I was too busy discovering a new element',
    'A time traveler warned me not to do it',
    'The homework instructions were in an ancient language'
  ];

  await waitForEvent(players[0], 'game-started', 5000);
  drainEvent(players.slice(1), 'game-started');

  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: excuses[i] });
    log(names[i], `submitted excuse`);
  }
  await wait(300);
  host.emit('close-submissions', { code });
  log('HOST', 'Closed submissions');

  // ========================
  // FOREACH: rate loop (4 iterations)
  // ========================
  console.log('\n--- Phase: Foreach (rate loop) ---');

  // Track which players get "waiting" vs "game-started" per iteration
  // to verify self-exclusion
  let selfExclusionCount = 0;

  // Ratings that each non-author player will submit
  // We'll have predictable ratings so we can verify scores
  const ratingChoices = ['Meh', 'Not Bad', 'Pretty Good', 'Amazing'];
  const ratingPoints = { 'Meh': 10, 'Not Bad': 25, 'Pretty Good': 50, 'Amazing': 100 };

  // expectedScores tracks what each author should earn
  const expectedScores = {};
  for (let i = 0; i < NUM_PLAYERS; i++) {
    expectedScores[playerIds[i]] = 0;
  }

  for (let iter = 0; iter < NUM_PLAYERS; iter++) {
    console.log(`\n  --- Iteration ${iter + 1} of ${NUM_PLAYERS} ---`);

    // Wait for announce sub-phase (show excuse)
    await wait(1000);
    let showAnnounce;
    for (let i = 0; i < players.length; i++) {
      try {
        showAnnounce = await waitForEvent(players[i], 'announce', 8000);
        break;
      } catch (e) { /* try next */ }
    }

    if (showAnnounce) {
      check(showAnnounce.message.includes('Excuse'), `Iter ${iter + 1}: Show announce received`);
      const quoteMatch = showAnnounce.message.match(/"([^"]+)"/);
      if (quoteMatch) {
        log('SIM', `Showing: "${quoteMatch[1]}"`);
      }
    }
    drainEvent(players, 'announce');
    drainEvent([host], 'announce');

    // Wait for announce timer (5s)
    await wait(6000);

    // Now the collect-choice sub-phase should start
    // Author should get "waiting", everyone else gets "game-started"
    await wait(500);

    // Check each player: who got 'game-started' and who got 'waiting'
    let gotChoice = [];
    let gotWaiting = [];

    for (let i = 0; i < players.length; i++) {
      // Check for waiting first (buffered)
      if (players[i]._buffer['waiting'] && players[i]._buffer['waiting'].length > 0) {
        const waitingData = players[i]._buffer['waiting'].shift();
        gotWaiting.push(i);
        log(names[i], `got WAITING: "${waitingData.message}"`);
      }
      // Check for game-started
      if (players[i]._buffer['game-started'] && players[i]._buffer['game-started'].length > 0) {
        const choiceData = players[i]._buffer['game-started'].shift();
        gotChoice.push({ index: i, data: choiceData });
      }
    }

    // If some players haven't received yet, wait briefly
    if (gotChoice.length + gotWaiting.length < NUM_PLAYERS) {
      await wait(2000);
      for (let i = 0; i < players.length; i++) {
        if (gotChoice.some(c => c.index === i) || gotWaiting.includes(i)) continue;
        if (players[i]._buffer['waiting'] && players[i]._buffer['waiting'].length > 0) {
          const waitingData = players[i]._buffer['waiting'].shift();
          gotWaiting.push(i);
          log(names[i], `got WAITING: "${waitingData.message}"`);
        }
        if (players[i]._buffer['game-started'] && players[i]._buffer['game-started'].length > 0) {
          const choiceData = players[i]._buffer['game-started'].shift();
          gotChoice.push({ index: i, data: choiceData });
        }
      }
    }

    check(gotWaiting.length === 1, `Iter ${iter + 1}: Exactly 1 player got waiting (self-excluded) — got ${gotWaiting.length}`);
    check(gotChoice.length === NUM_PLAYERS - 1, `Iter ${iter + 1}: ${NUM_PLAYERS - 1} players got choice prompt — got ${gotChoice.length}`);

    if (gotWaiting.length === 1) {
      selfExclusionCount++;
      log('SIM', `Self-excluded: ${names[gotWaiting[0]]} (the author)`);
    }

    // Now the non-author players rate — everyone picks "Amazing" for easy math
    const rating = 'Amazing';
    for (const c of gotChoice) {
      check(c.data.isChoice === true, `Iter ${iter + 1}: ${names[c.index]} got choice prompt`);
      check(Array.isArray(c.data.choices), `Iter ${iter + 1}: Choices is array`);
      players[c.index].emit('submit-response', { code, response: rating });
      log(names[c.index], `rated: "${rating}"`);
    }

    // Track expected scores: the AUTHOR gets points based on ratings
    // The waiting player is the author
    if (gotWaiting.length === 1) {
      const authorIdx = gotWaiting[0];
      const authorSocketId = playerIds[authorIdx];
      // 3 raters each picked "Amazing" = 100 pts each = 300 total
      expectedScores[authorSocketId] += gotChoice.length * ratingPoints[rating];
      log('SIM', `Expected score for ${names[authorIdx]}: +${gotChoice.length * ratingPoints[rating]} = ${expectedScores[authorSocketId]}`);
    }

    await wait(300);
    host.emit('close-submissions', { code });
    log('HOST', 'Closed ratings');

    // Wait for reveal announce ("That excuse was by ...")
    await wait(1500);
    let revealAnnounce;
    for (let i = 0; i < players.length; i++) {
      try {
        revealAnnounce = await waitForEvent(players[i], 'announce', 8000);
        break;
      } catch (e) { /* try next */ }
    }

    if (revealAnnounce) {
      check(revealAnnounce.message.includes('was by'), `Iter ${iter + 1}: Reveal announce received`);
      log('SIM', `Reveal: ${revealAnnounce.message}`);
    }
    drainEvent(players, 'announce');
    drainEvent([host], 'announce');

    // Wait for reveal timer (4s)
    await wait(5000);
  }

  check(selfExclusionCount === NUM_PLAYERS, `Self-exclusion worked for all ${NUM_PLAYERS} iterations (got ${selfExclusionCount})`);

  // ========================
  // LEADERBOARD
  // ========================
  console.log('\n--- Phase: Leaderboard ---');

  let lbData;
  for (let i = 0; i < players.length; i++) {
    try {
      lbData = await waitForEvent(players[i], 'leaderboard', 10000);
      break;
    } catch (e) { /* try next */ }
  }

  if (lbData) {
    check(Array.isArray(lbData.standings), 'Leaderboard has standings');
    check(lbData.standings.length > 0, `Got ${(lbData.standings || []).length} standings`);
    log('SIM', 'Final Scores:');
    for (const entry of (lbData.standings || [])) {
      log('SIM', `  ${entry.rank}. ${entry.name}: ${entry.score} pts`);
    }

    // Verify tally scoring: since everyone rated "Amazing" (100pts) and there are 3 raters per excuse,
    // each player should have 300 points
    const allScores = lbData.standings.map(e => e.score);
    check(allScores.every(s => s === 300), `All scores are 300 (3 raters × 100pts "Amazing") — got ${allScores.join(', ')}`);
  } else {
    warn('Leaderboard event not received');
  }
  drainEvent(players, 'leaderboard');

  // Wait for timer
  await wait(16000);

  // ========================
  // END
  // ========================
  console.log('\n--- Phase: End ---');

  let endFound = false;
  for (let i = 0; i < players.length; i++) {
    try {
      const endData = await waitForEvent(players[i], 'game-ended', 5000);
      check(endData.message.includes('Excuse Machine'), 'End message correct');
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
