/**
 * The collect handler's deals: rotation from a classmate's item, and
 * dealItems from a teacher list. Every eligible receiver gets an item even
 * when some classmates never submitted (Doodle Bluff's blank-truth round),
 * and a late joiner is dealt one on arrival.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../engine/game-engine.js';
import { getHandler } from '../../../engine/phase-handlers/phase-registry.js';
import '../../../engine/phase-handlers/collect.js';

function setup({ draw, submitters, players }) {
  const phases = {
    lobby: { type: 'lobby', next: 'phrases' },
    phrases: { type: 'collect', prompt: 'A phrase', next: 'draw' },
    draw: { type: 'collect', prompt: 'Draw this: {{phrases.assigned}}', next: 'end', ...draw },
    end: { type: 'end' }
  };
  const engine = new GameEngine({ phases });
  for (const id of players) engine.players.add(id, 'Student ' + id);
  const byPlayer = {};
  for (const id of submitters) byPlayer[id] = 'phrase by ' + id;
  engine.storePhaseData('phrases', {
    responses: submitters.map(id => ({ playerId: id, name: id, text: byPlayer[id] })),
    byPlayer
  });
  engine.stateMachine.transition('phrases');
  engine.stateMachine.transition('draw');
  const emitted = [];
  const ctx = {
    phase: { id: 'draw', ...phases.draw },
    engine,
    room: { phaseState: {}, gameId: 'x' },
    resolveScreenControl: () => ({}),
    resolveTemplate: (t) => t,
    getEligibleVoters: () => engine.players.list(),
    emitToHost: () => {},
    emitToPlayer: (id, event, payload) => emitted.push({ id, event, payload }),
    services: {
      resolveImageUrl: () => null,
      resolveVideoEmbed: () => null,
      resolvePerPlayerTemplate: (t, eng, pid) => t.replace('{{phrases.assigned}}', String((eng.phaseData.phrases.assigned || {})[pid]))
    }
  };
  return { engine, ctx, emitted };
}

const FOUR = ['p1', 'p2', 'p3', 'p4'];

describe('rotation deal', () => {
  it('deals every receiver a classmate\'s item, never their own, when everyone submitted', async () => {
    const { engine, ctx } = setup({ draw: { rotateFrom: 'phrases', rotateShuffle: true }, submitters: FOUR, players: FOUR });
    await getHandler('collect').onEnter(ctx);
    const assigned = engine.phaseData.phrases.assigned;
    expect(Object.keys(assigned).sort()).toEqual(FOUR);
    for (const id of FOUR) expect(assigned[id]).not.toBe('phrase by ' + id);
    expect(new Set(Object.values(assigned)).size).toBe(4);
  });

  it('still hands an item to the student whose classmate never submitted', async () => {
    const { engine, ctx, emitted } = setup({ draw: { rotateFrom: 'phrases' }, submitters: ['p1', 'p2', 'p3'], players: FOUR });
    await getHandler('collect').onEnter(ctx);
    const assigned = engine.phaseData.phrases.assigned;
    expect(Object.keys(assigned).sort()).toEqual(FOUR);
    for (const id of ['p1', 'p2', 'p3']) expect(assigned[id]).not.toBe('phrase by ' + id);
    expect(['phrase by p1', 'phrase by p2', 'phrase by p3']).toContain(assigned.p4);
    expect(engine.phaseData.phrases.assignedFrom.p4).toMatch(/^p[123]$/);
    const p4Prompt = emitted.find(e => e.id === 'p4' && e.event === 'game-started').payload.prompt;
    expect(p4Prompt).toMatch(/Draw this: phrase by p[123]/);
  });

  it('deals a late joiner an item on reconnect', async () => {
    const { engine, ctx } = setup({ draw: { rotateFrom: 'phrases', rotateShuffle: true }, submitters: FOUR, players: FOUR });
    await getHandler('collect').onEnter(ctx);
    engine.players.add('p5', 'Late');
    const sent = [];
    getHandler('collect').onReconnect(ctx, { id: 'p5', emit: (event, payload) => sent.push({ event, payload }) });
    const src = engine.phaseData.phrases;
    expect(src.assigned.p5).toMatch(/^phrase by p[1-4]$/);
    expect(src.assignedFrom.p5).toMatch(/^p[1-4]$/);
    expect(sent[0].payload.prompt).toContain('Draw this: phrase by');
  });
});

describe('dealItems', () => {
  it('hands each player one item from the teacher list, wrapping when the class is bigger', async () => {
    const { engine, ctx } = setup({ draw: { dealItems: ['alpha', 'beta', 'gamma'] }, submitters: [], players: FOUR });
    await getHandler('collect').onEnter(ctx);
    const assigned = engine.phaseData.draw.assigned;
    expect(Object.keys(assigned).sort()).toEqual(FOUR);
    for (const id of FOUR) expect(['alpha', 'beta', 'gamma']).toContain(assigned[id]);
    expect(new Set(Object.values(assigned)).size).toBe(3);
  });

  it('deals a late joiner from the list too', async () => {
    const { engine, ctx } = setup({ draw: { dealItems: ['alpha', 'beta'] }, submitters: [], players: FOUR });
    await getHandler('collect').onEnter(ctx);
    engine.players.add('p5', 'Late');
    getHandler('collect').onReconnect(ctx, { id: 'p5', emit: () => {} });
    expect(['alpha', 'beta']).toContain(engine.phaseData.draw.assigned.p5);
  });
});
