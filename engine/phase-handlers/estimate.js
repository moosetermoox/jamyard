import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

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
      closed: false
    };
    room.phaseState = state;

    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : 'Guess the number!';
    state.prompt = prompt;

    console.log(`[handlePhase] Estimate: answer=${state.answer ?? '(none — poll mode)'}`);

    const total = ctx.engine.players.list().length;
    const payload = {
      prompt,
      unit: phase.unit || '',
      min: typeof phase.min === 'number' ? phase.min : null,
      max: typeof phase.max === 'number' ? phase.max : null,
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
    const phase = ctx.engine.config.phases[state.phaseId] || {};
    socket.emit(EVENTS.ESTIMATE_START, {
      prompt: state.prompt || '',
      unit: phase.unit || '',
      min: typeof phase.min === 'number' ? phase.min : null,
      max: typeof phase.max === 'number' ? phase.max : null,
      timer: null, // reconnectors don't restart the countdown
      count: Object.keys(state.guesses).length,
      total: ctx.engine.players.list().length
    });
  }
});
