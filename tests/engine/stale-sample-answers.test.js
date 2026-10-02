/**
 * A template's sample answers never outlive its question (2026-10-01, an
 * outside reviewer): Snowball with a class example asked "Why does natural
 * selection work?" and "Add sample answers" in Try it out still dealt the
 * template's fraction lines. A make-page question edit now drops the set
 * (like a swap always did), so Try it out writes one for the new question;
 * a copy saved before that drops it on read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyEdits, firstStudentStep } from '../../engine/make-print.js';
import { hasStaleTemplateSamples } from '../../engine/sample-answers.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const snowball = JSON.parse(read('games/snowball/config.json'));
const firstPrompt = (c) => { const s = firstStudentStep(c); return s ? s.phase.prompt : null; };
const builtinSets = [{ samples: snowball.sampleAnswers, prompt: firstPrompt(snowball) }];

describe('a changed question drops the template\'s sample answers', () => {
  it('Snowball carries an authored set about fractions to begin with', () => {
    expect(JSON.stringify(snowball.sampleAnswers)).toMatch(/fraction/i);
  });

  it('a question edit (the class example\'s path) drops them', () => {
    const { config, changed } = applyEdits(snowball, { prompt: 'Why does natural selection work?' });
    expect(changed).toBe(true);
    expect(firstPrompt(config)).toBe('Why does natural selection work?');
    expect(config.sampleAnswers).toBeUndefined();
  });

  it('an edit that leaves the question alone keeps them', () => {
    const { config } = applyEdits(snowball, { prompt: firstPrompt(snowball) });
    expect(config.sampleAnswers).toEqual(snowball.sampleAnswers);
  });
});

describe('a copy saved before the fix drops them on read', () => {
  const staleCopy = () => {
    const copy = JSON.parse(JSON.stringify(snowball));
    firstStudentStep(copy).phase.prompt = 'Why does natural selection work?';
    return copy;
  };

  it('the template\'s set under a new question is stale', () => {
    expect(hasStaleTemplateSamples(staleCopy(), builtinSets, firstPrompt)).toBe(true);
  });

  it('the template itself, a copy with its question, and a copy\'s own written set are not', () => {
    expect(hasStaleTemplateSamples(JSON.parse(JSON.stringify(snowball)), builtinSets, firstPrompt)).toBe(false);
    const own = staleCopy();
    own.sampleAnswers = { [firstStudentStep(own).id]: ['Variation plus selection over generations.'] };
    expect(hasStaleTemplateSamples(own, builtinSets, firstPrompt)).toBe(false);
    const none = staleCopy();
    delete none.sampleAnswers;
    expect(hasStaleTemplateSamples(none, builtinSets, firstPrompt)).toBe(false);
  });

  it('the server repairs on read with every built-in\'s set, gathered at startup', () => {
    const src = read('server.js');
    expect(src).toMatch(/if \(hasStaleTemplateSamples\(config, BUILTIN_SAMPLE_SETS, firstPromptOf\)\) \{\s+delete config\.sampleAnswers;/);
    expect(src).toMatch(/await loadBuiltinSampleSets\(\);/);
  });
});
