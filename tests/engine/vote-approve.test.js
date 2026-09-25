/**
 * Yes-or-no votes (vote.mode "approve", 2026-09-25): every voter says yes
 * or no to every candidate, and the ones with more yes than no pass.
 * An outside reviewer's Constitutional Convention needed clauses voted
 * INTO a constitution; a pick-one vote crowns a single favorite, so the
 * class never saw the clauses it approved.
 */

import { describe, it, expect } from 'vitest';
import { tallyApprove, approvedLines } from '../../engine/phases/vote-handler.js';
import { validate } from '../../engine/game-loader.js';

const candidates = [
  { playerId: 'p1', text: 'Every state gets two senators.', name: 'Maya' },
  { playerId: 'p2', text: 'No taxes on trade between states.', name: 'Jordan' },
  { playerId: 'p3', text: 'The capital moves every year.', name: 'Sam' }
];

function ballot(voterId, answers) {
  return Object.entries(answers).map(([choice, approve]) => ({ voterId, choice, approve }));
}

describe('tallyApprove', () => {
  it('passes a candidate with more yes than no, fails a tie and a loss', () => {
    const votes = [
      ...ballot('p1', { p2: true, p3: false }),
      ...ballot('p2', { p1: true, p3: true }),
      ...ballot('p3', { p1: true, p2: false })
    ];
    const r = tallyApprove(votes, candidates, {});
    expect(r.scores).toEqual({ p1: 2, p2: 1, p3: 1 });
    expect(r.noCounts).toEqual({ p1: 0, p2: 1, p3: 1 });
    expect(r.approved.map(a => a.playerId)).toEqual(['p1']);
    expect(r.rejected.map(a => a.playerId)).toEqual(['p2', 'p3']);
    expect(r.approvedCount).toBe(1);
    expect(r.winner).toBe('p1');
    expect(r.winnerText).toBe('Every state gets two senators.');
    // one ballot per voter, however many entries it carried
    expect(r.totalVotes).toBe(3);
  });

  it('orders results by yes count and writes the lists as words', () => {
    const votes = [
      ...ballot('p1', { p2: true, p3: true }),
      ...ballot('p2', { p1: true, p3: true }),
      ...ballot('p3', { p1: true, p2: true }),
      ...ballot('p4', { p1: false, p2: true, p3: true })
    ];
    const r = tallyApprove(votes, candidates, {});
    expect(r.results.map(x => x.playerId)).toEqual(['p2', 'p3', 'p1']);
    expect(r.approvedList).toBe(
      '1. No taxes on trade between states. (3 yes, 0 no)\n' +
      '2. The capital moves every year. (3 yes, 0 no)\n' +
      '3. Every state gets two senators. (2 yes, 1 no)'
    );
    expect(r.resultsList).toContain('Passed: No taxes on trade between states. (3 yes, 0 no)');
    expect(r.rejectedList).toBe('');
    expect(r.approvedList).not.toMatch(/p[1-4]/);
  });

  it('takes a pass threshold as a percent of the votes cast on the item', () => {
    const votes = [
      ...ballot('p1', { p2: true, p3: true }),
      ...ballot('p2', { p1: true, p3: false }),
      ...ballot('p3', { p1: true, p2: false }),
      ...ballot('p4', { p1: false, p2: true, p3: true })
    ];
    // p1: 2 yes 1 no (67%); p2: 2 yes 1 no; p3: 2 yes 1 no
    expect(tallyApprove(votes, candidates, { passAt: 60 }).approvedCount).toBe(3);
    expect(tallyApprove(votes, candidates, { passAt: 70 }).approvedCount).toBe(0);
    // unanimous: every vote cast on the item said yes
    expect(tallyApprove(votes, candidates, { passAt: 100 }).approvedCount).toBe(0);
    const all = [...ballot('p1', { p2: true }), ...ballot('p3', { p2: true })];
    expect(tallyApprove(all, candidates, { passAt: 100 }).approved.map(a => a.playerId)).toEqual(['p2']);
  });

  it('ignores a vote on an unknown candidate and counts a voter once', () => {
    const votes = [
      ...ballot('p1', { p2: true, ghost: true }),
      ...ballot('p1', { p3: false })
    ];
    const r = tallyApprove(votes, candidates, {});
    expect(r.scores.ghost).toBeUndefined();
    expect(r.totalVotes).toBe(1);
  });

  it('says so when nothing passed, and keeps literal options as their words', () => {
    const literal = ['Pizza day', 'Longer recess'];
    const votes = [...ballot('p1', { 'Pizza day': false, 'Longer recess': false })];
    const r = tallyApprove(votes, literal, {});
    expect(r.approved).toEqual([]);
    expect(r.approvedList).toBe('');
    expect(r.rejectedList).toBe('1. Pizza day (0 yes, 1 no)\n2. Longer recess (0 yes, 1 no)');
    expect(approvedLines([])).toBe('');
  });
});

describe('the validator on an approve vote', () => {
  const base = () => ({
    name: 'Convention',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'Write one clause.', next: 'vote' },
      vote: { type: 'vote', mode: 'approve', candidates: 'ask.responses', excludeAuthors: true, next: 'passed' },
      passed: { type: 'reveal', template: 'These passed:\n\n{{vote.approvedList}}', next: 'end' },
      end: { type: 'end', message: 'Done.' }
    }
  });

  it('accepts the mode and a sane threshold', () => {
    const cfg = base();
    cfg.phases.vote.passAt = 66;
    const { errors } = validate(cfg, 'convention', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('rejects a threshold outside 1 to 100', () => {
    const cfg = base();
    cfg.phases.vote.passAt = 0;
    expect(validate(cfg, 'convention', { returnResults: true }).errors.join('\n')).toMatch(/passAt/);
  });

  it('warns when nothing after the vote shows its result', () => {
    const cfg = base();
    cfg.phases.vote.next = 'end';
    delete cfg.phases.passed;
    const { errors, warnings } = validate(cfg, 'convention', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings.join('\n')).toMatch(/nothing shows the result/i);
  });

  it('stays quiet when a crown reads a pick-one vote', () => {
    const cfg = base();
    cfg.phases.vote.mode = 'pick-one';
    cfg.phases.vote.next = 'crown';
    delete cfg.phases.passed;
    cfg.phases.crown = { type: 'winner', from: 'vote.scores', next: 'end' };
    const { warnings } = validate(cfg, 'convention', { returnResults: true });
    expect(warnings.join('\n')).not.toMatch(/nothing shows the result/i);
  });
});
