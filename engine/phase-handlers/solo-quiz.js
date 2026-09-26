/**
 * Phase handler: solo-quiz — a self-paced multiple-choice quiz.
 *
 * Each student walks through the question list on their own device at
 * their own speed; speed never counts. The projector shows only progress
 * (how many started, how many finished, how the class did per question),
 * never a question or a name with a score. Built for rolling-start
 * activities: a student who arrives late simply begins at question one.
 *
 * Per-student progress lives in room.phaseState (kind 'solo-quiz') and
 * is mirrored into phaseData so a restart resumes where everyone was.
 * The server owns answers (solo-quiz-answer) and the close
 * (closeSoloQuiz): grading is engine/phases/solo-quiz-scoring.js.
 *
 * @typedef {Object} SoloQuizState
 * @property {'solo-quiz'} kind
 * @property {string} phaseId
 * @property {Array<{question: string, choices: string[], correct: string}>} questions
 * @property {Object<string, {index: number, answers: Array<{choice: string, correct: boolean}>}>} progress
 * @property {boolean} closed
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { playableQuestions, summarizeProgress, shuffledChoices } from '../phases/solo-quiz-scoring.js';

/** The projector's picture: counts and per-question rates, nothing else. */
export function hostProgressPayload(state, engine) {
  const { started, finished, perQuestion } = summarizeProgress(state.progress, state.questions);
  return {
    started,
    finished,
    total: engine.players.list().length,
    perQuestion: perQuestion.map((q, i) => ({
      index: i,
      answered: q.answered,
      correct: q.correct,
      pct: q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0
    }))
  };
}

/** What one student sees next: their current question, or their finish line. */
export function playerQuestionPayload(state, playerId, points) {
  const p = state.progress[playerId] || { index: 0, answers: [] };
  const total = state.questions.length;
  const correct = p.answers.filter(a => a && a.correct).length;
  // answered rides along so a quiz ended early reads "1 of 1 answered",
  // never "1 of 5" as if the rest were wrong
  const answered = p.answers.length;
  if (p.index >= total) {
    return { done: true, index: total, total, answered, correct, score: correct * points };
  }
  const q = state.questions[p.index];
  return {
    done: false,
    index: p.index,
    total,
    answered,
    question: q.question,
    // this student's own order for this question, the same on a refresh
    choices: shuffledChoices(q.choices, playerId + '|' + p.index),
    correct,
    score: correct * points
  };
}

export function pointsFor(phase) {
  return Number.isInteger(phase.pointsPerQuestion) && phase.pointsPerQuestion > 0 ? phase.pointsPerQuestion : 1;
}

registerHandler('solo-quiz', {
  async onEnter(ctx) {
    const { phase, room, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    const questions = playableQuestions(phase.questions);

    // A restart resumes everyone where they were (progress is mirrored
    // into phaseData on every answer; see the server's answer handler).
    const prior = engine.phaseData[phase.id];
    const progress = prior && prior.progress && typeof prior.progress === 'object'
      ? JSON.parse(JSON.stringify(prior.progress))
      : {};

    const state = {
      kind: 'solo-quiz',
      phaseId: phase.id,
      questions,
      progress,
      closed: false
    };
    room.phaseState = state;
    const title = phase.title ? ctx.resolveTemplate(phase.title) : 'Quiz';
    state.title = title;

    console.log(`[handlePhase] Solo quiz: ${questions.length} question(s)`);

    ctx.emitToHost(EVENTS.SOLO_QUIZ_START, {
      title,
      questionCount: questions.length,
      ...hostProgressPayload(state, engine),
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });
    const points = pointsFor(phase);
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.SOLO_QUIZ_QUESTION, {
        title,
        ...playerQuestionPayload(state, player.id, points),
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'solo-quiz') return;
    const phase = ctx.engine.config.phases[state.phaseId] || {};
    if (state.closed && state.resultsPayload) {
      // Closed: the student's own final line, never the class table.
      const mine = playerQuestionPayload(state, socket.id, pointsFor(phase));
      socket.emit(EVENTS.SOLO_QUIZ_DONE, { ...mine, closed: true, phaseInstanceId: ctx.phaseInstanceId });
      return;
    }
    socket.emit(EVENTS.SOLO_QUIZ_QUESTION, {
      title: state.title || 'Quiz',
      ...playerQuestionPayload(state, socket.id, pointsFor(phase)),
      // Late joiners are the normal case in a rolling quiz: carry the
      // instance id so their feedback passes the client's stale guard.
      phaseInstanceId: ctx.phaseInstanceId
    });
  }
});
