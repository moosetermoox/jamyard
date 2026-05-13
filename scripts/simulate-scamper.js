/**
 * SCAMPER Simulator
 *
 * Verifies that the rotateFrom primitive works end-to-end:
 *   - each rotation phase delivers a *different* player's previous item to
 *     each receiver
 *   - the chain is consistent across 7 lenses (so the final reveal is each
 *     idea after seven different transformations)
 *
 * Requires the server running on localhost:3000.
 *
 * Usage: node scripts/simulate-scamper.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
const NUM_PLAYERS = 4;

const INITIAL_IDEAS = [
  'A walking school bus that picks up kids on the way',
  'A homework swap club where kids trade chores',
  'Lunch trays you can eat',
  'Solar-powered backpacks that charge tablets'
];

const LENSES = [
  { name: 'substitute',       sourcePhase: 'initial-idea',     suffix: 'SUBST' },
  { name: 'combine',          sourcePhase: 'substitute',       suffix: 'COMB'  },
  { name: 'adapt',            sourcePhase: 'combine',          suffix: 'ADAPT' },
  { name: 'modify',           sourcePhase: 'adapt',            suffix: 'MOD'   },
  { name: 'put-to-other-use', sourcePhase: 'modify',           suffix: 'OTHER' },
  { name: 'eliminate-step',   sourcePhase: 'put-to-other-use', suffix: 'ELIM'  },
  { name: 'rearrange',        sourcePhase: 'eliminate-step',   suffix: 'REARR' }
];

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { forceNew: true });
    socket.on('connect', () => { log(label, `connected ${socket.id}`); resolve(socket); });
    socket.on('connect_error', err => reject(new Error(`${label} ${err.message}`)));
  });
}

function waitForEvent(socket, event, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeout);
    socket.once(event, data => { clearTimeout(t); resolve(data); });
  });
}

function log(who, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${who}] ${msg}`);
}

// Pull the assigned-source line out of "Original idea: <X>\n\nNow ..." style prompts
function extractAssigned(prompt) {
  // Look for "idea: <text>\n\n" pattern (case-insensitive)
  const m = prompt.match(/idea:\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

async function run() {
  console.log('\n=== SCAMPER ROTATION SIMULATOR ===\n');

  const host = await connect('HOST');
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(await connect(`P${i + 1}`));
  }

  host.emit('create-room', { gameId: 'scamper' });
  const { code } = await waitForEvent(host, 'room-created');
  log('HOST', `room ${code}`);

  for (let i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: `P${i + 1}` });
    await waitForEvent(players[i], 'join-success');
  }
  log('SIM', `${players.length} joined`);
  await wait(300);

  log('HOST', 'starting...');
  host.emit('start-game', { code });

  // intro announce (15s timer, auto-advance) — wait for initial-idea collect
  const initialPrompt = await waitForEvent(players[0], 'game-started', 25000);
  log('SIM', `initial-idea collect started ("${initialPrompt.prompt.slice(0, 60)}...")`);

  // Submit initial ideas
  const ideaByPid = {};
  for (let i = 0; i < players.length; i++) {
    ideaByPid[players[i].id] = INITIAL_IDEAS[i];
    players[i].emit('submit-response', { code, response: INITIAL_IDEAS[i] });
    log(`P${i + 1}`, `submitted: "${INITIAL_IDEAS[i].slice(0, 40)}..."`);
  }
  await wait(300);
  host.emit('close-submissions', { code });

  // --- Walk the 7 SCAMPER lenses ---
  let lastChainByPid = { ...ideaByPid }; // playerId -> what they wrote last

  let allChecksPassed = true;

  for (const lens of LENSES) {
    log('SIM', `--- waiting for ${lens.name} announce → collect ---`);

    // Each lens: announce (12s) then collect.
    // We listen for game-started on every player so we capture each one's
    // assigned prompt independently.
    const promptsByPid = {};
    const promises = players.map(p =>
      waitForEvent(p, 'game-started', 30000).then(d => { promptsByPid[p.id] = d.prompt; })
    );
    await Promise.all(promises);
    log('SIM', `${lens.name}: all ${players.length} players got prompts`);

    // For each player, extract what they were "assigned" and verify it's
    // someone else's previous item (not their own, and not duplicate across the room)
    const assignedByPid = {};
    for (const p of players) {
      const assigned = extractAssigned(promptsByPid[p.id]);
      if (!assigned) {
        log('CHECK', `❌ ${lens.name}: P=${p.id} prompt missing 'idea:' line\n  PROMPT: ${promptsByPid[p.id]}`);
        allChecksPassed = false;
        continue;
      }
      assignedByPid[p.id] = assigned;
    }

    // Check: each player's assigned text should be SOMEONE ELSE's last item
    for (const p of players) {
      const assigned = assignedByPid[p.id];
      const myOwn = lastChainByPid[p.id];
      if (assigned === myOwn) {
        log('CHECK', `❌ ${lens.name}: P=${p.id} got their OWN item back ("${assigned.slice(0, 40)}...")`);
        allChecksPassed = false;
      }
      // Find which player wrote this assigned text
      const senderEntry = Object.entries(lastChainByPid).find(([, v]) => v === assigned);
      if (!senderEntry) {
        log('CHECK', `❌ ${lens.name}: P=${p.id} got "${assigned.slice(0, 40)}..." which doesn't match any previous item`);
        allChecksPassed = false;
      } else {
        log('CHECK', `✓ ${lens.name}: P=${p.id} ← P=${senderEntry[0]}`);
      }
    }

    // Check: assignments must be unique (every input shows up exactly once)
    const assignedValues = Object.values(assignedByPid);
    const unique = new Set(assignedValues);
    if (unique.size !== assignedValues.length) {
      log('CHECK', `❌ ${lens.name}: assignments contain duplicates (${assignedValues.length} total, ${unique.size} unique)`);
      allChecksPassed = false;
    } else {
      log('CHECK', `✓ ${lens.name}: assignments are unique`);
    }

    // Each player writes a transformed version (we just append the lens suffix
    // so the chain is traceable downstream)
    const newChainByPid = {};
    for (const p of players) {
      const transformed = `[${lens.suffix}] ${assignedByPid[p.id] || '(no assignment)'}`;
      newChainByPid[p.id] = transformed;
      p.emit('submit-response', { code, response: transformed });
    }
    await wait(200);
    host.emit('close-submissions', { code });
    lastChainByPid = newChainByPid;
  }

  // --- Final reveal ---
  log('SIM', 'waiting for final reveal...');
  const reveal = await waitForEvent(host, 'show-results', 30000);
  log('REVEAL', '\n----- HOST REVEAL -----\n' + reveal.content + '\n-----------------------');

  // The reveal should contain all 7 lens suffixes for each chain — the final
  // text is the result of going through all 7 transformations.
  for (const lens of LENSES) {
    const tag = `[${lens.suffix}]`;
    if (!reveal.content.includes(tag)) {
      log('CHECK', `❌ Final reveal missing ${tag}`);
      allChecksPassed = false;
    }
  }
  if (allChecksPassed) {
    log('CHECK', '✓ All 7 lens transformations present in the final reveal');
  }

  // Cleanup
  host.disconnect();
  players.forEach(p => p.disconnect());

  console.log('\n=== RESULT ===');
  console.log(allChecksPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  process.exit(allChecksPassed ? 0 : 1);
}

run().catch(err => {
  console.error('SIMULATOR ERROR:', err);
  process.exit(1);
});
