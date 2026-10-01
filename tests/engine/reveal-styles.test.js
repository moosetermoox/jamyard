/**
 * Reveal styles (2026-09-30, the mechanics inventory part three): a
 * sized word cloud, every answer as a card, one answer or one student at
 * random, each a template suffix the engine renders to a text shape the
 * screens draw. The pure module, the engine's resolver, the validator's
 * acceptance, and the reveal brick's style.
 */
import { describe, it, expect } from 'vitest';
import { wordCounts, formatCloud, formatCards, pickRandom, textOf, listOf, STOPWORDS } from '../../engine/phases/word-cloud.js';
import { GameEngine } from '../../engine/game-engine.js';
import { validate } from '../../engine/game-loader.js';
import { KNOWN_SUFFIXES } from '../../engine/resolver-grammar.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;

describe('word-cloud (pure)', () => {
  const answers = [
    { playerId: 'p1', text: 'Water and the sun' },
    { playerId: 'p2', text: 'Sun, water, wind!' },
    { playerId: 'p3', text: 'the wind' },
    'water water water'
  ];
  it('counts a word once per answer, drops stopwords and one-letter words, most common first', () => {
    expect(wordCounts(answers)).toEqual([{ word: 'water', count: 3 }, { word: 'sun', count: 2 }, { word: 'wind', count: 2 }]);
    expect(STOPWORDS.has('the')).toBe(true);
    expect(wordCounts(['a I x'])).toEqual([]);
  });
  it('caps the cloud and keeps accents and apostrophes inside words', () => {
    const many = Array.from({ length: 50 }, (_, i) => 'word' + i);
    expect(wordCounts(many, { max: 5 }).length).toBe(5);
    expect(wordCounts(['el niño corrió', "don't stop"]).map(w => w.word)).toEqual(['niño', 'corrió', "don't", 'stop']);
  });
  it('formats the cloud, the cards, and one at random', () => {
    expect(formatCloud(answers)).toBe('water ×3\nsun ×2\nwind ×2');
    expect(formatCards(answers)).toBe('◆ Water and the sun\n◆ Sun, water, wind!\n◆ the wind\n◆ water water water');
    expect(pickRandom(answers, () => 0)).toBe('Water and the sun');
    expect(pickRandom(answers, () => 0.99)).toBe('water water water');
    expect(pickRandom([], () => 0)).toBe('');
    expect(formatCards({ responses: ['one', ' ', 'two'] })).toBe('◆ one\n◆ two');
  });
  it('reads the words of an item and the list inside a value', () => {
    expect(textOf({ name: 'Ana' })).toBe('Ana');
    expect(textOf(7)).toBe('7');
    expect(listOf({ merged: ['x'] })).toEqual(['x']);
    expect(listOf('nope')).toEqual([]);
  });
});

describe('the engine renders the suffixes', () => {
  const config = {
    name: 'Styles', description: 'x',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'One word for today', next: 'show' },
      show: { type: 'reveal', template: '{{ask.responses.cloud}}\n\n{{ask.responses.cards}}\n\n{{ask.responses.random}}\n\n{{players.random}}\n\n{{players.cards}}', next: 'end' },
      end: { type: 'end', message: 'Done' }
    }
  };
  it('cloud, cards, and random over a collect, and a random student', () => {
    const engine = new GameEngine(config);
    engine.players.add('p1', 'Ana');
    engine.players.add('p2', 'Ben');
    engine.storePhaseData('ask', { responses: [{ playerId: 'p1', name: 'Ana', text: 'fire fire' }, { playerId: 'p2', name: 'Ben', text: 'fire and ice' }] });
    expect(engine.resolve('ask.responses.cloud')).toBe('fire ×2\nice ×1');
    expect(engine.resolve('ask.responses.cards')).toBe('◆ fire fire\n◆ fire and ice');
    expect(['fire fire', 'fire and ice']).toContain(engine.resolve('ask.responses.random'));
    expect(['Ana', 'Ben']).toContain(engine.resolve('players.random'));
    expect(engine.resolve('players.cards')).toBe('◆ Ana\n◆ Ben');
    expect(engine.resolve('ask.responses.list')).toBe('1. fire fire\n2. fire and ice');
  });
  it('the grammar knows the suffixes and the validator accepts them on a reveal', () => {
    for (const s of ['cloud', 'cards', 'random']) expect(KNOWN_SUFFIXES.has(s)).toBe(true);
    const { errors, warnings } = validate(config, 'styles', { returnResults: true });
    expect(errors.map(e => typeof e === 'string' ? e : e.message)).toEqual([]);
    const about = warnings.map(w => typeof w === 'string' ? w : w.message).filter(w => /cloud|cards|random/.test(w));
    expect(about).toEqual([]);
  });
});

describe('the reveal brick takes a style', () => {
  it('writes the token over the last question step with a heading', () => {
    const { config, problems } = S.compileStoryboard({ name: 'T', steps: [
      { brick: 'collect', text: 'One word that describes today' },
      { brick: 'reveal', style: 'cloud' },
      { brick: 'reveal', style: 'cards', text: 'Every word, up at once:' },
      { brick: 'reveal', style: 'random', text: 'We start with one of yours:' },
      { brick: 'end' }
    ] });
    expect(problems).toEqual([]);
    const reveals = Object.values(config.phases).filter(p => p.type === 'reveal').map(p => p.template);
    expect(reveals[0]).toBe('What we said, the bigger the more of us said it:\n\n{{ask.responses.cloud}}');
    expect(reveals[1]).toBe('Every word, up at once:\n\n{{ask.responses.cards}}');
    expect(reveals[2]).toBe('We start with one of yours:\n\n{{ask.responses.random}}');
    const { errors } = validate({ name: 'T', description: 'x', phases: config.phases }, 't', { returnResults: true });
    expect(errors).toEqual([]);
  });
  it('a style with no question step before it is a problem; the validator passes style through', () => {
    const { problems } = S.compileStoryboard({ name: 'T', steps: [{ brick: 'reveal', style: 'cloud' }, { brick: 'end' }] });
    expect(problems[0]).toMatch(/word cloud needs a question step/);
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'x', steps: [{ brick: 'collect' }, { brick: 'reveal', style: 'cards' }, { brick: 'reveal', style: 'pie' }] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[1].style).toBe('cards');
    expect(suggestions[0].storyboard.steps[2].style).toBeUndefined();
  });
});
