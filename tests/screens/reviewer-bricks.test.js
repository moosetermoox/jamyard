/**
 * Five bricks from a reviewer's fifteen classroom routines (2026-09-27):
 * the builder turned down a buzzer round, "I pick which questions go
 * up", pairing by answer, a jigsaw regroup, and a book bracket, while
 * the engine had (or now has) every one of them.
 *   buzz     -> a buzz step + the standings after it
 *   review   -> preview gate + reveal-one over the last question step
 *   pairs    -> pairBy: "opposite" | "same" over the last pick-one step
 *   teams    -> jigsaw: true = team-split method "jigsaw" from the last split
 *   bracket  -> log2(n) head-to-head bracket votes, a reveal after each
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate({ name: 'Bricks test', description: 'reviewer bricks', phases: config.phases }, 'bricks-test', { returnResults: true });
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

describe('buzz brick', () => {
  it('compiles to a buzz step with the standings after it', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Quiz bowl', steps: [
      { brick: 'announce', text: 'Buzz fast!' },
      { brick: 'buzz', text: 'Listen for the question, then buzz!', points: 20 },
      { brick: 'end', text: 'Done' }
    ] });
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'buzz', 'leaderboard', 'end']);
    const buzz = ordered(config).find(([, p]) => p.type === 'buzz');
    expect(buzz[1].prompt).toBe('Listen for the question, then buzz!');
    expect(buzz[1].points).toBe(20);
    const board = ordered(config).find(([, p]) => p.type === 'leaderboard')[1];
    expect(board.from).toBe(buzz[0] + '.scores');
    hostable(config, 'buzz');
  });
});

describe('review brick', () => {
  it('puts a teacher gate before a one-at-a-time reveal of the last question step', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Hot seat', steps: [
      { brick: 'collect', text: 'Write one question for our guest.' },
      { brick: 'review', text: 'The questions we are asking:' },
      { brick: 'end', text: 'Done' }
    ] });
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'collect', 'preview', 'reveal-one', 'end']);
    const [, [askId], [gateId, gate], [, show]] = ordered(config);
    expect(gate.rejectNext).toBe(askId);
    expect(gate.approveNext).toBeTruthy();
    expect(config.phases[gate.approveNext]).toBe(show);
    expect(show.from).toBe(askId + '.responses');
    expect(show.message).toBe('The questions we are asking:');
    expect(gateId).toBeTruthy();
    hostable(config, 'review');
  });
  it('needs a question step before it', () => {
    const { problems } = S.compileStoryboard({ name: 'x', steps: [{ brick: 'review', text: 'Up they go' }, { brick: 'end', text: 'Bye' }] });
    expect(problems.join(' ')).toMatch(/question step before it/);
  });
});

describe('pairs brick with pairBy', () => {
  it('pairs partners by the last pick-one step, opposite answers first', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Zoo', steps: [
      { brick: 'collect-choice', text: 'Should zoos exist?', choices: ['Yes', 'No'] },
      { brick: 'pairs', text: 'Tell your partner why you picked yours.', pairBy: 'opposite', rounds: ['Answer what your partner said.'] },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const pick = ordered(config).find(([, p]) => p.type === 'collect-choice');
    const open = ordered(config).find(([, p]) => p.type === 'collect' && p.assign === 'pairwise')[1];
    expect(open.pairBy).toEqual({ from: pick[0], mode: 'opposite' });
    hostable(config, 'pairBy');
  });
  it('says so and pairs at random when there is no pick-one step to pair by', () => {
    const { config, problems } = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'pairs', text: 'Talk.', pairBy: 'same' }, { brick: 'end', text: 'Bye' }
    ] });
    expect(problems.join(' ')).toMatch(/pick-one question step/);
    const open = ordered(config).find(([, p]) => p.type === 'collect')[1];
    expect(open.pairBy).toBeUndefined();
  });
});

describe('teams brick with jigsaw', () => {
  it('regroups the earlier split with the jigsaw method', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Jigsaw', steps: [
      { brick: 'teams', teamCount: 4 },
      { brick: 'collect', text: 'Write the three big ideas of your section.' },
      { brick: 'teams', jigsaw: true },
      { brick: 'announce', text: 'Teach your new group your section.' },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const splits = ordered(config).filter(([, p]) => p.type === 'team-split');
    expect(splits.length).toBe(2);
    expect(splits[1][1]).toEqual({ type: 'team-split', method: 'jigsaw', regroupFrom: splits[0][0], next: splits[1][1].next });
    expect(splits[1][0]).toMatch(/^regroup/);
    hostable(config, 'jigsaw');
  });
  it('needs a teams step before it', () => {
    const { problems } = S.compileStoryboard({ name: 'x', steps: [{ brick: 'teams', jigsaw: true }, { brick: 'end', text: 'Bye' }] });
    expect(problems.join(' ')).toMatch(/teams step before it/);
  });
});

describe('bracket brick', () => {
  const BOOKS = ['Holes', 'Hatchet', 'Wonder', 'Matilda', 'Frindle', 'Bud, Not Buddy', 'The Wild Robot', 'Hoot'];
  it('builds log2(n) bracket rounds over a teacher list, a reveal after each, the champion last', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Book bracket', steps: [
      { brick: 'announce', text: 'Eight books, one winner.' },
      { brick: 'bracket', text: 'Which book should we read next?', items: BOOKS, timer: 45 },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    expect(types(config)).toEqual(['lobby', 'announce', 'vote', 'reveal', 'vote', 'reveal', 'vote', 'reveal', 'end']);
    const votes = ordered(config).filter(([, p]) => p.type === 'vote');
    expect(votes[0][1]).toMatchObject({ mode: 'head-to-head', bracket: true, candidates: BOOKS, question: 'Which book should we read next?', timer: 45 });
    expect(votes[1][1].candidates).toBe(votes[0][0] + '.winners');
    expect(votes[2][1].candidates).toBe(votes[1][0] + '.winners');
    expect(votes[0][1].excludeAuthors).toBeUndefined();
    const reveals = ordered(config).filter(([, p]) => p.type === 'reveal');
    expect(reveals[0][1].template).toContain('{{' + votes[0][0] + '.bracketList}}');
    expect(reveals[2][1].template).toContain('{{' + votes[2][0] + '.winnerText}}');
    expect(reveals[2][0]).toBe('champion');
    hostable(config, 'bracket');
  });
  it('runs over the class answers when there is no list, nobody voting on their own', () => {
    const { config, problems } = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'collect', text: 'Name a song for the class playlist.' },
      { brick: 'bracket', text: 'Which song stays?' },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const votes = ordered(config).filter(([, p]) => p.type === 'vote');
    expect(votes.length).toBe(5); // up to 32 nominations; spare rounds pass themselves
    expect(votes[0][1].candidates).toMatch(/\.responses$/);
    expect(votes.every(([, v]) => v.excludeAuthors === true)).toBe(true);
    hostable(config, 'bracket over answers');
  });
  it('refuses a list of two and asks for a list or a question step', () => {
    expect(S.compileStoryboard({ name: 'x', steps: [{ brick: 'bracket', items: ['A', 'B'] }, { brick: 'end', text: 'Bye' }] }).problems.join(' ')).toMatch(/at least 3 items/);
    expect(S.compileStoryboard({ name: 'x', steps: [{ brick: 'bracket' }, { brick: 'end', text: 'Bye' }] }).problems.join(' ')).toMatch(/items.*list|question step/);
  });
});

describe('a refusal carries the part the bricks can do', () => {
  const svc = new AIService({ mode: 'real' });
  const partial = { name: 'The part', description: 'x', steps: [{ brick: 'collect', text: 'Write.' }, { brick: 'end', text: 'Bye' }] };
  it('passes a partial plan through, never after a refusal on purpose', () => {
    const out = svc._parseStoryboard(JSON.stringify({ cantBuild: true, reason: 'No second piece.', partial }));
    expect(out.cantBuild).toBe(true);
    expect(out.partial).toEqual(partial);
    const harm = svc._parseStoryboard(JSON.stringify({ cantBuild: true, harm: true, reason: 'It would sting.', partial }));
    expect(harm.harm).toBe(true);
    expect(harm.partial).toBeUndefined();
    const thin = svc._parseStoryboard(JSON.stringify({ cantBuild: true, reason: 'x', partial: { steps: [{ brick: 'end' }] } }));
    expect(thin.partial).toBeUndefined();
  });
  it('the Create page offers to build it and the route forwards it', () => {
    const designer = readFileSync(new URL('../../screens/designer/designer.js', import.meta.url), 'utf8');
    expect(designer).toContain("'Build the part we can'");
    expect(designer).toContain('showStoryboardFlow(description, partial)');
    expect(designer).toContain("'Part of this we can build'");
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toMatch(/cantBuild: true, harm: storyboard\.harm === true, reason: storyboard\.reason \|\| '', partial, ideaId/);
    expect(server).not.toContain("reason: 'AI matched a recipe but its parameters did not validate.'");
    expect(server).toContain('could not take what this idea needs');
  });
});

describe('the vocabulary agrees', () => {
  it('the suggestion validator knows the bricks and their fields', () => {
    for (const b of ['buzz', 'review', 'bracket']) expect(STORYBOARD_BRICKS).toContain(b);
    const out = validateSuggestions([{ kind: 'storyboard', why: 't', storyboard: { name: 'x', steps: [
      { brick: 'collect-choice', text: 'Yes or no?', choices: ['Yes', 'No'] },
      { brick: 'pairs', text: 'Why?', pairBy: 'opposite' },
      { brick: 'teams', teamCount: 3 }, { brick: 'teams', jigsaw: true },
      { brick: 'buzz', text: 'Buzz!', points: 15 },
      { brick: 'bracket', text: 'Which?', items: Array.from({ length: 20 }, (_, i) => 'Item ' + i) },
      { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    const steps = out.suggestions[0].storyboard.steps;
    expect(steps[1].pairBy).toBe('opposite');
    expect(steps[3].jigsaw).toBe(true);
    expect(steps[4].points).toBe(15);
    expect(steps[5].items.length).toBe(16);
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
    await svc.generateStoryboard('a buzzer round');
    await svc.generateSuggestions({ occasion: 'x', topic: 'y', time: '10 minutes', games: [], recipes: [] });
    const livePoll = JSON.parse(readFileSync(new URL('../../recipes/live-poll.json', import.meta.url), 'utf8'));
    await svc.matchRecipe('a buzzer round', [livePoll], { games: [] });
    for (const key of ['storyboard', 'concierge']) {
      expect(seen[key], key).toMatch(/buzz/);
      expect(seen[key], key).toMatch(/review/);
      expect(seen[key], key).toMatch(/bracket/);
      expect(seen[key], key).toMatch(/jigsaw/);
      expect(seen[key], key).toMatch(/pairBy/);
    }
    expect(seen.storyboard).toMatch(/"partial"/);
    expect(seen.storyboard).toMatch(/SECRET ROLES ARE FINE/);
    expect(seen.matcher).toMatch(/buzz/);
    expect(seen.matcher).toMatch(/SECRET ROLES/);
    expect(seen.matcher).toMatch(/never offScreen/);
  });
});
