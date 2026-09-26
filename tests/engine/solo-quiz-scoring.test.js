/**
 * Self-paced quiz rules (engine/phases/solo-quiz-scoring.js): question
 * cleaning, progress summaries for the projector, and grading at close.
 */
import { describe, it, expect } from 'vitest';
import { isCorrectAnswer, playableQuestions, summarizeProgress, scoreSoloQuiz, shuffledChoices } from '../../engine/phases/solo-quiz-scoring.js';

const questions = [
  { question: 'Capital of Australia?', choices: ['Sydney', 'Canberra'], correct: 'Canberra' },
  { question: 'Closest planet to the Sun?', choices: ['Venus', 'Mercury', 'Mars'], correct: 'Mercury' },
  { question: '2 + 2?', choices: ['3', '4'], correct: '4' }
];

describe('isCorrectAnswer', () => {
  it('matches on trimmed, case-folded text', () => {
    expect(isCorrectAnswer(' canberra ', 'Canberra')).toBe(true);
    expect(isCorrectAnswer('Sydney', 'Canberra')).toBe(false);
    expect(isCorrectAnswer(null, 'x')).toBe(false);
  });
});

describe('playableQuestions', () => {
  it('drops questions with no text, under two choices, or a correct answer not among the choices', () => {
    const cleaned = playableQuestions([
      ...questions,
      { question: '', choices: ['a', 'b'], correct: 'a' },
      { question: 'One choice?', choices: ['a'], correct: 'a' },
      { question: 'Wrong key', choices: ['a', 'b'], correct: 'c' },
      null,
      { text: 'Alt key spelling', choices: ['x', 'y'], correct: 'y' }
    ]);
    expect(cleaned).toHaveLength(4);
    expect(cleaned[3].question).toBe('Alt key spelling');
  });

  it('is empty for non-arrays', () => {
    expect(playableQuestions(null)).toEqual([]);
  });
});

describe('summarizeProgress', () => {
  it('counts started and finished students and per-question correct rates', () => {
    const progress = {
      p1: { index: 3, answers: [{ choice: 'Canberra', correct: true }, { choice: 'Mars', correct: false }, { choice: '4', correct: true }] },
      p2: { index: 1, answers: [{ choice: 'Sydney', correct: false }] },
      p3: { index: 0, answers: [] }
    };
    const s = summarizeProgress(progress, questions);
    expect(s.started).toBe(2);
    expect(s.finished).toBe(1);
    expect(s.perQuestion).toEqual([
      { answered: 2, correct: 1 },
      { answered: 1, correct: 0 },
      { answered: 1, correct: 1 }
    ]);
  });
});

describe('scoreSoloQuiz', () => {
  const progress = {
    p1: { index: 3, answers: [{ choice: 'Canberra', correct: true }, { choice: 'Mercury', correct: true }, { choice: '3', correct: false }] },
    p2: { index: 1, answers: [{ choice: 'Canberra', correct: true }] }
  };
  const nameOf = (id) => ({ p1: 'Maya', p2: 'Sam' })[id] || null;

  it('awards points per correct answer and keeps partial progress at close', () => {
    const r = scoreSoloQuiz(progress, questions, 10, nameOf);
    expect(r.scores).toEqual({ p1: 20, p2: 10 });
    expect(r.results[0]).toMatchObject({ name: 'Maya', answered: 3, correct: 2, total: 3, finished: true });
    expect(r.results[1]).toMatchObject({ name: 'Sam', answered: 1, correct: 1, finished: false });
    expect(r.finished).toBe(1);
    expect(r.started).toBe(2);
  });

  it('reports per-question rates and a class average', () => {
    const r = scoreSoloQuiz(progress, questions, 1, nameOf);
    expect(r.perQuestion[0]).toMatchObject({ index: 0, answered: 2, correct: 2, pct: 100 });
    expect(r.perQuestion[2]).toMatchObject({ answered: 1, correct: 0, pct: 0 });
    // 3 correct out of the 4 answers given (the unanswered never count as wrong)
    expect(r.averagePct).toBe(75);
  });

  it('defaults to one point per question for bad point values', () => {
    expect(scoreSoloQuiz(progress, questions, 0).scores.p1).toBe(2);
    expect(scoreSoloQuiz({}, questions, 5).averagePct).toBe(0);
  });
});

describe("the third-review fixes (2026-09-26)", () => {
  it("deals each student their own choice order, the same one on a refresh", () => {
    const choices = ["Sydney", "Canberra", "Melbourne", "Perth"];
    const a = shuffledChoices(choices, "p1|0");
    expect(a.slice().sort()).toEqual(choices.slice().sort());
    expect(shuffledChoices(choices, "p1|0")).toEqual(a);
    expect(choices).toEqual(["Sydney", "Canberra", "Melbourne", "Perth"]);
    const orders = new Set();
    for (let i = 0; i < 40; i++) orders.add(shuffledChoices(choices, "p" + i + "|0").join("|"));
    expect(orders.size).toBeGreaterThan(4);
    const firsts = new Set();
    for (let i = 0; i < 40; i++) firsts.add(shuffledChoices(choices, "p" + i + "|0")[0]);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("averages over the questions answered, never counting the unanswered as wrong", () => {
    const progress = { p1: { index: 1, answers: [{ choice: "Canberra", correct: true }] } };
    const r = scoreSoloQuiz(progress, questions, 1);
    expect(r.averagePct).toBe(100);
    expect(r.answeredAll).toBe(1);
    expect(r.results[0]).toMatchObject({ answered: 1, correct: 1, total: 3, finished: false });
  });
});
