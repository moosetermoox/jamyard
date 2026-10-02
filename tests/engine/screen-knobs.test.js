/**
 * The screen knobs (2026-09-30, the mechanics inventory part four): three
 * turns on existing blocks that reach the student screen.
 *   maxPicks        collect-choice: pick several, every pick counted
 *   correctAnswer   collect: a graded open answer (normalized match)
 *   stations        announce / collect / collect-choice: a line per group
 * Pure rules, the loader's rules, and the bricks; the screens are read in
 * tests/screens/screen-knobs-screens.test.js and the room is proved by
 * scripts/simulate-screen-knobs.js.
 */
import { describe, it, expect } from 'vitest';
import { gradeFreeText, normalizeAnswer } from '../../engine/phases/free-text-grading.js';
import { buildLiveTally } from '../../engine/phases/live-tally.js';
import { responseToText } from '../../engine/moderation.js';
import { stationFor } from '../../engine/per-player-template.js';
import { KNOWN_SUFFIXES, PER_PLAYER_SUFFIXES, PER_PLAYER_TOKEN } from '../../engine/resolver-grammar.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const result = (phases) => validate({ name: 'K', description: 'screen knobs', phases }, 'screen-knobs', { returnResults: true });
const errorsOf = (phases) => result(phases).errors.map(e => typeof e === 'string' ? e : e.message);
const warningsOf = (phases) => result(phases).warnings.map(w => typeof w === 'string' ? w : w.message);
const END = { type: 'end', message: 'Done' };

describe('gradeFreeText', () => {
  it('normalizes case, spaces, and end punctuation; accepts the right answer or any accepted one', () => {
    expect(normalizeAnswer('  Paris. ')).toBe('paris');
    expect(normalizeAnswer('"United  States"')).toBe('united states');
    const out = gradeFreeText([
      { playerId: 'p1', text: 'paris' }, { playerId: 'p2', text: 'Paris.' }, { playerId: 'p3', text: 'Rome' }, { playerId: 'p4', text: 'the capital, Paris' }
    ], ['Paris', 'Paris, France'], 50);
    expect(out.scores).toEqual({ p1: 50, p2: 50, p3: 0, p4: 0 });
    expect(out.correctCount).toBe(2);
    expect(out.answeredCount).toBe(4);
    expect(out.rightByPlayer.p3).toBe(false);
    expect(gradeFreeText([{ playerId: 'p1', text: 'x' }], ['x']).scores.p1).toBe(100);
    expect(gradeFreeText([{ playerId: 'p1', text: 'x' }], []).scores.p1).toBe(0);
  });
});

describe('several picks on one answer', () => {
  it('the live tally counts every pick and the student once', () => {
    const { rows, answered } = buildLiveTally([
      { response: ['A', 'B'] }, { response: 'B' }, { response: 'C' }, { response: { fields: 'x' } }, { response: '' }
    ], ['A', 'B', 'C']);
    expect(answered).toBe(3);
    expect(rows).toEqual([{ label: 'A', count: 1, pct: 33 }, { label: 'B', count: 2, pct: 67 }, { label: 'C', count: 1, pct: 33 }]);
  });
  it('the console and the answer line read the picks joined', () => {
    expect(responseToText(['A', 'B'])).toBe('A | B');
    expect(responseToText('A')).toBe('A');
  });
  it('the validator refuses several picks with a right answer or more than the choices', () => {
    const base = { lobby: { type: 'lobby', next: 'poll' }, poll: { type: 'collect-choice', prompt: 'Pick', choices: ['A', 'B', 'C'], maxPicks: 2, liveResults: true, next: 'show' }, show: { type: 'reveal', template: '{{poll.barChart}}', next: 'end' }, end: END };
    expect(errorsOf(base)).toEqual([]);
    expect(errorsOf({ ...base, poll: { ...base.poll, correctAnswer: 'A' } })[0]).toMatch(/a graded question takes one pick/);
    expect(errorsOf({ ...base, poll: { ...base.poll, maxPicks: 4 } })[0]).toMatch(/only 3 choices/);
  });
});

describe('a graded open answer', () => {
  const base = { lobby: { type: 'lobby', next: 'ask' }, ask: { type: 'collect', prompt: 'Capital of France?', correctAnswer: 'Paris', acceptedAnswers: ['Paris, France'], next: 'show' }, show: { type: 'reveal', template: 'The answer was {{ask.correctAnswer}}. {{ask.correctCount}} of {{ask.answeredCount}} had it.', next: 'board' }, board: { type: 'leaderboard', from: 'ask.scores', next: 'end' }, end: END };
  it('validates with its outputs read, and refuses boxes or a drawing', () => {
    expect(errorsOf(base)).toEqual([]);
    expect(errorsOf({ ...base, ask: { ...base.ask, fields: [{ label: 'a', key: 'a' }, { label: 'b', key: 'b' }] } })[0]).toMatch(/one box/);
    expect(errorsOf({ ...base, ask: { ...base.ask, inputType: 'drawing' } })[0]).toMatch(/only words can be matched/);
  });
});

describe('stations: a line per group', () => {
  const base = {
    lobby: { type: 'lobby', next: 'teams' },
    teams: { type: 'team-split', method: 'random', teamCount: 2, next: 'go' },
    go: { type: 'announce', message: 'Your task: {{go.station}}', stations: ['Measure the water', 'Graph the readings'], stationsFrom: 'teams', next: 'work' },
    work: { type: 'collect', prompt: 'What did your group find at {{work.station}}?', stations: ['the sink', 'the window'], stationsFrom: 'teams', next: 'end' },
    end: END
  };
  it('the grammar knows the suffix and the validator accepts the shape', () => {
    expect(KNOWN_SUFFIXES.has('station')).toBe(true);
    expect(PER_PLAYER_SUFFIXES.has('station')).toBe(true);
    expect(PER_PLAYER_TOKEN.test('{{go.station}}')).toBe(true);
    expect(errorsOf(base)).toEqual([]);
    expect(warningsOf(base).some(w => /never show it/.test(w))).toBe(false);
  });
  it('refuses one line, a missing split, and warns when the text never shows the line', () => {
    expect(errorsOf({ ...base, go: { ...base.go, stations: ['only one'] } })[0]).toMatch(/at least two lines/);
    expect(errorsOf({ ...base, go: { ...base.go, stationsFrom: 'work' } })[0]).toMatch(/must name an earlier Split into Teams step/);
    expect(warningsOf({ ...base, go: { ...base.go, message: 'Go to your station.' } }).some(w => /never show it/.test(w))).toBe(true);
  });
  it('deals the lines in the order of the groups, wrapping, the first to a student with no group', () => {
    const engine = {
      config: { phases: { go: { stations: ['A', 'B'], stationsFrom: 'teams' } } },
      phaseData: { teams: { teams: { 'Group 1': [], 'Group 2': [], 'Group 3': [] }, playerTeam: { p1: 'Group 1', p2: 'Group 2', p3: 'Group 3' } } }
    };
    expect(stationFor(engine, 'go', 'p1')).toBe('A');
    expect(stationFor(engine, 'go', 'p2')).toBe('B');
    expect(stationFor(engine, 'go', 'p3')).toBe('A');
    expect(stationFor(engine, 'go', 'nobody')).toBe('A');
    expect(stationFor(engine, 'missing', 'p1')).toBe('');
  });
});

describe('the bricks', () => {
  const compile = (steps) => S.compileStoryboard({ name: 'T', steps });
  const hostable = (config, label) => {
    const r = validate({ name: 'T', description: 'x', phases: config.phases }, 't', { returnResults: true });
    expect(r.errors.map(e => typeof e === 'string' ? e : e.message), label).toEqual([]);
  };
  const find = (config, type) => Object.entries(config.phases).find(([, p]) => p.type === type);
  it('collect-choice takes maxPicks, capped by the choices', () => {
    const { config, problems } = compile([{ brick: 'collect-choice', text: 'Pick up to three', choices: ['A', 'B', 'C', 'D'], maxPicks: 3 }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(find(config, 'collect-choice')[1].maxPicks).toBe(3);
    hostable(config, 'maxPicks');
    const capped = compile([{ brick: 'collect-choice', choices: ['A', 'B'], maxPicks: 5 }, { brick: 'end' }]).config;
    expect(find(capped, 'collect-choice')[1].maxPicks).toBe(2);
  });
  it('collect takes answer and accepted, the standings follow', () => {
    const { config, problems } = compile([{ brick: 'collect', text: 'Capital of France?', answer: 'Paris', accepted: ['Paris, France'] }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    const [askId, ask] = find(config, 'collect');
    expect(ask.correctAnswer).toBe('Paris');
    expect(ask.acceptedAnswers).toEqual(['Paris, France']);
    expect(ask.pointsCorrect).toBe(100);
    expect(find(config, 'leaderboard')[1].from).toBe(askId + '.scores');
    hostable(config, 'graded collect');
    const plain = compile([{ brick: 'collect', text: 'q' }, { brick: 'end' }]).config;
    expect(find(plain, 'leaderboard')).toBeUndefined();
  });
  it('announce and collect take stations after a teams step, binding the token', () => {
    const { config, problems } = compile([
      { brick: 'teams', teamCount: 3 },
      { brick: 'announce', text: 'Your station: {{thisStep.station}}', stations: ['Measure', 'Graph', 'Clean'] },
      { brick: 'collect', text: 'What did you find?', stations: ['at the sink', 'at the window'] },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    const [goId, go] = find(config, 'announce');
    expect(go.stations).toEqual(['Measure', 'Graph', 'Clean']);
    expect(go.stationsFrom).toBe(find(config, 'team-split')[0]);
    expect(go.message).toBe('Your station: {{' + goId + '.station}}');
    const [askId, ask] = find(config, 'collect');
    expect(ask.prompt).toBe('What did you find?\n\n{{' + askId + '.station}}');
    hostable(config, 'stations');
    const noTeams = compile([{ brick: 'announce', text: 'x', stations: ['a', 'b'] }, { brick: 'end' }]);
    expect(noTeams.problems[0]).toMatch(/needs a teams step/);
    expect(find(noTeams.config, 'announce')[1].stations).toBeUndefined();
  });
  it('the validator passes the fields through', () => {
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'x', steps: [
      { brick: 'collect-choice', choices: ['a', 'b'], maxPicks: 2 },
      { brick: 'collect', answer: 'Paris', accepted: ['paris, france'] },
      { brick: 'collect', answer: 42 },
      { brick: 'estimate', answer: 42 },
      { brick: 'announce', stations: ['one', 'two'] }
    ] } }], { gameIds: [], recipes: {} });
    const [cc, c1, c2, est, ann] = suggestions[0].storyboard.steps;
    expect(cc.maxPicks).toBe(2);
    expect(c1.answer).toBe('Paris');
    expect(c1.accepted).toEqual(['paris, france']);
    expect(c2.answer).toBe('42');
    expect(est.answer).toBe(42);
    expect(ann.stations).toEqual(['one', 'two']);
  });
});

describe('what the live eval taught the compiler (2026-09-30)', () => {
  const compile = (steps) => S.compileStoryboard({ name: 'T', steps });
  const find = (config, type) => Object.entries(config.phases).find(([, p]) => p.type === type);
  it('a card or random reveal may read a pick-one step\'s picks', () => {
    const { config, problems } = compile([{ brick: 'collect-choice', text: 'Pick', choices: ['A', 'B'], maxPicks: 2 }, { brick: 'reveal', style: 'cards' }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    const [pollId] = find(config, 'collect-choice');
    const reveals = Object.values(config.phases).filter(p => p.type === 'reveal').map(p => p.template);
    expect(reveals.some(t => t.includes('{{' + pollId + '.responses.cards}}'))).toBe(true);
  });
  it('stations on a tasks brick put the per-group line up first, then the shared list', () => {
    const { config, problems } = compile([
      { brick: 'teams', teamCount: 2 },
      { brick: 'tasks', text: 'Your station: {{thisStep.station}}', stations: ['Measure', 'Graph'], items: ['Set up', 'Clean up'] },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    const order = [];
    let id = 'lobby';
    while (id && config.phases[id]) { order.push(config.phases[id].type); id = config.phases[id].next; }
    expect(order).toEqual(['lobby', 'team-split', 'announce', 'checklist', 'end']);
    const [stId, st] = find(config, 'announce');
    expect(st.stations).toEqual(['Measure', 'Graph']);
    expect(st.message).toBe('Your station: {{' + stId + '.station}}');
    const r = validate({ name: 'T', description: 'x', phases: config.phases }, 't', { returnResults: true });
    expect(r.errors).toEqual([]);
    const only = compile([{ brick: 'teams', teamCount: 2 }, { brick: 'tasks', stations: ['Measure', 'Graph'] }, { brick: 'end' }]);
    expect(only.problems).toEqual([]);
    expect(Object.values(only.config.phases).map(p => p.type)).toEqual(['lobby', 'team-split', 'announce', 'end']);
  });
});
