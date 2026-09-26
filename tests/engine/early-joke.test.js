/**
 * early-joke.js — the first N students to join a room each see a random
 * dad joke (a nudge to log in quickly). Server-owned: the room state says
 * who got which joke, so a refresh shows the same one and the eleventh
 * student gets none. The joke list is a checked-in JSON built from
 * docs/500-all-ages-dad-jokes.md by scripts/build-dad-jokes.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseJokeList, createEarlyJokeState, dealJoke, jokeFor,
  validateEarlyJoke, EARLY_JOKE_MAX_FIRST, DAD_JOKES, splitJoke, EARLY_JOKE_PUNCHLINE_MS,
  isEarlyJokeOn, earlyJokeFirst, EARLY_JOKE_DEFAULT_FIRST, isEarlyBirdJoin
} from '../../engine/early-joke.js';
import { validate } from '../../engine/game-loader.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EM = String.fromCharCode(0x2014);

describe('parseJokeList', () => {
  it('strips the numbers and drops the preamble', () => {
    const md = '# Title\n\nSource: somewhere.\n\n1. First joke.\n2. Second joke?  Yes.\n';
    expect(parseJokeList(md)).toEqual(['First joke.', 'Second joke? Yes.']);
  });

  it('folds continuation lines into the joke and drops blank lines between them', () => {
    const md = "1. What is a pumpkin's sport?\r\n\r\nSquash.\r\n2. Me: hi\nDoctor: no\n\nMe: ok\n3. Last.";
    expect(parseJokeList(md)).toEqual([
      "What is a pumpkin's sport?\nSquash.",
      'Me: hi\nDoctor: no\nMe: ok',
      'Last.'
    ]);
  });

  it('turns em dashes into commas (no em dashes reach students)', () => {
    expect(parseJokeList('1. Origami ' + EM + ' paper-view.\n')).toEqual(['Origami, paper-view.']);
  });
});

describe('engine/dad-jokes.json', () => {
  it('is the built output of the docs list: 480 strings, no numbers, no em dashes, no blanks', () => {
    const built = JSON.parse(readFileSync(join(root, 'engine', 'dad-jokes.json'), 'utf8'));
    expect(built).toEqual([...DAD_JOKES]);
    expect(built.length).toBe(480);
    for (const joke of built) {
      expect(typeof joke).toBe('string');
      expect(joke.trim().length).toBeGreaterThan(0);
      expect(joke).not.toMatch(/^\d+\./);
      expect(joke).not.toContain(EM);
    }
  });

  it('matches a fresh parse of the docs list (re-run scripts/build-dad-jokes.js after editing it)', () => {
    const source = readFileSync(join(root, 'docs', '500-all-ages-dad-jokes.md'), 'utf8');
    expect(parseJokeList(source)).toEqual([...DAD_JOKES]);
  });
});

describe('splitJoke', () => {
  it('holds back the answer to a question', () => {
    expect(splitJoke('Why did the tomato blush? Because it saw the salad dressing.')).toEqual({
      setup: 'Why did the tomato blush?', punchline: 'Because it saw the salad dressing.', pauseMs: EARLY_JOKE_PUNCHLINE_MS
    });
  });

  it('keeps a quote mark after the question with the setup', () => {
    expect(splitJoke('"Why do seagulls fly over the ocean?" "Because bagels."').setup).toBe('"Why do seagulls fly over the ocean?"');
  });

  it('uses the joke\'s own last line as the punchline', () => {
    const s = splitJoke('Me: hi\nDoctor: no\nMe: Trick question.');
    expect(s.setup).toBe('Me: hi\nDoctor: no');
    expect(s.punchline).toBe('Me: Trick question.');
  });

  it('splits a statement at its last sentence break, or an ellipsis', () => {
    expect(splitJoke('I used to work in a shoe shop. It was sole destroying.')).toMatchObject({ setup: 'I used to work in a shoe shop.', punchline: 'It was sole destroying.' });
    expect(splitJoke('Slept like a log last night … woke up in the fireplace.')).toMatchObject({ setup: 'Slept like a log last night …', punchline: 'woke up in the fireplace.' });
  });

  it('turns a one-liner on its comma or dash', () => {
    expect(splitJoke('I used to be a banker, but I lost interest.')).toMatchObject({ setup: 'I used to be a banker', punchline: 'but I lost interest.' });
    expect(splitJoke('Geology rocks, but Geography is where it\'s at!')).toMatchObject({ setup: 'Geology rocks', punchline: 'but Geography is where it\'s at!' });
    expect(splitJoke('I am reading a book on glue – can\'t put it down.')).toMatchObject({ setup: 'I am reading a book on glue', punchline: 'can\'t put it down.' });
  });

  it('never cuts inside a quotation', () => {
    const s = splitJoke('The librarian replied, "yes, they are right behind you"');
    expect(s.setup).toBe('The librarian replied');
    expect(s.punchline).toBe('"yes, they are right behind you"');
    const c = splitJoke('He replies, ‘No, just leave it in the carton!’');
    expect(c.setup).toBe('He replies');
  });

  it('tells a one-breath joke whole, with no pause', () => {
    expect(splitJoke('Writing with a broken pencil is pointless.')).toMatchObject({ setup: 'Writing with a broken pencil is pointless.', punchline: null });
  });

  it('gives every real joke a non-empty setup and never an empty punchline', () => {
    for (const joke of DAD_JOKES) {
      const s = splitJoke(joke);
      expect(s.setup.length).toBeGreaterThan(0);
      if (s.punchline !== null) expect(s.punchline.length).toBeGreaterThan(0);
    }
  });
});

describe('createEarlyJokeState', () => {
  it('is ON by default: no field means the default count', () => {
    expect(createEarlyJokeState({ name: 'X' })).toEqual({ first: EARLY_JOKE_DEFAULT_FIRST, dealt: {} });
    expect(createEarlyJokeState({ earlyJoke: true })).toEqual({ first: EARLY_JOKE_DEFAULT_FIRST, dealt: {} });
    expect(isEarlyJokeOn({ name: 'X' })).toBe(true);
    expect(earlyJokeFirst({ name: 'X' })).toBe(EARLY_JOKE_DEFAULT_FIRST);
  });

  it('is null when the teacher turned it off, or there is no config', () => {
    expect(createEarlyJokeState({ earlyJoke: false })).toBeNull();
    expect(isEarlyJokeOn({ earlyJoke: false })).toBe(false);
    expect(earlyJokeFirst({ earlyJoke: false })).toBe(0);
    expect(createEarlyJokeState(null)).toBeNull();
  });

  it('carries the count and starts with nothing dealt', () => {
    expect(createEarlyJokeState({ earlyJoke: { first: 3 } })).toEqual({ first: 3, dealt: {} });
  });
});

describe('dealJoke', () => {
  const jokes = ['a', 'b', 'c', 'd'];

  it('gives the first N joiners a joke each and the next one nothing', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 2 } });
    expect(typeof dealJoke(state, 'p1', jokes)).toBe('string');
    expect(typeof dealJoke(state, 'p2', jokes)).toBe('string');
    expect(dealJoke(state, 'p3', jokes)).toBeNull();
    expect(Object.keys(state.dealt).sort()).toEqual(['p1', 'p2']);
  });

  it('never deals the same joke twice in one room while the list lasts', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 4 } });
    const dealt = ['p1', 'p2', 'p3', 'p4'].map(id => dealJoke(state, id, jokes));
    expect(dealt.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps dealing (repeats allowed) once the list is used up', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 3 } });
    const dealt = ['p1', 'p2', 'p3'].map(id => dealJoke(state, id, ['only']));
    expect(dealt).toEqual(['only', 'only', 'only']);
  });

  it('gives a player who already has a joke the same one again', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 1 } });
    const first = dealJoke(state, 'p1', jokes);
    expect(dealJoke(state, 'p1', jokes)).toBe(first);
    expect(jokeFor(state, 'p1', jokes)).toBe(first);
  });

  it('is a no-op on a room without the setting', () => {
    expect(dealJoke(null, 'p1', jokes)).toBeNull();
    expect(jokeFor(null, 'p1', jokes)).toBeNull();
    expect(jokeFor(createEarlyJokeState({ earlyJoke: { first: 1 } }), 'nobody', jokes)).toBeNull();
  });

  it('stores an index, not the text, so the reconnect id walker can re-key it', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 1 } });
    dealJoke(state, 'p1', jokes);
    expect(Number.isInteger(state.dealt.p1)).toBe(true);
    expect(jokes[state.dealt.p1]).toBe(jokeFor(state, 'p1', jokes));
  });

  it('draws from the real list by default', () => {
    const state = createEarlyJokeState({ earlyJoke: { first: 1 } });
    expect(DAD_JOKES).toContain(dealJoke(state, 'p1'));
  });
});

describe('validateEarlyJoke', () => {
  const minimal = extra => ({
    name: 'Test',
    phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end', message: 'Done' } },
    ...extra
  });

  it('accepts absent, false (off), true (default), and { first: N } within the cap', () => {
    expect(validateEarlyJoke({}, 'g')).toEqual([]);
    expect(validateEarlyJoke({ earlyJoke: false }, 'g')).toEqual([]);
    expect(validateEarlyJoke({ earlyJoke: true }, 'g')).toEqual([]);
    expect(validateEarlyJoke({ earlyJoke: { first: 10 } }, 'g')).toEqual([]);
    expect(validateEarlyJoke({ earlyJoke: { first: 1 } }, 'g')).toEqual([]);
    expect(validateEarlyJoke({ earlyJoke: { first: EARLY_JOKE_MAX_FIRST } }, 'g')).toEqual([]);
  });

  it('rejects a string, a string count, zero, a fraction, and more than the cap', () => {
    expect(validateEarlyJoke({ earlyJoke: 'yes' }, 'g')).toHaveLength(1);
    expect(validateEarlyJoke({ earlyJoke: { first: '10' } }, 'g')).toHaveLength(1);
    expect(validateEarlyJoke({ earlyJoke: { first: 0 } }, 'g')).toHaveLength(1);
    expect(validateEarlyJoke({ earlyJoke: { first: 2.5 } }, 'g')).toHaveLength(1);
    expect(validateEarlyJoke({ earlyJoke: { first: EARLY_JOKE_MAX_FIRST + 1 } }, 'g')).toHaveLength(1);
  });

  it('runs inside the game loader', () => {
    expect(() => validate(minimal({ earlyJoke: { first: 10 } }), 'test')).not.toThrow();
    expect(() => validate(minimal({ earlyJoke: 'yes' }), 'test')).toThrow(/earlyJoke/);
  });
});

describe('isEarlyBirdJoin', () => {
  it('deals in the lobby, before a room has a step, and in a rolling room', () => {
    expect(isEarlyBirdJoin({ phaseType: 'lobby' })).toBe(true);
    expect(isEarlyBirdJoin({ phaseType: null })).toBe(true);
    expect(isEarlyBirdJoin({ phaseType: 'collect', rolling: true })).toBe(true);
  });
  it('never deals to a student who joins after a together room started', () => {
    expect(isEarlyBirdJoin({ phaseType: 'announce' })).toBe(false);
    expect(isEarlyBirdJoin({ phaseType: 'collect', rolling: false })).toBe(false);
  });
});
