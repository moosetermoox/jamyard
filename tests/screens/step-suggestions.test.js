/**
 * Builder suggestion engine — the load-bearing rule is HOSTABLE-AS-IS:
 * every step the + button can land, in every context it can land in, must
 * pass the real validator with zero edits. A suggestion that needs typing
 * before it works is a bug.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';

const S = globalThis.StepSuggestions;

function validateGame(phases, label) {
  const config = {
    name: 'Suggestion Test',
    description: 'built by the suggestion engine test',
    phases
  };
  const result = validate(config, 'suggestion-test', { returnResults: true });
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
}

function baseGame() {
  return {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'What did you learn today?', timer: 60, next: 'end' },
    end: { type: 'end', message: 'Done!' }
  };
}

describe('ordering + ids', () => {
  it('orders phases by the next-chain from lobby', () => {
    const phases = baseGame();
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'end']);
  });

  it('still lists unreachable phases at the end', () => {
    const phases = baseGame();
    phases.stray = { type: 'announce', message: 'hi' };
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'end', 'stray']);
  });

  it('freshId avoids collisions', () => {
    const phases = { reveal: {}, 'reveal-2': {} };
    expect(S.freshId(phases, 'reveal')).toBe('reveal-3');
    expect(S.freshId(phases, 'vote')).toBe('vote');
  });
});

describe('every opening suggestion is hostable as-is', () => {
  for (const sug of S.suggestOpening()) {
    it(`opening: ${sug.type}`, () => {
      const phases = { lobby: { type: 'lobby', next: 'first' } };
      const phase = S.defaultPhaseFor(sug.type, { phases });
      expect(phase, `no default builder for ${sug.type}`).toBeTruthy();
      phase.next = 'end';
      phases.first = phase;
      phases.end = { type: 'end', message: 'Done!' };
      validateGame(phases, `opening ${sug.type}`);
    });
  }
});

describe('every after-collect suggestion is hostable as-is', () => {
  const ctx = () => ({ phases: baseGame(), afterId: 'ask' });
  for (const sug of S.suggestAfter('collect', { phases: baseGame(), afterId: 'ask' })) {
    if (sug.type === 'ai') continue; // pairs tested separately
    it(`after collect: ${sug.type}`, () => {
      const c = ctx();
      const phase = S.defaultPhaseFor(sug.type, c);
      expect(phase, `no default builder for ${sug.type}`).toBeTruthy();
      const id = S.freshId(c.phases, 'step-' + sug.type);
      S.insertAfter(c.phases, 'ask', id, phase);
      validateGame(c.phases, `after-collect ${sug.type}`);
    });
  }
});

describe('suggestions without answers never point at answers', () => {
  it('no vote/ai suggestions after a reveal when nothing was collected', () => {
    const phases = {
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'welcome', next: 'end' },
      end: { type: 'end', message: 'bye' }
    };
    const sugs = S.suggestAfter('announce', { phases, afterId: 'intro' });
    expect(sugs.some(s => s.ai)).toBe(false);
  });

  it('reveal default without a collect upstream uses static text', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    const phase = S.defaultPhaseFor('reveal', { phases });
    expect(phase.template).not.toContain('{{');
  });
});

describe('AI pair', () => {
  it('lands as ai-process + reveal, both hostable as-is', () => {
    const phases = baseGame();
    for (const flavor of S.aiFlavors()) {
      const test = JSON.parse(JSON.stringify(phases));
      const pair = S.buildAiPair(flavor, { phases: test, afterId: 'ask' });
      expect(pair, `${flavor.key} should build a pair`).toBeTruthy();
      expect(pair).toHaveLength(2);
      S.insertAfter(test, 'ask', pair[0].id, pair[0].phase);
      S.insertAfter(test, pair[0].id, pair[1].id, pair[1].phase);
      validateGame(test, `ai flavor ${flavor.key}`);
    }
  });

  it('refuses to build when no answers exist upstream', () => {
    const phases = { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } };
    expect(S.buildAiPair(S.aiFlavors()[0], { phases })).toBeNull();
  });

  it('every flavor carries real instructions', () => {
    for (const flavor of S.aiFlavors()) {
      expect(flavor.instructions.length).toBeGreaterThan(40);
      expect(flavor.title.length).toBeGreaterThan(3);
    }
  });
});

describe('arc detection gates the wrap-up', () => {
  it('no arc: ask without show', () => {
    expect(S.hasArc(baseGame())).toBe(false);
  });

  it('arc: ask + reveal', () => {
    const phases = baseGame();
    phases.show = { type: 'reveal', template: 'here it is' };
    expect(S.hasArc(phases)).toBe(true);
  });

  it('wrap-up tile appears only with an arc and leads the row', () => {
    const noArc = S.suggestAfter('collect', { phases: baseGame(), afterId: 'ask' });
    expect(noArc.some(s => s.type === 'end')).toBe(false);

    const phases = baseGame();
    delete phases.end; // building in progress, no end yet
    phases.ask.next = 'show';
    phases.show = { type: 'reveal', template: 'answers!' };
    const withArc = S.suggestAfter('reveal', { phases, afterId: 'show' });
    expect(withArc[0].type).toBe('end');
    expect(withArc[0].feelsComplete).toBe(true);
  });

  it('wrap-up never offered twice', () => {
    const phases = baseGame();
    phases.show = { type: 'reveal', template: 'answers!' };
    const sugs = S.suggestAfter('reveal', { phases, afterId: 'show' });
    expect(sugs.some(s => s.type === 'end')).toBe(false); // end already exists
  });

  it('end default is hostable', () => {
    const phases = baseGame();
    phases.ask.next = 'wrap';
    phases.wrap = S.defaultPhaseFor('end', { phases });
    delete phases.end;
    validateGame(phases, 'wrap-up');
  });
});

describe('moveStep reorders the chain', () => {
  function fiveStep() {
    return {
      lobby: { type: 'lobby', next: 'a' },
      a: { type: 'announce', message: 'a', next: 'b' },
      b: { type: 'collect', prompt: 'b?', next: 'c' },
      c: { type: 'reveal', template: 'c', next: 'end' },
      end: { type: 'end', message: 'bye' }
    };
  }

  it('moves a step down', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'b', 'down')).toBe(true);
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'c', 'b', 'end']);
    validateGame(p, 'after move down');
  });

  it('moves a step up', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'c', 'up')).toBe(true);
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'c', 'b', 'end']);
    validateGame(p, 'after move up');
  });

  it('refuses illegal moves', () => {
    const p = fiveStep();
    expect(S.moveStep(p, 'lobby', 'down')).toBe(false);
    expect(S.moveStep(p, 'end', 'up')).toBe(false);
    expect(S.moveStep(p, 'a', 'up')).toBe(false);      // already first
    expect(S.moveStep(p, 'c', 'down')).toBe(false);    // end is below
    expect(S.orderedPhaseIds(p)).toEqual(['lobby', 'a', 'b', 'c', 'end']);
  });

  it('leaves branch fields untouched', () => {
    const p = fiveStep();
    p.a.approveNext = 'c';
    S.moveStep(p, 'b', 'down');
    expect(p.a.approveNext).toBe('c');
  });
});

describe('insertAfter rewires the chain', () => {
  it('splices into the next-pointers', () => {
    const phases = baseGame();
    S.insertAfter(phases, 'ask', 'mid', { type: 'announce', message: 'pause' });
    expect(phases.ask.next).toBe('mid');
    expect(phases.mid.next).toBe('end');
    expect(S.orderedPhaseIds(phases)).toEqual(['lobby', 'ask', 'mid', 'end']);
  });
});
