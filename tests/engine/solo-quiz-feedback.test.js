/**
 * Review eighteen: a wrong answer after a right one said "Correct!". The
 * feedback payload spread the next question over the verdict, and the next
 * question's `correct` is the running COUNT (1 after one right answer), so a
 * wrong pick read as truthy. The verdict now rides as `right`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { feedbackPayload, playerQuestionPayload } from '../../engine/phase-handlers/solo-quiz.js';

const state = {
  questions: [
    { question: 'A?', choices: ['x', 'y'], correct: 'x' },
    { question: 'B?', choices: ['x', 'y'], correct: 'x' },
    { question: 'C?', choices: ['x', 'y'], correct: 'x' }
  ],
  progress: { p1: { index: 2, answers: [{ choice: 'x', correct: true }, { choice: 'y', correct: false }] } }
};

describe('solo quiz feedback payload', () => {
  it('a wrong answer after a right one reads as wrong', () => {
    const next = playerQuestionPayload(state, 'p1', 1);
    expect(next.correct).toBe(1); // the running count
    const out = feedbackPayload({ answeredIndex: 1, right: false, correctAnswer: 'x', next, phaseInstanceId: 7 });
    expect(out.right).toBe(false);
    expect(out.correct).toBe(1);
    expect(out.index).toBe(2);
    expect(out.phaseInstanceId).toBe(7);
  });

  it('the server and the student screen use the verdict field', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toMatch(/soloQuizFeedback\(\{/);
    const player = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');
    const block = player.slice(player.indexOf("socket.on('solo-quiz-feedback'"));
    expect(block.slice(0, 1200)).toMatch(/data\.right \?/);
    expect(block.slice(0, 1200)).not.toMatch(/data\.correct \?/);
  });
});
