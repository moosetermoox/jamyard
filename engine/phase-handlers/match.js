import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { armPhaseTimer } from '../phase-timer.js';
import { normalizePairs } from '../phases/match-scoring.js';

/**
 * match — pair items from two lists (vocab ↔ definitions, quotes ↔ authors).
 *
 * The left column stays fixed; students drag the right column into
 * alignment (same drag infra as rank). A submission is the right-item
 * texts in left-item order. Closing scores everyone (pointsPerMatch per
 * correct pair — engine/phases/match-scoring.js, pure) and reveals the
 * correct pairs with per-pair class accuracy: the discussion moment.
 * Like estimate, results do NOT auto-advance — the host clicks Continue.
 *
 * Output `scores` is a scoreMap, so leaderboard/winner consume it like
 * any graded phase.
 *
 * @typedef {Object} MatchState
 * @property {'match'} kind
 * @property {string} phaseId
 * @property {Array<{left: string, right: string}>} pairs
 * @property {string[]} rightItems              shuffled display order
 * @property {Object<string, string[]>} submissions  playerId → right texts in left order
 * @property {Set<string>} eligibleIds
 * @property {Set<string>} completed
 * @property {boolean} closed
 */

registerHandler('match', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const eligible = ctx.getEligibleVoters(phase.from || 'all');
    const pairs = normalizePairs(phase.pairs);

    // Fewer than 2 usable pairs (blank editor rows, bad AI output) — skip
    // rather than strand students on an unplayable board.
    if (pairs.length < 2) {
      console.warn(`[match:${phase.id}] fewer than 2 usable pairs, skipping the step`);
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        engine.storePhaseData(phase.id, { scores: {}, results: [], resultsList: '', pairCount: 0 });
        await ctx.advanceTo(nextId);
        return;
      }
    }

    // One shared shuffle of the right column; stored so reconnectors see
    // the same board and scoring stays position-independent. Re-deal if the
    // shuffle lands on the solved order — a pre-solved board (1-in-n! but
    // it happened in testing) trivializes the round.
    const correctOrder = pairs.map(p => p.right);
    let rightItems = ctx.services.shuffleArray(correctOrder);
    for (let tries = 0; tries < 5 && pairs.length > 1 && rightItems.every((r, i) => r === correctOrder[i]); tries++) {
      rightItems = ctx.services.shuffleArray(correctOrder);
    }

    const eligibleIds = new Set(eligible.map(p => p.id));
    room.phaseState = {
      kind: 'match',
      phaseId: phase.id,
      pairs,
      rightItems,
      submissions: {},
      eligibleIds,
      completed: new Set(),
      closed: false,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };

    const sc = ctx.resolveScreenControl();
    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : 'Match the pairs!';
    room.phaseState.prompt = prompt;

    console.log(`[handlePhase] Match: ${pairs.length} pairs, ${eligible.length} matchers`);

    ctx.emitToHost(EVENTS.MATCH_START, {
      prompt,
      leftItems: pairs.map(p => p.left),
      pairCount: pairs.length,
      totalMatchers: eligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.MATCH_START, {
          prompt,
          leftItems: pairs.map(p => p.left),
          rightItems,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for others to match...' });
      }
    }

    if (phase.timer) {
      armPhaseTimer(room, phase.timer, () => ctx.services.closeMatching(room.code || code, room));
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'match') return;
    const sc = ctx.resolveScreenControl();
    // Already closed: show the results, not a dead board.
    if (state.closed && state.resultsPayload) {
      socket.emit(EVENTS.MATCH_RESULTS, state.resultsPayload);
      return;
    }
    if (state.completed.has(socket.id)) {
      socket.emit(EVENTS.WAITING, { message: 'Matches submitted. Waiting for others...' });
    } else if (state.eligibleIds.has(socket.id)) {
      socket.emit(EVENTS.MATCH_START, {
        prompt: state.prompt || '',
        leftItems: state.pairs.map(p => p.left),
        rightItems: state.rightItems,
        timer: null, // reconnectors don't restart the countdown
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    } else {
      socket.emit(EVENTS.WAITING, { message: 'Waiting for others to match...' });
    }
  }
});
