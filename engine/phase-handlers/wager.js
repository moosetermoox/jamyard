import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('wager', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const wgFrom = phase.from || 'all';
    const wgEligible = ctx.getEligibleVoters(wgFrom);
    let wgOptions = phase.options;
    if (typeof wgOptions === 'string' && wgOptions.includes('.')) {
      wgOptions = engine.resolve(wgOptions);
    }
    if (!Array.isArray(wgOptions)) wgOptions = [];
    wgOptions = wgOptions.map(o => typeof o === 'string' ? o : (o.text || o.name || JSON.stringify(o)));

    // If scoresFrom isn't set, every player starts with a default pool so the
    // simplest case (a one-off bet with no prior score chain) just works.
    const DEFAULT_STARTING_POINTS = 100;
    const wgScores = phase.scoresFrom
      ? (engine.resolve(phase.scoresFrom) || {})
      : Object.fromEntries(wgEligible.map(p => [p.id, DEFAULT_STARTING_POINTS]));
    const wgEligibleIds = new Set(wgEligible.map(p => p.id));

    room.phaseState = {
      kind: 'wager',
      phaseId: phase.id, options: wgOptions, scores: { ...wgScores },
      wagers: {}, eligibleIds: wgEligibleIds, completed: new Set(),
      minBet: phase.minBet || 1,
      maxBetPercent: phase.maxBetPercent || 100,
      correctOption: phase.correctOption || null,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };

    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Wager: ${wgOptions.length} options, ${wgEligible.length} wagerers`);

    ctx.emitToHost(EVENTS.WAGER_START, {
      prompt: phase.prompt, options: wgOptions,
      totalWagerers: wgEligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (wgEligibleIds.has(player.id)) {
        const availPts = wgScores[player.id] || 0;
        ctx.emitToPlayer(player.id, EVENTS.WAGER_START, {
          prompt: phase.prompt, options: wgOptions,
          availablePoints: availPts,
          minBet: room.phaseState.minBet,
          maxBetPercent: room.phaseState.maxBetPercent,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for others to place wagers...' });
      }
    }

    if (phase.timer) {
      room.phaseState.timer = setTimeout(async () => {
        if (room.phaseState && room.phaseState.phaseId === phase.id) {
          await ctx.services.closeWager(room.code || code, room);
        }
      }, phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const wgState = ctx.room.phaseState;
    if (wgState) {
      const sc = ctx.resolveScreenControl();
      if (wgState.completed.has(socket.id)) {
        socket.emit(EVENTS.WAITING, { message: 'Wager placed. Waiting for others...' });
      } else if (wgState.eligibleIds.has(socket.id)) {
        const availPts = wgState.scores[socket.id] || 0;
        socket.emit(EVENTS.WAGER_START, {
          prompt: ctx.phase.prompt, options: wgState.options,
          availablePoints: availPts,
          minBet: wgState.minBet, maxBetPercent: wgState.maxBetPercent,
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit(EVENTS.WAITING, { message: 'Waiting for others to place wagers...' });
      }
    }
  }
});
