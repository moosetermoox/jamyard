/**
 * Chain headings (outside review #2, 2026-09-07): a scope:"own" reveal
 * can name the two lines over a returned chain, so Someone's Got You reads
 * "You wrote:" / "Someone wrote this for you:" instead of the generic
 * "You started with:" / "A classmate took it from there:". Defaults stay
 * exactly as they were for every existing chain activity.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatChainContent } from '../../engine/phases/chain-reveal.js';
import { validate } from '../../engine/game-loader.js';

const view = { original: 'I want to speak up in science.', steps: ['Ask the first question.'], complete: true };

describe('formatChainContent headings', () => {
  it('keeps the defaults when no heading is given', () => {
    const text = formatChainContent(view, { display: 'final' });
    expect(text).toContain('🌱 You started with:');
    expect(text).toContain('A classmate took it from there:');
  });

  it('uses the reveal\'s own headings, trimmed, and ignores blank ones', () => {
    const text = formatChainContent(view, {
      display: 'final', heading: ' You wrote: ', grewHeading: 'Someone wrote this for you:'
    });
    expect(text.split('\n')).toEqual([
      'You wrote:', '“I want to speak up in science.”', '',
      'Someone wrote this for you:', '“Ask the first question.”'
    ]);
    const blank = formatChainContent(view, { display: 'final', heading: '   ', grewHeading: '' });
    expect(blank).toContain('🌱 You started with:');
    expect(blank).toContain('A classmate took it from there:');
  });

  it('Someone\'s Got You returns each reply to its author before the wall, and still validates', () => {
    const cfg = JSON.parse(readFileSync('games/someones-got-you/config.json', 'utf8'));
    expect(cfg.phases.check.approveNext).toBe('foryou');
    expect(cfg.phases.foryou).toMatchObject({
      type: 'reveal', scope: 'own', chainFrom: ['notes', 'boost'], chainDisplay: 'final',
      chainGrewHeading: 'Someone wrote this for you:', next: 'wall'
    });
    expect(() => validate(cfg, 'someones-got-you')).not.toThrow();
    const recipe = JSON.parse(readFileSync('recipes/someones-got-you.json', 'utf8'));
    expect(recipe.template.phases.foryou).toEqual(cfg.phases.foryou);
  });
});
