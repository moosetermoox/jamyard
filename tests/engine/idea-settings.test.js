import { describe, it, expect } from 'vitest';
import { parseAnonymity, applyIdeaSettings } from '../../engine/idea-settings.js';

// A reviewer asked for "a five-minute anonymous history poll" (2026-09-23)
// and the saved copy had student names Shown: no recipe has an anonymity
// parameter, and the route never read the word. The idea is read
// deterministically, like the minutes are.

describe('parseAnonymity', () => {
  it('reads anonymous and anonymously as names hidden', () => {
    expect(parseAnonymity('A five-minute anonymous history poll about causes of the American Revolution')).toBe(true);
    expect(parseAnonymity('Students answer anonymously, then we discuss.')).toBe(true);
  });

  it('reads the plain phrasings for hidden names', () => {
    expect(parseAnonymity('One question, no names, results on the board.')).toBe(true);
    expect(parseAnonymity('Collect their worries without names.')).toBe(true);
    expect(parseAnonymity('Names hidden please, it is a sensitive topic.')).toBe(true);
    expect(parseAnonymity('Hide student names on the projector.')).toBe(true);
  });

  it('reads a teacher saying names stay as names shown', () => {
    expect(parseAnonymity('Not anonymous, I want to see who said what.')).toBe(false);
    expect(parseAnonymity('A non-anonymous poll with names.')).toBe(false);
    expect(parseAnonymity('Show names on the board so we can follow up.')).toBe(false);
  });

  it('says nothing when the idea says nothing', () => {
    expect(parseAnonymity('A quick poll about the causes of the American Revolution.')).toBe(null);
    expect(parseAnonymity('')).toBe(null);
    expect(parseAnonymity(undefined)).toBe(null);
  });

  it('is not fooled by a recipe name or a stray word', () => {
    // "Anonymous Feedback" is a recipe name; a teacher typing it wants the
    // names off, which is the same answer, so the recipe name is fine.
    expect(parseAnonymity('anonymous feedback on my teaching')).toBe(true);
    expect(parseAnonymity('The names of the planets, in order.')).toBe(null);
  });
});

describe('applyIdeaSettings', () => {
  it('writes anonymous onto the config and reports it', () => {
    const config = { name: 'Live Poll', phases: {} };
    const applied = applyIdeaSettings(config, 'an anonymous poll about the Revolution');
    expect(config.anonymous).toBe(true);
    expect(applied).toEqual({ anonymous: true });
  });

  it('leaves a silent idea alone, whatever the config had', () => {
    const on = { anonymous: true };
    expect(applyIdeaSettings(on, 'a quick poll')).toEqual({});
    expect(on.anonymous).toBe(true);
    const off = {};
    expect(applyIdeaSettings(off, 'a quick poll')).toEqual({});
    expect(off.anonymous).toBeUndefined();
  });

  it('turns names back on when the teacher said so', () => {
    const config = { anonymous: true };
    expect(applyIdeaSettings(config, 'with names shown')).toEqual({ anonymous: false });
    expect(config.anonymous).toBe(false);
  });

  it('survives a missing config', () => {
    expect(applyIdeaSettings(null, 'anonymous')).toEqual({});
  });
});
