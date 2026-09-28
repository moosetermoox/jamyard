/**
 * A reviewer's second round on the Create page (2026-09-28): six of the
 * fifteen routines ran end to end, and these are the fixes for what was
 * left: pairing "far" apart on a scale, pretend students finishing a
 * head-to-head ballot, a bracket for a big class, an anonymous question
 * box that keeps what did not pass off the projector and shows the top
 * five, roles that fit the group, a projector line on pair steps, the
 * plan door beside a recipe that drops part of the idea, no bracketed
 * placeholders, and the plan opening straight away on a plain no-match.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { topLines, rankedResultsList } from '../../engine/phases/vote-handler.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;
const read = (rel) => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

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
function hostable(config, label) {
  const r = validate({ name: 'Round two', description: 'test', phases: config.phases }, 'round-two', { returnResults: true });
  expect(r.errors.map(e => e.message || e), label).toEqual([]);
}

describe('fist to five pairs far apart', () => {
  it('the pairs brick carries pairBy far onto the pairwise step', () => {
    const { config, problems } = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'collect-choice', text: 'Fist to five: how sure are you?', choices: ['0', '1', '2', '3', '4', '5'] },
      { brick: 'pairs', text: 'Explain it to your partner.', pairBy: 'far' },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const open = ordered(config).find(([, p]) => p.type === 'collect' && p.assign === 'pairwise')[1];
    expect(open.pairBy.mode).toBe('far');
    hostable(config, 'far');
    const out = validateSuggestions([{ kind: 'storyboard', why: 't', storyboard: { name: 'x', steps: [
      { brick: 'pairs', text: 'x', pairBy: 'far' }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(out.suggestions[0].storyboard.steps[0].pairBy).toBe('far');
  });
});

describe('the anonymous question box', () => {
  it('keeps what did not pass off the projector and shows the top five', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Question box', steps: [
      { brick: 'collect', text: 'What do you want to ask?' },
      { brick: 'vote', approve: true, showRejected: false, top: 5 },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const vote = ordered(config).find(([, p]) => p.type === 'vote');
    expect(vote[1].resultsLimit).toBe(5);
    const reveal = ordered(config).find(([, p]) => p.type === 'reveal')[1];
    // The heading never promises a count the list may not reach (2026-09-28:
    // "Top 5" over four questions)
    expect(reveal.template).toContain('most votes first:');
    expect(reveal.template).not.toMatch(/top 5/i);
    expect(reveal.template).toContain('{{' + vote[0] + '.approvedList}}');
    expect(reveal.template).not.toContain('Did not pass');
    expect(reveal.template).not.toContain('rejectedList');
    hostable(config, 'question box');
  });
  it('a pick-one vote with top shows a ranked list instead of a crown, and the Convention keeps its Did not pass', () => {
    const top = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'collect', text: 'Ask.' }, { brick: 'vote', top: 3 }, { brick: 'end', text: 'Bye' }
    ] });
    expect(ordered(top.config).map(([, p]) => p.type)).toEqual(['lobby', 'collect', 'vote', 'reveal', 'end']);
    const vote = ordered(top.config).find(([, p]) => p.type === 'vote');
    expect(vote[1].resultsLimit).toBe(3);
    expect(ordered(top.config).find(([, p]) => p.type === 'reveal')[1].template).toContain('{{' + vote[0] + '.resultsList}}');
    hostable(top.config, 'top');
    const convention = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'collect', text: 'Clause.' }, { brick: 'vote', approve: true }, { brick: 'end', text: 'Bye' }
    ] });
    expect(ordered(convention.config).find(([, p]) => p.type === 'reveal')[1].template).toContain('Did not pass');
    const out = validateSuggestions([{ kind: 'storyboard', why: 't', storyboard: { name: 'x', steps: [
      { brick: 'vote', approve: true, showRejected: false, top: 5 }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(out.suggestions[0].storyboard.steps[0]).toMatchObject({ showRejected: false, top: 5 });
  });
  it('the tally cuts the lists to the limit', () => {
    expect(topLines('1. a\n2. b\n3. c', 2)).toBe('1. a\n2. b');
    expect(topLines('1. a\n2. b', undefined)).toBe('1. a\n2. b');
    const answers = [{ playerId: 'p1', text: 'One' }, { playerId: 'p2', text: 'Two' }, { playerId: 'p3', text: 'Three' }];
    expect(rankedResultsList({ p1: 1, p2: 4, p3: 2 }, answers, 2)).toBe('1. Two (4)\n2. Three (2)');
    expect(read('server.js')).toContain('rankedResultsList(result.scores, vs.candidates, phaseConfig.resultsLimit)');
    expect(read('server.js')).toContain('topLines(result.approvedList, phaseConfig.resultsLimit)');
  });
});

describe('pair steps say where the words are', () => {
  it('every pairwise step carries a projector line', () => {
    const { config } = S.compileStoryboard({ name: 'x', steps: [
      { brick: 'pairs', text: 'Open.', rounds: ['Reply.'] }, { brick: 'end', text: 'Bye' }
    ] });
    const pairSteps = ordered(config).filter(([, p]) => p.type === 'collect' && p.assign === 'pairwise');
    expect(pairSteps.length).toBe(2);
    expect(pairSteps[0][1].hostTemplate).toMatch(/on their own device/);
    expect(pairSteps[1][1].hostTemplate).toMatch(/partner's words are on your own device/);
    hostable(config, 'pairs projector line');
  });
});

describe('the screens and the route', () => {
  it('pretend students click through every matchup of a head-to-head ballot', () => {
    const player = read('screens/player/player.js');
    expect(player).toMatch(/while \(voteBtns\.length > 0 && guard < 40\)/);
    expect(player).toContain('currentMatchupIndex < currentMatchups.length');
  });
  it('a bracket round with one candidate skips its results card when another round follows', () => {
    expect(read('engine/phase-handlers/vote.js')).toContain('skipped: true');
    const reveal = read('engine/phase-handlers/reveal.js');
    expect(reveal).toContain("round && round.skipped && after && after.type === 'vote' && after.bracket");
  });
  it('the match card offers the plan when the recipe drops part of the idea, and a plain no-match opens the plan', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain("planBtn.textContent = 'Plan it step by step'");
    expect(designer).toMatch(/if \(!data\.harm && !data\.offScreen\) \{\s*closeOverlay\(overlay\);\s*showStoryboardFlow\(description\);/);
    expect(designer).toContain('Plan it step by step keeps it');
  });
  it('a bracketed placeholder param is dropped before the recipe compiles', () => {
    const server = read('server.js');
    expect(server).toMatch(/A bracketed placeholder/);
    const re = /^\s*[\[<{][^\]>}]*[\]>}]\s*$/;
    expect(re.test('[statement]')).toBe(true);
    expect(re.test('<your question>')).toBe(true);
    expect(re.test('Is [this] a fact?')).toBe(false);
  });
});

describe('the prompts', () => {
  it('teach far, roles that fit, the question-box shape, and no placeholders', async () => {
    const svc = new AIService({ mode: 'real' });
    const seen = { storyboard: '', matcher: '', concierge: '' };
    svc._callClaude = async (params) => {
      const text = (typeof params.system === 'string' ? params.system + '\n' : '') + params.messages[0].content;
      if (/BRICKS \(each step is one\)/.test(text)) seen.storyboard = text;
      else if (/YOU MAY ONLY SUGGEST/.test(text)) seen.concierge = text;
      else if (/Available recipes/.test(text)) seen.matcher = text;
      return { content: [{ type: 'text', text: '{"noMatch": true, "reason": "x", "suggestion": "y", "steps": [], "suggestions": []}' }] };
    };
    await svc.generateStoryboard('fist to five');
    await svc.generateSuggestions({ occasion: 'x', topic: 'y', time: '10 minutes', games: [], recipes: [] });
    const livePoll = JSON.parse(read('recipes/live-poll.json'));
    await svc.matchRecipe('four corners', [livePoll], { games: [] });
    expect(seen.storyboard).toMatch(/"far" pairs the ends/);
    expect(seen.storyboard).toMatch(/ROLES FIT THE GROUP/);
    expect(seen.storyboard).toMatch(/showRejected: false/);
    expect(seen.storyboard).toMatch(/top: N/);
    expect(seen.concierge).toMatch(/"far"/);
    expect(seen.matcher).toMatch(/placeholder in brackets/);
  });
});
