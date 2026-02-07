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
});
