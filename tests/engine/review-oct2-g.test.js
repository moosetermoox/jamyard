/**
 * An outside reviewer's findings on jamyard.org (2026-10-02, batch G):
 * Folded Pass's default theme line, Idea Chain's projector line and
 * gallery, a rotation that handed a story back to its starter, Silent
 * Debate's last round and cap, Hot Seat History's guest and figure, a lone
 * student in Snowball, and One More Thing's report attribution.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { withoutPlaceholderLines } from '../../engine/phases/host-prompt.js';
import { buildChainViews, buildChainRecords } from '../../engine/phases/chain-reveal.js';
import { formatRevealItem, isChainRow } from '../../engine/phase-handlers/reveal-one.js';
import { pickRotationShift } from '../../engine/phases/rotation-shift.js';
import { soloMergeWords } from '../../engine/phases/partner-words.js';
import { translate } from '../../engine/i18n/index.js';
import { addedOnly } from '../../engine/report.js';
import '../../screens/shared/step-suggestions.js';

const SS = globalThis.StepSuggestions;
const json = (rel) => JSON.parse(readFileSync(new URL('../../' + rel, import.meta.url), 'utf8'));

describe('1. Folded Pass with no theme', () => {
  const recipe = json('recipes/exquisite-corpse.json');
  const prompts = (config) => [1, 2, 3, 4, 5, 6].map(i => config.phases['word-' + i].prompt);

  it('never prints "Theme: anything at all"', () => {
    const { config } = compileRecipe(recipe, {});
    for (const p of prompts(config)) {
      expect(p).not.toMatch(/Theme:/);
      expect(p).not.toMatch(/anything at all/);
    }
    expect(prompts(json('games/exquisite-corpse/config.json')).join('\n')).not.toMatch(/Theme:/);
  });

  it('keeps the line when the teacher names a theme', () => {
    const { config } = compileRecipe(recipe, { theme: 'the ocean' });
    for (const p of prompts(config)) expect(p).toMatch(/\n\nTheme: the ocean$/);
  });
});

describe('3. a projector line that headed a private part goes with it', () => {
  it('drops "The version you received:" over a quote the projector cannot show', () => {
    const out = withoutPlaceholderLines('The version you received:\n\n“…”\n\nRewrite it with one twist.');
    expect(out).toBe('Rewrite it with one twist.');
  });

  it('keeps a heading over words that stay', () => {
    expect(withoutPlaceholderLines('Your task:\n\nWrite one line.\n\n“…”')).toBe('Your task:\n\nWrite one line.');
  });
});

describe('4. Idea Chain\'s gallery shows a chain one hop per line', () => {
  const chainDatas = [
    { byPlayer: { a: 'a dragon opens a bakery', b: 'a cat runs for mayor' }, assignedFrom: { a: 'b', b: 'a' } },
    { byPlayer: { a: 'the cat loses by one vote', b: 'the ovens are haunted' } }
  ];
  const views = buildChainViews(chainDatas);

  it('stores the hops apart on a steps chain', () => {
    const { responses } = buildChainRecords(views, () => 'Maya', { display: 'steps' });
    const row = responses.find(r => r.playerId === 'a');
    expect(row.hops).toEqual(['a dragon opens a bakery', 'the ovens are haunted']);
    expect(isChainRow(row)).toBe(true);
    expect(formatRevealItem(row)).toBe('a dragon opens a bakery\n→ the ovens are haunted');
  });

  it('a filled sentence (Folded Pass) stays one line', () => {
    const { responses } = buildChainRecords(views, () => 'Maya', { display: 'template', template: 'The {1} {2}.' });
    expect(responses[0].hops).toBeUndefined();
    expect(formatRevealItem(responses[0])).toBe(responses[0].text);
  });

  it('the projector shows one chain at a time', () => {
    const host = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');
    expect(host).toMatch(/if \(revealOneSingle\) revealOneItems\.textContent = ''/);
    const handler = readFileSync(new URL('../../engine/phase-handlers/reveal-one.js', import.meta.url), 'utf8');
    expect(handler).toMatch(/oneAtATime/);
  });
});

describe('5. a pass-along never comes home early', () => {
  it('two students: nobody is handed the story they started', () => {
    // After one hop, a holds b's story and b holds a's
    const shift = pickRotationShift(['a', 'b'], { a: 'b', b: 'a' }, 1);
    // the usual turn would hand each their own story; keep it instead
    expect(shift).toBe(0);
  });

  it('three students on the third hop: the turn that skips the starter', () => {
    // Each holds the story started two seats back (p holds origin p+1)
    const shift = pickRotationShift(['a', 'b', 'c'], { a: 'b', b: 'c', c: 'a' }, 1);
    expect(shift).toBe(2);
  });

  it('a class bigger than the chain keeps the usual turn', () => {
    expect(pickRotationShift(['a', 'b', 'c', 'd', 'e'], { a: 'd', b: 'e', c: 'a', d: 'b', e: 'c' }, 1)).toBe(1);
  });

  it('the collect handler uses it for chained hops', () => {
    const src = readFileSync(new URL('../../engine/phase-handlers/collect.js', import.meta.url), 'utf8');
    expect(src).toMatch(/pickRotationShift\(senders, originOf, offset\)/);
  });
});

describe('16/17. the pairs brick: the opening stays in view, and room to argue', () => {
  const plan = {
    steps: [
      { brick: 'pairs', text: 'Write your opening argument for {{side}}.', sides: ['For', 'Against'], timer: 300,
        rounds: ['Read your partner\'s opening below. Write a rebuttal.', 'Defend your original argument against their rebuttal.'] },
      { brick: 'end', text: 'Done.' }
    ]
  };
  const { config } = SS.compileStoryboard(plan);
  const ids = Object.keys(config.phases);
  const openId = ids.find(id => id.startsWith('pair-write'));
  const rounds = ids.filter(id => id.startsWith('pair-round'));

  it('the last round shows what the student wrote first', () => {
    expect(rounds.length).toBe(2);
    expect(config.phases[rounds[0]].prompt).not.toContain('.mine}}');
    expect(config.phases[rounds[1]].prompt).toContain('What you wrote first:\n\n“{{' + openId + '.mine}}”');
  });

  it('a five-minute opening takes more than 280 letters', () => {
    expect(config.phases[openId].maxLength).toBe(1200);
    for (const r of rounds) expect(config.phases[r].maxLength).toBe(1200);
    const short = SS.compileStoryboard({ steps: [{ brick: 'pairs', text: 'Write.', timer: 60 }, { brick: 'end', text: 'x' }] }).config;
    const shortOpen = Object.keys(short.phases).find(id => id.startsWith('pair-write'));
    expect(short.phases[shortOpen].maxLength).toBe(800);
  });

  it('the line reads in the plan\'s language', () => {
    const es = SS.compileStoryboard({ ...plan, language: 'es' }).config;
    const r2 = Object.keys(es.phases).filter(id => id.startsWith('pair-round'))[1];
    expect(es.phases[r2].prompt).toContain('Lo que escribiste primero:');
  });
});

describe('20. a hot seat with a character', () => {
  const plan = {
    steps: [
      { brick: 'hotseat', character: 'Harriet Tubman', text: 'Write one question about her life.' },
      { brick: 'end', text: 'Thank you.' }
    ]
  };
  const { config, problems } = SS.compileStoryboard(plan);
  const phases = config.phases;
  const find = (type) => Object.keys(phases).find(id => phases[id].type === type);

  it('the class picks the guest first and the projector names the figure', () => {
    expect(problems || []).toEqual([]);
    const voteId = find('vote');
    expect(phases[voteId].candidates).toBe('players');
    expect(phases[voteId].question).toBe('Who plays Harriet Tubman?');
    const named = phases[phases[voteId].next];
    expect(named.type).toBe('reveal');
    expect(named.template).toContain('**Harriet Tubman**');
    expect(named.template).toContain('{{' + voteId + '.winnerText}}');
  });

  it('the questions are asked of the figure, after the guest is known', () => {
    const askId = Object.keys(phases).find(id => id.startsWith('ask'));
    const order = Object.keys(phases);
    expect(order.indexOf(askId)).toBeGreaterThan(order.indexOf(find('vote')));
    expect(phases[askId].prompt).toContain('Ask **Harriet Tubman**:');
    expect(phases[askId].prompt).toContain('In the hot seat yourself?');
  });

  it('one guest takes every question, never their own', () => {
    const seat = phases[find('reveal-one')];
    expect(seat.to).toBe('{{' + find('vote') + '.winnerText}}');
    expect(seat.rotateEvery).toBeUndefined();
    expect(seat.seatOrderFrom).toBeUndefined();
  });

  it('the validator lets the character through', async () => {
    const { validateSuggestions } = await import('../../engine/suggest-validate.js');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: plan.steps } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].character).toBe('Harriet Tubman');
  });
});

describe('24. a student alone in a merge', () => {
  const snowball = json('games/snowball/config.json');
  const line = translate('en', 'No partner this time, so make your own answer stronger.');

  it('is never sent to a partner', () => {
    const out = soloMergeWords(snowball.phases.pairs.instruction, line, 'en');
    expect(out).toBe('No partner this time, so make your own answer stronger.');
    expect(out).not.toMatch(/partner\./);
  });

  it('keeps the teacher\'s other words', () => {
    expect(soloMergeWords('Sit next to your partner. Use one example from the text.', line, 'en'))
      .toBe(line + '\n\nUse one example from the text.');
  });

  it('reads in the room\'s language', () => {
    expect(translate('es', 'No partner this time, so make your own answer stronger.')).toMatch(/pareja/);
    expect(soloMergeWords('Siéntate con tu pareja.', translate('es', 'No partner this time, so make your own answer stronger.'), 'es'))
      .toBe('Esta vez no tienes pareja, así que mejora tu propia respuesta.');
  });
});

describe('44. One More Thing\'s report names who wrote each line', () => {
  const phase = { id: 'add-one', type: 'collect', rotateFrom: 'recall', appendOnly: true };
  const phaseData = {
    recall: { assigned: { maya: 'Alliances', sam: 'Nationalism' } }
  };
  const data = {
    responses: [
      { playerId: 'maya', name: 'Maya', text: 'Alliances\nMilitarism' },
      { playerId: 'sam', name: 'Sam', text: 'Nationalism\nImperialism' },
      { playerId: 'jo', name: 'Jo', text: 'A line with no handed text' }
    ]
  };

  it('keeps only the line each student added', () => {
    const out = addedOnly(phase, data, phaseData);
    expect(out.responses.map(r => [r.name, r.text])).toEqual([
      ['Maya', 'Militarism'], ['Sam', 'Imperialism'], ['Jo', 'A line with no handed text']
    ]);
  });

  it('leaves any other step as it was', () => {
    expect(addedOnly({ ...phase, appendOnly: false }, data, phaseData)).toBe(data);
  });
});
