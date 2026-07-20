/**
 * AI name re-hydration — the output half of AI data minimization: names
 * never go TO the model, so the server fills `playerName` on anything the
 * model returns with a recognized playerId (feedback-coach-academy's
 * per-player judge results are the shipped example).
 */

import { describe, it, expect } from 'vitest';
import { fillPlayerNames } from '../../engine/ai-name-fill.js';

const NAMES = { p1: 'Maya', p2: 'Dev' };
const lookup = (id) => NAMES[id] || null;

describe('fillPlayerNames', () => {
  it('fills playerName on per-player result arrays (the judge pattern)', () => {
    const out = [
      { playerId: 'p1', score: 88, critique: 'Specific and kind.' },
      { playerId: 'p2', score: 74, critique: 'Add a next step.' }
    ];
    fillPlayerNames(out, lookup);
    expect(out[0].playerName).toBe('Maya');
    expect(out[1].playerName).toBe('Dev');
  });

  it('overwrites a model-garbled playerName with the registry truth', () => {
    const out = [{ playerId: 'p1', playerName: 'Mia', score: 50 }];
    fillPlayerNames(out, lookup);
    expect(out[0].playerName).toBe('Maya');
  });

  it('leaves unknown playerIds untouched', () => {
    const out = [{ playerId: 'ghost', playerName: 'AI Invention', score: 1 }];
    fillPlayerNames(out, lookup);
    expect(out[0].playerName).toBe('AI Invention');
  });

  it('reaches nested shapes (objects in objects, arrays in objects)', () => {
    const out = {
      winner: { playerId: 'p2', reason: 'clearest answer' },
      groups: [{ label: 'similar', members: [{ playerId: 'p1' }] }]
    };
    fillPlayerNames(out, lookup);
    expect(out.winner.playerName).toBe('Dev');
    expect(out.groups[0].members[0].playerName).toBe('Maya');
  });

  it('passes through scalars, null, and scoreMaps unchanged', () => {
    expect(fillPlayerNames('a poem', lookup)).toBe('a poem');
    expect(fillPlayerNames(null, lookup)).toBeNull();
    const scores = { p1: 245, p2: 198 };
    fillPlayerNames(scores, lookup);
    expect(scores).toEqual({ p1: 245, p2: 198 }); // values are numbers, no objects to fill
  });
});
