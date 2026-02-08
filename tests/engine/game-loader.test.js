import { describe, it, expect } from 'vitest';
import { loadGame } from '../../engine/game-loader.js';

describe('GameLoader', () => {
  describe('loading valid configs', () => {
    it('can load the _template config', async () => {
      const config = await loadGame('_template');
      expect(config.name).toBe('Template Game');
      expect(config.phases).toBeDefined();
      expect(config.phases.lobby.type).toBe('lobby');
      expect(config.phases.end.type).toBe('end');
    });

    it('returns all phase data from the config', async () => {
      const config = await loadGame('_template');
      expect(config.phases.collect.prompt).toBe('What is your answer?');
      expect(config.phases.collect.timer).toBe(30);
      expect(config.phases.lobby.next).toBe('collect');
    });
  });

  describe('missing config file', () => {
    it('throws error for a game that does not exist', async () => {
      await expect(loadGame('nonexistent-game'))
        .rejects.toThrow('Game not found');
    });
  });

  describe('missing required fields', () => {
    it('throws error when name is missing', async () => {
      await expect(loadGame('_test-no-name'))
        .rejects.toThrow('missing required field: name');
    });

    it('throws error when phases is missing', async () => {
      await expect(loadGame('_test-no-phases'))
        .rejects.toThrow('missing required field: phases');
    });

    it('throws error when lobby phase is missing', async () => {
      await expect(loadGame('_test-no-lobby'))
        .rejects.toThrow('missing a lobby phase');
    });

    it('throws error when end phase is missing', async () => {
      await expect(loadGame('_test-no-end'))
        .rejects.toThrow('missing an end phase');
    });
  });

  describe('invalid next references', () => {
    it('throws error when next points to nonexistent phase', async () => {
      await expect(loadGame('_test-bad-next'))
        .rejects.toThrow('does not exist');
    });
  });
});
