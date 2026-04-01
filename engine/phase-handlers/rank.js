import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('rank', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const rkFrom = phase.from || 'all';
    const rkEligible = ctx.getEligibleVoters(rkFrom);
    let rkCandidates = phase.candidates ? engine.resolve(phase.candidates) : [];
    if (!Array.isArray(rkCandidates)) {
      if (typeof rkCandidates === 'object') {
        rkCandidates = Object.values(rkCandidates);
      } else {
        rkCandidates = [rkCandidates];
      }
    }
    // Normalize items to strings for display
    const rkItems = rkCandidates.map(c => {
      if (typeof c === 'string') return c;
      if (c && c.text) return c.text;
      if (c && c.name) return c.name;
      if (c && c.response) return c.response;
      return JSON.stringify(c);
    });

    const rkEligibleIds = new Set(rkEligible.map(p => p.id));
    room.phaseState = {
      phaseId: phase.id, candidates: rkItems,
      submissions: {}, eligibleIds: rkEligibleIds, completed: new Set(),
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };

    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Rank: ${rkItems.length} items, ${rkEligible.length} rankers`);

    ctx.emitToHost(EVENTS.RANK_START, {
      prompt: phase.prompt, totalRankers: rkEligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (rkEligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.RANK_START, {
          prompt: phase.prompt, candidates: rkItems,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for others to rank...' });
      }
    }

    if (phase.timer) {
      room.phaseState.timer = setTimeout(async () => {
        if (room.phaseState && room.phaseState.phaseId === phase.id) {
          await ctx.services.closeRanking(room.code || code, room);
        }
      }, phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const rkState = ctx.room.phaseState;
    if (rkState) {
      const sc = ctx.resolveScreenControl();
      if (rkState.completed.has(socket.id)) {
        socket.emit(EVENTS.WAITING, { message: 'Ranking submitted. Waiting for others...' });
      } else if (rkState.eligibleIds.has(socket.id)) {
        socket.emit(EVENTS.RANK_START, {
          prompt: ctx.phase.prompt, candidates: rkState.candidates,
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit(EVENTS.WAITING, { message: 'Waiting for others to rank...' });
      }
    }
  }
});
