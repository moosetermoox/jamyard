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
});
