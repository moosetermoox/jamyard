/**
 * Names on a pass-around (2026-10-13): the owner built a celebration
 * chain (write what you are proud of, two classmates each add a cheer, it
 * comes home) and the builder could not say who wrote what. Two engine
 * fields: collect `showNames` puts a line on a hand-off step saying whose
 * piece it is ("Maya started this. Jordan added to it."), and reveal
 * `chainNames` signs every part of a returned chain. The chain and
 * feedback bricks take `names: true` and set both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { handedLineFor } from '../../engine/phase-handlers/collect.js';
import {
  buildChainViews, formatChainContent, buildChainRecords, chainAdditions, joinNames
} from '../../engine/phases/chain-reveal.js';
import { translate, STRINGS } from '../../engine/i18n/index.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// Three students, two add-only hops: p1's piece went to p2 then p3.
function celebrationChain() {
  return [
    {
      byPlayer: { p1: 'I ran my first 5k.', p2: 'I passed the driving test.', p3: 'I cooked for my family.' },
      assignedFrom: { p2: 'p1', p3: 'p2', p1: 'p3' }
    },
    {
      byPlayer: {
        p2: 'I ran my first 5k.\nThat is a real finish line, well done.',
        p3: 'I passed the driving test.\nFreedom on four wheels!',
        p1: 'I cooked for my family.\nThey are lucky to have you.'
      },
      assignedFrom: { p3: 'p2', p1: 'p3', p2: 'p1' }
    },
    {
      byPlayer: {
        p3: 'I ran my first 5k.\nThat is a real finish line, well done.\nNext stop, 10k.',
        p1: 'I passed the driving test.\nFreedom on four wheels!\nRoad trip soon?',
        p2: 'I cooked for my family.\nThey are lucky to have you.\nSave me a plate.'
      }
    }
  ];
}
const NAMES = { p1: 'Maya', p2: 'Jordan', p3: 'Sam' };
const nameOf = (id) => NAMES[id] || null;

describe('chain views carry who wrote each hop', () => {
  it('authors line up with steps', () => {
    const v = buildChainViews(celebrationChain()).get('p1');
    expect(v.authors).toEqual(['p2', 'p3']);
    expect(v.steps.length).toBe(2);
  });

  it('a hidden hop is left out of both lists', () => {
    const chain = celebrationChain();
    delete chain[1].byPlayer.p2;
    chain[1].hiddenByPlayer = { p2: 'hidden' };
    const v = buildChainViews(chain).get('p1');
    expect(v.steps).toEqual(['I ran my first 5k.\nThat is a real finish line, well done.\nNext stop, 10k.']);
    expect(v.authors).toEqual(['p3']);
  });

  it('records keep the hop authors by name', () => {
    const views = buildChainViews(celebrationChain());
    const { responses } = buildChainRecords(views, nameOf, { display: 'final' });
    const mine = responses.find(r => r.playerId === 'p1');
    expect(mine.authors).toEqual([{ playerId: 'p2', name: 'Jordan' }, { playerId: 'p3', name: 'Sam' }]);
  });
});

describe('chainAdditions and joinNames', () => {
  it('splits an add-only chain into what each hop added', () => {
    const v = buildChainViews(celebrationChain()).get('p1');
    expect(chainAdditions(v)).toEqual(['That is a real finish line, well done.', 'Next stop, 10k.']);
  });

  it('gives up when a hop does not start with the text before it', () => {
    expect(chainAdditions({ original: 'seed', steps: ['seed more', 'something else'] })).toBeNull();
    expect(chainAdditions({ original: 'seed', steps: [] })).toEqual([]);
    expect(chainAdditions(null)).toBeNull();
  });

  it('joins names with the language\'s and', () => {
    expect(joinNames(['Maya'])).toBe('Maya');
    expect(joinNames(['Maya', 'Jordan'])).toBe('Maya and Jordan');
    expect(joinNames(['Maya', 'Jordan', 'Sam'])).toBe('Maya, Jordan and Sam');
    expect(joinNames(['Maya', 'Jordan'], k => translate('es', k))).toBe('Maya y Jordan');
    expect(joinNames([])).toBe('');
  });
});

describe('formatChainContent with names', () => {
  const view = () => buildChainViews(celebrationChain()).get('p1');

  it('final display shows what each classmate added under their name', () => {
    const text = formatChainContent(view(), { display: 'final', names: ['Jordan', 'Sam'] });
    expect(text).toBe([
      '🌱 You started with:', '“I ran my first 5k.”',
      '', 'Jordan added:', '“That is a real finish line, well done.”',
      '', 'Sam added:', '“Next stop, 10k.”'
    ].join('\n'));
  });

  it('final display keeps a custom heading over the signed additions', () => {
    const text = formatChainContent(view(), { display: 'final', names: ['Jordan', 'Sam'], heading: 'You wrote:', grewHeading: 'Your cheers:' });
    expect(text).toMatch(/^You wrote:\n“I ran my first 5k\.”\n\nYour cheers:\n\nJordan added:/);
  });

  it('final display names the hands when the hops do not accumulate', () => {
    const v = view();
    v.steps = ['A rewrite', 'Another rewrite'];
    const text = formatChainContent(v, { display: 'final', names: ['Jordan', 'Sam'] });
    expect(text).toContain('Jordan and Sam took it from there:\n“Another rewrite”');
  });

  it('steps display puts the name on each line', () => {
    const text = formatChainContent(view(), { display: 'steps', names: ['Jordan', 'Sam'] });
    expect(text).toContain('1. Jordan: I ran my first 5k.\nThat is a real finish line, well done.');
    expect(text).toContain('2. Sam: ');
  });

  it('a quoted return names the card', () => {
    const text = formatChainContent(view(), { display: 'steps', quoted: true, names: ['Jordan', 'Sam'], heading: 'You wrote:', grewHeading: 'What your classmates said:' });
    expect(text).toContain('What your classmates said:\n\nJordan wrote:\n\n“I ran my first 5k.\nThat is a real finish line, well done.”\n\nSam wrote:\n\n“');
  });

  it('without names nothing changes, and a missing name leaves that hop unsigned', () => {
    const plain = formatChainContent(view(), { display: 'final' });
    expect(plain).toContain('2 classmates took it from there:');
    expect(plain).not.toContain('added:');
    const half = formatChainContent(view(), { display: 'steps', names: ['Jordan', null] });
    expect(half).toContain('1. Jordan: ');
    expect(half).toContain('2. I ran my first 5k.');
    // A names list of the wrong length is ignored, never misaligned
    const wrong = formatChainContent(view(), { display: 'steps', names: ['Jordan'] });
    expect(wrong).not.toContain('Jordan');
  });

  it('a template chain ignores names', () => {
    const v = { original: 'blue', steps: ['dog', 'sang'], authors: ['p2', 'p3'], complete: true };
    const text = formatChainContent(v, { display: 'template', template: 'The {1} {2} {3}.', names: ['Jordan', 'Sam'] });
    expect(text).toContain('“The blue dog sang.”');
    expect(text).not.toContain('Jordan');
  });

  it('the fixed lines translate', () => {
    const text = formatChainContent(view(), { display: 'final', names: ['Jordan', 'Sam'], t: k => translate('es', k) });
    expect(text).toContain('Jordan añadió:');
    expect(text).toContain('Sam añadió:');
  });
});

// A stand-in engine: the phase graph, the stored links, the roster.
function fakeEngine(phases, phaseData, language = 'en') {
  return {
    config: { phases },
    phaseData,
    language,
    players: { find: (id) => (NAMES[id] ? { id, name: NAMES[id] } : null) }
  };
}
const CHAIN_PHASES = {
  'chain-start': { type: 'collect', prompt: 'Proud of?', next: 'pass' },
  'pass': { type: 'collect', prompt: 'Cheer.', rotateFrom: 'chain-start', showNames: true, next: 'pass-2' },
  'pass-2': { type: 'collect', prompt: 'Cheer again.', rotateFrom: 'pass', showNames: true, next: 'pass-3' },
  'pass-3': { type: 'collect', prompt: 'Once more.', rotateFrom: 'pass-2', showNames: true }
};
const CHAIN_DATA = {
  'chain-start': { assignedFrom: { p2: 'p1', p3: 'p2', p1: 'p3' } },
  'pass': { assignedFrom: { p3: 'p2', p1: 'p3', p2: 'p1' } },
  'pass-2': { assignedFrom: { p1: 'p3', p2: 'p1', p3: 'p2' } }
};

describe('handedLineFor: whose piece a hand-off step shows', () => {
  it('the first hand-off names the writer', () => {
    const engine = fakeEngine(CHAIN_PHASES, CHAIN_DATA);
    expect(handedLineFor(engine, CHAIN_PHASES.pass, 'p2')).toBe('Maya wrote this.');
  });

  it('later hops name the starter and everyone who added since', () => {
    const engine = fakeEngine(CHAIN_PHASES, CHAIN_DATA);
    // p1's piece: p1 → p2 (pass) → p3 (pass-2) → p1 (pass-3)
    expect(handedLineFor(engine, CHAIN_PHASES['pass-2'], 'p3')).toBe('Maya started this. Jordan added to it.');
    expect(handedLineFor(engine, CHAIN_PHASES['pass-3'], 'p1')).toBe('Maya started this. Jordan and Sam added to it.');
  });

  it('a step that shows the first piece names the starter only', () => {
    const phases = { ...CHAIN_PHASES, 'pass-2': { ...CHAIN_PHASES['pass-2'], showOriginal: true } };
    const engine = fakeEngine(phases, CHAIN_DATA);
    expect(handedLineFor(engine, phases['pass-2'], 'p3')).toBe('Maya wrote this.');
  });

  it('nothing without the switch, a rotation, a link, or a name', () => {
    const engine = fakeEngine(CHAIN_PHASES, CHAIN_DATA);
    expect(handedLineFor(engine, { ...CHAIN_PHASES.pass, showNames: false }, 'p2')).toBeNull();
    expect(handedLineFor(engine, { type: 'collect', showNames: true }, 'p2')).toBeNull();
    expect(handedLineFor(engine, CHAIN_PHASES.pass, 'p9')).toBeNull();
    // A broken link further back: no name rather than the wrong one
    const broken = { ...CHAIN_DATA, 'chain-start': { assignedFrom: {} } };
    expect(handedLineFor(fakeEngine(CHAIN_PHASES, broken), CHAIN_PHASES['pass-2'], 'p3')).toBeNull();
  });

  it('speaks the room\'s language', () => {
    const engine = fakeEngine(CHAIN_PHASES, CHAIN_DATA, 'es');
    expect(handedLineFor(engine, CHAIN_PHASES['pass-3'], 'p1')).toBe('Maya empezó esto. Después pasó por Jordan y Sam.');
  });
});

describe('the fields', () => {
  it('both schemas carry the switch, and every language table has the rows', () => {
    expect(PHASE_SCHEMAS.collect.fields.showNames.type).toBe('boolean');
    expect(PHASE_SCHEMAS.reveal.fields.chainNames.type).toBe('boolean');
    const keys = ['{name} wrote this.', '{name} started this.', '{names} added to it.', '{a} and {b}', '{name} wrote:', '{name} added:', '{names} took it from there:'];
    for (const lang of Object.keys(STRINGS)) {
      for (const k of keys) expect(STRINGS[lang][k], lang + ' ' + k).toBeTruthy();
    }
  });

  it('showNames needs a rotation, on the server and in the editor', () => {
    const bad = { lobby: { type: 'lobby', next: 'a' }, a: { type: 'collect', prompt: 'x', showNames: true, next: 'z' }, z: { type: 'end', message: 'bye' } };
    const r = validate({ name: 'N', description: 'd', phases: bad }, 'names-test', { returnResults: true });
    expect(r.errors.map(e => (typeof e === 'string' ? e : e.message)).join('\n')).toMatch(/sets "showNames" but not "rotateFrom"/);
    const good = JSON.parse(JSON.stringify(bad));
    good.a = { type: 'collect', prompt: 'x', next: 'b' };
    good.b = { type: 'collect', prompt: 'y', rotateFrom: 'a', showNames: true, next: 'z' };
    const r2 = validate({ name: 'N', description: 'd', phases: good }, 'names-test', { returnResults: true });
    expect(r2.errors).toEqual([]);
    expect(read('screens/designer/editor.js')).toMatch(/phase\.showNames === true && !phase\.rotateFrom/);
  });

  it('the student screen shows the line, and both collect payloads send it', () => {
    expect(read('screens/player/index.html')).toMatch(/id="handed-line"/);
    const player = read('screens/player/player.js');
    expect(player).toMatch(/handedLineEl\.textContent = handedLine/);
    const collect = read('engine/phase-handlers/collect.js');
    expect(collect.match(/handedLine: /g).length).toBe(2);
  });
});

describe('the bricks', () => {
  it('chain with names: every hop says whose piece it is, the return is signed', () => {
    const { config, problems } = S.compileStoryboard({ name: 'C', steps: [
      { brick: 'chain', start: 'Proud of?', hops: ['Cheer.', 'Cheer again.'], visibility: 'all', names: true },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const phases = config.phases;
    const hops = Object.values(phases).filter(p => p.type === 'collect' && p.rotateFrom);
    expect(hops.length).toBe(2);
    expect(hops.every(p => p.showNames === true)).toBe(true);
    const start = Object.values(phases).find(p => p.type === 'collect' && !p.rotateFrom);
    expect(start.showNames).toBeUndefined();
    const reveal = Object.values(phases).find(p => p.type === 'reveal');
    expect(reveal.chainNames).toBe(true);
    const r = validate(config, 'chain-names', { returnResults: true });
    expect(r.errors).toEqual([]);
  });

  it('chain without names stays as it was', () => {
    const { config } = S.compileStoryboard({ name: 'C', steps: [
      { brick: 'chain', start: 'Proud of?', hops: ['Cheer.'], visibility: 'all' }, { brick: 'end', text: 'Bye' }
    ] });
    expect(Object.values(config.phases).some(p => p.showNames || p.chainNames)).toBe(false);
  });

  it('a blind chain refuses names with a reason', () => {
    const { config, problems } = S.compileStoryboard({ name: 'C', steps: [
      { brick: 'chain', start: 'One word.', hops: ['Another.'], visibility: 'blind', names: true }, { brick: 'end', text: 'Bye' }
    ] });
    expect(problems.join('\n')).toMatch(/names were left off, a blind chain/);
    expect(Object.values(config.phases).some(p => p.showNames || p.chainNames)).toBe(false);
  });

  it('feedback with names: both readers see whose piece it is, the comments come back signed', () => {
    const { config, problems } = S.compileStoryboard({ name: 'F', steps: [
      { brick: 'feedback', draft: 'Thesis?', text: 'Comment.', readers: 2, names: true }, { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const readers = Object.values(config.phases).filter(p => p.type === 'collect' && p.rotateFrom);
    expect(readers.length).toBe(2);
    expect(readers.every(p => p.showNames === true)).toBe(true);
    const reveal = Object.values(config.phases).find(p => p.type === 'reveal');
    expect(reveal.chainNames).toBe(true);
    expect(reveal.chainQuoted).toBe(true);
    expect(validate(config, 'feedback-names', { returnResults: true }).errors).toEqual([]);
  });

  it('the validator passes names on chain and feedback only', () => {
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'chain', start: 'S', hops: ['H'], names: true },
      { brick: 'feedback', draft: 'D', text: 'T', names: true },
      { brick: 'collect', text: 'C', names: true },
      { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    const steps = suggestions[0].storyboard.steps;
    expect(steps[0].names).toBe(true);
    expect(steps[1].names).toBe(true);
    expect(steps[2].names).toBeUndefined();
  });

  it('the prompts and the plan dialog name the switch', () => {
    const src = read('services/ai-service.js');
    expect(src).toMatch(/names = true when every hand-off should say whose piece it is/);
    expect(src).toMatch(/names = true when each reader should see whose piece it is/);
    expect(src).toMatch(/"names": true when every hand-off should say whose piece it is/);
    expect(src).toMatch(/"names": true when the readers should see whose piece it is/);
    const designer = read('screens/designer/designer.js');
    expect(designer).toMatch(/step\.brick === 'chain' && step\.names === true/);
    expect(designer).toMatch(/the comments come back signed/);
  });
});
