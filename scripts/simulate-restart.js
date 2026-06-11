/**
 * Restart-survival simulation — proves room snapshots work end to end.
 *
 * Spawns its own server on a side port, plays a game to mid-collect,
 * KILLS the server process (the Render-redeploy / crash scenario), starts
 * a fresh one, then rejoins as host (hostToken) and player (player token)
 * and asserts the game resumed at the interrupted phase with the roster
 * intact.
 *
 * Requires DATABASE_URL (snapshots persist in Neon).
 *
 *   node scripts/simulate-restart.js
 */

import { spawn } from 'node:child_process';
import { connect, waitForEvent, wait, log, makeReporter } from './sim-harness.js';

const PORT = 3211;
const SERVER = `http://localhost:${PORT}`;
const GAME = 'weekend-poem'; // lobby → collect first — quick to reach mid-phase

const reporter = makeReporter();
const check = (c, d) => reporter.check(c, d);

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', d => {
    const line = String(d).trim();
    if (/restore|snapshot|host-rejoin/i.test(line)) log('SRV', line.split('\n')[0]);
  });
  child.stderr.on('data', d => log('SRV-ERR', String(d).trim().split('\n')[0]));
  return child;
}

async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${SERVER}/api/games`);
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await wait(300);
  }
  throw new Error('Server did not become ready');
}

async function run() {
  if (!process.env.DATABASE_URL) {
    // dotenv is loaded by the server, not by this script — read .env manually
    const { readFileSync, existsSync } = await import('node:fs');
    if (existsSync('.env')) {
      for (const line of readFileSync('.env', 'utf8').split('\n')) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.+)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — snapshots need the database. Aborting.');
    process.exit(1);
  }

  console.log('\n=== RESTART-SURVIVAL SIMULATION ===\n');

  // --- Act 1: play a game to mid-phase ---
  let server = startServer();
  await waitForReady();
  log('SIM', 'Server 1 up');

  const host1 = await connect('HOST', SERVER);
  host1.emit('create-room', { gameId: GAME });
  const created = await waitForEvent(host1, 'room-created', 5000);
  const { code, hostToken } = created;
  check(!!hostToken, 'Host received a hostToken');
  log('SIM', `Room ${code}`);

  const p1 = await connect('P1', SERVER);
  p1.emit('join-room', { code, name: 'Maya' });
  const j1 = await waitForEvent(p1, 'join-success', 3000);
  const mayaToken = j1.token;

  const p2 = await connect('P2', SERVER);
  p2.emit('join-room', { code, name: 'Jordan' });
  await waitForEvent(p2, 'join-success', 3000);

  host1.emit('start-game', { code });
  const collect = await waitForEvent(p1, 'game-started', 5000);
  check(!!collect.prompt, 'Game reached the collect phase');
  p1.emit('submit-response', { code, response: 'Went hiking in the rain with my dog' });
  await wait(1200); // let the snapshot debounce flush

  // --- The disaster: server dies mid-phase ---
  log('SIM', '💥 Killing the server mid-game');
  server.kill('SIGKILL');
  await wait(800);

  // --- Act 2: fresh server, everyone comes back ---
  server = startServer();
  await waitForReady();
  log('SIM', 'Server 2 up (fresh process, empty memory)');

  const host2 = await connect('HOST2', SERVER);
  host2.emit('host-rejoin', { code, hostToken });
  const rebound = await waitForEvent(host2, 'room-created', 8000);
  check(rebound.code === code, 'Host rebound to the same room code');
  check(rebound.restored === true, 'Room was restored from snapshot');
  check(rebound.teacherPin === created.teacherPin, 'Teacher PIN survived');

  const roster = await waitForEvent(host2, 'player-joined', 3000);
  const names = (roster.players || []).map(p => p.name).sort();
  check(names.includes('Maya') && names.includes('Jordan'), `Roster survived (${names.join(', ')})`);

  // Host rejoin re-enters the interrupted phase fresh
  const reentered = await waitForEvent(host2, 'game-started', 5000);
  check(!!reentered.prompt, 'Interrupted phase re-entered (collect prompt re-shown)');

  // Player reconnects with her token and is recognized
  const p1b = await connect('P1-back', SERVER);
  p1b.emit('join-room', { code, name: 'Maya', token: mayaToken });
  const back = await waitForEvent(p1b, 'join-success', 5000);
  check(back.reconnected === true, 'Maya reconnected as herself (token rebind)');
  const replay = await waitForEvent(p1b, 'game-started', 5000).catch(() => null);
  check(!!replay, 'Maya sees the re-entered phase screen');

  // A wrong hostToken must NOT hijack the room
  const intruder = await connect('INTRUDER', SERVER);
  intruder.emit('host-rejoin', { code, hostToken: 'not-the-token' });
  const denied = await waitForEvent(intruder, 'host-rejoin-error', 3000).catch(() => null);
  check(!!denied, 'Wrong hostToken is rejected');

  for (const s of [host1, host2, p1, p2, p1b, intruder]) { try { s.disconnect(); } catch (e) { /* dead */ } }
  server.kill('SIGKILL');

  reporter.summary ? reporter.summary() : null;
  console.log(`\nResult: ${reporter.errors} errors`);
  if (reporter.errors > 0) {
    console.log('\x1b[31m✗ Restart survival FAILED\x1b[0m');
    process.exit(1);
  }
  console.log('\x1b[32m✓ The game survived a server death\x1b[0m');
  process.exit(0);
}

run().catch(err => {
  console.error('\x1b[31mSimulation crashed:\x1b[0m', err.message);
  process.exit(1);
});
