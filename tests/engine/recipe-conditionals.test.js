/**
 * Recipe compiler conditionals — $if / $value / $repeat / $map directives.
 *
 * Why: ${param} substitution can't include/exclude fields or phases, which
 * forced Closer's pairing, Snowball's rounds, and One Voice's attempt cap
 * OUT of their recipes (the engine supports all three). These directives
 * keep recipes data-not-code while allowing structural variation, and
 * $repeat unlocks the long-deferred quiz-show recipe.
 */

import { describe, it, expect } from 'vitest';
import { compileRecipe } from '../../engine/recipe-compiler.js';

function mkRecipe(parameters, phases) {
  return {
    id: 'test-recipe',
    name: 'Test',
    description: 'test',
    parameters,
    template: { name: 'Test Game', description: 'test', phases }
  };
}

function compileOk(recipe, params) {
  const { config, diagnostics } = compileRecipe(recipe, params);
  const errors = diagnostics.filter(d => d.severity === 'error');
  expect(errors, JSON.stringify(errors)).toEqual([]);
  expect(config).not.toBeNull();
  return config;
}

// =====================================================================
// $if on phases (+ transition rewiring)
// =====================================================================

const voteRecipe = mkRecipe(
  { withVote: { type: 'boolean', default: false } },
  {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'Say something', next: 'vote' },
    vote: {
      $if: 'withVote',
      type: 'vote', mode: 'pick-one', candidates: 'ask.responses', next: 'end'
    },
    end: { type: 'end' }
  }
);

describe('$if on phases', () => {
  it('keeps the phase (and strips $if) when the condition is true', () => {
    const config = compileOk(voteRecipe, { withVote: true });
    expect(config.phases.vote).toBeDefined();
    expect(config.phases.vote.$if).toBeUndefined();
    expect(config.phases.vote.type).toBe('vote');
    expect(config.phases.ask.next).toBe('vote');
  });

  it('drops the phase and rewires next through it when false', () => {
    const config = compileOk(voteRecipe, { withVote: false });
    expect(config.phases.vote).toBeUndefined();
    expect(config.phases.ask.next).toBe('end'); // skipped through the drop
  });

  it('rewires through a chain of consecutively dropped phases', () => {
    const recipe = mkRecipe(
      { extra: { type: 'boolean', default: false } },
      {
        lobby: { type: 'lobby', next: 'a' },
        a: { type: 'announce', message: 'hi', next: 'b' },
        b: { $if: 'extra', type: 'announce', message: 'b', next: 'c' },
        c: { $if: 'extra', type: 'announce', message: 'c', next: 'end' },
        end: { type: 'end' }
      }
    );
    const config = compileOk(recipe, {});
    expect(config.phases.a.next).toBe('end');
  });

  it('errors when a ref points at a dropped phase with nowhere to go', () => {
    const recipe = mkRecipe(
      { extra: { type: 'boolean', default: false } },
      {
        lobby: { type: 'lobby', next: 'dead' },
        dead: { $if: 'extra', type: 'end' } // no next to follow
      }
    );
    const { config, diagnostics } = compileRecipe(recipe, {});
    expect(config).toBeNull();
    expect(diagnostics.some(d => d.severity === 'error' && /dead/.test(d.message))).toBe(true);
  });
});

// =====================================================================
// Condition syntax
// =====================================================================

describe('condition syntax', () => {
  function recipeWithCond(cond) {
    return mkRecipe(
      { mode: { type: 'enum', values: ['rotate', 'keep'], default: 'rotate' } },
      {
        lobby: { type: 'lobby', next: 'maybe' },
        maybe: { $if: cond, type: 'announce', message: 'shown', next: 'end' },
        end: { type: 'end' }
      }
    );
  }

  it('name=value matches enum params', () => {
    expect(compileOk(recipeWithCond('mode=rotate'), { mode: 'rotate' }).phases.maybe).toBeDefined();
    expect(compileOk(recipeWithCond('mode=rotate'), { mode: 'keep' }).phases.maybe).toBeUndefined();
  });

  it('name!=value negates equality', () => {
    expect(compileOk(recipeWithCond('mode!=keep'), { mode: 'rotate' }).phases.maybe).toBeDefined();
    expect(compileOk(recipeWithCond('mode!=keep'), { mode: 'keep' }).phases.maybe).toBeUndefined();
  });

  it('!name negates truthiness', () => {
    const r = mkRecipe(
      { skip: { type: 'boolean', default: false } },
      {
        lobby: { type: 'lobby', next: 'maybe' },
        maybe: { $if: '!skip', type: 'announce', message: 'shown', next: 'end' },
        end: { type: 'end' }
      }
    );
    expect(compileOk(r, { skip: false }).phases.maybe).toBeDefined();
    expect(compileOk(r, { skip: true }).phases.maybe).toBeUndefined();
  });

  it('unknown param in a condition is a compile error (author bug)', () => {
    const { config, diagnostics } = compileRecipe(recipeWithCond('nope=x'), {});
    expect(config).toBeNull();
    expect(diagnostics.some(d => /nope/.test(d.message))).toBe(true);
  });
});

// =====================================================================
// {$if, $value} envelope for conditional FIELDS
// =====================================================================

describe('$value envelope', () => {
  const recipe = mkRecipe(
    {
      pairing: { type: 'enum', values: ['rotate', 'keep'], default: 'rotate' },
      source: { type: 'string', default: 'earlier' }
    },
    {
      lobby: { type: 'lobby', next: 'ask' },
      ask: {
        type: 'collect', prompt: 'q', assign: 'pairwise',
        rotatePairsFrom: { $if: 'pairing=rotate', $value: '${source}' },
        reusePairsFrom: { $if: 'pairing=keep', $value: '${source}' },
        next: 'end'
      },
      end: { type: 'end' }
    }
  );

  it('keeps only the matching field, with substitution inside $value', () => {
    const rot = compileOk(recipe, { pairing: 'rotate' });
    expect(rot.phases.ask.rotatePairsFrom).toBe('earlier');
    expect(rot.phases.ask.reusePairsFrom).toBeUndefined();

    const keep = compileOk(recipe, { pairing: 'keep' });
    expect(keep.phases.ask.rotatePairsFrom).toBeUndefined();
    expect(keep.phases.ask.reusePairsFrom).toBe('earlier');
  });

  it('$value preserves non-string types', () => {
    const r = mkRecipe(
      { cap: { type: 'boolean', default: true } },
      {
        lobby: { type: 'lobby', next: 'count' },
        count: {
          type: 'one-voice', target: 20,
          maxAttempts: { $if: 'cap', $value: 5 },
          next: 'end'
        },
        end: { type: 'end' }
      }
    );
    expect(compileOk(r, { cap: true }).phases.count.maxAttempts).toBe(5);
    expect(compileOk(r, { cap: false }).phases.count.maxAttempts).toBeUndefined();
  });

  it('drops $if elements from arrays', () => {
    const r = mkRecipe(
      { extra: { type: 'boolean', default: false } },
      {
        lobby: { type: 'lobby', next: 'rate' },
        rate: {
          type: 'rate', prompt: 'p',
          scales: [
            { id: 'a', label: 'A', min: 1, max: 5 },
            { $if: 'extra', id: 'b', label: 'B', min: 1, max: 5 }
          ],
          next: 'end'
        },
        end: { type: 'end' }
      }
    );
    expect(compileOk(r, { extra: false }).phases.rate.scales).toHaveLength(1);
    expect(compileOk(r, { extra: true }).phases.rate.scales).toHaveLength(2);
  });
});

// =====================================================================
// $repeat — array-driven phase generation (the quiz-show enabler)
// =====================================================================

describe('$repeat', () => {
  const quizRecipe = mkRecipe(
    {
      questions: {
        type: 'array', required: true,
        item: {
          type: 'object',
          fields: {
            question: { type: 'string' },
            choices: { type: 'array', item: { type: 'string' } },
            correct: { type: 'string' }
          }
        }
      }
    },
    {
      lobby: { type: 'lobby', next: 'q1' },
      $repeat: {
        forEach: 'questions',
        keyPattern: 'q${i}',
        phase: {
          type: 'collect-choice',
          prompt: 'Q${i} of ${n}: ${item.question}',
          choices: '${item.choices}',
          correctAnswer: '${item.correct}',
          next: '${nextKey}'
        },
        after: 'end'
      },
      end: { type: 'end' }
    }
  );

  const QUESTIONS = [
    { question: 'Capital of Australia?', choices: ['Canberra', 'Sydney'], correct: 'Canberra' },
    { question: '2+2?', choices: ['3', '4'], correct: '4' }
  ];

  it('expands one phase per array item, chained in order', () => {
    const config = compileOk(quizRecipe, { questions: QUESTIONS });
    expect(config.phases.$repeat).toBeUndefined();
    expect(config.phases.q1.prompt).toBe('Q1 of 2: Capital of Australia?');
    expect(config.phases.q1.choices).toEqual(['Canberra', 'Sydney']); // native array
    expect(config.phases.q1.correctAnswer).toBe('Canberra');
    expect(config.phases.q1.next).toBe('q2');
    expect(config.phases.q2.next).toBe('end'); // last one exits via "after"
  });

  it('preserves the position of phases declared after the repeat', () => {
    const config = compileOk(quizRecipe, { questions: QUESTIONS });
    const keys = Object.keys(config.phases);
    expect(keys.indexOf('q1')).toBeLessThan(keys.indexOf('q2'));
    expect(keys.indexOf('q2')).toBeLessThan(keys.indexOf('end'));
  });

  it('errors when forEach names a non-array param', () => {
    const r = mkRecipe(
      { count: { type: 'integer', default: 3 } },
      {
        lobby: { type: 'lobby', next: 'end' },
        $repeat: { forEach: 'count', keyPattern: 'x${i}', phase: { type: 'announce', message: 'x', next: '${nextKey}' }, after: 'end' },
        end: { type: 'end' }
      }
    );
    const { config, diagnostics } = compileRecipe(r, {});
    expect(config).toBeNull();
    expect(diagnostics.some(d => /count/.test(d.message))).toBe(true);
  });
});

// =====================================================================
// $repeat with a "phases" map — several phases per item (question +
// reveal beats, the Speed Quiz shape)
// =====================================================================

describe('$repeat — multi-phase "phases" map', () => {
  const revealRecipe = mkRecipe(
    {
      questions: {
        type: 'array', required: true,
        item: {
          type: 'object',
          fields: {
            question: { type: 'string' },
            correct: { type: 'string' }
          }
        }
      }
    },
    {
      lobby: { type: 'lobby', next: 'q1' },
      $repeat: {
        forEach: 'questions',
        phases: {
          'q${i}': {
            type: 'collect-choice',
            prompt: 'Q${i} of ${n}: ${item.question}',
            choices: ['a', 'b'],
            correctAnswer: '${item.correct}',
            next: 'r${i}'
          },
          'r${i}': {
            type: 'announce',
            message: 'The answer was: ${item.correct}!\n\n{{q${i}.barChart}}',
            next: '${nextKey}'
          }
        },
        after: 'end'
      },
      end: { type: 'end' }
    }
  );

  const QUESTIONS = [
    { question: 'Capital of Australia?', correct: 'Canberra' },
    { question: '2+2?', correct: '4' }
  ];

  it('interleaves the per-item phases in declaration order', () => {
    const config = compileOk(revealRecipe, { questions: QUESTIONS });
    expect(Object.keys(config.phases)).toEqual(['lobby', 'q1', 'r1', 'q2', 'r2', 'end']);
  });

  it('chains within an item explicitly and across items via nextKey', () => {
    const config = compileOk(revealRecipe, { questions: QUESTIONS });
    expect(config.phases.q1.next).toBe('r1');
    expect(config.phases.r1.next).toBe('q2'); // nextKey = FIRST phase of next item
    expect(config.phases.q2.next).toBe('r2');
    expect(config.phases.r2.next).toBe('end'); // last item exits via "after"
  });

  it('compile-time ${i} composes with runtime {{...}} tokens', () => {
    const config = compileOk(revealRecipe, { questions: QUESTIONS });
    expect(config.phases.r2.message).toBe('The answer was: 4!\n\n{{q2.barChart}}');
  });

  it('rewires refs through an $if-dropped generated phase', () => {
    const r = mkRecipe(
      {
        questions: { type: 'array', required: true, item: { type: 'string' } },
        reveal: { type: 'boolean', default: true }
      },
      {
        lobby: { type: 'lobby', next: 'q1' },
        $repeat: {
          forEach: 'questions',
          phases: {
            'q${i}': { type: 'announce', message: '${item}', next: 'r${i}' },
            'r${i}': { $if: 'reveal', type: 'announce', message: 'reveal', next: '${nextKey}' }
          },
          after: 'end'
        },
        end: { type: 'end' }
      }
    );
    const config = compileOk(r, { questions: ['a', 'b'], reveal: false });
    expect(config.phases.r1).toBeUndefined();
    expect(config.phases.q1.next).toBe('q2'); // skips the dropped reveal
    expect(config.phases.q2.next).toBe('end');
  });

  it('errors on a $repeat with neither "phase" nor a "phases" map', () => {
    const r = mkRecipe(
      { questions: { type: 'array', required: true, item: { type: 'string' } } },
      {
        lobby: { type: 'lobby', next: 'end' },
        $repeat: { forEach: 'questions', keyPattern: 'x${i}' },
        end: { type: 'end' }
      }
    );
    const { config, diagnostics } = compileRecipe(r, { questions: ['a'] });
    expect(config).toBeNull();
    expect(diagnostics.some(d => /invalid \$repeat/.test(d.message))).toBe(true);
  });
});

// =====================================================================
// $map — derived arrays (leaderboard summing N generated rounds)
// =====================================================================

describe('$map', () => {
  it('builds an array by templating each item', () => {
    const r = mkRecipe(
      { questions: { type: 'array', required: true, item: { type: 'string' } } },
      {
        lobby: { type: 'lobby', next: 'board' },
        board: {
          type: 'leaderboard',
          from: { $map: 'questions', value: 'q${i}.scores' },
          next: 'end'
        },
        end: { type: 'end' }
      }
    );
    const config = compileOk(r, { questions: ['a', 'b', 'c'] });
    expect(config.phases.board.from).toEqual(['q1.scores', 'q2.scores', 'q3.scores']);
  });
});

// =====================================================================
// Dotted-path placeholders (general)
// =====================================================================

describe('dotted-path placeholders', () => {
  it('resolves ${param.field} into object params', () => {
    const r = mkRecipe(
      { topic: { type: 'object', fields: { title: { type: 'string' } }, default: { title: 'Oceans' } } },
      {
        lobby: { type: 'lobby', next: 'a' },
        a: { type: 'announce', message: 'Today: ${topic.title}', next: 'end' },
        end: { type: 'end' }
      }
    );
    expect(compileOk(r, {}).phases.a.message).toBe('Today: Oceans');
  });
});
