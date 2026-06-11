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

// Connection/event primitives live in the shared harness so every
// simulate-*.js script (and scripted-timing tests) reuses one implementation.
import {
  DEFAULT_SERVER, PLAYER_NAMES,
  wait, log, connect, waitForEvent, waitForAnyPlayerEvent, drainEvent,
  makeReporter
} from './sim-harness.js';

const SERVER = DEFAULT_SERVER;
const GAME_ID = process.argv[2];
const NUM_PLAYERS = parseInt(process.argv[3]) || 4;
const NAMES = PLAYER_NAMES;

const reporter = makeReporter();
var phaseLog = [];

function check(condition, description) { reporter.check(condition, description); }
function warn(description) { reporter.warn(description); }

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
      reporter.errors++;
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
        host.emit('advance-phase', { code });
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

    // Check for buzz (buzzer round)
    try {
      var buzzData = await waitForAnyPlayerEvent(players, 'buzz-start', 2000);
      console.log(`\n--- Phase: BUZZ ---`);
      log('SIM', `Prompt: "${(buzzData.prompt || '').substring(0, 60)}"`);
      phaseLog.push({ type: 'buzz' });
      drainEvent(players, 'buzz-start');
      drainEvent([host], 'buzz-start');

      // P1 buzzes and is judged wrong; P2 buzzes and is judged right; finish.
      players[0].emit('buzz-tap', { code });
      await wait(250);
      host.emit('buzz-judge', { code, correct: false });
      await wait(250);
      players[1 % players.length].emit('buzz-tap', { code });
      await wait(250);
      host.emit('buzz-judge', { code, correct: true });
      var buzzResult = await waitForAnyPlayerEvent(players, 'buzz-result', 2000).catch(function () { return null; });
      check(!!buzzResult, 'Buzz judged and broadcast');
      drainEvent(players, 'buzz-result');
      await wait(250);
      host.emit('buzz-finish', { code });
      log('HOST', 'Finished buzzer round');
      lastEventTime = Date.now();
      handled = true;
      await wait(500);
      continue;
    } catch (e) { /* no buzz */ }

    // Check for estimate (guess the number)
    try {
      var estData = await waitForAnyPlayerEvent(players, 'estimate-start', 2000);
      console.log(`\n--- Phase: ESTIMATE ---`);
      log('SIM', `Prompt: "${(estData.prompt || '').substring(0, 60)}"`);
      phaseLog.push({ type: 'estimate' });
      drainEvent(players, 'estimate-start');
      drainEvent([host], 'estimate-start');

      for (var ei = 0; ei < players.length; ei++) {
        players[ei].emit('estimate-submit', { code, value: 20 + ei * 13 });
        log(names[ei], `guessed ${20 + ei * 13}`);
      }
      await wait(400);
      host.emit('close-estimates', { code });
      var estResults = await waitForAnyPlayerEvent(players, 'estimate-results', 3000).catch(function () { return null; });
      check(!!estResults, 'Estimate results broadcast');
      if (estResults && estResults.answer != null) {
        check(Array.isArray(estResults.guesses) && estResults.guesses.length === players.length, 'All guesses in results');
      }
      drainEvent(players, 'estimate-results');
      await wait(400);
      host.emit('advance-phase', { code });
      lastEventTime = Date.now();
      handled = true;
      await wait(500);
      continue;
    } catch (e) { /* no estimate */ }

    // Check for processing (ai-process)
    try {
      var procData = await waitForAnyPlayerEvent(players, 'processing-started', 2000);
      console.log(`\n--- Phase: AI-PROCESS ---`);
      log('SIM', `Task: ${procData.task || 'unknown'}`);
      phaseLog.push({ type: 'ai-process', task: procData.task });
      drainEvent(players, 'processing-started');

      // AI auto-advances when done. Wait for any next event to appear (up to 120s).
      log('SIM', 'Waiting for AI to finish...');
      var aiDone = false;
      var aiStart = Date.now();
      while (!aiDone && (Date.now() - aiStart) < 120000) {
        await wait(1000);
        // Check if any game event arrived in any player buffer
        var nextEvents = ['game-started', 'announce', 'show-results', 'leaderboard', 'game-ended',
                          'vote-start', 'processing-started', 'preview', 'eliminated', 'winner',
                          'waiting', 'team-split', 'rank-start', 'wager-start', 'relay-turn'];
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
        warn('AI did not complete within 120s');
      }
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no processing */ }

    // Check for vote
    try {
      var voteData = await waitForAnyPlayerEvent(players, 'vote-start', 2000);
      console.log(`\n--- Phase: VOTE ---`);
      log('SIM', `Mode: ${voteData.mode || 'unknown'}`);
      phaseLog.push({ type: 'vote', mode: voteData.mode });

      // Each player got their own vote-start payload (matchups differ per
      // voter) — read each buffer entry before draining.
      for (var i = 0; i < players.length; i++) {
        var myVote = (players[i]._buffer['vote-start'] && players[i]._buffer['vote-start'][0]) || voteData;
        if (myVote.mode === 'head-to-head') {
          var ms = myVote.matchups || [];
          var h2hVotes = ms.map(function (m) {
            var c = Math.random() < 0.5 ? m.optionA : m.optionB;
            return { choice: (c && c.playerId) ? c.playerId : c };
          });
          if (h2hVotes.length > 0) {
            players[i].emit('submit-vote', { code, votes: h2hVotes });
            log(names[i], `voted on ${h2hVotes.length} matchup(s)`);
          }
        } else {
          var candidates = myVote.candidates || [];
          if (candidates.length > 0) {
            var pick = candidates[i % candidates.length];
            // Literal option lists (branching votes) are strings — the string IS the choice
            var choice = (pick && pick.playerId) ? pick.playerId : pick;
            players[i].emit('submit-vote', { code, choice: choice });
            log(names[i], `voted for: "${typeof pick === 'string' ? pick : (pick.text || pick.name || choice)}"`);
          }
        }
      }
      drainEvent(players, 'vote-start');
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
        host.emit('advance-phase', { code });
      }
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no leaderboard */ }

    // Check for reveal
    try {
      var revealData = await waitForAnyPlayerEvent(players, 'show-results', 2000);
      console.log(`\n--- Phase: REVEAL ---`);
      var content = revealData.content || revealData.template || '(no content)';
      log('SIM', `Content: "${String(content).substring(0, 100)}"`);
      phaseLog.push({ type: 'reveal', content: String(content).substring(0, 100) });
      drainEvent(players, 'show-results');
      drainEvent([host], 'show-results');
      await wait(2000);
      host.emit('advance-phase', { code });
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

    // Check for team-split
    try {
      var tsData = await waitForAnyPlayerEvent(players, 'team-split', 2000);
      console.log(`\n--- Phase: TEAM-SPLIT ---`);
      check(tsData.myTeam, `Player assigned to team: ${tsData.myTeam}`);
      if (tsData.teams) {
        var teamNames = Object.keys(tsData.teams);
        for (var tn of teamNames) {
          log('SIM', `  ${tn}: ${tsData.teams[tn].map(p => p.name).join(', ')}`);
        }
      }
      phaseLog.push({ type: 'team-split' });
      drainEvent(players, 'team-split');
      drainEvent([host], 'team-split');
      await wait(1000);
      host.emit('advance-phase', { code });
      log('HOST', 'Advanced past team-split');
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no team-split */ }

    // Check for rank-start
    try {
      var rkData = await waitForAnyPlayerEvent(players, 'rank-start', 2000);
      console.log(`\n--- Phase: RANK ---`);
      check(Array.isArray(rkData.candidates), `Has ${(rkData.candidates || []).length} candidates to rank`);
      log('SIM', `Prompt: "${(rkData.prompt || '').substring(0, 60)}"`);
      phaseLog.push({ type: 'rank', prompt: rkData.prompt });
      drainEvent(players, 'rank-start');

      // Each player submits a ranking (original order = their ranking)
      for (var i = 0; i < players.length; i++) {
        var ranking = rkData.candidates ? [...rkData.candidates] : [];
        // Shuffle slightly per player for variety
        if (ranking.length > 1 && i % 2 === 1) ranking.reverse();
        players[i].emit('rank-submit', { code, ranking });
        log(names[i], `ranked ${ranking.length} items`);
      }
      await wait(500);
      host.emit('close-ranking', { code });
      log('HOST', 'Closed ranking');
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no rank */ }

    // Check for wager-start
    try {
      var wgData = await waitForAnyPlayerEvent(players, 'wager-start', 2000);
      console.log(`\n--- Phase: WAGER ---`);
      check(Array.isArray(wgData.options), `Has ${(wgData.options || []).length} options to wager on`);
      log('SIM', `Prompt: "${(wgData.prompt || '').substring(0, 60)}"`);
      log('SIM', `Available points: ${wgData.availablePoints || 0}`);
      phaseLog.push({ type: 'wager', prompt: wgData.prompt });
      drainEvent(players, 'wager-start');

      // Each player wagers on a random option
      for (var i = 0; i < players.length; i++) {
        var wgOptions = wgData.options || ['A'];
        var pick = wgOptions[i % wgOptions.length];
        var amount = Math.max(1, Math.floor((wgData.availablePoints || 10) * 0.3));
        players[i].emit('wager-submit', { code, option: pick, amount: amount });
        log(names[i], `wagered ${amount} on "${pick}"`);
      }
      await wait(500);
      host.emit('close-wager', { code });
      log('HOST', 'Closed wager');
      // Check if host needs to resolve
      try {
        var resolveData = await waitForEvent(host, 'wager-need-resolve', 3000);
        log('HOST', 'Resolving wager — picking first option');
        host.emit('wager-resolve', { code, winningOption: (resolveData.options || ['A'])[0] });
      } catch (e) { /* auto-resolved */ }
      lastEventTime = Date.now();
      handled = true;
      await wait(1000);
      continue;
    } catch (e) { /* no wager */ }

    // Check for relay-turn
    try {
      var rlData = await waitForAnyPlayerEvent(players, 'relay-turn', 2000);
      console.log(`\n--- Phase: RELAY ---`);
      log('SIM', `Prompt: "${(rlData.prompt || '').substring(0, 60)}"`);
      phaseLog.push({ type: 'relay' });
      drainEvent(players, 'relay-turn');
      drainEvent(players, 'relay-waiting');

      // Submit relay turns until the phase advances
      var relayDone = false;
      var relayTurns = 0;
      var maxRelayTurns = NUM_PLAYERS + 2;
      while (!relayDone && relayTurns < maxRelayTurns) {
        relayTurns++;
        // Find which player has the relay-turn (check buffers)
        var submitted = false;
        for (var pi = 0; pi < players.length; pi++) {
          if (!submitted) {
            players[pi].emit('relay-submit', { code, text: `Relay contribution from ${names[pi]}` });
            log(names[pi], 'submitted relay turn');
            submitted = true;
          }
        }
        await wait(1500);
        // Check if relay ended (next event appeared)
        var nextEvents = ['game-started', 'announce', 'show-results', 'leaderboard', 'game-ended',
                          'vote-start', 'processing-started', 'team-split', 'rank-start',
                          'wager-start', 'eliminated', 'winner'];
        for (var p of players) {
          for (var ev of nextEvents) {
            if (p._buffer[ev] && p._buffer[ev].length > 0) { relayDone = true; break; }
          }
          if (relayDone) break;
        }
        if (!relayDone) {
          // Check for next relay-turn
          try {
            var nextTurn = await waitForAnyPlayerEvent(players, 'relay-turn', 3000);
            drainEvent(players, 'relay-turn');
            drainEvent(players, 'relay-waiting');
          } catch (e) {
            relayDone = true; // No more turns
          }
        }
      }
      log('SIM', `Relay completed after ${relayTurns} turns`);
      lastEventTime = Date.now();
      handled = true;
      continue;
    } catch (e) { /* no relay */ }

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
  console.log(`\nResult: ${reporter.errors} errors, ${reporter.warnings} warnings`);

  if (reporter.errors === 0 && reporter.warnings === 0) {
    console.log('\x1b[32m✓ Game completed successfully!\x1b[0m');
  } else if (reporter.errors === 0) {
    console.log('\x1b[33m⚠ Game completed with warnings\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Game had errors\x1b[0m');
  }

  cleanup(host, players);
}

function cleanup(host, players) {
  if (host) host.disconnect();
  for (var p of (players || [])) p.disconnect();
  setTimeout(() => process.exit(reporter.errors > 0 ? 1 : 0), 500);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
