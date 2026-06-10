import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

/**
 * one-voice — cooperative counting (docs/connection-pack-spec.md §4).
 *
 * The class counts to `target` together. Anyone may tap the next number at
 * any moment, but two taps inside `collisionWindowMs` reset the count to
 * zero. No turn order, no winners: the class either makes it or laughs and
 * tries again.
 *
 * ALL timing decisions are server-authoritative: adjudication uses the
 * socket-receive timestamp the server passes in — client clocks are never
 * trusted. The decision logic itself is the pure `adjudicateTap` below
 * (clock injected), so window-boundary behavior is unit-testable to the
 * millisecond.
 *
 * After a reset there is a short lockout (the "groan and regroup" beat,
 * RESET_LOCKOUT_MS): taps queued during the collision don't cascade into
 * more resets the moment the count clears.
 *
 * @typedef {Object} OneVoiceState
 * @property {string} phaseId
 * @property {'one-voice'} kind
 * @property {number} target
 * @property {number} windowMs
 * @property {number|null} maxAttempts   null = unlimited
 * @property {number} count
 * @property {number} attempt            1-based
 * @property {number} bestRun
 * @property {number} resets
 * @property {number|null} lastTapAt     server receive time of the last counted tap
 * @property {string|null} lastTapBy     playerId of the last counted tap
 * @property {number} lockoutUntil       taps before this timestamp are ignored
 * @property {boolean} finished
 * @property {Array<{attempt: number, reachedCount: number}>} history
 * @property {NodeJS.Timeout|null} timer
 * @property {() => void} cleanup
 */

// Post-reset lockout: long enough for the reset animation + a breath,
// short enough not to kill momentum.
export const RESET_LOCKOUT_MS = 800;

// Pause on the success celebration before auto-advancing.
export const SUCCESS_ADVANCE_MS = 4000;

/**
 * Adjudicate one tap. Pure — mutates `state` deterministically based on
 * the injected receive-time `now`, and returns what happened:
 *
 *   { type: 'count',   count }                  the tap counted
 *   { type: 'success', count }                  the tap counted AND reached target
 *   { type: 'reset',   attempt, bestRun, resets }  collision — back to zero
 *   { type: 'finished-attempts' }               reset exhausted maxAttempts
 *   { type: 'reject',  reason: 'same-player' | 'lockout' | 'finished' }
 *
 * Boundary rule (spec §4.2): a gap of EXACTLY collisionWindowMs is a
 * collision ("two taps inside the same collision window"); the gap must
 * exceed the window to count.
 *
 * @param {OneVoiceState} state
 * @param {string} playerId
 * @param {number} now  Server receive timestamp (ms)
 */
export function adjudicateTap(state, playerId, now) {
  if (state.finished) return { type: 'reject', reason: 'finished' };
  if (now < state.lockoutUntil) return { type: 'reject', reason: 'lockout' };

  // Same student may not say two numbers in a row — participation breadth
  // is the game (and it stops one kid soloing to the target).
  if (state.lastTapBy === playerId && state.count > 0) {
    return { type: 'reject', reason: 'same-player' };
  }

  // Collision: this tap landed within the window of the previous one.
  if (state.lastTapAt !== null && now - state.lastTapAt <= state.windowMs && state.count > 0) {
    state.bestRun = Math.max(state.bestRun, state.count);
    state.history.push({ attempt: state.attempt, reachedCount: state.count });
    state.count = 0;
    state.resets++;
    state.attempt++;
    state.lastTapAt = null;
    state.lastTapBy = null;
    state.lockoutUntil = now + RESET_LOCKOUT_MS;

    if (state.maxAttempts !== null && state.attempt > state.maxAttempts) {
      state.finished = true;
      return { type: 'finished-attempts' };
    }
    return { type: 'reset', attempt: state.attempt, bestRun: state.bestRun, resets: state.resets };
  }

  // The tap counts.
  state.count++;
  state.lastTapAt = now;
  state.lastTapBy = playerId;

  if (state.count >= state.target) {
    state.bestRun = state.target;
    state.history.push({ attempt: state.attempt, reachedCount: state.count });
    state.finished = true;
    return { type: 'success', count: state.count };
  }
  return { type: 'count', count: state.count };
}

/** Public stats snapshot for broadcasts + the stored phase data. */
export function oneVoiceStats(state) {
  return {
    target: state.target,
    count: state.count,
    attempt: state.attempt,
    attempts: state.attempt,
    bestRun: state.bestRun,
    resets: state.resets
  };
}

registerHandler('one-voice', {
  async onEnter(ctx) {
    const { phase, room } = ctx;
    const sc = ctx.resolveScreenControl();

    /** @type {OneVoiceState} */
    const state = {
      phaseId: phase.id,
      kind: 'one-voice',
      target: Number.isInteger(phase.target) ? phase.target : 20,
      windowMs: Number.isInteger(phase.collisionWindowMs) ? phase.collisionWindowMs : 400,
      maxAttempts: Number.isInteger(phase.maxAttempts) ? phase.maxAttempts : null,
      count: 0,
      attempt: 1,
      bestRun: 0,
      resets: 0,
      lastTapAt: null,
      lastTapBy: null,
      lockoutUntil: 0,
      finished: false,
      history: [],
      timer: null,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };
    room.phaseState = state;

    console.log(`[handlePhase] One Voice: target ${state.target}, window ${state.windowMs}ms`);

    const payload = {
      target: state.target,
      collisionWindowMs: state.windowMs,
      ...oneVoiceStats(state),
      hostTemplate: sc.hostTemplate, playerTemplate: sc.playerTemplate,
      show: sc.hostShow || sc.playerShow || null
    };
    ctx.emitToHost(EVENTS.ONE_VOICE_START, payload);
    for (const player of ctx.engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.ONE_VOICE_START, payload);
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'one-voice') return;
    socket.emit(EVENTS.ONE_VOICE_START, {
      target: state.target,
      collisionWindowMs: state.windowMs,
      ...oneVoiceStats(state)
    });
  }
});
