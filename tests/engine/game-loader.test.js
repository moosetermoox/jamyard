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

    it('can load the mood-check config', async () => {
      const config = await loadGame('mood-check');
      expect(config.name).toBe('Mood Check');
      expect(config.description).toBe('How is everyone feeling today?');
      expect(config.phases.lobby.type).toBe('lobby');
      expect(config.phases.collect.prompt).toBe('How are you feeling today? (one word or short phrase)');
      expect(config.phases.process.type).toBe('ai-process');
      expect(config.phases.process.task).toBe('summarize');
      expect(config.phases.end.type).toBe('end');
    });

    it('can load the corn-story config', async () => {
      const config = await loadGame('corn-story');
      expect(config.name).toBe('Corn Story');
      expect(config.description).toBe('A 3-round elimination game of creativity!');
      expect(config.hooks).toBe('./hooks.js');
      expect(config.minPlayers).toBe(4);

      // Verify all 16 phases exist
      const phaseNames = Object.keys(config.phases);
      expect(phaseNames).toHaveLength(16);

      // Round 1 phases
      expect(config.phases.lobby.next).toBe('round1-intro');
      expect(config.phases['round1-intro'].type).toBe('reveal');
      expect(config.phases['round1-collect'].type).toBe('collect');
      expect(config.phases['round1-collect'].from).toBe('remaining');
      expect(config.phases['round1-process'].type).toBe('ai-process');
      expect(config.phases['round1-process'].task).toBe('compare');
      expect(config.phases['round1-process'].format).toBe('json');
      expect(config.phases['round1-eliminate'].type).toBe('eliminate');
      expect(config.phases['round1-eliminate'].method).toBe('hook');
      expect(config.phases['round1-eliminate'].hook).toBe('eliminateDuplicates');

      // Round 2 phases
      expect(config.phases['round2-collect'].from).toBe('remaining');
      expect(config.phases['round2-vote'].type).toBe('vote');
      expect(config.phases['round2-vote'].mode).toBe('head-to-head');
      expect(config.phases['round2-vote'].voters).toBe('all');
      expect(config.phases['round2-eliminate'].method).toBe('bottom-percent');
      expect(config.phases['round2-eliminate'].percent).toBe(60);

      // Final round phases
      expect(config.phases['final-collect'].from).toBe('remaining');
      expect(config.phases['final-vote'].type).toBe('vote');
      expect(config.phases['final-vote'].mode).toBe('pick-one');
      expect(config.phases['final-vote'].voters).toBe('eliminated');
      expect(config.phases.crown.type).toBe('winner');
      expect(config.phases.crown.from).toBe('final-vote.scores');
      expect(config.phases.end.type).toBe('end');
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
