/**
 * The late-seat contract, swept (cause 4 of docs/ARCHITECTURE-REVIEW-2026-10.md,
 * seventh pass, 2026-10-03). CLAUDE.md's rule: "a late joiner is seated,
 * never stranded". Any handler that freezes who may answer when its step
 * opens (it calls getEligibleVoters at enter and keeps the result) must
 * seat a student who joins while the step is open, through onLateJoin,
 * or the newcomer sits on a waiting line until the step closes.
 *
 * First run: six handlers froze the roster with no hook (vote, rank, rate,
 * wager, merge, relay). Proof against a live server:
 * scripts/simulate-late-answer.js over games/_sim-late-answer.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import {
  admitLateVoter, seatInMergeGroup, seatInRelayOrder
} from '../../engine/phases/late-seating.js';

const HANDLERS = new URL('../../engine/phase-handlers/', import.meta.url);

// A handler that reads the eligible set at enter but keeps nothing from it
// needs no hook; say why.
const ALLOWED = {
  'ai-process': 'no student answers this step; the roster feeds the PII scrub only',
  'collect-choice': 'the ballot goes to whoever is in the room: onReconnect builds it for a player the enter never saw, nothing about the roster is stored',
  'phase-context': 'defines getEligibleVoters; not a handler'
};

describe('every handler that freezes who may answer seats a late joiner', () => {
  const files = readdirSync(HANDLERS).filter(f => f.endsWith('.js') && !['index.js', 'phase-registry.js'].includes(f));
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const src = readFileSync(new URL(file, HANDLERS), 'utf8');
    if (!src.includes('getEligibleVoters(')) continue;
    it(`${name} has onLateJoin, or a reason in ALLOWED`, () => {
      const hasHook = /onLateJoin\(ctx, playerId\)/.test(src);
      if (ALLOWED[name]) {
        expect(hasHook, `${name} is in ALLOWED but defines onLateJoin; drop it from the map`).toBe(false);
        return;
      }
      expect(hasHook, `${name} freezes the eligible set at enter and never seats a late joiner`).toBe(true);
    });
  }

  it('every ALLOWED entry names a handler that still reads the eligible set', () => {
    for (const name of Object.keys(ALLOWED)) {
      const path = new URL(`${name}.js`, HANDLERS);
      expect(existsSync(path), `${name}.js is gone; drop it from ALLOWED`).toBe(true);
      expect(readFileSync(path, 'utf8')).toContain('getEligibleVoters(');
    }
  });

  it('the proof script and its fixture exist', () => {
    expect(existsSync(new URL('../../scripts/simulate-late-answer.js', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../../games/_sim-late-answer/config.json', import.meta.url))).toBe(true);
  });
});

describe('admitLateVoter', () => {
  const fresh = () => ({ kind: 'vote', tallied: false, eligibleVoterIds: ['p1', 'p2'], candidateIds: ['a', 'b'], votersCompleted: new Set() });

  it('adds the newcomer to an open vote for everyone', () => {
    const s = fresh();
    expect(admitLateVoter(s, 'p3', undefined)).toBe(true);
    expect(s.eligibleVoterIds).toEqual(['p1', 'p2', 'p3']);
    expect(admitLateVoter(s, 'p3', 'all')).toBe(false); // once
  });

  it('never after the tally, for a vote among some students, or with nothing on the ballot', () => {
    expect(admitLateVoter({ ...fresh(), tallied: true }, 'p3')).toBe(false);
    expect(admitLateVoter(fresh(), 'p3', 'finalists')).toBe(false);
    expect(admitLateVoter({ ...fresh(), candidateIds: [] }, 'p3')).toBe(false);
    expect(admitLateVoter({ kind: 'rank', eligibleIds: new Set() }, 'p3')).toBe(false);
    expect(admitLateVoter(null, 'p3')).toBe(false);
  });
});

describe('seatInMergeGroup', () => {
  const group = (id, members, submitted = false) => ({ groupId: id, members, agreed: new Set(), submitted });
  const fresh = () => {
    const g1 = group('g1', ['a', 'b', 'c']);
    const g2 = group('g2', ['d', 'e']);
    return { kind: 'merge', groups: [g1, g2], byPlayer: { a: g1, b: g1, c: g1, d: g2, e: g2 } };
  };

  it('seats the newcomer in the smallest group still writing', () => {
    const s = fresh();
    const g = seatInMergeGroup(s, 'z');
    expect(g.groupId).toBe('g2');
    expect(g.members).toEqual(['d', 'e', 'z']);
    expect(s.byPlayer.z).toBe(g);
    expect(seatInMergeGroup(s, 'z')).toBe(g); // already seated: the same group
  });

  it('skips a group that handed in, and gives up when every group did', () => {
    const s = fresh();
    s.groups[1].submitted = true;
    expect(seatInMergeGroup(s, 'z').groupId).toBe('g1');
    const done = fresh();
    done.groups.forEach(g => { g.submitted = true; });
    expect(seatInMergeGroup(done, 'z')).toBe(null);
    expect(seatInMergeGroup({ kind: 'vote' }, 'z')).toBe(null);
  });
});

describe('seatInRelayOrder', () => {
  const fresh = (idx = 0) => ({ kind: 'relay', turnOrder: ['a', 'b'], currentTurnIndex: idx });

  it('gives the newcomer the last turn while turns remain', () => {
    const s = fresh(1);
    expect(seatInRelayOrder(s, 'z', undefined)).toBe(true);
    expect(s.turnOrder).toEqual(['a', 'b', 'z']);
    expect(seatInRelayOrder(s, 'z')).toBe(false);
  });

  it('never once the last turn is done, or for a relay among some students', () => {
    expect(seatInRelayOrder(fresh(2), 'z')).toBe(false);
    expect(seatInRelayOrder(fresh(0), 'z', 'remaining')).toBe(false);
    expect(seatInRelayOrder({ kind: 'merge' }, 'z')).toBe(false);
  });
});
