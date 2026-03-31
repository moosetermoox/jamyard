import { registerHandler } from './phase-registry.js';

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
    room.rankState = {
      phaseId: phase.id, candidates: rkItems,
      submissions: {}, eligibleIds: rkEligibleIds, completed: new Set()
    };

    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Rank: ${rkItems.length} items, ${rkEligible.length} rankers`);

    ctx.emitToHost('rank-start', {
      prompt: phase.prompt, totalRankers: rkEligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (rkEligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, 'rank-start', {
          prompt: phase.prompt, candidates: rkItems,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, 'waiting', { message: 'Waiting for others to rank...' });
      }
    }

    if (phase.timer) {
      room.rankTimer = setTimeout(async () => {
        if (room.rankState && room.rankState.phaseId === phase.id) {
          await ctx.services.closeRanking(room.code || code, room);
        }
      }, phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const rkState = ctx.room.rankState;
    if (rkState) {
      const sc = ctx.resolveScreenControl();
      if (rkState.completed.has(socket.id)) {
        socket.emit('waiting', { message: 'Ranking submitted. Waiting for others...' });
      } else if (rkState.eligibleIds.has(socket.id)) {
        socket.emit('rank-start', {
          prompt: ctx.phase.prompt, candidates: rkState.candidates,
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit('waiting', { message: 'Waiting for others to rank...' });
      }
    }
  }
});
