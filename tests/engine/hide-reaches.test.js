/**
 * A Hide reaches every step that copied the answers (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass, 2026-10-03). CLAUDE.md's
 * rule: "a new step type that snapshots responses at enter should be added
 * to hideStoredResponse". The sweep reads every handler that resolves
 * another step's stored data at enter and asks that its kind be in
 * HIDE_REACHES or in ALLOWED with a reason.
 *
 * First run: a hidden answer stayed on an open vote's ballot, on a bluff
 * round's shared ballot, and kept its round in a For Each.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { hideStoredResponse, HIDE_REACHES } from '../../engine/moderation.js';

const HANDLERS = new URL('../../engine/phase-handlers/', import.meta.url);

// Handlers that read stored data at enter but hold nothing a Hide could
// still reach, with the reason
const ALLOWED = {
  'ai-eliminate': 'the answers go to the model at enter; a Hide before the close keeps a row out',
  'ai-process': 'the answers go to the model at enter; a Hide before the close keeps a row out',
  assign: 'reads a rank step\'s order, never a student\'s words',
  checklist: 'reads teams and roles, never a student\'s words',
  leaderboard: 'reads scores',
  merge: 'the seeds are on the group\'s screens the moment the step opens',
  rank: 'the items are plain text with no author to match',
  reveal: 'the content is on the projector the moment the step opens; a one-by-one reveal keeps a queue and is reached',
  'solo-quiz': 'the questions are dealt as text at enter',
  'team-roles': 'reads teams, never a student\'s words',
  'team-split': 'reads scores and an earlier split, never a student\'s words',
  turn: 'the phrases are dealt to teams as text at enter',
  wager: 'reads scores'
};

const READS_STORED = /(?<!\w)(?:engine|ctx\.engine)\.resolve\(|\.phaseData\[/;
// the code, not its comments (rate.js documents its output as engine.phaseData[id])
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('every handler that copies stored data at enter is reached by a Hide, or says why not', () => {
  const files = readdirSync(HANDLERS).filter(f => f.endsWith('.js') && !['index.js', 'phase-registry.js', 'phase-context.js'].includes(f));
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const src = codeOf(readFileSync(new URL(file, HANDLERS), 'utf8'));
    if (!READS_STORED.test(src)) continue;
    it(`${name}`, () => {
      if (HIDE_REACHES.includes(name)) {
        expect(ALLOWED[name], `${name} is both reached and ALLOWED; drop one`).toBeUndefined();
        return;
      }
      expect(ALLOWED[name], `${name} copies another step's rows at enter and a Hide never reaches it; add it to hideStoredResponse or to ALLOWED with the reason`).toBeTruthy();
    });
  }

  it('every ALLOWED entry names a handler that still reads stored data', () => {
    for (const name of Object.keys(ALLOWED)) {
      const src = codeOf(readFileSync(new URL(`${name}.js`, HANDLERS), 'utf8'));
      expect(READS_STORED.test(src), `${name} no longer reads stored data; drop it from ALLOWED`).toBe(true);
    }
  });

  it('the server re-sends a ballot the Hide changed', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toContain('if (touched.vote || touched.ballot) {');
    expect(server).toMatch(/touched\.vote \|\| touched\.ballot[\s\S]{0,600}sendCurrentState\(s, code, room\)/);
  });
});

const engineWith = (over = {}) => ({
  phaseData: {}, foreachState: {}, getCurrentPhase: () => null, storePhaseData() {}, ...over
});

describe('an open vote loses the hidden entry and its votes', () => {
  const fresh = () => {
    const candidates = [
      { playerId: 'p1', text: 'Holes', name: 'Maya' },
      { playerId: 'p2', text: 'Hatchet', name: 'Jordan' },
      { playerId: 'p3', text: 'Wonder', name: 'Sam' }
    ];
    return {
      engine: engineWith(),
      phaseState: {
        kind: 'vote', mode: 'pick-one', tallied: false, candidates, candidateIds: ['p1', 'p2', 'p3'],
        votes: [{ voterId: 'p1', choice: 'p2' }, { voterId: 'p3', choice: 'p2' }, { voterId: 'p2', choice: 'p1' }],
        votersCompleted: new Set(['p1', 'p2', 'p3'])
      }
    };
  };

  it('removes the candidate, their id, and the votes for them; an Unhide brings the entry back', () => {
    const room = fresh();
    expect(hideStoredResponse(room, 'p2', true).vote).toBe(true);
    expect(room.phaseState.candidateIds).toEqual(['p1', 'p3']);
    expect(room.phaseState.votes).toEqual([{ voterId: 'p2', choice: 'p1' }]);
    expect(hideStoredResponse(room, 'p2', false).vote).toBe(true);
    expect(room.phaseState.candidateIds).toEqual(['p1', 'p3', 'p2']);
  });

  it('never after the tally, in a head-to-head, or for a student with no entry', () => {
    const tallied = fresh(); tallied.phaseState.tallied = true;
    expect(hideStoredResponse(tallied, 'p2', true).vote).toBe(false);
    const h2h = fresh(); h2h.phaseState.mode = 'head-to-head';
    expect(hideStoredResponse(h2h, 'p2', true).vote).toBe(false);
    expect(hideStoredResponse(fresh(), 'p9', true).vote).toBe(false);
  });
});

describe('an open bluff ballot loses the hidden answer\'s words', () => {
  const fresh = () => ({
    lastClosedCollectId: 'fakes',
    engine: engineWith({
      phaseData: { fakes: { responses: [{ playerId: 'p1', text: 'A Sock Odyssey' }, { playerId: 'p2', text: 'Mop Wars' }] } },
      getCurrentPhase: () => ({ id: 'guess', type: 'collect-choice' })
    }),
    phaseState: { kind: 'collect-choice', ballot: ['Mop Wars', 'The Real Title', 'A Sock Odyssey'] }
  });

  it('drops the entry by its words and restores it on an Unhide', () => {
    const room = fresh();
    const out = hideStoredResponse(room, 'p2', true);
    expect(out.collect).toBe(true);
    expect(out.ballot).toBe(true);
    expect(room.phaseState.ballot).toEqual(['The Real Title', 'A Sock Odyssey']);
    expect(hideStoredResponse(room, 'p2', false).ballot).toBe(true);
    expect(room.phaseState.ballot).toEqual(['The Real Title', 'A Sock Odyssey', 'Mop Wars']);
  });

  it('leaves a ballot alone when the step up is not a multiple-choice one', () => {
    const room = fresh();
    room.engine.getCurrentPhase = () => ({ id: 'show', type: 'reveal' });
    expect(hideStoredResponse(room, 'p2', true).ballot).toBe(false);
  });
});

describe('a For Each drops the rounds it has not reached for the hidden student', () => {
  const fresh = () => ({
    engine: engineWith({
      foreachState: {
        rounds: {
          currentIndex: 1,
          items: [{ playerId: 'p1', text: 'a' }, { playerId: 'p2', text: 'b' }, { playerId: 'p3', text: 'c' }, { playerId: 'p2', text: 'd' }],
          scores: {}
        }
      }
    }),
    phaseState: { kind: 'collect', phaseId: '_fe:rounds:guess' }
  });

  it('keeps the round up now and the ones before it, drops the later ones, restores on an Unhide', () => {
    const room = fresh();
    expect(hideStoredResponse(room, 'p2', true).foreach).toBe(true);
    expect(room.engine.foreachState.rounds.items.map(i => i.text)).toEqual(['a', 'b', 'c']);
    expect(hideStoredResponse(room, 'p2', false).foreach).toBe(true);
    expect(room.engine.foreachState.rounds.items.map(i => i.text)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a human-vs-ai pair built on the hidden idea goes too', () => {
    const room = fresh();
    room.engine.foreachState.rounds.items = [{ human: { playerId: 'p1' } }, { human: { playerId: 'p2' } }];
    room.engine.foreachState.rounds.currentIndex = 0;
    expect(hideStoredResponse(room, 'p2', true).foreach).toBe(true);
    expect(room.engine.foreachState.rounds.items.length).toBe(1);
  });
});
