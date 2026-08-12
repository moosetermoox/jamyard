/**
 * remapForeachSubConfig — pure ref-rewriting for foreach iterations.
 *
 * Each iteration clones its sub-phase configs under virtual `_fe:` ids, so
 * any reference from one sub-phase to a sibling ("titles.responses" in the
 * same round) must be rewritten to the virtual id. Extracted from
 * setupForeachIteration (server.js) so the bluffing additions, choicePool
 * sources and excludeAuthored, are unit-testable.
 */

import { describe, it, expect } from 'vitest';
import { remapForeachSubConfig, resolveCurrentRefsInSubConfig } from '../../engine/phases/foreach-remap.js';

const SUBS = ['titles', 'guess', 'reveal-truth'];
const FE = 'rounds';

describe('remapForeachSubConfig', () => {
  it('rewrites template refs to sibling sub-phases in message and prompt', () => {
    const sub = {
      message: 'Votes:\n{{guess.barChart}}\nfrom {{titles.responses}}',
      prompt: 'See {{guess.tally}} but leave {{draw.responses}} alone'
    };
    remapForeachSubConfig(sub, SUBS, FE);
    expect(sub.message).toBe('Votes:\n{{_fe:rounds:guess.barChart}}\nfrom {{_fe:rounds:titles.responses}}');
    expect(sub.prompt).toBe('See {{_fe:rounds:guess.tally}} but leave {{draw.responses}} alone');
  });

  it('rewrites bare dataRefs in input and content', () => {
    const sub = { input: 'titles.responses', content: 'guess' };
    remapForeachSubConfig(sub, SUBS, FE);
    expect(sub.input).toBe('_fe:rounds:titles.responses');
    expect(sub.content).toBe('_fe:rounds:guess');
  });

  it('rewrites choicePool "from" sources naming a sibling sub-phase', () => {
    const sub = {
      choicePool: [
        { from: 'titles.responses', field: 'text' },
        { literal: '{{_current.assigned}}' },
        { from: 'outside.responses' }
      ]
    };
    remapForeachSubConfig(sub, SUBS, FE);
    expect(sub.choicePool[0].from).toBe('_fe:rounds:titles.responses');
    expect(sub.choicePool[1].literal).toBe('{{_current.assigned}}');
    expect(sub.choicePool[2].from).toBe('outside.responses');
  });

  it('rewrites excludeAuthored naming a sibling sub-phase', () => {
    const sub = { excludeAuthored: 'titles' };
    remapForeachSubConfig(sub, SUBS, FE);
    expect(sub.excludeAuthored).toBe('_fe:rounds:titles');
  });

  it('leaves excludeAuthored alone when it names an outside phase', () => {
    const sub = { excludeAuthored: 'lies-from-earlier' };
    remapForeachSubConfig(sub, SUBS, FE);
    expect(sub.excludeAuthored).toBe('lies-from-earlier');
  });

  it('handles configs with none of the remappable fields', () => {
    const sub = { type: 'announce', timer: 5 };
    expect(() => remapForeachSubConfig(sub, SUBS, FE)).not.toThrow();
    expect(sub).toEqual({ type: 'announce', timer: 5 });
  });
});

describe('resolveCurrentRefsInSubConfig', () => {
  // The iteration item, as the engine's _current resolver would see it
  const resolve = (ref) => ({
    '_current.assigned': 'a snail wedding',
    '_current.text': '[drawing]'
  })[ref];

  it('resolves {{_current.*}} in message, prompt, correctAnswer, and choicePool literals', () => {
    const sub = {
      message: 'It was {{_current.assigned}}!',
      prompt: 'About {{_current.text}}',
      correctAnswer: '{{_current.assigned}}',
      choicePool: [
        { from: 'titles.responses', field: 'text' },
        { literal: '{{_current.assigned}}' }
      ]
    };
    resolveCurrentRefsInSubConfig(sub, resolve);
    expect(sub.message).toBe('It was a snail wedding!');
    expect(sub.prompt).toBe('About [drawing]');
    // correctAnswer/choicePool matter most: left unresolved, the per-player
    // ".assigned" template machinery intercepts them at phase close and the
    // "truth" becomes a placeholder string (caught by the first robot
    // playtest of doodle-bluff).
    expect(sub.correctAnswer).toBe('a snail wedding');
    expect(sub.choicePool[1].literal).toBe('a snail wedding');
    expect(sub.choicePool[0]).toEqual({ from: 'titles.responses', field: 'text' });
  });

  it('never mutates the original config\'s choicePool entries (shared across iterations)', () => {
    const sharedPool = [{ literal: '{{_current.assigned}}' }];
    const sub1 = { choicePool: sharedPool };
    resolveCurrentRefsInSubConfig(sub1, resolve);
    expect(sub1.choicePool[0].literal).toBe('a snail wedding');
    // A second iteration cloning from the same original must still see the token
    expect(sharedPool[0].literal).toBe('{{_current.assigned}}');

    const sub2 = { choicePool: sharedPool };
    remapForeachSubConfig(sub2, SUBS, FE);
    expect(sharedPool[0]).toEqual({ literal: '{{_current.assigned}}' });
  });

  it('leaves unresolvable and non-_current tokens for runtime', () => {
    const sub = {
      message: '{{_current.missing}} and {{guess.barChart}}',
      correctAnswer: '{{trivia.result.truth}}'
    };
    resolveCurrentRefsInSubConfig(sub, resolve);
    expect(sub.message).toBe('{{_current.missing}} and {{guess.barChart}}');
    expect(sub.correctAnswer).toBe('{{trivia.result.truth}}');
  });
});
