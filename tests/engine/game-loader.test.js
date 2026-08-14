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
      expect(config.phases.collect.prompt).toContain('How are you feeling today? (one word or short phrase)');
      expect(config.phases.collect.passAllowed).toBe(true);
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

      // 16 original phases + 3 "show what everyone said" reveals
      const phaseNames = Object.keys(config.phases);
      expect(phaseNames).toHaveLength(19);

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

  describe('correct-answer typo trap', () => {
    function quizConfig(correctAnswer, choices) {
      return {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'q' },
          q: { type: 'collect-choice', prompt: '?', choices, correctAnswer, timer: 15, next: 'end' },
          end: { type: 'end' }
        }
      };
    }

    it('warns when a literal correctAnswer matches no choice exactly', () => {
      const result = validate(quizConfig('Camberra', ['Canberra', 'Sydney']), 'typo', { returnResults: true });
      expect(result.errors).toEqual([]);
      expect(result.warnings.some(w => String(w).includes('nobody can ever be right'))).toBe(true);
    });

    it('stays quiet when the correctAnswer matches, or is templated', () => {
      const ok = validate(quizConfig('Canberra', ['Canberra', 'Sydney']), 'ok', { returnResults: true });
      expect(ok.warnings.some(w => String(w).includes('nobody can ever be right'))).toBe(false);
      const templated = validate(quizConfig('{{trivia.result.truth}}', ['Canberra', 'Sydney']), 'tpl', { returnResults: true });
      expect(templated.warnings.some(w => String(w).includes('nobody can ever be right'))).toBe(false);
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

    it('allows ai-process phase without input (generates from scratch)', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Do something', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
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
          prev: { type: 'preview', content: 'ai.result' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "approveNext"');
    });

    it('rejects preview phase missing rejectNext', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'prev' },
          prev: { type: 'preview', content: 'ai.result', approveNext: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "rejectNext"');
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

  describe('announce phase validation', () => {
    it('rejects announce phase missing message', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ann' },
          ann: { type: 'announce', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "message"');
    });

    it('accepts valid announce phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ann' },
          ann: { type: 'announce', message: 'Round 1!', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('accepts announce phase with timer', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ann' },
          ann: { type: 'announce', message: 'Get ready!', timer: 5, next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('collect-choice phase validation', () => {
    it('rejects collect-choice phase missing prompt', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'pick' },
          pick: { type: 'collect-choice', choices: ['A', 'B'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "prompt"');
    });

    it('rejects collect-choice phase missing choices', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'pick' },
          pick: { type: 'collect-choice', prompt: 'Pick one', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow(/missing required field "choices"/);
    });

    it('accepts valid collect-choice phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'pick' },
          pick: { type: 'collect-choice', prompt: 'Pick one', choices: ['A', 'B', 'C'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects invalid from value on collect-choice', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'pick' },
          pick: { type: 'collect-choice', prompt: 'Pick', choices: ['A'], from: 'winners', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid from value "winners"');
    });

    it('accepts data ref string as choices', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Generate', input: 'lobby.responses', format: 'json', next: 'pick' },
          pick: { type: 'collect-choice', prompt: 'Pick one', choices: 'ai.result', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('ai-eliminate phase validation', () => {
    it('rejects ai-eliminate phase missing instruction', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'aielim' },
          aielim: { type: 'ai-eliminate', input: 'ask.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "instruction"');
    });

    it('rejects ai-eliminate phase missing input', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'aielim' },
          aielim: { type: 'ai-eliminate', instruction: 'Eliminate rule breakers', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "input"');
    });

    it('accepts valid ai-eliminate phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'aielim' },
          aielim: { type: 'ai-eliminate', instruction: 'Eliminate rule breakers', input: 'ask.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('loop validation', () => {
    it('rejects loopBack to nonexistent phase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'results', loopBack: 'nonexistent', loopCount: 3 },
          results: { type: 'reveal', template: 'Done', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('loopBack "nonexistent" which does not exist');
    });

    it('rejects loopBack without loopCount', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'results', loopBack: 'lobby' },
          results: { type: 'reveal', template: 'Done', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing loopCount');
    });

    it('rejects loopCount less than 2', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'results', loopBack: 'lobby', loopCount: 1 },
          results: { type: 'reveal', template: 'Done', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid loopCount');
    });

    it('rejects loopBack without next', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', loopBack: 'lobby', loopCount: 3 },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing "next" (needed as loop exit)');
    });

    it('accepts valid loop config', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'end', loopBack: 'lobby', loopCount: 3 },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });
  });

  describe('preview validation fix', () => {
    it('accepts preview with template instead of content', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'prev' },
          prev: { type: 'preview', template: '{{ai.result}}', approveNext: 'end', rejectNext: 'lobby' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('accepts preview with content', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ai' },
          ai: { type: 'ai-process', instruction: 'Do it', input: 'lobby.responses', next: 'prev' },
          prev: { type: 'preview', content: 'ai.result', approveNext: 'end', rejectNext: 'ai' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects preview with neither content nor template', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'prev' },
          prev: { type: 'preview', approveNext: 'end', rejectNext: 'lobby' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('must have either "content" or "template"');
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

  describe('screen control validation', () => {
    it('accepts valid hostShow toggles for collect', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostShow: ['prompt', 'counter'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects invalid hostShow toggle', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostShow: ['invalidToggle'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid hostShow toggle "invalidToggle"');
    });

    it('rejects invalid playerShow toggle', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', playerShow: ['badToggle'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid playerShow toggle "badToggle"');
    });

    it('rejects non-array hostShow', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostShow: 'prompt', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid hostShow');
    });

    it('rejects non-string hostTemplate', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostTemplate: 123, next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid hostTemplate');
    });

    it('accepts valid hostTemplate string', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostTemplate: 'Custom text', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('accepts empty hostShow array (hide all)', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', hostShow: [], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('accepts valid playerShow toggles for reveal', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'show' },
          show: { type: 'reveal', template: 'Done', playerShow: ['content'], next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('backward compat: no screen control fields works fine', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: { type: 'collect', prompt: 'Hi', next: 'end' },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('validates hostShow toggles per phase type', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'show' },
          show: { type: 'reveal', template: 'Done', hostShow: ['prompt'], next: 'end' },
          end: { type: 'end' }
        }
      };
      // 'prompt' is valid for collect but not for reveal
      expect(() => validate(config, 'test')).toThrow('invalid hostShow toggle "prompt"');
    });
  });

  describe('new phase types validation', () => {
    function makeConfig(overrides) {
      return {
        name: 'Test', phases: {
          lobby: { type: 'lobby', next: 'test' },
          ...overrides,
          end: { type: 'end' }
        }
      };
    }

    // team-split
    it('accepts valid team-split phase', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'random', teamCount: 3, next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects team-split missing method', () => {
      const config = makeConfig({
        test: { type: 'team-split', teamCount: 2, next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "method"');
    });

    it('rejects team-split with no sizing (neither teamCount nor groupSize)', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'random', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('needs either "Number of teams" or "Group size"');
    });

    it('rejects team-split with BOTH teamCount and groupSize', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'random', teamCount: 2, groupSize: 4, next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('pick one');
    });

    it('accepts team-split sized by groupSize with choice method', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'choice', groupSize: 4, next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects invalid teamCount', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'random', teamCount: 50, next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid teamCount');
    });

    // rank
    it('accepts valid rank phase', () => {
      const config = makeConfig({
        collect: { type: 'collect', prompt: 'Ideas?', next: 'test' },
        test: { type: 'rank', prompt: 'Rank them', candidates: 'collect.responses', next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects rank missing prompt', () => {
      const config = makeConfig({
        test: { type: 'rank', candidates: 'collect.responses', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "prompt"');
    });

    it('rejects rank missing candidates', () => {
      const config = makeConfig({
        test: { type: 'rank', prompt: 'Rank them', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "candidates"');
    });

    // wager
    it('accepts valid wager phase', () => {
      const config = makeConfig({
        test: { type: 'wager', prompt: 'Bet!', options: ['A', 'B', 'C'], next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects wager missing prompt', () => {
      const config = makeConfig({
        test: { type: 'wager', options: ['A', 'B'], next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "prompt"');
    });

    it('rejects wager missing options', () => {
      const config = makeConfig({
        test: { type: 'wager', prompt: 'Bet!', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "options"');
    });

    it('rejects invalid wager minBet', () => {
      const config = makeConfig({
        test: { type: 'wager', prompt: 'Bet!', options: ['A', 'B'], minBet: -5, next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid minBet');
    });

    it('rejects invalid wager maxBetPercent', () => {
      const config = makeConfig({
        test: { type: 'wager', prompt: 'Bet!', options: ['A', 'B'], maxBetPercent: 200, next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid maxBetPercent');
    });

    // relay
    it('accepts valid relay phase', () => {
      const config = makeConfig({
        test: { type: 'relay', prompt: 'Add a sentence', next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects relay missing prompt', () => {
      const config = makeConfig({
        test: { type: 'relay', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('missing required field "prompt"');
    });

    it('accepts relay with valid order enum', () => {
      const config = makeConfig({
        test: { type: 'relay', prompt: 'Go!', order: 'join-order', next: 'end' }
      });
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects relay with invalid order enum', () => {
      const config = makeConfig({
        test: { type: 'relay', prompt: 'Go!', order: 'alphabetical', next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid order');
    });

    // host/player toggles
    it('validates team-split hostShow toggles', () => {
      const config = makeConfig({
        test: { type: 'team-split', method: 'random', teamCount: 2, hostShow: ['invalid'], next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid hostShow toggle');
    });

    it('validates rank playerShow toggles', () => {
      const config = makeConfig({
        collect: { type: 'collect', prompt: 'Ideas?', next: 'test' },
        test: { type: 'rank', prompt: 'Rank', candidates: 'collect.responses', playerShow: ['invalid'], next: 'end' }
      });
      expect(() => validate(config, 'test')).toThrow('invalid playerShow toggle');
    });
  });

  describe('foreach phase validation', () => {
    it('accepts valid foreach config', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Answer', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: {
              show: { type: 'announce', message: 'Item', timer: 5 },
              guess: { type: 'collect-choice', prompt: 'Pick', choices: ['A', 'B'], timer: 10 }
            },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects foreach missing data', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'loop' },
          loop: {
            type: 'foreach',
            subPhases: { show: { type: 'announce', message: 'Hi' } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "data"');
    });

    it('rejects foreach missing subPhases', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('missing required field "subPhases"');
    });

    it('rejects foreach with empty subPhases', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: {},
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('empty subPhases');
    });

    it('rejects foreach with invalid sub-phase type', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: { show: { type: 'nonexistent' } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('invalid type "nonexistent"');
    });

    it('rejects foreach with invalid data ref', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'loop' },
          loop: {
            type: 'foreach', data: 'nonexistent.responses',
            subPhases: { show: { type: 'announce', message: 'Hi' } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('phase "nonexistent" does not exist');
    });

    it('rejects foreach scoring with missing subPhase', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: { show: { type: 'announce', message: 'Hi' } },
            scoring: { correctAnswer: '_current.playerName' },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('scoring is missing "subPhase"');
    });

    it('rejects foreach scoring with missing correctAnswer (correct mode)', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: { guess: { type: 'collect-choice', prompt: 'Pick', choices: ['A'] } },
            scoring: { subPhase: 'guess' },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('scoring is missing "correctAnswer"');
    });

    it('accepts foreach scoring with tally mode and pointMap', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: { rate: { type: 'collect-choice', prompt: 'Rate', choices: ['Good', 'Bad'] } },
            scoring: { subPhase: 'rate', mode: 'tally', pointMap: { 'Good': 10, 'Bad': 0 } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects foreach tally scoring without pointMap', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            subPhases: { rate: { type: 'collect-choice', prompt: 'Rate', choices: ['Good'] } },
            scoring: { subPhase: 'rate', mode: 'tally' },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('requires a "pointMap" object');
    });

    it('accepts foreach with pairMode human-vs-ai and aiInject', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            aiInject: { count: 3, instruction: 'Generate fakes' },
            pairMode: 'human-vs-ai',
            subPhases: { guess: { type: 'collect-choice', prompt: 'Pick', choices: ['Idea A', 'Idea B'] } },
            scoring: { subPhase: 'guess', correctAnswer: '_current.aiPosition', pointsCorrect: 100 },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).not.toThrow();
    });

    it('rejects pairMode without aiInject', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            pairMode: 'human-vs-ai',
            subPhases: { guess: { type: 'collect-choice', prompt: 'Pick', choices: ['A', 'B'] } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      expect(() => validate(config, 'test')).toThrow('pairMode requires aiInject');
    });

    it('rejects invalid pairMode value', () => {
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: { type: 'collect', prompt: 'Go', next: 'loop' },
          loop: {
            type: 'foreach', data: 'collect.responses',
            aiInject: { count: 2, instruction: 'Generate fakes' },
            pairMode: 'round-robin',
            subPhases: { guess: { type: 'collect-choice', prompt: 'Pick', choices: ['A', 'B'] } },
            next: 'end'
          },
          end: { type: 'end' }
        }
      };
      // Schema-driven enum check: "invalid pairMode value ... Valid values: human-vs-ai"
      expect(() => validate(config, 'test')).toThrow('invalid pairMode value');
    });
  });
});
