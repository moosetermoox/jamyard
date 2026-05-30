/**
 * Tests for the Kahoot-style speed-bonus scoring helper used by collect-choice
 * when `correctAnswer` is set.
 *
 * Formula: linear decay from 100% (instant) to 50% (timer expiry); wrong
 * answers = 0; no timer = flat pointsCorrect for any correct answer.
 */

import { describe, it, expect } from 'vitest';
import { scoreResponse, scoreResponses } from '../../engine/speed-scoring.js';
import { validate } from '../../engine/game-loader.js';

describe('scoreResponse — formula', () => {
  it('wrong answer scores 0', () => {
    expect(scoreResponse({
      choice: 'London', correctAnswer: 'Paris',
      elapsedMs: 0, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(0);
  });

  it('missing choice scores 0', () => {
    expect(scoreResponse({
      choice: null, correctAnswer: 'Paris',
      elapsedMs: 0, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(0);
  });

  it('instant correct answer scores the full pointsCorrect', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 0, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(1000);
  });

  it('correct at mid-timer scores 75%', () => {
    // elapsed = 15s of 30s timer → ratio 0.5 → factor 0.75
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 15000, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(750);
  });

  it('correct at timer expiry scores 50%', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 30000, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(500);
  });

  it('post-expiry correct is capped at 50% (not below)', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 60000, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(500);
  });

  it('case-insensitive + trims whitespace', () => {
    expect(scoreResponse({
      choice: '  paris ', correctAnswer: 'Paris',
      elapsedMs: 0, timerSeconds: 30, pointsCorrect: 1000
    })).toBe(1000);
  });

  it('no timer = flat pointsCorrect (no decay)', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 999999, timerSeconds: 0, pointsCorrect: 1000
    })).toBe(1000);
  });

  it('speedBonus:false ignores timing', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 20000, timerSeconds: 30, pointsCorrect: 1000,
      speedBonus: false
    })).toBe(1000);
  });

  it('respects custom pointsCorrect', () => {
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 0, timerSeconds: 30, pointsCorrect: 500
    })).toBe(500);
    expect(scoreResponse({
      choice: 'Paris', correctAnswer: 'Paris',
      elapsedMs: 15000, timerSeconds: 30, pointsCorrect: 500
    })).toBe(375);
  });
});

describe('scoreResponses — aggregates per player', () => {
  it('returns playerId -> points map covering correct + wrong', () => {
    const phaseStartAt = 1_000_000;
    const responses = [
      { playerId: 'p1', text: 'Paris', responseAt: phaseStartAt + 5000 },  // 5/30 ratio
      { playerId: 'p2', text: 'London', responseAt: phaseStartAt + 1000 }, // wrong
      { playerId: 'p3', text: 'Paris', responseAt: phaseStartAt + 30000 }  // expiry
    ];
    const scores = scoreResponses({
      responses, correctAnswer: 'Paris', phaseStartAt,
      timerSeconds: 30, pointsCorrect: 1000, speedBonus: true
    });
    // p1: 5/30 ratio = 0.1667 → factor 0.917 → 917
    expect(scores.p1).toBe(917);
    expect(scores.p2).toBe(0);
    expect(scores.p3).toBe(500);
  });

  it('handles missing responseAt gracefully (elapsed = 0)', () => {
    const scores = scoreResponses({
      responses: [{ playerId: 'p1', text: 'Paris' }],
      correctAnswer: 'Paris',
      phaseStartAt: 1_000_000,
      timerSeconds: 30, pointsCorrect: 1000, speedBonus: true
    });
    expect(scores.p1).toBe(1000);
  });
});

describe('schema — collect-choice with correctAnswer', () => {
  it('accepts a speed-quiz config', () => {
    const cfg = {
      name: 'Speed Quiz',
      phases: {
        lobby: { type: 'lobby', next: 'q1' },
        q1: {
          type: 'collect-choice',
          prompt: 'Capital of France?',
          choices: ['Paris', 'London', 'Berlin', 'Madrid'],
          correctAnswer: 'Paris',
          pointsCorrect: 1000,
          speedBonus: true,
          timer: 20,
          next: 'board'
        },
        board: { type: 'leaderboard', from: 'q1.scores', next: 'end' },
        end: { type: 'end' }
      }
    };
    expect(() => validate(cfg, 'speed-quiz')).not.toThrow();
  });

  it('accepts both literal and {{ref}} correctAnswer values', () => {
    const cfg = {
      name: 'Ref Quiz',
      phases: {
        lobby: { type: 'lobby', next: 'gen' },
        gen: { type: 'ai-process', task: 'generate', format: 'json',
               instruction: 'return {truth: ...}', next: 'q1' },
        q1: {
          type: 'collect-choice', prompt: '?', choices: ['A', 'B'],
          correctAnswer: '{{gen.result.truth}}', next: 'end'
        },
        end: { type: 'end' }
      }
    };
    expect(() => validate(cfg, 'ref-quiz')).not.toThrow();
  });
});
