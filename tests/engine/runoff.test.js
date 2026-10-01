/**
 * Instant runoff (2026-10-01, the mechanics inventory's Part 3): a rank
 * step with `runoff: true` treats every order as a ballot and picks ONE
 * item (engine/phases/runoff.js); the close stores .winnerText,
 * .runoffList, .runoffRounds; the rank brick takes `runoff: true` and
 * shows the pick with every round.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { instantRunoff, runoffList } from '../../engine/phases/runoff.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const items = ['Pizza', 'Tacos', 'Sushi'];
const rep = (n, ballot) => Array.from({ length: n }, () => ballot.slice());

describe('instant runoff: the count', () => {
  it('a split favorite does not lose to the plurality leader', () => {
    const ballots = [
      ...rep(4, ['Pizza', 'Tacos', 'Sushi']),
      ...rep(3, ['Tacos', 'Sushi', 'Pizza']),
      ...rep(2, ['Sushi', 'Tacos', 'Pizza'])
    ];
    const r = instantRunoff(ballots, items);
    expect(r.winner).toBe('Tacos');
    expect(r.decidedBy).toBe('majority');
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[0].out).toEqual(['Sushi']);
    expect(runoffList(r, 'en')).toBe('Round 1: Pizza 4, Tacos 3, Sushi 2. Sushi is out.\nRound 2: Tacos 5, Pizza 4. Tacos wins with 5 of 9.');
  });

  it('a first-round majority ends it in one round', () => {
    const r = instantRunoff([...rep(3, ['Sushi', 'Pizza', 'Tacos']), ['Pizza', 'Sushi', 'Tacos']], items);
    expect(r.winner).toBe('Sushi');
    expect(r.rounds).toHaveLength(1);
    expect(runoffList(r, 'en')).toBe('Round 1: Sushi 3, Pizza 1, Tacos 0. Sushi wins with 3 of 4.');
  });

  it('every item nobody put first goes out at once', () => {
    const five = ['A', 'B', 'C', 'D', 'E'];
    const r = instantRunoff([...rep(2, ['A', 'B', 'C', 'D', 'E']), ...rep(2, ['B', 'A', 'C', 'D', 'E']), ['C', 'B', 'A', 'D', 'E']], five);
    expect(r.rounds[0].out.sort()).toEqual(['D', 'E']);
    expect(r.winner).toBe('B');
  });

  it('two left and even: the class\'s overall ranking decides, and says so', () => {
    const r = instantRunoff([['Pizza', 'Tacos'], ['Tacos', 'Pizza'], ['Tacos', 'Pizza'], ['Pizza', 'Tacos']], ['Pizza', 'Tacos']);
    expect(r.decidedBy).toBe('tie');
    expect(['Pizza', 'Tacos']).toContain(r.winner);
    expect(runoffList(r, 'en')).toMatch(/wins the tie on the class's overall ranking\.$/);
    // the same ballots in another order pick the same item
    const again = instantRunoff([['Tacos', 'Pizza'], ['Pizza', 'Tacos'], ['Pizza', 'Tacos'], ['Tacos', 'Pizza']], ['Pizza', 'Tacos']);
    expect(again.winner).toBe(r.winner);
  });

  it('nobody ranked: no pick, a plain line', () => {
    const r = instantRunoff([], items);
    expect(r.winner).toBeNull();
    expect(runoffList(r, 'en')).toBe('Nobody ranked anything.');
  });

  it('speaks the activity\'s language, every table carries the rows', () => {
    const keys = ['Round {n}:', '{item} is out.', '{item} wins with {votes} of {total}.', "{item} wins the tie on the class's overall ranking.", 'Nobody ranked anything.'];
    for (const [lang, table] of Object.entries(STRINGS)) for (const k of keys) expect(table[k], `${lang}: ${k}`).toBeTruthy();
    const r = instantRunoff([...rep(4, ['Pizza', 'Tacos', 'Sushi']), ...rep(3, ['Tacos', 'Sushi', 'Pizza']), ...rep(2, ['Sushi', 'Tacos', 'Pizza'])], items);
    expect(runoffList(r, 'es')).toBe('Ronda 1: Pizza 4, Tacos 3, Sushi 2. Sushi queda fuera.\nRonda 2: Tacos 5, Pizza 4. Tacos gana con 5 de 9.');
  });
});

describe('instant runoff: the step and the brick', () => {
  const errorsOf = (phase) => validate({ name: 'R', description: 'r', phases: {
    lobby: { type: 'lobby', next: 'r' }, r: { type: 'rank', prompt: 'Order', candidates: items, next: 'end', ...phase }, end: { type: 'end' }
  } }, 'r-test', { returnResults: true }).errors.map(e => (typeof e === 'string' ? e : e.message)).join(' ');

  it('the validator takes runoff, never beside a right order; the editor mirrors it', () => {
    expect(errorsOf({ runoff: true })).toBe('');
    expect(errorsOf({ runoff: true, correctOrder: items })).toMatch(/both "runoff" and "The right order"/);
    expect(read('screens/designer/editor.js')).toMatch(/"Pick one by instant runoff" and "The right order" cannot go together/);
  });

  it('the close stores the pick, the rounds, and the words', () => {
    const src = read('server.js');
    expect(src).toMatch(/if \(phase && phase\.runoff === true\) \{\s+const result = instantRunoff\(Object\.values\(rs\.submissions\), rs\.candidates\);/);
    expect(src).toMatch(/output\.runoffList = runoffList\(result, engine\.language\);/);
  });

  it('the rank brick shows the pick and every round', () => {
    const { config, problems } = S.compileStoryboard({ name: 'R', steps: [{ brick: 'rank', runoff: true, text: 'Order these.', items }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const rank = Object.entries(config.phases).find(([, p]) => p.type === 'rank');
    expect(rank[1].runoff).toBe(true);
    const reveal = config.phases[rank[1].next];
    expect(reveal.template).toBe('The class picked:\n\n**{{' + rank[0] + '.winnerText}}**\n\n{{' + rank[0] + '.runoffList}}');
    expect(validate({ name: 'R', description: 'r', phases: config.phases }, 'r2', { returnResults: true }).errors).toEqual([]);
  });

  it('a graded order or a hand-out after it keeps the whole order', () => {
    const graded = S.compileStoryboard({ name: 'R', steps: [{ brick: 'rank', runoff: true, correct: true, items }, { brick: 'end', text: 'Bye' }] });
    expect(graded.problems.join(' ')).toMatch(/the runoff was left off/);
    expect(Object.values(graded.config.phases).some(p => p.runoff)).toBe(false);
  });

  it('the validator passes it, the prompts and the plan dialog name it', () => {
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'rank', runoff: true, items }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].runoff).toBe(true);
    const src = read('services/ai-service.js');
    expect(src).toMatch(/- rank also takes runoff: true when the class must PICK ONE item/);
    expect(src).toMatch(/ranked-choice voting or instant runoff is rank with runoff: true\./);
    expect(src).toMatch(/RANKED-CHOICE VOTING \(instant runoff\)/);
    expect(read('screens/designer/designer.js')).toMatch(/step\.brick === 'rank' && step\.runoff === true/);
  });
});
