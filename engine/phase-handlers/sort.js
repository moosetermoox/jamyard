import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { armPhaseTimer } from '../phase-timer.js';
import { normalizeSortItems, isGradedSort } from '../phases/sort-scoring.js';

/**
 * sort — students place each item into a named bucket (metaphor vs
 * simile, fact vs opinion). Tap-to-assign on the player screen (buckets
 * as toggle buttons per item — drag across bucket zones is miserable on
 * a phone). A submission is the chosen bucket names in item order.
 *
 * Graded when every item declares a correct bucket (points per correct
 * placement — engine/phases/sort-scoring.js, pure); a consensus poll when
 * none do. Closing reveals per-item class distributions (+ accuracy when
 * graded): the discussion moment. Like estimate/match, results do NOT
 * auto-advance — the host clicks Continue.
 *
 * @typedef {Object} SortState
 * @property {'sort'} kind
 * @property {string} phaseId
 * @property {Array<{text: string, bucket: string|null}>} items  shuffled
 * @property {string[]} buckets
 * @property {boolean} graded
 * @property {Object<string, string[]>} submissions  playerId → buckets in item order
 * @property {Set<string>} eligibleIds
 * @property {Set<string>} completed
 * @property {boolean} closed
 */

registerHandler('sort', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const eligible = ctx.getEligibleVoters(phase.from || 'all');
    const items = ctx.services.shuffleArray(normalizeSortItems(phase.items));
    const buckets = (Array.isArray(phase.buckets) ? phase.buckets : [])
      .map(b => String(b ?? '').trim()).filter(Boolean);

    // An unplayable board (blank editor rows, bad AI output) — skip
    // rather than strand students.
    if (items.length < 2 || buckets.length < 2) {
      console.warn(`[sort:${phase.id}] fewer than 2 usable items/buckets, skipping the step`);
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        engine.storePhaseData(phase.id, { scores: {}, results: [], resultsList: '', itemCount: 0 });
        await ctx.advanceTo(nextId);
        return;
      }
    }

    const eligibleIds = new Set(eligible.map(p => p.id));
    room.phaseState = {
      kind: 'sort',
      phaseId: phase.id,
      items,
      buckets,
      graded: isGradedSort(items),
      submissions: {},
      eligibleIds,
      completed: new Set(),
      closed: false,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };

    const sc = ctx.resolveScreenControl();
    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : 'Sort the items!';
    room.phaseState.prompt = prompt;

    console.log(`[handlePhase] Sort: ${items.length} items into ${buckets.length} buckets (${room.phaseState.graded ? 'graded' : 'consensus'})`);

    ctx.emitToHost(EVENTS.SORT_START, {
      prompt,
      buckets,
      itemCount: items.length,
      totalSorters: eligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.SORT_START, {
          prompt,
          buckets,
          items: items.map(it => it.text), // correct buckets stay server-side
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for others to sort...' });
      }
    }

    if (phase.timer) {
      armPhaseTimer(room, phase.timer, () => ctx.services.closeSorting(room.code || code, room));
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'sort') return;
    const sc = ctx.resolveScreenControl();
    // Already closed: show the results, not a dead board.
    if (state.closed && state.resultsPayload) {
      socket.emit(EVENTS.SORT_RESULTS, state.resultsPayload);
      return;
    }
    if (state.completed.has(socket.id)) {
      socket.emit(EVENTS.WAITING, { message: 'Sorting submitted. Waiting for others...' });
    } else if (state.eligibleIds.has(socket.id)) {
      socket.emit(EVENTS.SORT_START, {
        prompt: state.prompt || '',
        buckets: state.buckets,
        items: state.items.map(it => it.text),
        timer: null, // reconnectors don't restart the countdown
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    } else {
      socket.emit(EVENTS.WAITING, { message: 'Waiting for others to sort...' });
    }
  }
});
