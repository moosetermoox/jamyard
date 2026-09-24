import { describe, it, expect } from 'vitest';
import { refitRecipeIdFor } from '../../engine/match-refit.js';

// The matcher pointed "an anonymous history poll with four choices" at the
// Live Poll built-in (2026-09-23), and Make it yours opened the default
// question about today's lesson. The built-in is the live-poll recipe with
// its defaults, so the pick is really a recipe pick with the teacher's
// content still to fill.

const loaded = [
  { id: 'live-poll', config: { name: 'Live Poll', recipe: { id: 'live-poll', version: '1', params: {} } } },
  { id: 'snowball', config: { name: 'Snowball' } },
  { id: 'broken-stamp', config: { name: 'Odd', recipe: { version: '1' } } }
];

describe('refitRecipeIdFor', () => {
  it('names the recipe behind a recipe-born built-in', () => {
    expect(refitRecipeIdFor('live-poll', loaded)).toBe('live-poll');
  });

  it('is null for a hand-made built-in', () => {
    expect(refitRecipeIdFor('snowball', loaded)).toBe(null);
  });

  it('is null for an unknown id, a stamp without an id, or bad input', () => {
    expect(refitRecipeIdFor('nope', loaded)).toBe(null);
    expect(refitRecipeIdFor('broken-stamp', loaded)).toBe(null);
    expect(refitRecipeIdFor(undefined, loaded)).toBe(null);
    expect(refitRecipeIdFor('live-poll', null)).toBe(null);
  });
});
