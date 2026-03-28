/**
 * Who Said It? Simulator
 *
 * Plays through: lobby → announce → collect → foreach(announce → collect-choice → announce) → leaderboard → end
 *
 * Usage: node scripts/simulate-who-said-it.js
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

function waitForAnyEvent(sockets, event, timeout = 15000) {
  // Return the first socket that receives the event + the data
  return new Promise((resolve, reject) => {
    // Check buffers first
    for (let i = 0; i < sockets.length; i++) {
      if (sockets[i]._buffer[event] && sockets[i]._buffer[event].length > 0) {
        resolve({ index: i, data: sockets[i]._buffer[event].shift() });
        return;
      }
    }
    const timer = setTimeout(() => {
      for (const s of sockets) s.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' on any socket after ${timeout}ms`));
    }, timeout);
    const handler = function(data) {
      clearTimeout(timer);
      const idx = sockets.indexOf(this);
      for (const s of sockets) s.off(event, handler);
      resolve({ index: idx, data });
    };
    for (const s of sockets) s.on(event, handler);
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
  console.log('\n=== WHO SAID IT? SIMULATOR ===\n');

  const host = await connect('HOST');
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(await connect(`P${i + 1}`));
  }

  // Create room
  host.emit('create-room', { gameId: 'who-said-it' });
  const { code } = await waitForEvent(host, 'room-created');
  log('HOST', `Room: ${code}`);

  // Join
  const names = ['Alice', 'Bob', 'Charlie', 'Dana'];
  for (let i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: names[i] });
    await waitForEvent(players[i], 'join-success');
    log(names[i], 'joined');
  }
  await wait(500);

  // ========================
  // START GAME → Announce
  // ========================
  console.log('\n--- Phase: Announce (intro) ---');
  host.emit('start-game', { code });
  const announceData = await waitForEvent(players[0], 'announce', 10000);
  check(announceData.message.includes('Get ready'), 'Intro announce received');
  drainEvent(players.slice(1), 'announce');
  drainEvent([host], 'announce');

  // Wait for timer
  await wait(6000);

  // ========================
  // COLLECT: answers
  // ========================
  console.log('\n--- Phase: Collect (answers) ---');

  const answers = ['fried crickets', 'durian fruit', 'raw octopus', 'chocolate ants'];
  // Wait for collect prompt
  await waitForEvent(players[0], 'game-started', 5000);
  drainEvent(players.slice(1), 'game-started');

  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: answers[i] });
    log(names[i], `submitted: "${answers[i]}"`);
  }
  await wait(300);
  host.emit('close-submissions', { code });
  log('HOST', 'Closed submissions');

  // ========================
  // FOREACH: guess loop (4 iterations)
  // ========================
  console.log('\n--- Phase: Foreach (guess loop) ---');

  for (let iter = 0; iter < NUM_PLAYERS; iter++) {
    console.log(`\n  --- Iteration ${iter + 1} of ${NUM_PLAYERS} ---`);

    // Wait for announce sub-phase ("Someone said: ...")
    await wait(1000);
    let showAnnounce;
    for (let i = 0; i < players.length; i++) {
      try {
        showAnnounce = await waitForEvent(players[i], 'announce', 8000);
        break;
      } catch (e) { /* try next */ }
    }

    if (showAnnounce) {
      check(showAnnounce.message.includes('Someone said'), `Iter ${iter + 1}: Show announce received`);
      const quoteMatch = showAnnounce.message.match(/"([^"]+)"/);
      if (quoteMatch) {
        log('SIM', `Showing: "${quoteMatch[1]}"`);
      }
    } else {
      warn(`Iter ${iter + 1}: show announce not captured`);
    }
    drainEvent(players, 'announce');
    drainEvent([host], 'announce');

    // Wait for announce timer (5s)
    await wait(6000);

    // Wait for collect-choice sub-phase
    let choiceData;
    for (let i = 0; i < players.length; i++) {
      try {
        choiceData = await waitForEvent(players[i], 'game-started', 5000);
        break;
      } catch (e) { /* try next */ }
    }

    if (choiceData) {
      check(choiceData.isChoice === true, `Iter ${iter + 1}: Got choice prompt`);
      check(Array.isArray(choiceData.choices), `Iter ${iter + 1}: Choices is array`);
      check(choiceData.choices.length > 1, `Iter ${iter + 1}: Has ${choiceData.choices.length} choices`);
      log('SIM', `Choices: ${choiceData.choices.join(', ')}`);
      drainEvent(players, 'game-started');
      drainEvent([host], 'game-started');

      // Everyone picks the first choice (some will be right, some wrong)
      for (let i = 0; i < players.length; i++) {
        const pick = choiceData.choices[i % choiceData.choices.length];
        players[i].emit('submit-response', { code, response: pick });
        log(names[i], `guessed: "${pick}"`);
      }

      await wait(300);
      host.emit('close-submissions', { code });
      log('HOST', 'Closed guesses');
    } else {
      warn(`Iter ${iter + 1}: choice prompt not captured`);
    }

    // Wait for reveal announce ("It was ...!")
    await wait(1500);
    let revealAnnounce;
    for (let i = 0; i < players.length; i++) {
      try {
        revealAnnounce = await waitForEvent(players[i], 'announce', 8000);
        break;
      } catch (e) { /* try next */ }
    }

    if (revealAnnounce) {
      check(revealAnnounce.message.includes('It was'), `Iter ${iter + 1}: Reveal announce received`);
      log('SIM', `Reveal: ${revealAnnounce.message}`);
    } else {
      warn(`Iter ${iter + 1}: reveal announce not captured`);
    }
    drainEvent(players, 'announce');
    drainEvent([host], 'announce');

    // Wait for reveal timer (5s)
    await wait(6000);
  }

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
      check(endData.message.includes('Who Said It'), 'End message correct');
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
