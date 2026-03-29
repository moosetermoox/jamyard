/**
 * Universal Game Simulator
 *
 * Plays through ANY game config by reading the phase types and responding appropriately.
 * Reports errors, unexpected behavior, and phase flow issues.
 *
 * Usage:
 *   node scripts/simulate-any-game.js <game-id> [num-players]
 *   node scripts/simulate-any-game.js caption-contest 5
 *   node scripts/simulate-any-game.js          # lists all games
 *
 * Requires server running on localhost:3000
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const GAME_ID = process.argv[2];
const NUM_PLAYERS = parseInt(process.argv[3]) || 4;
const NAMES = ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack',
               'Kate', 'Leo', 'Mia', 'Nick', 'Olivia', 'Pete', 'Quinn', 'Rose', 'Sam', 'Tina'];

var errors = 0;
var warnings = 0;
var phaseLog = [];

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(who, msg) {
  var ts = new Date().toLocaleTimeString('en-US', { hour12: false });
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

function connect(label) {
  return new Promise((resolve, reject) => {
    var socket = io(SERVER, { forceNew: true });
    socket._buffer = {};
    socket._label = label;
    socket.onAny((event, data) => {
      if (!socket._buffer[event]) socket._buffer[event] = [];
      socket._buffer[event].push(data);
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(new Error(`${label} connect failed: ${err.message}`)));
  });
}

function waitForEvent(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (socket._buffer[event] && socket._buffer[event].length > 0) {
      resolve(socket._buffer[event].shift());
      return;
    }
    var timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout waiting for '${event}'`)); }, timeout);
    var handler = (data) => {
      clearTimeout(timer);
      if (socket._buffer[event]) {
        var idx = socket._buffer[event].indexOf(data);
        if (idx >= 0) socket._buffer[event].splice(idx, 1);
      }
      resolve(data);
    };
    socket.once(event, handler);
  });
}

function waitForAnyPlayerEvent(players, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    for (var i = 0; i < players.length; i++) {
      if (players[i]._buffer[event] && players[i]._buffer[event].length > 0) {
        resolve(players[i]._buffer[event].shift());
        return;
      }
    }
    var timer = setTimeout(() => {
      for (var s of players) s.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' on any player`));
    }, timeout);
    var handler = function (data) {
      clearTimeout(timer);
      for (var s of players) s.off(event, handler);
      resolve(data);
    };
    for (var s of players) s.on(event, handler);
  });
}

function drainEvent(sockets, event) {
  for (var s of sockets) {
    if (s._buffer[event]) s._buffer[event] = [];
  }
}

function drainAll(sockets) {
  for (var s of sockets) {
    s._buffer = {};
  }
}

// Generate a plausible response for a collect prompt
function generateResponse(prompt, playerName, index) {
  var responses = [
    'A magical underwater castle with jellyfish lights and seahorse rides for everyone',
    'A time travel themed party where each room is a different decade with matching music and costumes',
    'A glow-in-the-dark paint party in a warehouse with UV lights and white outfits for everyone to splatter',
    'A mystery dinner where everyone gets a character and has to solve a pretend crime while eating pizza',
    'A retro arcade party with classic video games, neon decorations, and a high score competition',
    'Building the tallest tower out of spaghetti and marshmallows',
    'Dancing penguins on the moon with disco balls',
    'Teaching cats how to do algebra homework',
    'A robot that only speaks in riddles and jokes',
    'Flying tacos raining from the sky during recess'
  ];
  return responses[index % responses.length] + ` - from ${playerName}`;
}

async function run() {
  // If no game ID, list available games
  if (!GAME_ID) {
    try {
      var resp = await fetch(`${SERVER}/api/games`);
      var data = await resp.json();
      console.log('\nAvailable games:\n');
      for (var g of data.games) {
        console.log(`  ${g.id.padEnd(25)} ${g.name} (${g.phaseCount} phases)`);
      }
      console.log(`\nUsage: node scripts/simulate-any-game.js <game-id> [num-players]`);
    } catch (e) {
      console.error('Cannot connect to server. Is it running on port 3000?');
    }
    process.exit(0);
  }

  console.log(`\n=== UNIVERSAL GAME SIMULATOR ===`);
  console.log(`Game: ${GAME_ID}`);
  console.log(`Players: ${NUM_PLAYERS}`);
  console.log(`================================\n`);

  // Connect host + players
  var host = await connect('HOST');
  var players = [];
  for (var i = 0; i < NUM_PLAYERS; i++) {
    players.push(await connect(`P${i + 1}`));
  }
  log('SIM', `Connected: 1 host + ${NUM_PLAYERS} players`);

  // Create room
  host.emit('create-room', { gameId: GAME_ID });
  var roomData;
  try {
    roomData = await waitForEvent(host, 'room-created', 5000);
  } catch (e) {
    console.error(`\x1b[31mFailed to create room. Is "${GAME_ID}" a valid game?\x1b[0m`);
    cleanup(host, players);
    return;
  }
  var code = roomData.code;
  log('HOST', `Room created: ${code}`);
  check(code && code.length > 0, 'Room code received');

  // Join players
  var names = NAMES.slice(0, NUM_PLAYERS);
  for (var i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: names[i] });
    try {
      await waitForEvent(players[i], 'join-success', 3000);
      log(names[i], 'joined');
    } catch (e) {
      console.error(`\x1b[31m${names[i]} failed to join!\x1b[0m`);
      errors++;
    }
  }
  await wait(500);

  // Start game
  console.log('\n--- Starting Game ---');
  host.emit('start-game', { code });

  // Main game loop — react to events
  var gameEnded = false;
  var maxPhases = 100; // safety limit
  var phaseCount = 0;
  var lastEventTime = Date.now();

  while (!gameEnded && phaseCount < maxPhases) {
    phaseCount++;
    var handled = false;

    // Check for game-ended first
    for (var p of players) {
      if (p._buffer['game-ended'] && p._buffer['game-ended'].length > 0) {
        var endData = p._buffer['game-ended'].shift();
        console.log(`\n--- Phase: END ---`);
        log('SIM', `Game ended: ${endData.message || '(no message)'}`);
        gameEnded = true;
        handled = true;
        break;
      }
    }
    if (gameEnded) break;

    // Check for announce (auto-advances with timer)
    try {
      var announceData = await waitForAnyPlayerEvent(players, 'announce', 2000);
      console.log(`\n--- Phase: ANNOUNCE ---`);
      var msgPreview = (announceData.message || '').substring(0, 80);
      log('SIM', `Message: "${msgPreview}${announceData.message && announceData.message.length > 80 ? '...' : ''}"`);
      check(announceData.message && announceData.message.length > 0, 'Announce has message');
      phaseLog.push({ type: 'announce', message: msgPreview });
      drainEvent(players, 'announce');
      drainEvent([host], 'announce');

      // If it has a timer, wait for it; otherwise host advances
      if (announceData.timer) {
        log('SIM', `Waiting ${announceData.timer}s for timer...`);
        await wait((announceData.timer + 1) * 1000);
      } else {
        // Check if there's a continue button — host clicks it
        await wait(1000);
        host.emit('next-phase', { code });
        await wait(500);
      }
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no announce */ }

    // Check for collect (game-started with prompt)
    try {
      var collectData = await waitForAnyPlayerEvent(players, 'game-started', 2000);
      drainEvent(players, 'game-started');

      if (collectData.isChoice) {
        // collect-choice
        console.log(`\n--- Phase: COLLECT-CHOICE ---`);
        log('SIM', `Prompt: "${(collectData.prompt || '').substring(0, 80)}"`);
        check(Array.isArray(collectData.choices), 'Has choices array');
        check(collectData.choices && collectData.choices.length >= 2, `Has ${(collectData.choices || []).length} choices`);
        log('SIM', `Choices: ${(collectData.choices || []).join(', ')}`);
        phaseLog.push({ type: 'collect-choice', prompt: collectData.prompt, choices: collectData.choices });

        // Each player picks a random choice
        for (var i = 0; i < players.length; i++) {
          var choices = collectData.choices || ['A'];
          var pick = choices[i % choices.length];
          players[i].emit('submit-response', { code, response: pick });
          log(names[i], `chose: "${pick}"`);
        }
        await wait(300);
        host.emit('close-submissions', { code });
        log('HOST', 'Closed submissions');
      } else {
        // regular collect
        console.log(`\n--- Phase: COLLECT ---`);
        log('SIM', `Prompt: "${(collectData.prompt || '').substring(0, 80)}"`);
        phaseLog.push({ type: 'collect', prompt: collectData.prompt });

        // Submit responses
        for (var i = 0; i < players.length; i++) {
          var response = generateResponse(collectData.prompt, names[i], i);
          players[i].emit('submit-response', { code, response: response });
          log(names[i], `submitted (${response.length} chars)`);
        }
        await wait(300);
        host.emit('close-submissions', { code });
        log('HOST', 'Closed submissions');
      }
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no collect */ }

    // Check for processing (ai-process)
    try {
      var procData = await waitForAnyPlayerEvent(players, 'processing-started', 2000);
      console.log(`\n--- Phase: AI-PROCESS ---`);
      log('SIM', `Task: ${procData.task || 'unknown'}`);
      phaseLog.push({ type: 'ai-process', task: procData.task });
      drainEvent(players, 'processing-started');

      // AI auto-advances when done. Wait for any next event to appear (up to 60s).
      log('SIM', 'Waiting for AI to finish...');
      var aiDone = false;
      var aiStart = Date.now();
      while (!aiDone && (Date.now() - aiStart) < 60000) {
        await wait(1000);
        // Check if any game event arrived in any player buffer
        var nextEvents = ['game-started', 'announce', 'reveal', 'leaderboard', 'game-ended',
                          'vote-started', 'processing-started', 'preview', 'eliminated', 'winner'];
        for (var p of players) {
          for (var ev of nextEvents) {
            if (p._buffer[ev] && p._buffer[ev].length > 0) { aiDone = true; break; }
          }
          if (aiDone) break;
        }
        // Also check host
        if (!aiDone && host._buffer['preview'] && host._buffer['preview'].length > 0) aiDone = true;
      }
      if (aiDone) {
        log('SIM', `AI finished in ${Math.round((Date.now() - aiStart) / 1000)}s`);
      } else {
        warn('AI did not complete within 60s');
      }
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no processing */ }

    // Check for vote
    try {
      var voteData = await waitForAnyPlayerEvent(players, 'vote-started', 2000);
      console.log(`\n--- Phase: VOTE ---`);
      log('SIM', `Mode: ${voteData.mode || 'unknown'}`);
      phaseLog.push({ type: 'vote', mode: voteData.mode });
      drainEvent(players, 'vote-started');

      if (voteData.mode === 'head-to-head') {
        // Vote on matchups
        for (var i = 0; i < players.length; i++) {
          try {
            var matchup = await waitForEvent(players[i], 'matchup', 3000);
            if (matchup && matchup.options) {
              var pick = matchup.options[0];
              players[i].emit('cast-vote', { code, vote: pick });
              log(names[i], `voted for: "${pick}"`);
            }
          } catch (e) { /* no matchup for this player */ }
        }
      } else {
        // pick-one
        for (var i = 0; i < players.length; i++) {
          try {
            var candidates = voteData.candidates || [];
            if (candidates.length > 0) {
              var pick = candidates[i % candidates.length];
              var voteValue = pick.playerId || pick.name || pick;
              players[i].emit('cast-vote', { code, vote: voteValue });
              log(names[i], `voted for: "${voteValue}"`);
            }
          } catch (e) { /* skip */ }
        }
      }
      await wait(500);
      host.emit('close-voting', { code });
      log('HOST', 'Closed voting');
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no vote */ }

    // Check for leaderboard
    try {
      var lbData = await waitForAnyPlayerEvent(players, 'leaderboard', 2000);
      console.log(`\n--- Phase: LEADERBOARD ---`);
      check(Array.isArray(lbData.standings), 'Has standings array');
      if (lbData.standings) {
        for (var entry of lbData.standings) {
          log('SIM', `  ${entry.rank}. ${entry.name}: ${entry.score} pts`);
        }
      }
      phaseLog.push({ type: 'leaderboard', standings: lbData.standings });
      drainEvent(players, 'leaderboard');
      drainEvent([host], 'leaderboard');

      if (lbData.timer) {
        await wait((lbData.timer + 1) * 1000);
      } else {
        await wait(2000);
        host.emit('next-phase', { code });
      }
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no leaderboard */ }

    // Check for reveal
    try {
      var revealData = await waitForAnyPlayerEvent(players, 'reveal', 2000);
      console.log(`\n--- Phase: REVEAL ---`);
      var content = revealData.content || revealData.template || '(no content)';
      log('SIM', `Content: "${String(content).substring(0, 100)}"`);
      phaseLog.push({ type: 'reveal', content: String(content).substring(0, 100) });
      drainEvent(players, 'reveal');
      drainEvent([host], 'reveal');
      await wait(2000);
      host.emit('next-phase', { code });
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no reveal */ }

    // Check for preview (teacher only)
    try {
      var previewData = await waitForEvent(host, 'preview', 2000);
      console.log(`\n--- Phase: PREVIEW ---`);
      log('HOST', 'Preview received — auto-approving');
      phaseLog.push({ type: 'preview' });
      host.emit('preview-approve', { code });
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no preview */ }

    // Check for eliminate
    try {
      var elimData = await waitForAnyPlayerEvent(players, 'eliminated', 2000);
      console.log(`\n--- Phase: ELIMINATE ---`);
      log('SIM', `Eliminated: ${JSON.stringify(elimData)}`);
      phaseLog.push({ type: 'eliminate' });
      drainEvent(players, 'eliminated');
      drainEvent([host], 'eliminated');
      lastEventTime = Date.now();
      handled = true;
      await wait(3000);
      continue;
    } catch (e) { /* no eliminate */ }

    // Check for winner
    try {
      var winData = await waitForAnyPlayerEvent(players, 'winner', 2000);
      console.log(`\n--- Phase: WINNER ---`);
      log('SIM', `Winner: ${winData.name || winData.winner || JSON.stringify(winData)}`);
      phaseLog.push({ type: 'winner' });
      drainEvent(players, 'winner');
      drainEvent([host], 'winner');
      lastEventTime = Date.now();
      handled = true;
      await wait(3000);
      continue;
    } catch (e) { /* no winner */ }

    // Nothing happened — check if stuck
    if (!handled) {
      var stuckTime = Date.now() - lastEventTime;
      if (stuckTime > 60000) {
        warn(`No events for ${Math.round(stuckTime / 1000)}s — game may be stuck`);
        break;
      }
      // Short wait before retrying
      await wait(1000);
    }
  }

  if (phaseCount >= maxPhases) {
    warn('Hit max phase limit — game may have an infinite loop');
  }

  // Summary
  console.log('\n================================');
  console.log('SIMULATION SUMMARY');
  console.log('================================');
  console.log(`Phases visited: ${phaseLog.length}`);
  for (var i = 0; i < phaseLog.length; i++) {
    var p = phaseLog[i];
    console.log(`  ${i + 1}. ${p.type}${p.task ? ' (' + p.task + ')' : ''}${p.prompt ? ': ' + p.prompt.substring(0, 50) : ''}`);
  }
  console.log(`\nResult: ${errors} errors, ${warnings} warnings`);

  if (errors === 0 && warnings === 0) {
    console.log('\x1b[32m✓ Game completed successfully!\x1b[0m');
  } else if (errors === 0) {
    console.log('\x1b[33m⚠ Game completed with warnings\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Game had errors\x1b[0m');
  }

  cleanup(host, players);
}

function cleanup(host, players) {
  if (host) host.disconnect();
  for (var p of (players || [])) p.disconnect();
  setTimeout(() => process.exit(errors > 0 ? 1 : 0), 500);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
