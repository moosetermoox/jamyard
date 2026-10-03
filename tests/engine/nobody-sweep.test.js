/**
 * "A step nobody can answer closes itself", swept (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, seventh pass, 2026-10-03). CLAUDE.md's
 * rule: a new answer-style handler with an eligibility rule should call
 * nobodyCanAnswer. The sweep reads every handler that computes who may
 * answer at enter (getEligibleVoters) and asks that it call the rule, or
 * that an ALLOWED entry say why the step cannot be left with nobody.
 *
 * First run: a vote whose every voter had only their own answer to pick
 * from (one student, excludeAuthors) sat on "0 of 1 voted" until a press;
 * rank, rate, wager, match, sort, and relay had no rule at all.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const HANDLERS = new URL('../../engine/phase-handlers/', import.meta.url);

const ALLOWED = {
  'ai-process': 'no student answers this step',
  checklist: 'every student gets a list (a solo one without teams), so one student in the room is one who can tick',
  merge: 'a student alone gets a solo merge (SOLO_MERGE_LINE); the step cannot open with nobody once a student is in',
  'phase-context': 'defines getEligibleVoters; not a handler',
  'team-roles': 'a roster step: with nobody to seat the host\'s Confirm moves on',
  'team-split': 'a roster step: with nobody to seat the host\'s Confirm moves on'
};

describe('every handler that computes who may answer closes itself when nobody can', () => {
  const files = readdirSync(HANDLERS).filter(f => f.endsWith('.js') && !['index.js', 'phase-registry.js'].includes(f));
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const src = readFileSync(new URL(file, HANDLERS), 'utf8');
    if (!src.includes('getEligibleVoters(')) continue;
    it(`${name}`, () => {
      const calls = src.includes('nobodyCanAnswer(');
      if (ALLOWED[name]) {
        expect(calls, `${name} is in ALLOWED but calls nobodyCanAnswer; drop it from the map`).toBe(false);
        return;
      }
      expect(calls, `${name} computes who may answer and never closes itself when nobody can`).toBe(true);
    });
  }

  it('every ALLOWED entry names a handler that still computes who may answer', () => {
    for (const name of Object.keys(ALLOWED)) {
      const path = new URL(`${name}.js`, HANDLERS);
      expect(existsSync(path), `${name}.js is gone; drop it from ALLOWED`).toBe(true);
      expect(readFileSync(path, 'utf8')).toContain('getEligibleVoters(');
    }
  });

  it('the server lends the vote tally and the relay finish to the handlers', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toContain('tallyVote: (code, room) => tallyAndAdvance(code, room)');
    expect(server).toContain('finishRelay: (code, room) => finishRelay(code, room)');
  });

  it('the vote counts the voters who still have something to pick, not the eligible list', () => {
    const vote = readFileSync(new URL('vote.js', HANDLERS), 'utf8');
    expect(vote).toMatch(/const canVote = eligible\.filter\(v => !room\.phaseState\.votersCompleted\.has\(v\.id\)\)\.length;/);
    expect(vote).toContain('nobodyCanAnswer(engine, canVote)');
  });

  it('the proof script and its fixture exist', () => {
    expect(existsSync(new URL('../../scripts/simulate-nobody-votes.js', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../../games/_sim-nobody-votes/config.json', import.meta.url))).toBe(true);
  });
});
