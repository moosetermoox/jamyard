import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { effectiveRange } from '../phases/estimate-range.js';
import { secondsLeft } from '../phase-timer.js';

/**
 * estimate — numeric guessing with closeness scoring.
 *
 * "How many liters of water does a cow drink a day?" Every student submits
 * a number; when the teacher closes (or the timer runs out), the answer is
 * revealed with the class distribution and closeness-ranked scores
 * (engine/phases/estimate-scoring.js — pure, scale-free).
 *
 * Without an `answer` it's poll-the-room mode: no scores, just the
 * distribution and stats — "how long do YOU think a school day should be?"
 *
 * Output `scores` is a scoreMap, so leaderboard/winner consume it like any
 * graded phase. Stats (`average`/`median`/`closest`/`answer`) are available
 * to later templates: {{guess.average}}.
 *
 * @typedef {Object} EstimateState
 * @property {'estimate'} kind
 * @property {string} phaseId
 * @property {number|null} answer
 * @property {Object<string, number>} guesses   playerId → value
 * @property {boolean} closed
 */

registerHandler('estimate', {
  async onEnter(ctx) {
    const { phase, room } = ctx;
    const sc = ctx.resolveScreenControl();

    const state = {
      kind: 'estimate',
      phaseId: phase.id,
      answer: typeof phase.answer === 'number' && Number.isFinite(phase.answer) ? phase.answer : null,
      guesses: {},
      // When each guess landed and the step opened: the speed bonus
      // (scoring "distance" with speedBonus, 2026-10-01)
      guessedAt: {},
      startedAt: Date.now(),
      // the clock's deadline, so a refreshed screen gets the time left
      // (it got timer: null and lost the countdown; extend-timer bumps it)
      timerEndsAt: phase.timer ? Date.now() + phase.timer * 1000 : null,
      closed: false
    };
    room.phaseState = state;

    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : 'Guess the number!';
    state.prompt = prompt;

    console.log(`[handlePhase] Estimate: answer=${state.answer ?? '(none, poll mode)'}`);

    const image = ctx.services.resolveImageUrl(phase.image, room.gameId, room.gameSource);

    const total = ctx.engine.players.list().length;
    // The step's min/max, or the question's own "scale of 1 to 10": the
    // student screen turns a known range into a tappable scale or slider
    const range = effectiveRange(phase);
    const payload = {
      prompt,
      unit: phase.unit || '',
      image,
      min: range.min,
      max: range.max,
      timer: phase.timer || null,
      count: 0,
      total,
      hostTemplate: sc.hostTemplate, playerTemplate: sc.playerTemplate,
      show: sc.hostShow || sc.playerShow || null
    };
    ctx.emitToHost(EVENTS.ESTIMATE_START, payload);
    for (const player of ctx.engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.ESTIMATE_START, payload);
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'estimate') return;
    // Already closed: show the results, not a dead input box.
    if (state.closed && state.resultsPayload) {
      socket.emit(EVENTS.ESTIMATE_RESULTS, state.resultsPayload);
      return;
    }
    const phase = ctx.engine.config.phases[state.phaseId] || {};
    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const range = effectiveRange(phase);
    socket.emit(EVENTS.ESTIMATE_START, {
      prompt: state.prompt || '',
      unit: phase.unit || '',
      image,
      min: range.min,
      max: range.max,
      timer: secondsLeft(ctx.room), // the time left, never a restarted clock
      // The guess this student already sent, so a refreshed screen says
      // "you guessed 500" instead of an empty box (the owner's re-check,
      // 2026-10-03); the server keeps counting it either way
      myGuess: Object.prototype.hasOwnProperty.call(state.guesses, socket.id) ? state.guesses[socket.id] : null,
      count: Object.keys(state.guesses).length,
      total: ctx.engine.players.list().length,
      phaseInstanceId: ctx.phaseInstanceId
    });
  }
});
