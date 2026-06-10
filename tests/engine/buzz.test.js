/**
 * Buzz phase — first-tap-wins buzzer rounds (trivia bee, spelling bee).
 *
 * The teacher asks questions out loud (or shows a prompt); the first
 * player to buzz gets to answer; the teacher judges Right/Wrong on the
 * host screen. Wrong locks that player out for the current question and
 * reopens the buzzer. All adjudication is server-authoritative — these
 * pure functions are the referee.
 */

import { describe, it, expect } from 'vitest';
import { createBuzzState, applyBuzz, applyJudge, applyNextQuestion } from '../../engine/phase-handlers/buzz.js';

function freshState(overrides = {}) {
  return createBuzzState({ points: 10, lockoutOnWrong: true, ...overrides });
}

describe('applyBuzz', () => {
  it('first buzz locks the buzzer to that player', () => {
    const s = freshState();
    const r = applyBuzz(s, 'p1');
    expect(r.type).toBe('locked');
    expect(s.buzzedBy).toBe('p1');
    expect(s.open).toBe(false);
  });

  it('later buzzes are rejected while locked', () => {
    const s = freshState();
    applyBuzz(s, 'p1');
    expect(applyBuzz(s, 'p2')).toEqual({ type: 'reject', reason: 'closed' });
  });

  it('locked-out players cannot buzz after a wrong answer', () => {
    const s = freshState();
    applyBuzz(s, 'p1');
    applyJudge(s, false);
    expect(applyBuzz(s, 'p1')).toEqual({ type: 'reject', reason: 'locked-out' });
    expect(applyBuzz(s, 'p2').type).toBe('locked'); // others can
  });
});

describe('applyJudge', () => {
  it('correct awards points and holds for the next question', () => {
    const s = freshState();
    applyBuzz(s, 'p1');
    const r = applyJudge(s, true);
    expect(r.type).toBe('correct');
    expect(r.playerId).toBe('p1');
    expect(s.scores.p1).toBe(10);
    expect(s.open).toBe(false); // teacher clicks Next Question
  });

  it('wrong locks the player out and reopens the buzzer', () => {
    const s = freshState();
    applyBuzz(s, 'p1');
    const r = applyJudge(s, false);
    expect(r.type).toBe('wrong');
    expect(r.playerId).toBe('p1');
    expect(s.open).toBe(true);
    expect(s.buzzedBy).toBe(null);
    expect(s.scores.p1 || 0).toBe(0);
  });

  it('lockoutOnWrong: false lets the same player buzz again', () => {
    const s = freshState({ lockoutOnWrong: false });
    applyBuzz(s, 'p1');
    applyJudge(s, false);
    expect(applyBuzz(s, 'p1').type).toBe('locked');
  });

  it('judging with nobody buzzed is rejected', () => {
    const s = freshState();
    expect(applyJudge(s, true).type).toBe('reject');
  });

  it('points accumulate across questions', () => {
    const s = freshState();
    applyBuzz(s, 'p1'); applyJudge(s, true);
    applyNextQuestion(s);
    applyBuzz(s, 'p1'); applyJudge(s, true);
    expect(s.scores.p1).toBe(20);
  });
});

describe('applyNextQuestion', () => {
  it('clears lockouts and the buzz, reopens, bumps the counter', () => {
    const s = freshState();
    applyBuzz(s, 'p1');
    applyJudge(s, false); // p1 locked out
    applyBuzz(s, 'p2');
    applyJudge(s, true);
    applyNextQuestion(s);
    expect(s.question).toBe(2);
    expect(s.open).toBe(true);
    expect(s.buzzedBy).toBe(null);
    expect(applyBuzz(s, 'p1').type).toBe('locked'); // lockout cleared
  });
});
