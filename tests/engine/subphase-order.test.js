/**
 * restoreSubPhaseOrder — foreach sub-phases run in key order, and a jsonb
 * round trip (or a model rewrite) can hand the keys back shuffled.
 */
import { describe, it, expect } from 'vitest';
import { restoreSubPhaseOrder } from '../../engine/subphase-order.js';

const reference = {
  phases: {
    rounds: { type: 'foreach', subPhases: { titles: { type: 'collect' }, guess: { type: 'collect-choice' }, 'reveal-truth': { type: 'announce' } } },
    end: { type: 'end' }
  }
};

describe('restoreSubPhaseOrder', () => {
  it('puts a jsonb-sorted round back in the written order, keeping the edited contents', () => {
    const config = {
      phases: {
        rounds: { type: 'foreach', subPhases: { guess: { type: 'collect-choice', prompt: 'edited' }, titles: { type: 'collect' }, 'reveal-truth': { type: 'announce' } } },
        end: { type: 'end' }
      }
    };
    expect(restoreSubPhaseOrder(config, reference)).toEqual(['rounds']);
    expect(Object.keys(config.phases.rounds.subPhases)).toEqual(['titles', 'guess', 'reveal-truth']);
    expect(config.phases.rounds.subPhases.guess.prompt).toBe('edited');
  });

  it('leaves a real restructure alone (a sub-phase added or removed)', () => {
    const config = { phases: { rounds: { type: 'foreach', subPhases: { guess: {}, titles: {} } } } };
    expect(restoreSubPhaseOrder(config, reference)).toEqual([]);
    expect(Object.keys(config.phases.rounds.subPhases)).toEqual(['guess', 'titles']);
  });

  it('is a no-op when the order already matches, and safe on odd input', () => {
    const config = { phases: { rounds: { type: 'foreach', subPhases: { titles: {}, guess: {}, 'reveal-truth': {} } } } };
    expect(restoreSubPhaseOrder(config, reference)).toEqual([]);
    expect(restoreSubPhaseOrder(null, reference)).toEqual([]);
    expect(restoreSubPhaseOrder({ phases: {} }, { phases: {} })).toEqual([]);
  });
});
