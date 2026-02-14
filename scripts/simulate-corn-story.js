/**
 * Corn Story Simulator
 *
 * Simulates a full Corn Story game with fake players.
 * Requires the server to be running on localhost:3000.
 *
 * Usage: node scripts/simulate-corn-story.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = 6;

// Responses designed so that players 1 & 2 match in Round 1
const ROUND1_RESPONSES = [
  'eat it',         // Player 1 — matches Player 2
  'eating corn',    // Player 2 — matches Player 1
  'make a boat',    // Player 3 — unique
  'build a house',  // Player 4 — unique
  'feed a horse',   // Player 5 — unique
  'throw it',       // Player 6 — unique
];

const ROUND2_RESPONSES = [
  'corn sword',
  'corn phone case',
  'corn pillow',
  'corn shoes',
];

const FINAL_RESPONSES = [
  'corn spaceship to Mars',
  'corn-powered time machine',
];

// --- Helpers ---

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { forceNew: true });
    socket.on('connect', () => {
      log(label, `connected (${socket.id})`);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      reject(new Error(`${label} failed to connect: ${err.message}`));
    });
  });
}

function waitForEvent(socket, event, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for '${event}'`));
    }, timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function log(who, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${who}] ${msg}`);
}

// --- Main ---

async function run() {
  console.log('\n=== CORN STORY SIMULATOR ===\n');

  // Connect host
  const host = await connect('HOST');

  // Connect players
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const socket = await connect(`Player${i + 1}`);
    players.push(socket);
  }

  // Host creates room
  host.emit('create-room', { gameId: 'corn-story' });
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

  // --- Start Game (lobby → round1-intro) ---
  log('HOST', 'Starting game...');
  host.emit('start-game', { code });

  // round1-intro is a reveal — wait for show-results then advance
  await waitForEvent(host, 'show-results');
  log('HOST', 'Round 1 intro shown');
  await wait(300);
  host.emit('advance-phase', { code });

  // --- Round 1: Collect ---
  await waitForEvent(players[0], 'game-started');
  log('SIM', 'Round 1 collect started');

  // Submit responses (only remaining players, but all start as remaining)
  for (let i = 0; i < players.length; i++) {
    players[i].emit('submit-response', { code, response: ROUND1_RESPONSES[i] });
    log(`Player${i + 1}`, `submitted: "${ROUND1_RESPONSES[i]}"`);
  }

  await wait(500);

  // Host closes submissions
  log('HOST', 'Closing submissions...');
  host.emit('close-submissions', { code });

  // Wait for elimination results (ai-process → eliminate auto-chain)
  const elim1 = await waitForEvent(host, 'elimination-results');
  log('SIM', `Round 1 eliminated ${elim1.eliminatedNames.length}: ${elim1.eliminatedNames.join(', ')} (${elim1.remaining} remaining)`);

  // Advance past eliminate → round1-results (reveal)
  await wait(300);
  host.emit('advance-phase', { code });
  await waitForEvent(host, 'show-results');
  log('HOST', 'Round 1 results shown');
  await wait(300);
  host.emit('advance-phase', { code });

  // --- Round 2 intro ---
  await waitForEvent(host, 'show-results');
  log('HOST', 'Round 2 intro shown');
  await wait(300);
  host.emit('advance-phase', { code });

  // --- Round 2: Collect (remaining only) ---
  // Figure out who's still in
  const eliminatedSet = new Set(elim1.eliminated);
  const remaining = players.filter(p => !eliminatedSet.has(p.id));
  log('SIM', `Round 2: ${remaining.length} remaining players collecting`);

  // Wait for collect to start
  await waitForEvent(remaining[0], 'game-started');

  for (let i = 0; i < remaining.length; i++) {
    remaining[i].emit('submit-response', { code, response: ROUND2_RESPONSES[i] || `creative idea ${i}` });
    log(`Remaining${i + 1}`, `submitted: "${ROUND2_RESPONSES[i] || `creative idea ${i}`}"`);
  }

  await wait(500);
  log('HOST', 'Closing submissions...');
  host.emit('close-submissions', { code });

  // --- Round 2: Vote (head-to-head, all voters) ---
  // Wait for vote-start on any player
  const voteData = await waitForEvent(players[0], 'vote-start', 60000);
  log('SIM', `Round 2 vote started: ${voteData.mode}`);

  // All players vote on head-to-head matchups
  for (let i = 0; i < players.length; i++) {
    if (voteData.mode === 'head-to-head' && voteData.matchups) {
      const votes = voteData.matchups.map(m => {
        // Pick randomly between optionA and optionB
        const choice = Math.random() < 0.5
          ? (m.optionA.playerId || m.optionA)
          : (m.optionB.playerId || m.optionB);
        return { choice };
      });
      players[i].emit('submit-vote', { code, votes });
    } else {
      // Fallback: pick-one
      const choice = voteData.candidates?.[0]?.playerId || 'unknown';
      players[i].emit('submit-vote', { code, choice });
    }
    log(`Player${i + 1}`, 'voted');
  }

  // Wait for elimination
  const elim2 = await waitForEvent(host, 'elimination-results');
  log('SIM', `Round 2 eliminated ${elim2.eliminatedNames.length}: ${elim2.eliminatedNames.join(', ')} (${elim2.remaining} remaining)`);

  // Advance past eliminate → round2-results (reveal)
  await wait(300);
  host.emit('advance-phase', { code });
  await waitForEvent(host, 'show-results');
  log('HOST', 'Round 2 results shown');
  await wait(300);
  host.emit('advance-phase', { code });

  // --- Final intro ---
  await waitForEvent(host, 'show-results');
  log('HOST', 'Final round intro shown');
  await wait(300);
  host.emit('advance-phase', { code });

  // --- Final: Collect (remaining only) ---
  const elim2Set = new Set([...eliminatedSet, ...elim2.eliminated]);
  const finalists = players.filter(p => !elim2Set.has(p.id));
  log('SIM', `Final: ${finalists.length} finalists collecting`);

  if (finalists.length > 0) {
    await waitForEvent(finalists[0], 'game-started');
  }

  for (let i = 0; i < finalists.length; i++) {
    finalists[i].emit('submit-response', { code, response: FINAL_RESPONSES[i] || `ultimate corn idea ${i}` });
    log(`Finalist${i + 1}`, `submitted: "${FINAL_RESPONSES[i] || `ultimate corn idea ${i}`}"`);
  }

  await wait(500);
  log('HOST', 'Closing submissions...');
  host.emit('close-submissions', { code });

  // --- Final: Vote (pick-one, eliminated voters) ---
  // Find an eliminated player to wait for vote-start
  const eliminatedPlayers = players.filter(p => elim2Set.has(p.id));

  if (eliminatedPlayers.length > 0) {
    const finalVoteData = await waitForEvent(eliminatedPlayers[0], 'vote-start', 60000);
    log('SIM', `Final vote started: ${finalVoteData.mode}, ${eliminatedPlayers.length} eliminated voters`);

    for (const ep of eliminatedPlayers) {
      if (finalVoteData.mode === 'pick-one' && finalVoteData.candidates) {
        const pick = finalVoteData.candidates[Math.floor(Math.random() * finalVoteData.candidates.length)];
        const choice = pick.playerId || pick;
        ep.emit('submit-vote', { code, choice });
      }
    }
    log('SIM', 'All eliminated players voted');
  } else {
    log('SIM', 'No eliminated voters — host closing voting');
    host.emit('close-voting', { code });
  }

  // --- Winner ---
  const winner = await waitForEvent(host, 'winner-announced', 60000);
  log('SIM', `\n  WINNER: ${winner.winnerName} (${winner.winnerScore} votes)`);
  if (winner.standings) {
    log('SIM', '  Standings:');
    for (const s of winner.standings) {
      log('SIM', `    ${s.name}: ${s.score} votes`);
    }
  }

  // Advance past winner → end
  await wait(300);
  host.emit('advance-phase', { code });

  const endData = await waitForEvent(host, 'game-ended');
  log('SIM', `Game ended: ${endData.message}`);

  console.log('\n=== SIMULATION COMPLETE ===\n');

  // Clean up
  host.disconnect();
  for (const p of players) p.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Simulation failed:', err.message);
  process.exit(1);
});
