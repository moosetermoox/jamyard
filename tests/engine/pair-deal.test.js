/**
 * Secret pairs that find each other (2026-10-01, the mechanics
 * inventory's Part 3): a collect with dealItems + pairItems hands every
 * item to two students (engine/phases/pair-deal.js), the close says who
 * held what and how many named their match, and the findmatch brick wires
 * the deal and the reveal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitPairItem, dealPairs, joinLatePair, namesAMatch, judgePairs, foundLine } from '../../engine/phases/pair-deal.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { readsAsFindYourMatch } from '../../engine/find-match-idea.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('secret pairs: the deal', () => {
  it('splits halves and keeps a plain card whole', () => {
    expect(splitPairItem('Romeo | Juliet')).toEqual(['Romeo', 'Juliet']);
    expect(splitPairItem('Moo')).toEqual(['Moo', 'Moo']);
  });

  it('two students to an item, a half each', () => {
    const { assigned, groups } = dealPairs(['a', 'b', 'c', 'd'], ['Romeo | Juliet', 'Salt | Pepper'], seq([0.1, 0.9, 0.3, 0.7]));
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.members).toHaveLength(2);
      expect(g.cards.slice().sort()).toEqual(splitPairItem(g.item).slice().sort());
      g.members.forEach((id, m) => expect(assigned[id]).toBe(g.cards[m]));
    }
    expect(Object.keys(assigned).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('an odd student joins the last pair as a third', () => {
    const { groups } = dealPairs(['a', 'b', 'c', 'd', 'e'], ['X | Y', 'P | Q']);
    expect(groups.map(g => g.members.length).sort()).toEqual([2, 3]);
  });

  it('a class bigger than the list reuses items', () => {
    const { groups } = dealPairs(['a', 'b', 'c', 'd', 'e', 'f'], ['X | Y', 'P | Q']);
    expect(groups).toHaveLength(3);
  });

  it('a late arrival joins the smallest pair with the half it holds least', () => {
    const state = { groups: [{ item: 'X | Y', members: ['a', 'b', 'c'], cards: ['X', 'Y', 'X'] }, { item: 'P | Q', members: ['d', 'e'], cards: ['P', 'Q'] }], assigned: { a: 'X', b: 'Y', c: 'X', d: 'P', e: 'Q' } };
    expect(joinLatePair(state, 'z')).toBe('P');
    expect(state.groups[1].members).toContain('z');
    expect(joinLatePair(state, 'z')).toBe('P'); // already dealt: same card
  });
});

describe('secret pairs: finding', () => {
  it('a name counts whole, by first name, inside a sentence, or by its start', () => {
    expect(namesAMatch('Jordan Lee', ['Jordan Lee'])).toBe(true);
    expect(namesAMatch('jordan', ['Jordan Lee'])).toBe(true);
    expect(namesAMatch('It is Jordan!', ['Jordan Lee'])).toBe(true);
    expect(namesAMatch('Jor', ['Jordan Lee'])).toBe(true);
    expect(namesAMatch('José', ['Jose'])).toBe(true);
    expect(namesAMatch('Maya', ['Jordan Lee'])).toBe(false);
    expect(namesAMatch('', ['Jordan Lee'])).toBe(false);
  });

  it('says who held what and how many named their match', () => {
    const groups = [{ item: 'Romeo | Juliet', members: ['a', 'b'], cards: ['Romeo', 'Juliet'] }, { item: 'Moo', members: ['c', 'd'], cards: ['Moo', 'Moo'] }];
    const names = { a: 'Ana', b: 'Ben', c: 'Cleo', d: 'Dev' };
    const j = judgePairs(groups, { a: 'Ben', b: 'ana', c: 'Ben', d: '' }, id => names[id]);
    expect(j.found).toBe(2);
    expect(j.total).toBe(4);
    expect(j.foundByPlayer).toEqual({ a: true, b: true, c: false, d: false });
    expect(j.pairsList).toBe('Romeo + Juliet: Ana, Ben\nMoo: Cleo, Dev');
    expect(foundLine('en', 2, 4)).toBe('2 of 4 named their match.');
    for (const [lang, table] of Object.entries(STRINGS)) expect(table['{found} of {total} named their match.'], lang).toBeTruthy();
  });
});

describe('secret pairs: the Create page never calls it off the screens', () => {
  it('reads find-your-match ideas in six languages, and leaves room-only ideas alone', () => {
    const yes = [
      'Matching cards around the room: half the class gets a historical figure, the other half gets a famous quote, find the person whose card goes with yours.',
      'Encuentra tu pareja: cada estudiante recibe una palabra en español o su traducción al inglés y busca a su compañero por el salón.',
      'Find your match: each student secretly gets a vocabulary word or its definition and walks around to find their partner.',
      'Give each student an equation or its answer and have them find the classmate with the other half.',
      'Trouve ton partenaire : chaque élève reçoit un mot ou sa définition.',
      'Finde deinen Partner im Raum.',
      'Encontre o seu par na sala.',
      'Trova il tuo compagno con la carta che va con la tua.'
    ];
    const no = [
      'Students build a tower out of spaghetti and marshmallows in groups and we measure them.',
      'A scavenger hunt outside: students find five leaves on the school grounds.',
      'Students match ten vocabulary words to their definitions on their own devices, scored.',
      'Find the main idea of the paragraph and share it with a partner.',
      'A jetpack race around the gym.'
    ];
    for (const t of yes) expect(readsAsFindYourMatch(t), t).toBe(true);
    for (const t of no) expect(readsAsFindYourMatch(t), t).toBe(false);
  });

  it('the match route clears a wrong offScreen with it, and only that', () => {
    expect(read('server.js')).toMatch(/offScreen: match\.offScreen === true && !readsAsFindYourMatch\(description\),/);
  });
});

describe('secret pairs: the step and the brick', () => {
  const errorsOf = (phase) => validate({ name: 'P', description: 'p', phases: {
    lobby: { type: 'lobby', next: 'f' }, f: { type: 'collect', prompt: 'Find {{f.assigned}}', next: 'end', ...phase }, end: { type: 'end' }
  } }, 'p-test', { returnResults: true }).errors.map(e => (typeof e === 'string' ? e : e.message)).join(' ');

  it('the validator wants a dealt list; the editor mirrors it', () => {
    expect(errorsOf({ dealItems: ['X | Y', 'P | Q'], pairItems: true })).toBe('');
    expect(errorsOf({ pairItems: true })).toMatch(/pairItems, which needs a collect step with dealItems/);
    expect(read('screens/designer/editor.js')).toMatch(/"Deal each item to two students" needs "Deal these items out"/);
  });

  it('the deal and the close are wired', () => {
    const handler = read('engine/phase-handlers/collect.js');
    expect(handler).toMatch(/if \(phase\.pairItems === true\) \{\s+const \{ assigned, groups \} = dealPairs/);
    expect(handler).toMatch(/joinLatePair\(\{ groups: own\.pairGroups, assigned: own\.assigned \}, playerId\)/);
    expect(read('server.js')).toMatch(/const j = judgePairs\(existing\.pairGroups, byPlayer, nameOf\);/);
  });

  it('the brick deals the pairs and shows who held what', () => {
    const { config, problems } = S.compileStoryboard({ name: 'P', steps: [{ brick: 'findmatch', text: 'Find your match, type their name.', pairs: [{ left: 'Nucleus', right: 'Holds DNA' }, { left: 'Ribosome', right: 'Builds | proteins' }] }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const [id, find] = Object.entries(config.phases).find(([, p]) => p.pairItems);
    expect(find.dealItems).toEqual(['Nucleus | Holds DNA', 'Ribosome | Builds / proteins']);
    expect(find.prompt).toBe('Find your match, type their name.\n\n**{{' + id + '.assigned}}**');
    const held = config.phases[find.next];
    expect(held.template).toBe('Who held what:\n\n{{' + id + '.pairsList}}\n\n{{' + id + '.foundLine}}');
    expect(validate({ name: 'P', description: 'p', phases: config.phases }, 'p2', { returnResults: true }).errors).toEqual([]);
  });

  it('the same card twice from plain items; too few is a problem', () => {
    const { config } = S.compileStoryboard({ name: 'P', steps: [{ brick: 'findmatch', text: 'Find the same sound.', items: ['Moo', 'Baa'] }, { brick: 'end', text: 'Bye' }] });
    expect(Object.values(config.phases).find(p => p.pairItems).dealItems).toEqual(['Moo', 'Baa']);
    const few = S.compileStoryboard({ name: 'P', steps: [{ brick: 'findmatch', text: 'Find.', items: ['Moo'] }, { brick: 'end', text: 'Bye' }] });
    expect(few.problems.join(' ')).toMatch(/at least two pairs/);
  });

  it('the validator passes it, the prompts and the plan dialog name it', () => {
    expect(STORYBOARD_BRICKS).toContain('findmatch');
    const pairs = Array.from({ length: 20 }, (_, i) => ({ left: 'L' + i, right: 'R' + i }));
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'findmatch', text: 'Find.', pairs }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].pairs).toHaveLength(20);
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- findmatch: secret pairs that find each other in the room/);
    expect(src).toMatch(/findmatch \(every pair dealt to two students in private/);
    expect(src).toMatch(/FIND YOUR MATCH .* is NOT offScreen/);
    expect(src).toMatch(/SECRET PAIRS \(find your match\)/);
    expect(src).not.toMatch(/"voteText"\),deal/);
    expect(read('screens/designer/designer.js')).toMatch(/step\.brick === 'findmatch'/);
    expect(read('screens/shared/phase-names.js')).toMatch(/'findmatch': 'Find your match'/);
  });
});
