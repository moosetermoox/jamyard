import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

/**
 * buzz — first-tap-wins buzzer rounds (trivia bee, spelling bee, mental math).
 *
 * The teacher asks questions out loud (or shows a prompt); the first player
 * to tap locks the buzzer and answers aloud; the teacher judges Right/Wrong
 * on the host screen. Wrong locks that player out for the current question
 * and reopens the buzzer for everyone else. "Next question" clears lockouts
 * and reopens; "Finish round" stores the scores (a scoreMap — feeds
 * leaderboard/winner like any graded phase).
 *
 * One phase = as many informal questions as the teacher wants; adjudication
 * is server-authoritative via the pure functions below (socket arrival order
 * IS the buzz order — no client clocks involved).
 *
 * @typedef {Object} BuzzState
 * @property {'buzz'} kind
 * @property {string} phaseId
 * @property {number} points
 * @property {boolean} lockoutOnWrong
 * @property {boolean} open
 * @property {string|null} buzzedBy
 * @property {Set<string>} lockedOut
 * @property {Object<string, number>} scores
 * @property {number} question  1-based
 */

/** Build a fresh referee state from the phase config. */
export function createBuzzState(phase = {}) {
  return {
    kind: 'buzz',
    phaseId: phase.id || null,
    points: Number.isInteger(phase.points) && phase.points > 0 ? phase.points : 10,
    lockoutOnWrong: phase.lockoutOnWrong !== false,
    open: true,
    buzzedBy: null,
    lockedOut: new Set(),
    scores: {},
    question: 1
  };
}

/**
 * A player tapped the buzzer.
 * @returns {{type:'locked', playerId:string} | {type:'reject', reason:'locked-out'|'closed'}}
 */
export function applyBuzz(state, playerId) {
  if (state.lockedOut.has(playerId)) return { type: 'reject', reason: 'locked-out' };
  if (!state.open || state.buzzedBy) return { type: 'reject', reason: 'closed' };
  state.buzzedBy = playerId;
  state.open = false;
  return { type: 'locked', playerId };
}

/**
 * Teacher judged the buzzed-in answer.
 * Correct: award points, buzzer stays closed until "next question".
 * Wrong: lock the player out (if configured) and reopen for the rest.
 * @returns {{type:'correct'|'wrong', playerId:string} | {type:'reject'}}
 */
export function applyJudge(state, correct) {
  const playerId = state.buzzedBy;
  if (!playerId) return { type: 'reject' };

  if (correct) {
    state.scores[playerId] = (state.scores[playerId] || 0) + state.points;
    state.open = false; // held until next-question
    return { type: 'correct', playerId };
  }

  if (state.lockoutOnWrong) state.lockedOut.add(playerId);
  state.buzzedBy = null;
  state.open = true;
  return { type: 'wrong', playerId };
}

/** Teacher moved to the next question: clear lockouts, reopen. */
export function applyNextQuestion(state) {
  state.question++;
  state.buzzedBy = null;
  state.lockedOut.clear();
  state.open = true;
}

registerHandler('buzz', {
  async onEnter(ctx) {
    const { phase, room } = ctx;
    const sc = ctx.resolveScreenControl();

    const state = createBuzzState(phase);
    room.phaseState = state;

    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : '';
    state.prompt = prompt;

    console.log(`[handlePhase] Buzz: ${state.points} pts/question, lockoutOnWrong=${state.lockoutOnWrong}`);

    const payload = {
      prompt,
      points: state.points,
      question: state.question,
      scores: state.scores,
      hostTemplate: sc.hostTemplate, playerTemplate: sc.playerTemplate,
      show: sc.hostShow || sc.playerShow || null
    };
    ctx.emitToHost(EVENTS.BUZZ_START, payload);
    for (const player of ctx.engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.BUZZ_START, payload);
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'buzz') return;
    socket.emit(EVENTS.BUZZ_START, {
      prompt: state.prompt || '',
      points: state.points,
      question: state.question,
      scores: state.scores
    });
    if (state.buzzedBy) {
      const p = ctx.engine.players.find(state.buzzedBy);
      socket.emit(EVENTS.BUZZ_LOCKED, {
        playerId: state.buzzedBy,
        playerName: p ? p.name : '?',
        question: state.question
      });
    }
  }
});
