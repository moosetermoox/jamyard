import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../../engine/room-manager.js';
import { StateMachine } from '../../engine/state-machine.js';
import { PlayerRegistry } from '../../engine/player-registry.js';

const testGameConfig = {
  initialState: 'lobby',
  transitions: {
    lobby: ['collect'],
    collect: ['process'],
    process: ['reveal'],
    reveal: ['collect', 'end'],
    end: []
  }
};

describe('RoomManager', () => {
  describe('creating rooms', () => {
    it('can create a room and returns a 4-letter uppercase code', () => {
      const manager = new RoomManager(testGameConfig);
      const code = manager.create();
      expect(code).toMatch(/^[A-Z]{4}$/);
    });

    it('generates unique codes for multiple rooms', () => {
      const manager = new RoomManager(testGameConfig);
      const codes = new Set();
      for (let i = 0; i < 10; i++) {
        codes.add(manager.create());
      }
      expect(codes.size).toBe(10);
    });

    // Field report 2026-08-22: a Q on the projector was read as an O by
    // students typing the join code. Q is banned from the alphabet.
    it('never puts a Q in a room code', () => {
      const manager = new RoomManager(testGameConfig);
      for (let i = 0; i < 200; i++) {
        expect(manager.create()).not.toMatch(/Q/);
      }
    });
  });

  describe('finding rooms', () => {
    it('can find a room by its code', () => {
      const manager = new RoomManager(testGameConfig);
      const code = manager.create();
      const room = manager.find(code);
      expect(room).toBeDefined();
      expect(room.code).toBe(code);
    });

    it('returns undefined when finding a room that does not exist', () => {
      const manager = new RoomManager(testGameConfig);
      const room = manager.find('ZZZZ');
      expect(room).toBeUndefined();
    });
  });

  describe('deleting rooms', () => {
    it('can delete a room by code', () => {
      const manager = new RoomManager(testGameConfig);
      const code = manager.create();
      manager.delete(code);
      expect(manager.find(code)).toBeUndefined();
    });
  });

  describe('listing rooms', () => {
    it('can list all active rooms', () => {
      const manager = new RoomManager(testGameConfig);
      const code1 = manager.create();
      const code2 = manager.create();
      const rooms = manager.list();
      expect(rooms).toHaveLength(2);
      expect(rooms.map(r => r.code)).toContain(code1);
      expect(rooms.map(r => r.code)).toContain(code2);
    });

    it('can check if a room exists', () => {
      const manager = new RoomManager(testGameConfig);
      const code = manager.create();
      expect(manager.exists(code)).toBe(true);
      expect(manager.exists('ZZZZ')).toBe(false);
    });
  });

  describe('room components', () => {
    it('each room has its own playerRegistry instance', () => {
      const manager = new RoomManager(testGameConfig);
      const code1 = manager.create();
      const code2 = manager.create();
      const room1 = manager.find(code1);
      const room2 = manager.find(code2);

      expect(room1.playerRegistry).toBeInstanceOf(PlayerRegistry);
      expect(room2.playerRegistry).toBeInstanceOf(PlayerRegistry);
      expect(room1.playerRegistry).not.toBe(room2.playerRegistry);
    });

    it('each room has its own stateMachine instance', () => {
      const manager = new RoomManager(testGameConfig);
      const code1 = manager.create();
      const code2 = manager.create();
      const room1 = manager.find(code1);
      const room2 = manager.find(code2);

      expect(room1.stateMachine).toBeInstanceOf(StateMachine);
      expect(room2.stateMachine).toBeInstanceOf(StateMachine);
      expect(room1.stateMachine).not.toBe(room2.stateMachine);
    });

    it('each room tracks createdAt timestamp', () => {
      const manager = new RoomManager(testGameConfig);
      const before = Date.now();
      const code = manager.create();
      const after = Date.now();
      const room = manager.find(code);

      expect(room.createdAt).toBeGreaterThanOrEqual(before);
      expect(room.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('room expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('can expire rooms older than a given duration', () => {
      const manager = new RoomManager(testGameConfig);
      const oldCode = manager.create();

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour later

      const newCode = manager.create();

      manager.expireOlderThan(30 * 60 * 1000); // expire rooms older than 30 minutes

      expect(manager.find(oldCode)).toBeUndefined();
      expect(manager.find(newCode)).toBeDefined();
    });

    it('does not expire rooms younger than the given duration', () => {
      const manager = new RoomManager(testGameConfig);
      const code = manager.create();

      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes later

      manager.expireOlderThan(30 * 60 * 1000); // expire rooms older than 30 minutes

      expect(manager.find(code)).toBeDefined();
    });
  });
});
