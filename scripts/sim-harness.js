/**
 * Headless multi-client simulation harness.
 *
 * Shared primitives for driving a running Lanyard server with one host
 * socket + N player sockets — the building blocks every simulate-*.js
 * script needs (and that scripted-timing tests like One Voice's collision
 * adjudication will build on).
 *
 * Usage (from a script):
 *   import { connect, setupRoom, waitForEvent, teardown } from './sim-harness.js';
 *   const { host, players, names, code } = await setupRoom('my-game', 4);
 *   ...drive the game...
 *   await teardown(host, players);
 *
 * Every socket gets an event buffer (socket._buffer) populated by onAny,
 * so events that arrive before you ask for them aren't lost — essential
 * when phases auto-advance.
 *
 * Requires the server running (default http://localhost:3000; override
 * with the SIM_SERVER env var or the `server` option).
 */

import { io } from 'socket.io-client';

export const DEFAULT_SERVER = process.env.SIM_SERVER || 'http://localhost:3000';

export const PLAYER_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack',
  'Kate', 'Leo', 'Mia', 'Nick', 'Olivia', 'Pete', 'Quinn', 'Rose', 'Sam', 'Tina'
];

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function log(who, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${who}] ${msg}`);
}

/**
 * Connect one socket.io client with a labeled event buffer.
 * @param {string} label   For error messages ("HOST", "P1", ...)
 * @param {string} [server]
 * @returns {Promise<import('socket.io-client').Socket>}
 */
export function connect(label, server = DEFAULT_SERVER) {
  return new Promise((resolve, reject) => {
    const socket = io(server, { forceNew: true });
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

/**
 * Wait for one event on one socket (buffered events resolve immediately).
 */
export function waitForEvent(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (socket._buffer[event] && socket._buffer[event].length > 0) {
      resolve(socket._buffer[event].shift());
      return;
    }
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' on ${socket._label || 'socket'}`));
    }, timeout);
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

/**
 * Wait for one event to arrive on ANY of the given sockets.
 */
export function waitForAnyPlayerEvent(players, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    for (const p of players) {
      if (p._buffer[event] && p._buffer[event].length > 0) {
        resolve(p._buffer[event].shift());
        return;
      }
    }
    const timer = setTimeout(() => {
      for (const s of players) s.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' on any player`));
    }, timeout);
    const handler = function (data) {
      clearTimeout(timer);
      for (const s of players) s.off(event, handler);
      resolve(data);
    };
    for (const s of players) s.on(event, handler);
  });
}

/**
 * Wait until EVERY socket in the list has an event of this type buffered,
 * then return them in socket order. Use for per-player emits (pair reveal,
 * per-player prompts) where waitForAnyPlayerEvent would drop the rest.
 */
export async function waitForEventOnAll(sockets, event, timeout = 15000) {
  const results = [];
  for (const s of sockets) {
    results.push(await waitForEvent(s, event, timeout));
  }
  return results;
}

export function drainEvent(sockets, event) {
  for (const s of sockets) {
    if (s._buffer[event]) s._buffer[event] = [];
  }
}

export function drainAll(sockets) {
  for (const s of sockets) {
    s._buffer = {};
  }
}

/**
 * Connect a host + N players, create a room for the given game, and join
 * everyone. Throws if anything fails.
 *
 * @param {string} gameId
 * @param {number} numPlayers
 * @param {{ server?: string, names?: string[] }} [opts]
 * @returns {Promise<{ host, players, names, code }>}
 */
export async function setupRoom(gameId, numPlayers, opts = {}) {
  const server = opts.server || DEFAULT_SERVER;
  const names = (opts.names || PLAYER_NAMES).slice(0, numPlayers);

  const host = await connect('HOST', server);
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(await connect(`P${i + 1}`, server));
  }

  host.emit('create-room', { gameId });
  const roomData = await waitForEvent(host, 'room-created', 5000).catch(() => {
    throw new Error(`Failed to create room — is "${gameId}" a valid game and the server running at ${server}?`);
  });
  const code = roomData.code;
  log('HOST', `Room created: ${code} (game: ${gameId})`);

  for (let i = 0; i < players.length; i++) {
    players[i].emit('join-room', { code, name: names[i] });
    await waitForEvent(players[i], 'join-success', 3000);
  }
  log('SIM', `Joined ${numPlayers} players: ${names.join(', ')}`);

  return { host, players, names, code };
}

/**
 * Disconnect everything. Safe to call with partial state.
 */
export function teardown(host, players) {
  if (host) host.disconnect();
  for (const p of (players || [])) p.disconnect();
  return wait(300);
}

/**
 * Tiny assertion reporter shared by sim scripts. Tracks pass/fail counts;
 * call summary() at the end and exit(reporter.errors > 0 ? 1 : 0).
 */
export function makeReporter() {
  const r = {
    errors: 0,
    warnings: 0,
    check(condition, description) {
      if (condition) {
        console.log(`  \x1b[32m✓\x1b[0m ${description}`);
      } else {
        console.log(`  \x1b[31m✗ FAIL: ${description}\x1b[0m`);
        r.errors++;
      }
    },
    warn(description) {
      console.log(`  \x1b[33m⚠ ${description}\x1b[0m`);
      r.warnings++;
    },
    summary(title = 'SIMULATION SUMMARY') {
      console.log('\n================================');
      console.log(title);
      console.log('================================');
      console.log(`Result: ${r.errors} errors, ${r.warnings} warnings`);
      if (r.errors === 0 && r.warnings === 0) {
        console.log('\x1b[32m✓ All checks passed\x1b[0m');
      } else if (r.errors === 0) {
        console.log('\x1b[33m⚠ Completed with warnings\x1b[0m');
      } else {
        console.log('\x1b[31m✗ Had errors\x1b[0m');
      }
    }
  };
  return r;
}
