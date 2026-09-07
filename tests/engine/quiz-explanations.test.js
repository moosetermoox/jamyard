/**
 * Quiz explanations and discussion prompts (outside review #2, batch 3):
 * a quiz-show question may carry `explanation` (shown with the answer on
 * the results step) and `discussionPrompt` (the teacher console's
 * "Something to ask", put on the projector on demand). Both optional:
 * the compiler fills object-item defaults so an older question list
 * still compiles, and the step's discussionPrompt is a screenControl
 * field every top-level step accepts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileRecipe, applyDefaults } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';

const recipe = JSON.parse(readFileSync('recipes/quiz-show.json', 'utf8'));
const speedQuiz = JSON.parse(readFileSync('games/speed-quiz/config.json', 'utf8'));

const bare = { question: 'What is 2 + 2?', choices: ['3', '4', '5'], correct: '4' };
const full = {
  question: 'Capital of Australia?', choices: ['Sydney', 'Canberra'], correct: 'Canberra',
  explanation: 'Canberra was purpose-built as a compromise between Sydney and Melbourne.',
  discussionPrompt: 'What made Sydney tempting?'
};

describe('applyDefaults on object items', () => {
  it('fills missing item fields from the item spec, without touching the given params', () => {
    const params = { questions: [bare] };
    const out = applyDefaults(recipe, params);
    expect(out.questions[0].explanation).toBe('');
    expect(out.questions[0].discussionPrompt).toBe('');
    expect(params.questions[0].explanation).toBeUndefined();
  });
});

describe('quiz-show compiles with and without explanations', () => {
  it('a question without them compiles to a plain results step', () => {
    const { config, diagnostics } = compileRecipe(recipe, { questions: [bare] });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.phases.r1.message).toContain('The answer was: 4!');
    expect(config.phases.r1.discussionPrompt).toBe('');
    expect(() => validate(config, 'q')).not.toThrow();
  });

  it('a question with them puts the why on the results step and the prompt on the console field', () => {
    const { config, diagnostics } = compileRecipe(recipe, { questions: [full] });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.phases.r1.message).toContain(full.explanation);
    expect(config.phases.r1.discussionPrompt).toBe(full.discussionPrompt);
  });
});

describe('Speed Quiz carries a why and a question for every item', () => {
  it('every stamped question has an explanation and a discussion prompt', () => {
    for (const q of speedQuiz.recipe.params.questions) {
      expect(q.explanation, q.question).toBeTruthy();
      expect(q.discussionPrompt, q.question).toBeTruthy();
    }
    expect(speedQuiz.phases.r1.message).toContain(speedQuiz.recipe.params.questions[0].explanation);
  });
});
