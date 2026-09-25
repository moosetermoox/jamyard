/**
 * Storyboard truth (two outside reviews, 2026-09-24): what a custom
 * activity says it does is what it does.
 *
 *   - A vote over the class's answers exposes the winner's WORDS
 *     (.winnerText); a step's words that read .winner are rewritten by
 *     the compiler, and the validator warns about the id on a screen.
 *   - The collect brick's `items` deal a teacher list in private
 *     (collect.dealItems + {{thisStep.assigned}}), the honest shape for
 *     "each student secretly gets a state"; assign stays public.
 *   - The matcher is shown every recipe's and activity's steps, a legend,
 *     the secret hand-out rule, and answers with `missing`, which rides
 *     through the parse.
 *   - The design chat's diff (shared/config-diff.js) reads the two configs,
 *     never the AI's summary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import '../../screens/shared/config-diff.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { recipeStepTypes, summarizeRecipe } from '../../engine/recipe-loader.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;
const Diff = globalThis.ConfigDiff;

function hostable(config, label) {
  const result = validate({ name: 'Truth test', description: 'storyboard truth', phases: config.phases }, 'truth-test', { returnResults: true });
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable`).toEqual([]);
  return result;
}

const STATES = ['Virginia', 'Georgia', 'Delaware', 'New York'];

describe('the private hand-out: collect with items', () => {
  it('compiles to a collect that deals the list and reads it back on the student screen only', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Convention',
      steps: [
        { brick: 'collect', text: 'You represent {{thisStep.assigned}}. Write one clause.', items: STATES, timer: 120 },
        { brick: 'end', text: 'Done.' }
      ]
    });
    expect(problems).toEqual([]);
    const collect = Object.values(config.phases).find(p => p.type === 'collect');
    expect(collect.dealItems).toEqual(STATES);
    expect(collect.prompt).toContain('.assigned}}');
    expect(collect.prompt).not.toContain('thisStep');
    const collectId = Object.keys(config.phases).find(k => config.phases[k] === collect);
    expect(collect.prompt).toContain('{{' + collectId + '.assigned}}');
    expect(config.phases.lobby).toBeTruthy();
    hostable(config, 'hand-out');
  });

  it('puts the token in front when the AI forgot it, and refuses a list of one', () => {
    const { config } = S.compileStoryboard({ name: 'x', steps: [{ brick: 'collect', text: 'Write a clause.', items: STATES }, { brick: 'end', text: 'Bye' }] });
    const collect = Object.values(config.phases).find(p => p.type === 'collect');
    expect(collect.prompt).toMatch(/^{{[a-z-]+.assigned}}/);
    const one = S.compileStoryboard({ name: 'x', steps: [{ brick: 'collect', text: 'Write.', items: ['Only'] }, { brick: 'end', text: 'Bye' }] });
    expect(one.problems.join(' ')).toMatch(/at least two items/);
    expect(Object.values(one.config.phases).find(p => p.type === 'collect').dealItems).toBeUndefined();
  });

  it('lets sixty items through the suggestion validator on a collect, twelve on a rank', () => {
    const many = Array.from({ length: 70 }, (_, i) => 'Item ' + i);
    const out = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'x', steps: [{ brick: 'collect', text: 'Write.', items: many }, { brick: 'rank', text: 'Order.', items: many }, { brick: 'end', text: 'Bye' }] },
      why: 'test'
    }], { gameIds: [], recipes: {} });
    const steps = out.suggestions[0].storyboard.steps;
    expect(steps[0].items.length).toBe(60);
    expect(steps[1].items.length).toBe(12);
  });
});

describe('a vote over answers: the winner has words', () => {
  it('rewrites .winner to .winnerText in any step words the compiler writes', () => {
    const { config } = S.compileStoryboard({
      name: 'x',
      steps: [
        { brick: 'collect', text: 'Write one clause.' },
        { brick: 'vote', text: 'Pick the clause that belongs.' },
        { brick: 'reveal', text: 'These earned support: {{vote.winner}}' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    const reveal = Object.values(config.phases).find(p => p.type === 'reveal');
    expect(reveal.template).toContain('.winnerText}}');
    expect(reveal.template).not.toMatch(/\.winner\}\}/);
    expect(Object.values(config.phases).some(p => p.type === 'winner')).toBe(true);
    hostable(config, 'vote reveal');
  });

  it('warns when a screen reads a vote-over-answers .winner, and not for a fixed list', () => {
    const base = {
      name: 'x', description: 'y',
      phases: {
        lobby: { type: 'lobby', next: 'write' },
        write: { type: 'collect', prompt: 'Write.', next: 'vote' },
        vote: { type: 'vote', mode: 'pick-one', candidates: 'write.responses', next: 'show' },
        show: { type: 'reveal', template: 'Winner: {{vote.winner}}', next: 'end' },
        end: { type: 'end' }
      }
    };
    const r = validate(base, 'w', { returnResults: true });
    expect(r.warnings.join('\n')).toMatch(/winner's id, not their answer/);
    expect(r.warnings.join('\n')).toContain('{{vote.winnerText}}');
    const fixed = JSON.parse(JSON.stringify(base));
    fixed.phases.vote.candidates = ['Cave', 'Forest'];
    delete fixed.phases.write;
    fixed.phases.lobby.next = 'vote';
    const r2 = validate(fixed, 'w', { returnResults: true });
    expect(r2.warnings.join('\n')).not.toMatch(/winner's id/);
    const ok = JSON.parse(JSON.stringify(base));
    ok.phases.show.template = 'Winner: {{vote.winnerText}}';
    expect(validate(ok, 'w', { returnResults: true }).warnings.join('\n')).not.toMatch(/winner's id/);
  });

  it('is on the schema, the chip, and the prompt', () => {
    const editor = readFileSync(new URL('../../screens/designer/editor.js', import.meta.url), 'utf8');
    expect(editor).toContain("variable: '{{' + pid + '.winnerText}}'");
    const ai = readFileSync(new URL('../../services/ai-service.js', import.meta.url), 'utf8');
    expect(ai).toMatch(/vote: \.scores[^\n]*\.winnerText/);
  });
});

describe('the projector shows a blank for a per-student token', () => {
  it('never prints a note in our words there', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).not.toContain("'(each student gets their own)'");
    expect(server).not.toContain("'(each student gets a different player");
  });
});

describe('the matcher is shown the steps and says what is missing', () => {
  const recipes = [
    summarizeRecipe({ id: 'exit-ticket', name: 'Exit Ticket', description: 'Two questions, read privately.', parameters: {}, template: { phases: { lobby: { type: 'lobby' }, ticket: { type: 'collect' }, end: { type: 'end' } } } }),
    summarizeRecipe({ id: 'gallery', name: 'Gallery', description: 'Draw and show.', parameters: {}, template: { phases: { lobby: { type: 'lobby' }, draw: { type: 'collect' }, gate: { type: 'preview' }, wall: { type: 'reveal-one' }, roles: { $if: 'withRoles', type: 'team-roles' }, end: { type: 'end' } } } })
  ];

  it('lists each recipe\'s steps in order with a legend, and a conditional step marked', () => {
    expect(recipes[0].steps).toEqual(['collect', 'end']);
    expect(recipes[1].steps).toEqual(['collect', 'preview', 'reveal-one', 'team-roles?', 'end']);
    expect(recipeStepTypes({})).toEqual([]);
  });

  it('puts the steps, the legend, the secret hand-out rule, and the missing field in the prompt, and passes missing through', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return { content: [{ type: 'text', text: JSON.stringify({ recipe: 'exit-ticket', params: {}, explanation: 'Students write in private.', missing: ['a teacher review before the reveal', 'a three-choice poll at the end', '', 7] }) }] };
    };
    const match = await service.matchRecipe('anonymous exit ticket with teacher review then a three-choice poll', recipes, { games: [{ id: 'live-poll', name: 'Live Poll', description: 'A poll.', steps: ['collect-choice', 'reveal', 'end'] }] });
    expect(system).toContain('Steps, in order (these are ALL of them): collect -> end');
    expect(system).toContain('collect -> preview -> reveal-one -> team-roles? -> end');
    expect(system).toContain('[steps: collect-choice -> reveal -> end]');
    expect(system).toMatch(/HAS a teacher review only if "preview" is in its steps/);
    expect(system).toContain('SECRET HAND-OUT IDEAS');
    expect(system).toContain('"missing"');
    expect(match.missing).toEqual(['a teacher review before the reveal', 'a three-choice poll at the end']);
  });

  it('the route hands missing to the page, and the page shows it before anything is built', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server.split('missing: Array.isArray(match.missing) ? match.missing : []').length).toBe(3);
    const designer = readFileSync(new URL('../../screens/designer/designer.js', import.meta.url), 'utf8');
    expect(designer).toContain('This version does not have: ');
    expect(designer.split('appendMissingLine(modal, data.missing)').length).toBe(3);
  });

  it('offers featured built-ins only', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    const i = server.indexOf('matchGames = applyFeaturedOverrides(');
    expect(i).toBeGreaterThan(0);
    expect(server.slice(i, i + 400)).toContain('.filter(g => g.featured)');
  });
});

describe('the plan dialog shows what the builder adds', () => {
  it('names the waiting room and the crown, and keeps the model\'s notes off the screen', () => {
    const designer = readFileSync(new URL('../../screens/designer/designer.js', import.meta.url), 'utf8');
    expect(designer).toContain("'added: students join here'");
    expect(designer).toContain("'added: the winning answer, with a drumroll'");
    expect(designer).toContain("'Working out the steps'");
    expect(designer).not.toContain('progress.textContent = thought');
  });
});

describe('ConfigDiff.describe: what a draft really changes', () => {
  // phase-names.js writes window.PHASE_NAMES with no node guard; the
  // diff reads the table at call time, so the five names used here suffice
  globalThis.PHASE_NAMES = { lobby: 'Waiting room', collect: 'Open answer', reveal: 'Reveal results', vote: 'Vote', rank: 'Rank a list' };
  const before = {
    name: 'Convention', anonymous: false,
    phases: {
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Write a clause.', timer: 120, next: 'vote' },
      vote: { type: 'vote', mode: 'pick-one', candidates: 'write.responses', prompt: 'Pick your favorite', next: 'end' },
      end: { type: 'end' }
    }
  };

  it('is empty when nothing changes, so a summary with no draft behind it is caught', () => {
    expect(Diff.describe(before, JSON.parse(JSON.stringify(before)))).toEqual([]);
  });

  it('names added, removed, retyped, and reworded steps and moved settings', () => {
    const after = JSON.parse(JSON.stringify(before));
    after.phases.vote.prompt = 'Yes or no on each clause';
    after.phases.vote.next = 'show';
    after.phases.show = { type: 'reveal', template: '{{vote.winnerText}}', next: 'end' };
    after.phases.write.timer = 90;
    delete after.phases.lobby;
    after.anonymous = true;
    const lines = Diff.describe(before, after);
    expect(lines).toContain('Adds Reveal results "show"');
    expect(lines).toContain('Removes Waiting room "lobby"');
    expect(lines.find(l => l.startsWith('Vote "vote"'))).toBe('Vote "vote": rewords it (prompt); changes what comes after it');
    expect(lines.find(l => l.startsWith('Open answer "write"'))).toBe('Open answer "write": changes timer');
    expect(lines).toContain('Changes student names');
    const retyped = JSON.parse(JSON.stringify(before));
    retyped.phases.vote.type = 'rank';
    expect(Diff.describe(before, retyped)).toContain('Turns "vote" into Rank a list (it was Vote)');
  });
});
