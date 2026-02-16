import { describe, it, expect } from 'vitest';
import { loadGame, validate } from '../../engine/game-loader.js';

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

  describe('enhanced validation - phase types', () => {
    it('rejects invalid phase type', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'bad' },
          bad: { type: 'invalid-type', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid type "invalid-type"');
    });

    it('rejects phase with missing type', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'bad' },
          bad: { next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid type');
    });
  });

  describe('enhanced validation - required fields per type', () => {
    it('rejects collect phase missing prompt', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "prompt"');
    });

    it('rejects ai-process phase missing instruction', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', input: 'lobby.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "instruction"');
    });

    it('rejects ai-process phase missing input', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Do something', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "input"');
    });

    it('rejects vote phase missing mode', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'v' },
          v: { type: 'vote', candidates: 'lobby.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "mode"');
    });

    it('rejects vote phase missing candidates', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'v' },
          v: { type: 'vote', mode: 'pick-one', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "candidates"');
    });

    it('rejects eliminate phase missing method', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'elim' },
          elim: { type: 'eliminate', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "method"');
    });

    it('rejects preview phase missing approveNext', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'prev' },
          prev: { type: 'preview' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "approveNext"');
    });

    it('rejects winner phase missing from', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'win' },
          win: { type: 'winner', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "from"');
    });
  });

  describe('enhanced validation - enum values', () => {
    it('rejects invalid vote mode', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'v' },
          v: { type: 'vote', mode: 'triple-threat', candidates: 'lobby.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid mode value "triple-threat"');
    });

    it('rejects invalid eliminate method', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'elim' },
          elim: { type: 'eliminate', method: 'random', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid method value "random"');
    });

    it('rejects invalid ai-process task', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', task: 'magic', instruction: 'Do it', input: 'lobby.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid task value "magic"');
    });

    it('rejects invalid collect from value', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', from: 'winners', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid from value "winners"');
    });

    it('allows valid collect from values', () => {
      for (const from of ['all', 'remaining', 'eliminated']) {
        const config = {
          name: 'Test',
          phases: {
            lobby: { type: 'lobby', next: 'ask' },
            ask: { type: 'collect', prompt: 'Hi', from, next: 'end' },
            end: { type: 'end' }
          }
        };
        expect(() => validate(config, 'test')).not.toThrow();
      }
    });
  });

  describe('enhanced validation - timer', () => {
    it('rejects non-numeric timer', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', timer: 'fast', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid timer value');
    });

    it('rejects timer of 0', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', timer: 0, next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid timer value');
    });

    it('rejects timer above 3600', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', timer: 9999, next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid timer value');
    });

    it('accepts null timer', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', timer: null, next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('enhanced validation - eliminate specifics', () => {
    it('rejects bottom-percent without valid percent', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'elim' },
          elim: { type: 'eliminate', method: 'bottom-percent', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid percent value');
    });

    it('rejects hook method without hook name', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'elim' },
          elim: { type: 'eliminate', method: 'hook', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing hook name');
    });
  });

  describe('enhanced validation - data references', () => {
    it('rejects data ref pointing to nonexistent phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Do it', input: 'missing-phase.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('phase "missing-phase" does not exist');
    });

    it('rejects winner from ref pointing to nonexistent phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'win' },
          win: { type: 'winner', from: 'missing-vote.scores', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('phase "missing-vote" does not exist');
    });

    it('accepts valid data ref', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Do it', input: 'ask.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('enhanced validation - returnResults mode', () => {
    it('returns errors array instead of throwing', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'bad' },
          bad: { type: 'invalid-type', next: 'end' },
          end: { type: 'end' }
        }
      };
      const result = validate(config, 'test', { returnResults: true });
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('invalid type');
      expect(result.warnings).toBeDefined();
    });

    it('returns empty errors for valid config', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'end' },
          end: { type: 'end' }
        }
      };
      const result = validate(config, 'test', { returnResults: true });
      expect(result.errors).toHaveLength(0);
    });

    it('collects multiple errors at once', () => {
      const config = {
        name: '',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', next: 'end' },
          end: { type: 'end' }
        }
      };
      const result = validate(config, 'test', { returnResults: true });
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
