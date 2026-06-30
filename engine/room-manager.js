/**
 * RoomManager — owns the live rooms map and their lifecycle.
 *
 * `create()` mints a unique 4-letter join code and bundles a fresh
 * StateMachine + PlayerRegistry under it; `find()`/`remove()` look up and tear
 * down by code; `adopt()` re-inserts a room rebuilt from a snapshot (restart
 * survival) under its original code. Rooms live in memory only — durable game
 * configs are in the DB/filesystem, room *state* is intentionally ephemeral
 * (with snapshots in engine/room-snapshot.js bridging restarts).
 */
import { StateMachine } from './state-machine.js';
import { PlayerRegistry } from './player-registry.js';

export class RoomManager {
  constructor(gameConfig) {
    this.gameConfig = gameConfig;
    this.rooms = new Map();
  }

  create() {
    const code = this.generateUniqueCode();
    const room = {
      code,
      playerRegistry: new PlayerRegistry(),
      stateMachine: new StateMachine(this.gameConfig),
      createdAt: Date.now(),
      journal: []  // ring buffer of recent events — useful for debugging stalls
    };
    this.rooms.set(code, room);
    return code;
  }

  find(code) {
    return this.rooms.get(code);
  }

  /** Adopt an externally-built room (snapshot restore) under its old code. */
  adopt(room) {
    this.rooms.set(room.code, room);
  }

  delete(code) {
    this.rooms.delete(code);
  }

  list() {
    return Array.from(this.rooms.values());
  }

  exists(code) {
    return this.rooms.has(code);
  }

  expireOlderThan(duration) {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > duration) {
        this.rooms.delete(code);
      }
    }
  }

  generateUniqueCode() {
    let code;
    do {
      code = this.generateCode();
    } while (this.rooms.has(code));
    return code;
  }

  generateCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
  }
}
