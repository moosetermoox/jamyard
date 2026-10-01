/**
 * Eleven bricks over blocks the engine already had (2026-09-30, the
 * mechanics inventory): match, sort, rate, solo-quiz, wager, merge, relay,
 * tasks, knockout, charades, count, plus a rolling-start flag on the plan.
 * Every one compiles to steps that pass the validator as-is and carries
 * its own payoff; the storyboard, concierge, and matcher prompts name
 * them; the validator passes their fields through; the plan dialog shows
 * what was added.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';
import { ROSTER_BOUND_TYPES } from '../../engine/phases/rolling.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

function hostable(config, label) {
  const result = validate({ name: 'Bricks test', description: 'engine bricks', phases: config.phases, start: config.start }, 'bricks-test', { returnResults: true });
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
  return result;
}
function ordered(config) {
  const out = [];
  let id = 'lobby';
  const seen = new Set();
  while (id && config.phases[id] && !seen.has(id)) {
    seen.add(id);
    out.push([id, config.phases[id]]);
    id = config.phases[id].next || config.phases[id].approveNext;
  }
  return out;
}
const types = config => ordered(config).map(([, p]) => p.type);
const find = (config, type) => ordered(config).find(([, p]) => p.type === type);
const compile = (steps, extra) => S.compileStoryboard(Object.assign({ name: 'T', steps }, extra || {}));

describe('match brick', () => {
  it('compiles to a scored match step with the standings after it', () => {
    const { config, problems } = compile([
      { brick: 'match', text: 'Match the word to its meaning', pairs: [{ left: 'simile', right: 'like or as' }, { left: 'metaphor', right: 'is' }, { left: 'irony', right: 'the opposite' }], timer: 45 },
      { brick: 'end', text: 'Done' }
    ]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'match', 'leaderboard', 'end']);
    const [id, m] = find(config, 'match');
    expect(m.pairs.length).toBe(3);
    expect(m.prompt).toBe('Match the word to its meaning');
    expect(m.timer).toBe(45);
    expect(m.pointsPerMatch).toBe(10);
    expect(find(config, 'leaderboard')[1].from).toBe(id + '.scores');
    hostable(config, 'match');
  });
  it('drops a duplicate side and refuses fewer than two pairs', () => {
    const { config } = compile([{ brick: 'match', pairs: [{ left: 'a', right: 'b' }, { left: 'A', right: 'c' }, { left: 'd', right: 'e' }] }, { brick: 'end' }]);
    expect(find(config, 'match')[1].pairs.map(p => p.left)).toEqual(['a', 'd']);
    const bad = compile([{ brick: 'match', pairs: [{ left: 'a', right: 'b' }] }, { brick: 'end' }]);
    expect(bad.problems[0]).toMatch(/at least two pairs/);
    expect(types(bad.config)).toEqual(['lobby', 'end']);
  });
  it('no standings when asked', () => {
    const { config } = compile([{ brick: 'match', pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }], standings: false }, { brick: 'end' }]);
    expect(types(config)).toEqual(['lobby', 'match', 'end']);
  });
});

describe('sort brick', () => {
  it('a correct bucket on every item scores it', () => {
    const { config, problems } = compile([
      { brick: 'sort', text: 'Fact or opinion?', buckets: ['Fact', 'Opinion'], items: [{ text: 'Water boils at 100 C', bucket: 'fact' }, { text: 'Summer is best', bucket: 'Opinion' }] },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'sort', 'leaderboard', 'end']);
    const sort = find(config, 'sort')[1];
    expect(sort.items[0].bucket).toBe('Fact');
    expect(sort.pointsPerItem).toBe(10);
    hostable(config, 'sort graded');
  });
  it('plain strings make a class verdict with no standings', () => {
    const { config, problems } = compile([{ brick: 'sort', buckets: ['Genius', 'Chaos'], items: ['Pineapple on pizza', 'Homework on weekends'] }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'sort', 'end']);
    expect(find(config, 'sort')[1].items.every(it => !it.bucket)).toBe(true);
    hostable(config, 'sort verdict');
  });
  it('a mix, or a bucket off the list, falls back to a verdict with a note', () => {
    const { config, problems } = compile([{ brick: 'sort', buckets: ['A', 'B'], items: [{ text: 'x', bucket: 'A' }, { text: 'y' }] }, { brick: 'end' }]);
    expect(problems[0]).toMatch(/class verdict/);
    expect(types(config)).toEqual(['lobby', 'sort', 'end']);
    hostable(config, 'sort mixed');
  });
  it('two graded bricks in a row share one standings step', () => {
    const { config } = compile([
      { brick: 'match', pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }] },
      { brick: 'sort', buckets: ['X', 'Y'], items: [{ text: 'one', bucket: 'X' }, { text: 'two', bucket: 'Y' }] },
      { brick: 'end' }
    ]);
    expect(types(config)).toEqual(['lobby', 'match', 'sort', 'leaderboard', 'end']);
    const board = find(config, 'leaderboard')[1];
    expect(board.from).toEqual([find(config, 'match')[0] + '.scores', find(config, 'sort')[0] + '.scores']);
    hostable(config, 'match + sort');
  });
});

describe('rate brick', () => {
  it('builds scales with ids and end words, results to the teacher only when asked', () => {
    const { config, problems } = compile([
      { brick: 'rate', text: 'Rate the pitch', scales: [{ label: 'Originality', low: 'Familiar', high: 'Fresh' }, { label: 'Clarity' }, { label: 'Originality' }], results: 'teacher', timer: 60 },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    const rate = find(config, 'rate')[1];
    expect(rate.scales.map(s => s.id)).toEqual(['originality', 'clarity', 'originality-2']);
    expect(rate.scales[0].labels).toEqual({ min: 'Familiar', max: 'Fresh' });
    expect(rate.scales[1].labels).toBeUndefined();
    expect(rate.scales[0].min).toBe(1);
    expect(rate.scales[0].max).toBe(5);
    expect(rate.visibility).toBe('host-only');
    expect(rate.timer).toBe(60);
    hostable(config, 'rate');
    const open = compile([{ brick: 'rate', scales: [{ label: 'Fun' }] }, { brick: 'end' }]).config;
    expect(find(open, 'rate')[1].visibility).toBe('all');
  });
  it('needs a labelled scale', () => {
    const { problems } = compile([{ brick: 'rate', scales: [{ low: 'x' }] }, { brick: 'end' }]);
    expect(problems[0]).toMatch(/at least one scale/);
  });
});

describe('solo-quiz brick', () => {
  const questions = [{ text: '1/2 + 1/4?', choices: ['3/4', '2/6'], correct: '3/4' }, { text: 'Half of 10?', choices: ['5', '20'], correct: 'five' }];
  it('keeps the questions whose correct answer matches a choice, no standings by default', () => {
    const { config, problems } = compile([{ brick: 'solo-quiz', text: 'Fractions', questions }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'solo-quiz', 'end']);
    const quiz = find(config, 'solo-quiz')[1];
    expect(quiz.title).toBe('Fractions');
    expect(quiz.questions.length).toBe(1);
    expect(quiz.questions[0].question).toBe('1/2 + 1/4?');
    hostable(config, 'solo-quiz');
  });
  it('standings when asked, and a rolling plan around it', () => {
    const { config, problems } = compile([{ brick: 'announce', text: 'Go', timer: 10 }, { brick: 'solo-quiz', questions, standings: true }, { brick: 'end' }], { rolling: true });
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'solo-quiz', 'leaderboard', 'end']);
    expect(config.start).toBe('rolling');
    expect(find(config, 'announce')[1].timer).toBeUndefined();
    hostable(config, 'solo-quiz rolling');
  });
});

describe('wager brick', () => {
  it('bets on options, pays out by itself with a known answer, standings after', () => {
    const { config, problems } = compile([{ brick: 'wager', text: 'Which tool wins?', options: ['Mop', 'Broom', 'Sign'], correct: 'sign' }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'wager', 'leaderboard', 'end']);
    expect(find(config, 'wager')[1].correctOption).toBe('Sign');
    hostable(config, 'wager');
  });
  it('an unknown winning option is dropped with a note; no answer leaves it to the console', () => {
    const { config, problems } = compile([{ brick: 'wager', options: ['A', 'B'], correct: 'C' }, { brick: 'end' }]);
    expect(problems[0]).toMatch(/picks the winner on the console/);
    expect(find(config, 'wager')[1].correctOption).toBeUndefined();
    hostable(config, 'wager open');
  });
});

describe('merge brick', () => {
  it('pairs combine the collect before it, the shared answers revealed after', () => {
    const { config, problems } = compile([{ brick: 'collect', text: 'Big idea?' }, { brick: 'merge', text: 'Combine them', timer: 120 }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'collect', 'merge', 'reveal', 'end']);
    const [askId] = find(config, 'collect');
    const [mergeId, merge] = find(config, 'merge');
    expect(merge.seedFrom).toBe(askId + '.responses');
    expect(merge.groupSize).toBe(2);
    expect(merge.agreeMode).toBe('both');
    expect(merge.timer).toBe(120);
    expect(find(config, 'reveal')[1].template).toContain('{{' + mergeId + '.merged.list}}');
    hostable(config, 'merge');
  });
  it('fours are pairs then pairs of pairs; show: false drops the reveal', () => {
    const { config, problems } = compile([{ brick: 'collect', text: 'q' }, { brick: 'merge', groupSize: 4, show: false }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'collect', 'merge', 'merge', 'end']);
    const merges = ordered(config).filter(([, p]) => p.type === 'merge');
    expect(merges[0][1].groupSize).toBe(2);
    expect(merges[1][1].groupSize).toBe(4);
    expect(merges[1][1].seedFrom).toBe(merges[0][0] + '.merged');
    hostable(config, 'merge fours');
  });
  it('needs a question step before it', () => {
    const { problems, config } = compile([{ brick: 'merge' }, { brick: 'end' }]);
    expect(problems[0]).toMatch(/needs a question step/);
    expect(types(config)).toEqual(['lobby', 'end']);
  });
});

describe('relay, tasks, count bricks', () => {
  it('relay: a turn each, the piece revealed after', () => {
    const { config, problems } = compile([{ brick: 'relay', text: 'Next line', turns: 8, timer: 30, heading: 'Our poem:' }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'relay', 'reveal', 'end']);
    const [id, relay] = find(config, 'relay');
    expect(relay.turns).toBe(8);
    expect(relay.timer).toBe(30);
    expect(relay.order).toBe('random');
    expect(find(config, 'reveal')[1].template).toBe('Our poem:\n\n{{' + id + '.text}}');
    hostable(config, 'relay');
  });
  it('tasks: a checklist over the last teams step, or per student', () => {
    const { config, problems } = compile([{ brick: 'teams', groupSize: 3 }, { brick: 'tasks', text: 'Lab', items: ['Measure', 'Record', 'Clean up'] }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'team-split', 'checklist', 'end']);
    expect(find(config, 'checklist')[1].teamsFrom).toBe(find(config, 'team-split')[0]);
    hostable(config, 'tasks');
    const solo = compile([{ brick: 'tasks', items: ['Read', 'Answer'] }, { brick: 'end' }]).config;
    expect(find(solo, 'checklist')[1].teamsFrom).toBeUndefined();
    hostable(solo, 'tasks solo');
    expect(compile([{ brick: 'tasks', items: ['one'] }, { brick: 'end' }]).problems[0]).toMatch(/at least two tasks/);
  });
  it('count: one voice to a target, how it went after', () => {
    const { config, problems } = compile([{ brick: 'count', target: 30 }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'one-voice', 'reveal', 'end']);
    const [id, count] = find(config, 'one-voice');
    expect(count.target).toBe(30);
    expect(find(config, 'reveal')[1].template).toContain('{{' + id + '.bestRun}}');
    hostable(config, 'count');
  });
});

describe('knockout brick', () => {
  it('builds the elimination loop: intro, answer, show, vote, out, crown', () => {
    const { config, problems } = compile([{ brick: 'knockout', text: 'Your best joke', percent: 40, loops: 4, timer: 90, voteTimer: 20 }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'collect', 'reveal', 'vote', 'eliminate', 'winner', 'end']);
    const [introId, intro] = find(config, 'announce');
    const [answerId, answer] = find(config, 'collect');
    const [voteId, vote] = find(config, 'vote');
    const [outId, out] = find(config, 'eliminate');
    expect(intro.message).toContain('{{_loop.' + outId + '.iteration}}');
    expect(answer.from).toBe('remaining');
    expect(answer.prompt).toBe('Your best joke');
    expect(answer.timer).toBe(90);
    expect(vote.candidates).toBe(answerId + '.responses');
    expect(vote.excludeAuthors).toBe(true);
    expect(vote.timer).toBe(20);
    expect(out.percent).toBe(40);
    expect(out.loopBack).toBe(introId);
    expect(out.loopCount).toBe(4);
    expect(out.untilRemaining).toBe(1);
    expect(find(config, 'winner')[1].from).toBe(voteId + '.scores');
    hostable(config, 'knockout');
  });
});

describe('charades brick', () => {
  it('builds the teams and the phrase step when the plan has neither', () => {
    const { config, problems } = compile([{ brick: 'charades', text: 'No words!', phrases: 'Write a movie title.', timer: 45 }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'team-split', 'collect', 'turn', 'leaderboard', 'end']);
    const [teamsId, teams] = find(config, 'team-split');
    const [askId, ask] = find(config, 'collect');
    const [turnId, turn] = find(config, 'turn');
    expect(teams.teamCount).toBe(2);
    expect(ask.prompt).toBe('Write a movie title.');
    expect(turn.pool).toBe(askId + '.responses');
    expect(turn.teamsFrom).toBe(teamsId);
    expect(turn.instruction).toBe('No words!');
    expect(turn.timer).toBe(45);
    expect(find(config, 'leaderboard')[1].from).toBe(turnId + '.teamScores');
    hostable(config, 'charades');
  });
  it('uses the teams and the question step already in the plan', () => {
    const { config, problems } = compile([{ brick: 'teams', teamCount: 3 }, { brick: 'collect', text: 'A phrase' }, { brick: 'charades' }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'team-split', 'collect', 'turn', 'leaderboard', 'end']);
    hostable(config, 'charades with teams');
  });
});

describe('rolling start on a plan', () => {
  it('a plan of solo steps starts rolling with its timers dropped', () => {
    const { config, problems } = compile([{ brick: 'collect', text: 'One thing you learned', timer: 60 }, { brick: 'collect-choice', text: 'Confident?', choices: ['1', '2', '3'] }, { brick: 'end' }], { rolling: true });
    expect(problems).toEqual([]);
    expect(config.start).toBe('rolling');
    expect(ordered(config).every(([, p]) => p.timer === undefined)).toBe(true);
    hostable(config, 'rolling');
  });
  it('the compiler mirrors the engine\'s roster-bound list', () => {
    expect(S.ROLLING_BOUND).toEqual([...ROSTER_BOUND_TYPES]);
  });
  it('a plan with a step that needs the whole class starts together, with a note', () => {
    const { config, problems } = compile([{ brick: 'collect', text: 'q' }, { brick: 'merge' }, { brick: 'end' }], { rolling: true });
    expect(config.start).toBeUndefined();
    expect(problems.some(p => /cannot start as students arrive/.test(p))).toBe(true);
    hostable(config, 'rolling refused');
  });
});

describe('the wiring around the bricks', () => {
  it('the validator lists them and passes their fields through', () => {
    for (const b of ['match', 'sort', 'rate', 'solo-quiz', 'wager', 'merge', 'relay', 'tasks', 'knockout', 'charades', 'count']) {
      expect(STORYBOARD_BRICKS).toContain(b);
    }
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'x', rolling: true, steps: [
      { brick: 'match', pairs: [{ left: 'a', right: 'b' }] },
      { brick: 'sort', buckets: ['A', 'B'], items: [{ text: 'x', bucket: 'A' }, 'plain'] },
      { brick: 'rate', scales: [{ label: 'Fun', low: 'Meh', high: 'Yes' }], results: 'teacher' },
      { brick: 'wager', options: ['a', 'b'], correct: 'a' },
      { brick: 'knockout', percent: 40, loops: 3, voteTimer: 20 },
      { brick: 'relay', turns: 6, show: false },
      { brick: 'count', target: 30 },
      { brick: 'charades', phrases: 'A title', standings: false },
      { brick: 'tasks', items: ['one', 'two'] }
    ] } }], { gameIds: [], recipes: {} });
    const sb = suggestions[0].storyboard;
    expect(sb.rolling).toBe(true);
    const [match, sort, rate, wager, knockout, relay, count, charades, tasks] = sb.steps;
    expect(match.pairs).toEqual([{ left: 'a', right: 'b' }]);
    expect(sort.buckets).toEqual(['A', 'B']);
    expect(sort.items).toEqual([{ text: 'x', bucket: 'A' }, 'plain']);
    expect(rate.scales).toEqual([{ label: 'Fun', low: 'Meh', high: 'Yes' }]);
    expect(rate.results).toBe('teacher');
    expect(wager.options).toEqual(['a', 'b']);
    expect(wager.correct).toBe('a');
    expect(knockout.percent).toBe(40);
    expect(knockout.loops).toBe(3);
    expect(knockout.voteTimer).toBe(20);
    expect(relay.turns).toBe(6);
    expect(relay.show).toBe(false);
    expect(count.target).toBe(30);
    expect(charades.phrases).toBe('A title');
    expect(charades.standings).toBe(false);
    expect(tasks.items).toEqual(['one', 'two']);
  });
  it('the storyboard, concierge, and matcher prompts name them', async () => {
    const svc = new AIService({ mode: 'real' });
    const seen = { storyboard: '', concierge: '', matcher: '' };
    svc._callClaude = async (params) => {
      const text = (typeof params.system === 'string' ? params.system + '\n' : '') + params.messages[0].content;
      if (/BRICKS \(each step is one\)/.test(text)) seen.storyboard = text;
      else if (/YOU MAY ONLY SUGGEST/.test(text)) seen.concierge = text;
      else if (/Available recipes/.test(text)) seen.matcher = text;
      return { content: [{ type: 'text', text: '{"noMatch": true, "reason": "x", "suggestion": "y", "steps": [], "suggestions": []}' }] };
    };
    await svc.generateStoryboard('a vocab match');
    await svc.generateSuggestions({ occasion: 'x', topic: 'y', time: '10 minutes', games: [], recipes: [] });
    const livePoll = JSON.parse(read('recipes/live-poll.json'));
    await svc.matchRecipe('a vocab match', [livePoll], { games: [] });
    for (const key of ['storyboard', 'concierge']) {
      for (const b of ['match', 'sort', 'rate', 'solo-quiz', 'wager', 'merge', 'relay', 'tasks', 'knockout', 'charades', 'count', '"rolling": true']) {
        expect(seen[key], key + ' ' + b).toContain(b);
      }
    }
    expect(seen.storyboard).toMatch(/from match, from sort with a correct bucket on every item, from wager, from charades/);
    expect(seen.storyboard).toMatch(/eliminate players outside the knockout brick/);
    expect(seen.matcher).toMatch(/turn = charades by team/);
    expect(seen.matcher).toMatch(/one-voice = the class counts together/);
  });
  it('the plan dialog names the steps the bricks add, and passes the rolling flag', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("'added: the standings'");
    expect(designer).toContain("'added: the shared answers on the projector'");
    expect(designer).toContain("'added: rounds of answer, vote, and out, then the last one standing'");
    expect(designer).toContain('rolling: rolling,');
    expect(designer).toContain('Starts as students arrive');
    const names = read('screens/shared/phase-names.js');
    for (const n of ["'tasks': 'Group checklist'", "'knockout': 'Knockout rounds'", "'charades': 'Charades'", "'count': 'Count together'"]) {
      expect(names).toContain(n);
    }
  });
});
