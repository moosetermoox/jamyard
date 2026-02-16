import { describe, it, expect } from 'vitest';
import { PlayerRegistry } from '../../engine/player-registry.js';

describe('PlayerRegistry', () => {
  describe('adding and removing players', () => {
    it('can add a player with an id and name', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      expect(registry.find('player1')).toBeDefined();
      expect(registry.find('player1').name).toBe('Alex');
    });

    it('can remove a player by id', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.remove('player1');
      expect(registry.find('player1')).toBeUndefined();
    });

    it('new players start with connected: true', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      expect(registry.find('p1').connected).toBe(true);
    });
  });

  describe('querying players', () => {
    it('can list all players', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.add('player2', 'Jordan');
      const players = registry.list();
      expect(players).toHaveLength(2);
      expect(players.map(p => p.name)).toContain('Alex');
      expect(players.map(p => p.name)).toContain('Jordan');
    });

    it('can find a player by id', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      const player = registry.find('player1');
      expect(player).toBeDefined();
      expect(player.id).toBe('player1');
      expect(player.name).toBe('Alex');
    });

    it('can get the player count', () => {
      const registry = new PlayerRegistry();
      expect(registry.count()).toBe(0);
      registry.add('player1', 'Alex');
      expect(registry.count()).toBe(1);
      registry.add('player2', 'Jordan');
      expect(registry.count()).toBe(2);
      registry.remove('player1');
      expect(registry.count()).toBe(1);
    });
  });

  describe('updating player data', () => {
    it('can update a player\'s data', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.update('player1', { score: 10 });
      expect(registry.find('player1').score).toBe(10);
    });

    it('can update multiple fields at once', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.update('player1', { score: 10, response: 'hello' });
      const player = registry.find('player1');
      expect(player.score).toBe(10);
      expect(player.response).toBe('hello');
    });

    it('preserves existing data when updating', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.update('player1', { score: 10 });
      registry.update('player1', { response: 'hello' });
      const player = registry.find('player1');
      expect(player.score).toBe(10);
      expect(player.response).toBe('hello');
    });
  });

  describe('player status and elimination', () => {
    it('new players start as active', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      expect(registry.find('p1').status).toBe('active');
    });

    it('eliminate() changes status to eliminated', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.eliminate('p1');
      expect(registry.find('p1').status).toBe('eliminated');
    });

    it('getRemaining() only returns active players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');
      registry.add('p3', 'Carol');
      registry.eliminate('p2');

      const remaining = registry.getRemaining();
      expect(remaining).toHaveLength(2);
      expect(remaining.map(p => p.name)).toContain('Alice');
      expect(remaining.map(p => p.name)).toContain('Carol');
    });

    it('getEliminated() only returns eliminated players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');
      registry.add('p3', 'Carol');
      registry.eliminate('p2');

      const eliminated = registry.getEliminated();
      expect(eliminated).toHaveLength(1);
      expect(eliminated[0].name).toBe('Bob');
    });

    it('eliminating a player does not remove them from the registry', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');
      registry.eliminate('p1');

      expect(registry.count()).toBe(2);
      expect(registry.find('p1')).toBeDefined();
      expect(registry.list()).toHaveLength(2);
    });

    it('isEliminated() returns true for eliminated players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.eliminate('p1');
      expect(registry.isEliminated('p1')).toBe(true);
    });

    it('isEliminated() returns false for active players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      expect(registry.isEliminated('p1')).toBe(false);
    });

    it('isEliminated() returns false for unknown players', () => {
      const registry = new PlayerRegistry();
      expect(registry.isEliminated('unknown')).toBe(false);
    });
  });

  describe('name validation and formatting', () => {
    it('auto-renames duplicate names', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'Alex');
      registry.add('player2', 'Alex');
      registry.add('player3', 'Alex');
      expect(registry.find('player1').name).toBe('Alex');
      expect(registry.find('player2').name).toBe('Alex2');
      expect(registry.find('player3').name).toBe('Alex3');
    });

    it('truncates names longer than 20 characters', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', 'ThisNameIsWayTooLongForTheSystem');
      expect(registry.find('player1').name).toBe('ThisNameIsWayTooLong');
      expect(registry.find('player1').name.length).toBe(20);
    });

    it('rejects names shorter than 2 characters', () => {
      const registry = new PlayerRegistry();
      expect(() => registry.add('player1', 'A')).toThrow();
    });

    it('rejects single character names', () => {
      const registry = new PlayerRegistry();
      expect(() => registry.add('player1', 'X')).toThrow();
    });

    it('defaults to Anonymous if name is empty string', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', '');
      expect(registry.find('player1').name).toBe('Anonymous');
    });

    it('auto-renames multiple Anonymous players', () => {
      const registry = new PlayerRegistry();
      registry.add('player1', '');
      registry.add('player2', '');
      registry.add('player3', '');
      expect(registry.find('player1').name).toBe('Anonymous');
      expect(registry.find('player2').name).toBe('Anonymous2');
      expect(registry.find('player3').name).toBe('Anonymous3');
    });
  });

  describe('disconnect and reconnect', () => {
    it('disconnect() marks player as not connected', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.disconnect('p1');
      const player = registry.find('p1');
      expect(player.connected).toBe(false);
      expect(player.disconnectedAt).toBeDefined();
      expect(typeof player.disconnectedAt).toBe('number');
    });

    it('disconnected player stays in list and getRemaining', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');
      registry.disconnect('p1');

      expect(registry.list()).toHaveLength(2);
      expect(registry.getRemaining()).toHaveLength(2);
      expect(registry.count()).toBe(2);
    });

    it('disconnected eliminated player stays in getEliminated', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.eliminate('p1');
      registry.disconnect('p1');

      expect(registry.getEliminated()).toHaveLength(1);
      expect(registry.getEliminated()[0].name).toBe('Alice');
    });

    it('findByName() returns player by name', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');
      expect(registry.findByName('Alice').id).toBe('p1');
      expect(registry.findByName('Bob').id).toBe('p2');
      expect(registry.findByName('Charlie')).toBeUndefined();
    });

    it('reconnect() moves player to new ID preserving status', () => {
      const registry = new PlayerRegistry();
      registry.add('old-id', 'Alice');
      registry.update('old-id', { score: 42 });
      registry.disconnect('old-id');

      const result = registry.reconnect('old-id', 'new-id');
      expect(result).toBe(true);

      // Old ID gone
      expect(registry.find('old-id')).toBeUndefined();

      // New ID has same data
      const player = registry.find('new-id');
      expect(player).toBeDefined();
      expect(player.name).toBe('Alice');
      expect(player.id).toBe('new-id');
      expect(player.connected).toBe(true);
      expect(player.disconnectedAt).toBeUndefined();
      expect(player.score).toBe(42);
    });

    it('reconnect() preserves eliminated status', () => {
      const registry = new PlayerRegistry();
      registry.add('old-id', 'Alice');
      registry.eliminate('old-id');
      registry.disconnect('old-id');
      registry.reconnect('old-id', 'new-id');

      expect(registry.find('new-id').status).toBe('eliminated');
      expect(registry.isEliminated('new-id')).toBe(true);
    });

    it('reconnect() returns false for unknown player', () => {
      const registry = new PlayerRegistry();
      expect(registry.reconnect('unknown', 'new')).toBe(false);
    });

    it('cleanupDisconnected() removes expired players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.add('p2', 'Bob');

      // Manually set disconnectedAt in the past
      registry.disconnect('p1');
      const player = registry.find('p1');
      player.disconnectedAt = Date.now() - 60000; // 60 seconds ago
      registry.update('p1', { disconnectedAt: player.disconnectedAt });

      registry.cleanupDisconnected(30000); // 30s grace

      expect(registry.find('p1')).toBeUndefined();
      expect(registry.find('p2')).toBeDefined();
      expect(registry.count()).toBe(1);
    });

    it('cleanupDisconnected() keeps recently disconnected players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');
      registry.disconnect('p1');

      registry.cleanupDisconnected(30000); // 30s grace, just disconnected

      expect(registry.find('p1')).toBeDefined();
      expect(registry.count()).toBe(1);
    });

    it('cleanupDisconnected() does not remove connected players', () => {
      const registry = new PlayerRegistry();
      registry.add('p1', 'Alice');

      registry.cleanupDisconnected(0); // Even with 0ms grace

      expect(registry.find('p1')).toBeDefined();
    });
  });
});
