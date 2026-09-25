/**
 * The class sees the chains (an outside reviewer's water-cycle chains never
 * left the students' screens, 2026-09-25):
 *
 *   - a return-to-author reveal stores every finished chain as a response
 *     row, so a vote, a gallery, the console, and the report can read it;
 *   - the spotlight reads one student's work out of the room's data by id
 *     (never text from a console), for a chain or an open answer;
 *   - the report keeps the chains whole under their own heading;
 *   - the validator warns on a payoff step with something to ask AND a timer;
 *   - the reveal's outputs are declared, so {{poem.responses}} validates;
 *   - the retired Group Work recipe is summarized as retired.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildChainViews, chainResultText, buildChainRecords } from '../../engine/phases/chain-reveal.js';
import { spotlightItemFor, chainsFor } from '../../engine/spotlight.js';
import { buildActivityReport } from '../../engine/report.js';
import { PlayerRegistry } from '../../engine/player-registry.js';
import { validate } from '../../engine/game-loader.js';
import { DIAGNOSTIC_CODES } from '../../engine/diagnostics.js';
import { summarizeRecipe } from '../../engine/recipe-loader.js';
import { resolveOutputSpec } from '../../engine/phase-schema-runtime.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';

function ring() {
  return [
    { byPlayer: { p1: 'a sweaty gym sock', p2: 'a puddle', p3: 'a cloud' }, assignedFrom: { p2: 'p1', p3: 'p2', p1: 'p3' } },
    { byPlayer: { p2: 'the sun heats it up', p3: 'wind carries it', p1: 'it cools' }, assignedFrom: { p3: 'p2', p1: 'p3', p2: 'p1' } },
    { byPlayer: { p3: 'condensation', p1: 'evaporation', p2: 'precipitation' } }
  ];
}
const nameOf = (id) => ({ p1: 'Maya', p2: 'Jordan', p3: 'Sam' })[id] || null;

describe('chainResultText', () => {
  it('joins a steps chain with arrows, fills a template, keeps the last hop for final', () => {
    const views = buildChainViews(ring());
    const v = views.get('p1');
    expect(chainResultText(v, { display: 'steps' })).toBe('a sweaty gym sock → the sun heats it up → condensation');
    expect(chainResultText(v, { display: 'template', template: 'The {1}: {2}, then {3}.' })).toBe('The a sweaty gym sock: the sun heats it up, then condensation.');
    expect(chainResultText(v, { display: 'final' })).toBe('condensation');
    expect(chainResultText(undefined)).toBe('');
  });
});

describe('buildChainRecords', () => {
  it('stores one response row per starter, named, plus a numbered list', () => {
    const { responses, chainList } = buildChainRecords(buildChainViews(ring()), nameOf, { display: 'steps' });
    expect(responses.map(r => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(responses[1]).toMatchObject({ name: 'Jordan', text: 'a puddle → wind carries it → evaporation', original: 'a puddle' });
    expect(chainList.split('\n')).toHaveLength(3);
    expect(chainList.startsWith('1. a sweaty gym sock')).toBe(true);
  });
});

describe('the reveal declares its chain outputs', () => {
  it('a scope own reveal outputs responses and chainList; any other reveal outputs nothing', () => {
    const own = resolveOutputSpec(PHASE_SCHEMAS.reveal, { type: 'reveal', scope: 'own' });
    expect(Object.keys(own).sort()).toEqual(['chainList', 'responses']);
    expect(resolveOutputSpec(PHASE_SCHEMAS.reveal, { type: 'reveal' })).toEqual({});
  });

  it('a reveal-one gallery over {{poem.responses}} validates clean', () => {
    const config = JSON.parse(readFileSync(new URL('../../games/exquisite-corpse/config.json', import.meta.url), 'utf8'));
    expect(config.phases.share).toMatchObject({ type: 'reveal-one', from: 'poem.responses', next: 'end' });
    expect(config.phases.poem.next).toBe('share');
    const result = validate(config, 'exquisite-corpse', { returnResults: true });
    expect(result.errors).toEqual([]);
  });
});

describe('spotlight', () => {
  function engineWith(phase, phaseData, players) {
    const registry = new PlayerRegistry();
    for (const [id, name, response, hidden] of players) {
      registry.add(id, name, 'tok-' + id);
      if (response !== undefined) registry.update(id, { response, submitted: true, responseHidden: !!hidden });
    }
    return { phaseData, players: registry, getCurrentPhase: () => phase };
  }

  it('reads a finished chain by its starter during a return-to-author reveal', () => {
    const phase = { id: 'poem', type: 'reveal', scope: 'own' };
    const eng = engineWith(phase, { poem: { responses: [{ playerId: 'p1', name: 'Maya', text: 'sock → sun → rain' }] } }, [['p1', 'Maya']]);
    expect(chainsFor(eng, phase)).toEqual([{ playerId: 'p1', name: 'Maya', text: 'sock → sun → rain' }]);
    expect(spotlightItemFor(eng, phase, 'p1')).toEqual({ text: 'sock → sun → rain', name: 'Maya' });
    expect(spotlightItemFor(eng, phase, 'nobody')).toBeNull();
  });

  it('reads an open answer, never a hidden one, and carries a drawing\'s strokes', () => {
    const phase = { id: 'ask', type: 'collect' };
    const strokes = [[{ x: 1, y: 2 }]];
    const eng = engineWith(phase, {}, [
      ['p1', 'Maya', 'a good answer'],
      ['p2', 'Jordan', 'a hidden answer', true],
      ['p3', 'Sam', { type: 'drawing', strokes }]
    ]);
    expect(spotlightItemFor(eng, phase, 'p1')).toEqual({ text: 'a good answer', name: 'Maya' });
    expect(spotlightItemFor(eng, phase, 'p2')).toBeNull();
    expect(spotlightItemFor(eng, phase, 'p3')).toEqual({ text: '', name: 'Sam', drawing: strokes });
    expect(chainsFor(eng, phase)).toBeNull();
  });

  it('shows nothing on a step that is neither a chain reveal nor an answer step', () => {
    const phase = { id: 'v', type: 'vote' };
    const eng = engineWith(phase, {}, [['p1', 'Maya', 'x']]);
    expect(spotlightItemFor(eng, phase, 'p1')).toBeNull();
    expect(spotlightItemFor(eng, phase, '')).toBeNull();
  });
});

describe('the report keeps the chains whole', () => {
  it('gives a return-to-author reveal its own section, one entry per chain', () => {
    const registry = new PlayerRegistry();
    registry.add('p1', 'Maya', 't1');
    const engine = {
      config: { name: 'Water cycle chain', phases: {
        lobby: { type: 'lobby', next: 'w1' },
        w1: { type: 'collect', prompt: 'A place', next: 'poem' },
        poem: { type: 'reveal', scope: 'own', chainFrom: ['w1'], next: 'end' },
        end: { type: 'end' }
      } },
      phaseData: {
        w1: { responses: [{ playerId: 'p1', name: 'Maya', text: 'a sock' }] },
        poem: { responses: [{ playerId: 'p1', name: 'Maya', text: 'a sock → sun → rain' }], chainList: '1. a sock → sun → rain' }
      },
      players: registry
    };
    const report = buildActivityReport(engine, { code: 'ABCD' });
    const section = report.sections.find(s => s.id === 'poem');
    expect(section).toBeTruthy();
    expect(section.heading).toBe('What each one became, start to finish');
    expect(section.blocks[0]).toEqual({ kind: 'entries', items: [{ name: 'Maya', text: 'a sock → sun → rain' }] });
    // a plain reveal still gets no section
    engine.config.phases.poem = { type: 'reveal', template: 'x', next: 'end' };
    expect(buildActivityReport(engine).sections.find(s => s.id === 'poem')).toBeUndefined();
  });
});

describe('a payoff step with something to ask and a timer', () => {
  function configWith(step) {
    return { name: 'T', phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Say something', next: 'wrap' },
      wrap: step,
      end: { type: 'end' }
    } };
  }
  it('warns PAYOFF_TIMED on an announce, reveal, or reveal-one', () => {
    for (const step of [
      { type: 'announce', message: 'Laugh at the wildest ones', discussionPrompt: 'Which could really happen?', timer: 15, next: 'end' },
      { type: 'reveal', template: '{{ask.responses.list}}', discussionPrompt: 'Which one?', timer: 30, next: 'end' },
      { type: 'reveal-one', from: 'ask.responses', discussionPrompt: 'Which one?', timer: 20, next: 'end' }
    ]) {
      const result = validate(configWith(step), 't', { returnResults: true });
      expect(result.errors).toEqual([]);
      expect(result.diagnostics.map(d => d.code)).toContain(DIAGNOSTIC_CODES.PAYOFF_TIMED);
      expect(result.warnings.find(w => /moves the class on by itself/.test(w))).toMatch(/Remove the timer/);
    }
  });
  it('stays quiet without a timer or without a question', () => {
    const a = validate(configWith({ type: 'announce', message: 'x', discussionPrompt: 'y', next: 'end' }), 't', { returnResults: true });
    const b = validate(configWith({ type: 'announce', message: 'x', timer: 15, next: 'end' }), 't', { returnResults: true });
    expect(a.diagnostics.map(d => d.code)).not.toContain(DIAGNOSTIC_CODES.PAYOFF_TIMED);
    expect(b.diagnostics.map(d => d.code)).not.toContain(DIAGNOSTIC_CODES.PAYOFF_TIMED);
  });
});

describe('the retired recipe', () => {
  it('is summarized as retired so the picker can leave it out', () => {
    const old = JSON.parse(readFileSync(new URL('../../recipes/group-work.json', import.meta.url), 'utf8'));
    expect(old.retired).toBe(true);
    expect(summarizeRecipe(old).retired).toBe(true);
    const current = JSON.parse(readFileSync(new URL('../../recipes/group-work-day.json', import.meta.url), 'utf8'));
    expect(summarizeRecipe(current).retired).toBe(false);
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toContain('.filter(r => !r.retired)');
  });
});
