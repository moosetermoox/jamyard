import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../engine/game-engine.js';

const testConfig = {
  name: 'Test Game',
  phases: {
    lobby: { type: 'lobby', minPlayers: 2, next: 'collect' },
    collect: { type: 'collect', prompt: 'What is your answer?', next: 'process' },
    process: { type: 'ai-process', input: 'collect.responses', next: 'reveal' },
    reveal: { type: 'reveal', template: '{{process.result}}', next: 'end' },
    end: { type: 'end', message: 'Done!' }
  }
};

describe('GameEngine', () => {
  describe('creation', () => {
    it('can create an engine with a config', () => {
      const engine = new GameEngine(testConfig);
      expect(engine).toBeDefined();
      expect(engine.config).toBe(testConfig);
    });

    it('has a player registry', () => {
      const engine = new GameEngine(testConfig);
      expect(engine.players).toBeDefined();
      expect(engine.players.count()).toBe(0);
    });
  });

  describe('phases', () => {
    it('starts in the lobby phase', () => {
      const engine = new GameEngine(testConfig);
      const phase = engine.getCurrentPhase();
      expect(phase.id).toBe('lobby');
      expect(phase.type).toBe('lobby');
    });

    it('returns the full phase config from getCurrentPhase', () => {
      const engine = new GameEngine(testConfig);
      const phase = engine.getCurrentPhase();
      expect(phase.minPlayers).toBe(2);
      expect(phase.next).toBe('collect');
    });
  });

  describe('transitions', () => {
    it('can transition to the next phase', () => {
      const engine = new GameEngine(testConfig);
      engine.transition('collect');
      expect(engine.getCurrentPhase().id).toBe('collect');
    });

    it('can follow a chain of transitions', () => {
      const engine = new GameEngine(testConfig);
      engine.transition('collect');
      engine.transition('process');
      engine.transition('reveal');
      engine.transition('end');
      expect(engine.getCurrentPhase().id).toBe('end');
    });

    it('throws on invalid transition', () => {
      const engine = new GameEngine(testConfig);
      expect(() => engine.transition('end')).toThrow();
    });
  });

  describe('phase data', () => {
    it('can store and retrieve phase data', () => {
      const engine = new GameEngine(testConfig);
      const responses = [
        { playerId: 'p1', name: 'Alice', text: 'Hello' },
        { playerId: 'p2', name: 'Bob', text: 'World' }
      ];
      engine.storePhaseData('collect', { responses });
      expect(engine.getPhaseData('collect')).toEqual({ responses });
    });

    it('returns undefined for phases with no stored data', () => {
      const engine = new GameEngine(testConfig);
      expect(engine.getPhaseData('collect')).toBeUndefined();
    });
  });

  describe('data references', () => {
    it('resolves a simple phase.field reference', () => {
      const engine = new GameEngine(testConfig);
      engine.storePhaseData('process', { result: 'A funny poem' });
      expect(engine.resolve('process.result')).toBe('A funny poem');
    });

    it('resolves a reference to an array', () => {
      const engine = new GameEngine(testConfig);
      const responses = [
        { playerId: 'p1', name: 'Alice', text: 'Hiking' },
        { playerId: 'p2', name: 'Bob', text: 'Reading' }
      ];
      engine.storePhaseData('collect', { responses });
      expect(engine.resolve('collect.responses')).toEqual(responses);
    });

    it('resolves a nested path like phase.field.property', () => {
      const engine = new GameEngine(testConfig);
      const responses = [{ playerId: 'p1', name: 'Alice', text: 'Hiking' }];
      engine.storePhaseData('collect', { responses });
      expect(engine.resolve('collect.responses.length')).toBe(1);
    });

    it('returns undefined for a reference to a phase with no data', () => {
      const engine = new GameEngine(testConfig);
      expect(engine.resolve('collect.responses')).toBeUndefined();
    });

    it('returns undefined for a reference to a nonexistent field', () => {
      const engine = new GameEngine(testConfig);
      engine.storePhaseData('collect', { responses: [] });
      expect(engine.resolve('collect.missing')).toBeUndefined();
    });
  });

  describe('built-in variables', () => {
    it('getBuiltInVariables returns remaining, eliminated, and players', () => {
      const engine = new GameEngine(testConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.players.add('p3', 'Carol');
      engine.players.eliminate('p2');

      const vars = engine.getBuiltInVariables();
      expect(vars.players).toHaveLength(3);
      expect(vars.remaining).toHaveLength(2);
      expect(vars.eliminated).toHaveLength(1);
      expect(vars.eliminated[0].id).toBe('p2');
    });

    it('resolve returns remaining players via built-in variable', () => {
      const engine = new GameEngine(testConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');

      const remaining = engine.resolve('remaining');
      expect(remaining).toHaveLength(2);
    });

    it('resolve returns eliminated players via built-in variable', () => {
      const engine = new GameEngine(testConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.players.eliminate('p2');

      const eliminated = engine.resolve('eliminated');
      expect(eliminated).toHaveLength(1);
      expect(eliminated[0].id).toBe('p2');
    });

    it('resolve handles nested built-in paths like remaining.length', () => {
      const engine = new GameEngine(testConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.players.add('p3', 'Carol');
      engine.players.eliminate('p3');

      expect(engine.resolve('remaining.length')).toBe(2);
      expect(engine.resolve('eliminated.length')).toBe(1);
      expect(engine.resolve('players.length')).toBe(3);
    });

    it('built-in variables take precedence over phase data with same name', () => {
      const engine = new GameEngine(testConfig);
      engine.players.add('p1', 'Alice');
      engine.storePhaseData('remaining', { fake: true });

      const remaining = engine.resolve('remaining');
      expect(Array.isArray(remaining)).toBe(true);
    });
  });

  describe('runPhase', () => {
    const eliminateConfig = {
      name: 'Eliminate Game',
      phases: {
        lobby: { type: 'lobby', next: 'vote' },
        vote: { type: 'vote', mode: 'pick-one', candidates: 'lobby.responses', voters: 'all', next: 'eliminate' },
        eliminate: { type: 'eliminate', method: 'bottom-percent', percent: 50, from: 'vote.scores', next: 'winner' },
        winner: { type: 'winner', from: 'vote.scores', next: 'end' },
        end: { type: 'end', message: 'Done!' }
      }
    };

    it('runPhase with eliminate type removes bottom players by score', () => {
      const engine = new GameEngine(eliminateConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.players.add('p3', 'Carol');
      engine.players.add('p4', 'Dave');

      engine.storePhaseData('vote', { scores: { p1: 5, p2: 1, p3: 3, p4: 2 } });

      const result = engine.runPhase('eliminate');
      expect(result.eliminated).toContain('p2');
      expect(result.eliminated).toContain('p4');
      expect(engine.players.getRemaining().map(p => p.id)).toContain('p1');
    });

    it('runPhase with eliminate type using hook method', () => {
      const hookConfig = {
        name: 'Hook Game',
        phases: {
          lobby: { type: 'lobby', next: 'eliminate' },
          eliminate: { type: 'eliminate', method: 'hook', hook: 'myHook', input: 'lobby.data', next: 'end' },
          end: { type: 'end' }
        }
      };
      const engine = new GameEngine(hookConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');

      engine.hooks = {
        myHook: (context) => ['p2']
      };
      engine.storePhaseData('lobby', { data: 'test' });

      const result = engine.runPhase('eliminate');
      expect(result.eliminated).toEqual(['p2']);
      expect(engine.players.getRemaining().map(p => p.id)).toEqual(['p1']);
    });

    it('runPhase with winner type determines winner from scores', () => {
      const engine = new GameEngine(eliminateConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');

      engine.storePhaseData('vote', { scores: { p1: 5, p2: 3 } });

      const result = engine.runPhase('winner');
      expect(result.winnerId).toBe('p1');
      expect(result.winnerName).toBe('Alice');
      expect(result.winnerScore).toBe(5);
      expect(result.standings).toHaveLength(2);
    });

    it('runPhase with vote pick-one type returns candidate and voter info', () => {
      const engine = new GameEngine(eliminateConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');

      const responses = [
        { playerId: 'p1', text: 'Answer A' },
        { playerId: 'p2', text: 'Answer B' }
      ];
      engine.storePhaseData('lobby', { responses });

      const result = engine.runPhase('vote');
      expect(result.candidateIds).toEqual(['p1', 'p2']);
      expect(result.voters).toHaveLength(2);
    });

    it('runPhase with vote head-to-head type returns matchups', () => {
      const h2hConfig = {
        name: 'H2H Game',
        phases: {
          lobby: { type: 'lobby', next: 'vote' },
          vote: { type: 'vote', mode: 'head-to-head', candidates: 'lobby.responses', voters: 'all', next: 'end' },
          end: { type: 'end' }
        }
      };
      const engine = new GameEngine(h2hConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.players.add('p3', 'Carol');

      const responses = [
        { playerId: 'p1', text: 'A' },
        { playerId: 'p2', text: 'B' },
        { playerId: 'p3', text: 'C' }
      ];
      engine.storePhaseData('lobby', { responses });

      const result = engine.runPhase('vote');
      expect(result.matchups.length).toBeGreaterThan(0);
      expect(result.comparisons).toBeGreaterThan(0);
      expect(result.candidateIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('runPhase stores results in phase data', () => {
      const engine = new GameEngine(eliminateConfig);
      engine.players.add('p1', 'Alice');
      engine.players.add('p2', 'Bob');
      engine.storePhaseData('vote', { scores: { p1: 5, p2: 3 } });

      engine.runPhase('winner');

      const stored = engine.getPhaseData('winner');
      expect(stored).toBeDefined();
      expect(stored.winnerId).toBe('p1');
    });

    it('runPhase throws for unknown phase type', () => {
      const engine = new GameEngine(testConfig);
      expect(() => engine.runPhase('lobby')).toThrow('No handler for phase type "lobby"');
    });

    it('runPhase throws for nonexistent phase', () => {
      const engine = new GameEngine(testConfig);
      expect(() => engine.runPhase('nonexistent')).toThrow('Phase "nonexistent" not found');
    });
  });

  describe('loop system', () => {
    const loopConfig = {
      name: 'Loop Game',
      phases: {
        lobby: { type: 'lobby', next: 'round-collect' },
        'round-collect': { type: 'collect', prompt: 'Answer!', next: 'round-results' },
        'round-results': { type: 'reveal', template: 'Round {{_loop.round-results.iteration}} of {{_loop.round-results.total}}', next: 'end', loopBack: 'round-collect', loopCount: 3 },
        end: { type: 'end' }
      }
    };

    it('resolve handles _loop iteration and total variables', () => {
      const engine = new GameEngine(loopConfig);
      engine.loopState['round-results'] = { iteration: 2, total: 3 };

      expect(engine.resolve('_loop.round-results.iteration')).toBe(2);
      expect(engine.resolve('_loop.round-results.total')).toBe(3);
    });

    it('resolve returns defaults for _loop before loop state is initialized', () => {
      const engine = new GameEngine(loopConfig);
      // Before any loop state exists, should return 1 for iteration and loopCount for total
      expect(engine.resolve('_loop.round-results.iteration')).toBe(1);
      expect(engine.resolve('_loop.round-results.total')).toBe(3);
    });

    it('resolve returns undefined for _loop referencing nonexistent phase', () => {
      const engine = new GameEngine(loopConfig);
      expect(engine.resolve('_loop.nonexistent.iteration')).toBeUndefined();
    });

    it('storePhaseData stores versioned copy when inside a loop', () => {
      const engine = new GameEngine(loopConfig);
      engine.loopState['round-results'] = { iteration: 2, total: 3 };

      engine.storePhaseData('round-collect', { responses: ['a'] });

      // Bare key has latest data
      expect(engine.getPhaseData('round-collect')).toEqual({ responses: ['a'] });
      // Versioned key also exists
      expect(engine.getPhaseData('round-collect~2')).toEqual({ responses: ['a'] });
    });

    it('storePhaseData does not create versioned copy when not in a loop', () => {
      const engine = new GameEngine(loopConfig);

      engine.storePhaseData('round-collect', { responses: ['a'] });

      expect(engine.getPhaseData('round-collect')).toEqual({ responses: ['a'] });
      expect(engine.getPhaseData('round-collect~1')).toBeUndefined();
    });

    it('buildStateMachineConfig includes loopBack as valid transition', () => {
      const engine = new GameEngine(loopConfig);
      // Should be able to transition from round-results to round-collect (loopBack)
      engine.transition('round-collect');
      engine.transition('round-results');
      engine.transition('round-collect'); // loopBack transition
      expect(engine.getCurrentPhase().id).toBe('round-collect');
    });
  });

  describe('preview phase transitions', () => {
    it('supports approveNext and rejectNext transitions', () => {
      const config = {
        name: 'Preview Game',
        phases: {
          lobby: { type: 'lobby', next: 'preview' },
          preview: { type: 'preview', content: 'process.result', approveNext: 'reveal', rejectNext: 'fallback' },
          reveal: { type: 'reveal', template: 'Approved!', next: 'end' },
          fallback: { type: 'reveal', template: 'Rejected!', next: 'end' },
          end: { type: 'end' }
        }
      };
      const engine = new GameEngine(config);
      engine.transition('preview');
      engine.transition('reveal');
      expect(engine.getCurrentPhase().id).toBe('reveal');
    });
  });

  describe('foreach state', () => {
    const foreachConfig = {
      name: 'Foreach Game',
      phases: {
        lobby: { type: 'lobby', next: 'foreach1' },
        foreach1: { type: 'foreach', data: 'collect.responses', subPhases: { show: { type: 'announce' } }, next: 'end' },
        end: { type: 'end' }
      }
    };

    it('has foreachState initialized', () => {
      const engine = new GameEngine(foreachConfig);
      expect(engine.foreachState).toEqual({});
      expect(engine._currentForeachItem).toBeNull();
      expect(engine._foreachCandidates).toBeNull();
    });

    it('resolve handles _current when item is set', () => {
      const engine = new GameEngine(foreachConfig);
      engine._currentForeachItem = { text: 'hello', playerId: 'p1', playerName: 'Alice' };

      expect(engine.resolve('_current.text')).toBe('hello');
      expect(engine.resolve('_current.playerId')).toBe('p1');
      expect(engine.resolve('_current.playerName')).toBe('Alice');
    });

    it('resolve returns undefined for _current when no item set', () => {
      const engine = new GameEngine(foreachConfig);
      expect(engine.resolve('_current.text')).toBeUndefined();
    });

    it('resolve handles _current with nested pair objects (pairMode)', () => {
      const engine = new GameEngine(foreachConfig);
      engine._currentForeachItem = {
        a: { text: 'Human idea', isHuman: true, isAI: false },
        b: { text: 'AI idea', isHuman: false, isAI: true },
        aiPosition: 'Idea B',
        humanPosition: 'Idea A'
      };

      expect(engine.resolve('_current.a.text')).toBe('Human idea');
      expect(engine.resolve('_current.b.text')).toBe('AI idea');
      expect(engine.resolve('_current.a.isHuman')).toBe(true);
      expect(engine.resolve('_current.b.isAI')).toBe(true);
      expect(engine.resolve('_current.aiPosition')).toBe('Idea B');
      expect(engine.resolve('_current.humanPosition')).toBe('Idea A');
    });

    it('resolve handles _foreach index and total', () => {
      const engine = new GameEngine(foreachConfig);
      engine.foreachState['foreach1'] = {
        items: [{}, {}, {}],
        currentIndex: 1,
        scores: {}
      };

      expect(engine.resolve('_foreach.foreach1.index')).toBe(2); // 1-based
      expect(engine.resolve('_foreach.foreach1.total')).toBe(3);
    });

    it('resolve handles _foreach.scores', () => {
      const engine = new GameEngine(foreachConfig);
      engine.foreachState['foreach1'] = {
        items: [],
        currentIndex: 0,
        scores: { p1: 100, p2: 200 }
      };

      const scores = engine.resolve('_foreach.foreach1.scores');
      expect(scores).toEqual({ p1: 100, p2: 200 });
    });

    it('resolve returns empty array for _candidates when none set', () => {
      const engine = new GameEngine(foreachConfig);
      expect(engine.resolve('_candidates')).toEqual([]);
    });

    it('resolve returns candidates when set', () => {
      const engine = new GameEngine(foreachConfig);
      engine._foreachCandidates = ['Alice', 'Bob', 'Charlie'];
      expect(engine.resolve('_candidates')).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  describe('dynamic transitions', () => {
    it('addDynamicTransition allows new transitions', () => {
      const engine = new GameEngine(testConfig);
      // Initially can't transition from lobby to end
      expect(() => engine.transition('end')).toThrow();

      // Add dynamic transition
      engine.stateMachine.addDynamicTransition('lobby', 'end');
      engine.transition('end');
      expect(engine.getCurrentPhase().id).toBe('end');
    });

    it('addDynamicTransition does not duplicate', () => {
      const engine = new GameEngine(testConfig);
      engine.stateMachine.addDynamicTransition('lobby', 'end');
      engine.stateMachine.addDynamicTransition('lobby', 'end');
      // Should still work, just one entry
      const transitions = engine.stateMachine.transitions['lobby'];
      const endCount = transitions.filter(t => t === 'end').length;
      expect(endCount).toBe(1);
    });
  });

  describe('barChart resolver', () => {
    it('renders a tally as ASCII bars with counts and percentages', () => {
      const engine = new GameEngine({
        phases: {
          lobby: { type: 'lobby', next: 'poll' },
          poll: { type: 'collect-choice', choices: ['Yes', 'No'], next: 'end' },
          end: { type: 'end' }
        }
      });
      engine.storePhaseData('poll', { tally: { Yes: 4, No: 2 } });
      const chart = engine.resolve('poll.barChart');
      expect(chart).toContain('Yes');
      expect(chart).toContain('No');
      expect(chart).toContain('4 (67%)');
      expect(chart).toContain('2 (33%)');
      expect(chart).toContain('█');
      expect(chart).toContain('░');
    });

    it('sorts bars from most to least', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('lobby', { tally: { Low: 1, High: 5, Mid: 3 } });
      const chart = engine.resolve('lobby.barChart');
      const lines = chart.split('\n');
      expect(lines[0]).toContain('High');
      expect(lines[1]).toContain('Mid');
      expect(lines[2]).toContain('Low');
    });

    it('returns placeholder when tally is empty', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('lobby', { tally: {} });
      expect(engine.resolve('lobby.barChart')).toBe('(no responses)');
    });

    // Graded charts: the stored resolved correctAnswer marks its row with a
    // trailing ✓ so the screens can color THAT bar green (not the biggest —
    // a green most-popular bar read as "right" when the class guessed wrong).
    it('marks the correct answer row with a trailing check on graded charts', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('quiz', { tally: { Paris: 2, London: 5 }, correctAnswer: 'Paris' });
      const lines = engine.resolve('quiz.barChart').split('\n');
      expect(lines[0]).toContain('London');
      expect(lines[0]).not.toContain('✓');
      expect(lines[1]).toContain('Paris');
      expect(lines[1]).toMatch(/✓\s*$/);
    });

    it('matches the correct answer like scoring does (trim + case-insensitive)', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('quiz', { tally: { Paris: 3 }, correctAnswer: '  paris ' });
      expect(engine.resolve('quiz.barChart')).toMatch(/Paris.*✓\s*$/);
    });

    it('adds a zero row when nobody picked the correct answer', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('quiz', { tally: { London: 5, Rome: 1 }, correctAnswer: 'Paris' });
      const chart = engine.resolve('quiz.barChart');
      expect(chart).toContain('Paris');
      expect(chart).toMatch(/Paris\s+░+\s+0 \(0%\) ✓/);
    });

    it('never marks ungraded charts (polls and votes keep no check)', () => {
      const engine = new GameEngine({
        phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
      });
      engine.storePhaseData('poll', { tally: { Yes: 4, No: 2 } });
      expect(engine.resolve('poll.barChart')).not.toContain('✓');
    });
  });
});
