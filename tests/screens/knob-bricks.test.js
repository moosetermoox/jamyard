/**
 * The knobs as bricks (2026-09-30, the mechanics inventory part two):
 *   teams groupBy "same" | "mixed"  -> team-split method "byAnswer" over the last pick-one step
 *   vote over "students" (+ out)    -> candidates "players", the chosen name, or eliminate most-votes
 *   rank correct: true              -> correctOrder, the right order beside the class order, standings
 *   write-quiz                      -> a keyed collect, then solo-quiz questionsFrom
 * plus the prompts, the validator pass-through, the plan dialog, the
 * editor's new settings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

function hostable(config, label) {
  const result = validate({ name: 'Knobs test', description: 'knob bricks', phases: config.phases, start: config.start }, 'knobs-test', { returnResults: true });
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

describe('teams groupBy', () => {
  it('same: groups by the last pick-one step, a group size splits a big answer', () => {
    const { config, problems } = compile([
      { brick: 'collect-choice', text: 'Ban homework?', choices: ['Yes', 'No', 'Not sure'] },
      { brick: 'teams', groupBy: 'same', groupSize: 4 },
      { brick: 'announce', text: 'Build your side\'s best argument.' },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'collect-choice', 'team-split', 'announce', 'end']);
    const [pollId] = find(config, 'collect-choice');
    const split = find(config, 'team-split')[1];
    expect(split.method).toBe('byAnswer');
    expect(split.groupBy).toBe(pollId);
    expect(split.groupMode).toBe('same');
    expect(split.groupSize).toBe(4);
    expect(split.teamCount).toBeUndefined();
    hostable(config, 'groupBy same');
  });
  it('mixed takes no size; no pick-one step before it is a problem', () => {
    const { config } = compile([{ brick: 'collect-choice', text: 'q', choices: ['A', 'B'] }, { brick: 'teams', groupBy: 'mixed', groupSize: 3 }, { brick: 'end' }]);
    const split = find(config, 'team-split')[1];
    expect(split.groupMode).toBe('mixed');
    expect(split.groupSize).toBeUndefined();
    hostable(config, 'groupBy mixed');
    const bad = compile([{ brick: 'teams', groupBy: 'same' }, { brick: 'end' }]);
    expect(bad.problems[0]).toMatch(/needs a pick-one question step/);
    expect(types(bad.config)).toEqual(['lobby', 'end']);
  });
});

describe('vote over the students', () => {
  it('puts the roster on the ballot and shows the chosen name', () => {
    const { config, problems } = compile([{ brick: 'announce', text: 'Pick a presenter' }, { brick: 'vote', over: 'students', text: 'Who presents first?' }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'vote', 'reveal', 'end']);
    const [voteId, vote] = find(config, 'vote');
    expect(vote.candidates).toBe('players');
    expect(vote.excludeAuthors).toBe(true);
    expect(vote.question).toBe('Who presents first?');
    expect(find(config, 'reveal')[1].template).toContain('{{' + voteId + '.winnerText}}');
    hostable(config, 'vote over students');
  });
  it('out: true sends the most-voted student out of the round', () => {
    const { config, problems } = compile([
      { brick: 'collect', text: 'Your secret role', items: ['Spy: blend in', 'Crew: find the spy', 'Crew: find the spy'] },
      { brick: 'vote', over: 'students', text: 'Who is the spy?', out: true },
      { brick: 'end' }
    ]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'collect', 'vote', 'eliminate', 'end']);
    const [voteId] = find(config, 'vote');
    const out = find(config, 'eliminate')[1];
    expect(out.method).toBe('most-votes');
    expect(out.input).toBe(voteId + '.scores');
    expect(out.count).toBe(1);
    hostable(config, 'vote out');
  });
});

describe('rank with a right order', () => {
  it('grades the order, shows both orders, and adds the standings', () => {
    const { config, problems } = compile([{ brick: 'rank', text: 'Put the events in order', items: ['Bastille', 'King flees', 'King executed', 'Napoleon'], correct: true }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'rank', 'reveal', 'leaderboard', 'end']);
    const [rankId, rank] = find(config, 'rank');
    expect(rank.correctOrder).toEqual(['Bastille', 'King flees', 'King executed', 'Napoleon']);
    expect(rank.pointsPerItem).toBe(10);
    const show = find(config, 'reveal')[1].template;
    expect(show).toContain('{{' + rankId + '.correctList}}');
    expect(show).toContain('{{' + rankId + '.placedRight}}');
    expect(find(config, 'leaderboard')[1].from).toBe(rankId + '.scores');
    hostable(config, 'rank correct');
    const plain = compile([{ brick: 'rank', items: ['a', 'b'] }, { brick: 'end' }]).config;
    expect(types(plain)).toEqual(['lobby', 'rank', 'reveal', 'end']);
    expect(find(plain, 'rank')[1].correctOrder).toBeUndefined();
    expect(compile([{ brick: 'collect', text: 'q' }, { brick: 'rank', correct: true }, { brick: 'end' }]).problems[0]).toMatch(/graded order needs an items list/);
  });
});

describe('write-quiz brick', () => {
  it('builds the keyed boxes and a self-paced quiz over them', () => {
    const { config, problems } = compile([{ brick: 'announce', text: 'You write the quiz' }, { brick: 'write-quiz', text: 'One question on the water cycle', wrongs: 3, title: 'Water cycle, by us', standings: true }, { brick: 'end' }]);
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'collect', 'solo-quiz', 'leaderboard', 'end']);
    const [askId, ask] = find(config, 'collect');
    expect(ask.fields.map(f => f.key)).toEqual(['question', 'correct', 'wrong1', 'wrong2', 'wrong3']);
    expect(ask.prompt).toBe('One question on the water cycle');
    const quiz = find(config, 'solo-quiz')[1];
    expect(quiz.questionsFrom).toBe(askId);
    expect(quiz.title).toBe('Water cycle, by us');
    expect(quiz.questions).toBeUndefined();
    hostable(config, 'write-quiz');
    const plain = compile([{ brick: 'write-quiz' }, { brick: 'end' }]).config;
    expect(types(plain)).toEqual(['lobby', 'collect', 'solo-quiz', 'end']);
    expect(find(plain, 'collect')[1].fields.length).toBe(4);
  });
});

describe('the wiring around the knobs', () => {
  it('the validator lists write-quiz and passes the knob fields through', () => {
    expect(STORYBOARD_BRICKS).toContain('write-quiz');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'x', steps: [
      { brick: 'teams', groupBy: 'mixed' },
      { brick: 'vote', over: 'students', out: true },
      { brick: 'rank', items: ['a', 'b'], correct: true },
      { brick: 'write-quiz', wrongs: 3, title: 'Ours', standings: true },
      { brick: 'wager', options: ['a', 'b'], correct: 'a' }
    ] } }], { gameIds: [], recipes: {} });
    const [teams, vote, rank, wq, wager] = suggestions[0].storyboard.steps;
    expect(teams.groupBy).toBe('mixed');
    expect(vote.over).toBe('students');
    expect(vote.out).toBe(true);
    expect(rank.correct).toBe(true);
    expect(wq.wrongs).toBe(3);
    expect(wq.title).toBe('Ours');
    expect(wager.correct).toBe('a');
  });
  it('the storyboard, concierge, and matcher prompts name them', async () => {
    const svc = new AIService({ mode: 'real' });
    const seen = { storyboard: '', concierge: '', matcher: '', chat: '' };
    svc._callClaude = async (params) => {
      const text = (typeof params.system === 'string' ? params.system + '\n' : '') + params.messages[0].content;
      if (/BRICKS \(each step is one\)/.test(text)) seen.storyboard = text;
      else if (/YOU MAY ONLY SUGGEST/.test(text)) seen.concierge = text;
      else if (/Available recipes/.test(text)) seen.matcher = text;
      return { content: [{ type: 'text', text: '{"noMatch": true, "reason": "x", "suggestion": "y", "steps": [], "suggestions": []}' }] };
    };
    await svc.generateStoryboard('group them by answer');
    await svc.generateSuggestions({ occasion: 'x', topic: 'y', time: '10 minutes', games: [], recipes: [] });
    const livePoll = JSON.parse(read('recipes/live-poll.json'));
    await svc.matchRecipe('group them by answer', [livePoll], { games: [] });
    for (const key of ['storyboard', 'concierge']) {
      for (const b of ['write-quiz', 'groupBy', 'over', 'correct']) expect(seen[key], key + ' ' + b).toContain(b);
    }
    expect(seen.storyboard).toMatch(/\{\{poll\.least\}\}/);
    expect(seen.storyboard).toMatch(/from rank with correct: true/);
    expect(seen.matcher).toMatch(/or the most-voted student, after a vote over the students/);
    const ai = read('services/ai-service.js');
    expect(ai).toContain('BY ANSWER (groups from what each student picked');
    expect(ai).toContain('THE STUDENTS AS THE CHOICES');
    expect(ai).toContain('THE CLASS WRITES THE QUIZ');
  });
  it('the plan dialog and the editor carry the knobs', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("'added: the most-voted student is out of the round, announced to everyone'");
    expect(designer).toContain("'added: the chosen name on the projector'");
    expect(designer).toContain('a quiz over every complete question the class wrote');
    const editor = read('screens/designer/editor.js');
    expect(editor).toContain("{ value: 'byAnswer', label: 'By their answer to an earlier question' }");
    expect(editor).toContain("{ value: 'most-votes', label: 'The most votes go out (a vote over the students)' }");
    expect(editor).toContain("{ value: 'players', label: 'The students in the room, by name' }");
    expect(editor).toContain("'The right order (optional)'");
    expect(editor).toContain('grouping by answer needs "Group by the answers to"');
    expect(read('screens/shared/phase-names.js')).toContain("'write-quiz': 'Quiz from the class'");
  });
});
