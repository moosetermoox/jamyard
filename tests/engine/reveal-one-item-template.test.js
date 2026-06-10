/**
 * reveal-one itemTemplate — per-item display templating.
 *
 * Born from a real leak: feedback-coach-academy put {{_current.critique}} in
 * the reveal-one *message* (resolved once, no item scope) so students saw raw
 * code. itemTemplate is the supported way to show object items readably, and
 * the validator now flags _current used anywhere it can't resolve.
 */

import { describe, it, expect } from 'vitest';
import { formatRevealItem } from '../../engine/phase-handlers/reveal-one.js';
import { validate } from '../../engine/game-loader.js';

describe('formatRevealItem', () => {
  const item = { playerName: 'Maya', score: 85, critique: 'Specific and kind.' };

  it('fills {{_current.field}} tokens from the item', () => {
    expect(formatRevealItem(item, '{{_current.playerName}} — {{_current.score}}/100'))
      .toBe('Maya — 85/100');
  });

  it('renders missing paths as empty string, never raw code', () => {
    const out = formatRevealItem(item, 'X{{_current.nope}}Y {{_current.deep.er.path}}');
    expect(out).toBe('XY ');
    expect(out).not.toContain('{{');
  });

  it('bare {{_current}} uses the string item or its text/name', () => {
    expect(formatRevealItem('plain answer', '> {{_current}}')).toBe('> plain answer');
    expect(formatRevealItem({ text: 'hi' }, '> {{_current}}')).toBe('> hi');
  });

  it('without a template keeps the readable fallbacks', () => {
    expect(formatRevealItem('already a string')).toBe('already a string');
    expect(formatRevealItem({ text: 'the text' })).toBe('the text');
    expect(formatRevealItem({ name: 'Ben', response: 'tacos' })).toBe('Ben: tacos');
    expect(formatRevealItem({ weird: true })).toBe('{"weird":true}');
  });
});

describe('validator: special scopes out of context', () => {
  function gameWith(phaseOverrides) {
    return {
      name: 'Scope Test',
      phases: {
        lobby: { type: 'lobby', next: 'announce' },
        announce: { type: 'announce', message: 'hi', next: 'end', ...phaseOverrides.announce },
        ...phaseOverrides.extra,
        end: { type: 'end' }
      }
    };
  }

  function warningsFor(config) {
    const res = validate(config, 'scope-test', { returnResults: true });
    return res.warnings.filter(w => /raw code on screen/.test(w));
  }

  it('flags {{_current.x}} in a non-foreach phase', () => {
    const w = warningsFor(gameWith({ announce: { message: 'Hello {{_current.critique}}' } }));
    expect(w.length).toBe(1);
    expect(w[0]).toContain('_current');
  });

  it('flags _current in a reveal-one MESSAGE but allows it in itemTemplate', () => {
    const config = gameWith({
      extra: {
        collectStep: { type: 'collect', prompt: 'say things', next: 'revealOne' },
        revealOne: {
          type: 'reveal-one',
          from: 'collectStep.responses',
          message: '{{_current.playerName}} says:',
          itemTemplate: '{{_current.text}}',
          next: 'end'
        }
      }
    });
    config.phases.announce.next = 'collectStep';
    const w = warningsFor(config);
    expect(w.length).toBe(1);
    expect(w[0]).toContain('message');
    expect(w[0]).toContain('itemTemplate'); // the hint points at the fix
  });

  it('flags {{_pair.answers}} outside a pair-scoped reveal but allows it inside one', () => {
    const bad = warningsFor(gameWith({ announce: { message: '{{_pair.answers}}' } }));
    expect(bad.length).toBe(1);

    const config = gameWith({
      extra: {
        ask: { type: 'collect', prompt: 'q', assign: 'pairwise', next: 'share' },
        share: { type: 'reveal', scope: 'pair', pairsFrom: 'ask', template: '{{_pair.answers}}', next: 'end' }
      }
    });
    config.phases.announce.next = 'ask';
    expect(warningsFor(config).length).toBe(0);
  });

  it('does not flag foreach sub-phases (the valid context)', () => {
    const config = gameWith({
      extra: {
        ask: { type: 'collect', prompt: 'q', next: 'loop' },
        loop: {
          type: 'foreach',
          data: 'ask.responses',
          subPhases: {
            show: { type: 'announce', message: '{{_current.text}}', timer: 5 }
          },
          next: 'end'
        }
      }
    });
    config.phases.announce.next = 'ask';
    expect(warningsFor(config).length).toBe(0);
  });
});
