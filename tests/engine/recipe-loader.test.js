/**
 * Tests for the R6 additions to engine/recipe-loader.js:
 *   - Compatibility check sets _broken when a recipe template doesn't
 *     compile + validate against the current PHASE_SCHEMAS.
 *   - summarizeRecipe surfaces source/broken/brokenReason for the picker.
 *
 * The full end-to-end (filesystem scan + cache busting + endpoint
 * behavior) is verified by recipes-integration.test.js and the manual
 * smoke tests against the live server.
 */

import { describe, it, expect } from 'vitest';
import { summarizeRecipe } from '../../engine/recipe-loader.js';

describe('summarizeRecipe', () => {
  it('exposes source/broken/brokenReason', () => {
    const recipe = {
      id: 'x',
      name: 'X',
      description: 'X',
      icon: '🎯',
      tagline: 'tag',
      parameters: {},
      template: { phases: {} },
      _source: 'user',
      _broken: true,
      _brokenReason: 'phase type "frobnicate" no longer exists'
    };
    const summary = summarizeRecipe(recipe);
    expect(summary.source).toBe('user');
    expect(summary.broken).toBe(true);
    expect(summary.brokenReason).toBe('phase type "frobnicate" no longer exists');
  });

  it('defaults to non-broken when flags are absent', () => {
    const recipe = {
      id: 'x', name: 'X', description: 'X',
      parameters: {}, template: { phases: {} }
    };
    const summary = summarizeRecipe(recipe);
    expect(summary.broken).toBe(false);
    expect(summary.brokenReason).toBeNull();
    expect(summary.source).toBeNull();
  });

  it('preserves the recipe payload teachers need (parameters, name, etc.)', () => {
    const recipe = {
      id: 'r', name: 'R',
      icon: '✨',
      description: 'desc',
      tagline: 'tg',
      parameters: { q: { type: 'string' } },
      template: { phases: {} }
    };
    const s = summarizeRecipe(recipe);
    expect(s.id).toBe('r');
    expect(s.name).toBe('R');
    expect(s.icon).toBe('✨');
    expect(s.description).toBe('desc');
    expect(s.tagline).toBe('tg');
    expect(s.parameters).toEqual({ q: { type: 'string' } });
  });
});
