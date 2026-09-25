/**
 * Tests for engine/recipe-extractor.js — extracting parameter
 * candidates from a game config and building user-finalized recipes.
 *
 * Round-trip is the most important test: a game → extract candidates →
 * build recipe → compile recipe with the same defaults → produces the
 * same game config back.
 */

import { describe, it, expect } from 'vitest';
import { extractCandidates, buildUserRecipe } from '../../engine/recipe-extractor.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validateRecipe } from '../../engine/recipe-schema.js';

// =======================================================================
// extractCandidates
// =======================================================================

describe('extractCandidates — top-level fields', () => {
  it('detects name as a templateString candidate', () => {
    const config = { name: 'My Game', phases: {} };
    const cands = extractCandidates(config);
    const nameCand = cands.find(c => c.path === 'name');
    expect(nameCand).toBeDefined();
    expect(nameCand.fieldType).toBe('templateString');
    expect(nameCand.currentValue).toBe('My Game');
    expect(nameCand.required).toBe(true);
  });

  it('detects description as a string candidate', () => {
    const config = { name: 'X', description: 'A game.', phases: {} };
    const cands = extractCandidates(config);
    const descCand = cands.find(c => c.path === 'description');
    expect(descCand).toBeDefined();
    expect(descCand.fieldType).toBe('string');
    expect(descCand.required).toBe(false);
  });
});

describe('extractCandidates — per-phase fields', () => {
  it('detects collect.prompt + collect.timer', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'How are you?', timer: 60, next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    const promptCand = cands.find(c => c.path === 'phases.ask.prompt');
    expect(promptCand).toBeDefined();
    expect(promptCand.fieldType).toBe('templateString');
    expect(promptCand.required).toBe(true);
    expect(promptCand.currentValue).toBe('How are you?');

    const timerCand = cands.find(c => c.path === 'phases.ask.timer');
    expect(timerCand).toBeDefined();
    expect(timerCand.fieldType).toBe('integer');
    expect(timerCand.required).toBe(false);
  });

  it('detects collect-choice.choices as an array candidate', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: 'collect-choice', prompt: 'Pick', choices: ['A', 'B'], next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    const choicesCand = cands.find(c => c.path === 'phases.q.choices');
    expect(choicesCand).toBeDefined();
    expect(choicesCand.fieldType).toBe('array');
    expect(choicesCand.currentValue).toEqual(['A', 'B']);
  });

  it('skips dataRef and phaseRef fields (structural)', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'collect' },
        collect: { type: 'collect', prompt: 'x', next: 'lb' },
        lb: { type: 'leaderboard', from: 'collect.responses', next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    // 'from' on leaderboard is dataRef → not a candidate
    expect(cands.find(c => c.path === 'phases.lb.from')).toBeUndefined();
    // 'next' transitions are also never candidates
    expect(cands.find(c => c.fieldName === 'next')).toBeUndefined();
  });

  it('skips screen-control mixin fields', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: {
          type: 'collect',
          prompt: 'x',
          hostShow: ['prompt', 'timer'],
          playerTemplate: 'custom',
          next: 'end'
        },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    expect(cands.find(c => c.fieldName === 'hostShow')).toBeUndefined();
    expect(cands.find(c => c.fieldName === 'playerTemplate')).toBeUndefined();
  });

  it('skips loop transitions', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: 'collect', prompt: 'x', loopBack: 'q', loopCount: 3, next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    expect(cands.find(c => c.fieldName === 'loopBack')).toBeUndefined();
    expect(cands.find(c => c.fieldName === 'loopCount')).toBeUndefined();
  });

  it('skips fields that are template tokens (runtime-computed)', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'r' },
        r: { type: 'reveal', template: '{{ask.responses.list}}', next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    // template is exactly "{{...}}" → skipped
    expect(cands.find(c => c.path === 'phases.r.template')).toBeUndefined();
  });
});

describe('extractCandidates — name collision handling', () => {
  it('uses bare field name when no collision', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'q?', next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    const promptCand = cands.find(c => c.path === 'phases.ask.prompt');
    expect(promptCand.suggestedName).toBe('prompt');
  });

  it('prefixes with phase id when two phases have the same field', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'ask1' },
        ask1: { type: 'collect', prompt: 'first?', next: 'ask2' },
        ask2: { type: 'collect', prompt: 'second?', next: 'end' },
        end: { type: 'end' }
      }
    };
    const cands = extractCandidates(config);
    const c1 = cands.find(c => c.path === 'phases.ask1.prompt');
    const c2 = cands.find(c => c.path === 'phases.ask2.prompt');
    expect(c1.suggestedName).toBe('ask1Prompt');
    expect(c2.suggestedName).toBe('ask2Prompt');
  });
});

describe('extractCandidates — null/empty handling', () => {
  it('does not skip null timer values (they are still parameterizable)', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: 'collect', prompt: 'x', timer: null, next: 'end' },
        end: { type: 'end' }
      }
    };
    // timer: null is `undefined` once read with phase[fieldName] === undefined check.
    // Actually phase.timer === null, not undefined. The check skips undefined.
    // So null values DO appear as candidates.
    const cands = extractCandidates(config);
    const timerCand = cands.find(c => c.path === 'phases.q.timer');
    expect(timerCand).toBeDefined();
    expect(timerCand.currentValue).toBeNull();
  });
});

// =======================================================================
// buildUserRecipe — round-trip
// =======================================================================

describe('buildUserRecipe', () => {
  const sampleGame = {
    name: 'Mood Check',
    description: 'How are you feeling?',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'How are you?', timer: 45, next: 'end' },
      end: { type: 'end' }
    }
  };

  it('builds a valid recipe from a game', () => {
    const { recipe, diagnostics } = buildUserRecipe(
      sampleGame,
      [
        { path: 'phases.ask.prompt', name: 'question', label: 'Question' },
        { path: 'phases.ask.timer', name: 'timer', label: 'Timer (seconds)' }
      ],
      {
        id: 'my-mood',
        name: 'My Mood',
        description: 'A mood game.',
        icon: '🌡️'
      }
    );

    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(recipe).not.toBeNull();
    expect(recipe.id).toBe('my-mood');
    expect(recipe.parameters.question).toBeDefined();
    expect(recipe.parameters.question.type).toBe('templateString');
    expect(recipe.parameters.question.default).toBe('How are you?');
    expect(recipe.parameters.timer.type).toBe('integer');
    expect(recipe.parameters.timer.default).toBe(45);

    // Template should have ${question} substituted in
    expect(recipe.template.phases.ask.prompt).toBe('${question}');
    expect(recipe.template.phases.ask.timer).toBe('${timer}');
  });

  it('round-trip: extract → build → compile produces equivalent game', () => {
    const candidates = extractCandidates(sampleGame);
    const promptCand = candidates.find(c => c.path === 'phases.ask.prompt');
    const timerCand = candidates.find(c => c.path === 'phases.ask.timer');

    const { recipe } = buildUserRecipe(
      sampleGame,
      [
        { path: promptCand.path, name: 'q' },
        { path: timerCand.path, name: 't' }
      ],
      { id: 'rt', name: 'Round Trip', description: 'Test.', icon: '🧪' }
    );

    // Compile with the original values
    const { config } = compileRecipe(recipe, { q: 'How are you?', t: 45 });
    expect(config.phases.ask.prompt).toBe('How are you?');
    expect(config.phases.ask.timer).toBe(45);
  });

  it('rejects invalid parameter names', () => {
    const { recipe, diagnostics } = buildUserRecipe(
      sampleGame,
      [{ path: 'phases.ask.prompt', name: '123-bad' }],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe).toBeNull();
    expect(diagnostics.some(d => d.message.includes('123-bad'))).toBe(true);
  });

  it('rejects duplicate parameter names', () => {
    const { recipe, diagnostics } = buildUserRecipe(
      sampleGame,
      [
        { path: 'name', name: 'foo' },
        { path: 'phases.ask.prompt', name: 'foo' }
      ],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe).toBeNull();
    expect(diagnostics.some(d => d.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects invalid recipe id', () => {
    const { recipe, diagnostics } = buildUserRecipe(
      sampleGame,
      [],
      { id: 'has spaces', name: 'X', description: 'X' }
    );
    expect(recipe).toBeNull();
    expect(diagnostics.some(d => d.message.toLowerCase().includes('alphanumeric'))).toBe(true);
  });

  it('rejects when path is not a candidate', () => {
    const { recipe, diagnostics } = buildUserRecipe(
      sampleGame,
      [{ path: 'phases.lobby.next', name: 'wat' }],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe).toBeNull();
    expect(diagnostics.some(d => d.message.includes('No candidate'))).toBe(true);
  });

  it('omits default when original value is null', () => {
    const game = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: 'collect', prompt: 'x', timer: null, next: 'end' },
        end: { type: 'end' }
      }
    };
    const { recipe } = buildUserRecipe(
      game,
      [{ path: 'phases.q.timer', name: 'timer' }],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe.parameters.timer.default).toBeUndefined();
  });

  it('preserves array item type and bounds from schema', () => {
    const game = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'q' },
        q: { type: 'collect-choice', prompt: 'p', choices: ['A', 'B'], next: 'end' },
        end: { type: 'end' }
      }
    };
    const { recipe } = buildUserRecipe(
      game,
      [{ path: 'phases.q.choices', name: 'choices' }],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe.parameters.choices.type).toBe('array');
    expect(recipe.parameters.choices.item).toEqual({ type: 'string' });
    expect(recipe.parameters.choices.default).toEqual(['A', 'B']);
  });

  it('preserves enum values from schema', () => {
    const game = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'v' },
        c: { type: 'collect', prompt: 'p', next: 'v' },
        v: {
          type: 'vote', mode: 'pick-one', candidates: 'c.responses', next: 'end'
        },
        end: { type: 'end' }
      }
    };
    const { recipe } = buildUserRecipe(
      game,
      [{ path: 'phases.v.mode', name: 'voteMode' }],
      { id: 'x', name: 'X', description: 'X' }
    );
    expect(recipe.parameters.voteMode.type).toBe('enum');
    expect(recipe.parameters.voteMode.values).toEqual(['pick-one', 'head-to-head', 'approve']);
  });

  it('produced recipe passes validateRecipe', () => {
    const { recipe } = buildUserRecipe(
      sampleGame,
      [{ path: 'phases.ask.prompt', name: 'question' }],
      { id: 'x', name: 'X', description: 'desc' }
    );
    expect(validateRecipe(recipe).filter(d => d.severity === 'error')).toEqual([]);
  });
});
