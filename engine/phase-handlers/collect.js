import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('collect', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();

    // Clear previous responses for multi-round games
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined });
    }

    // Send prompt to host
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: phase.prompt, timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send prompt to eligible players
    for (const player of eligible) {
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: phase.prompt, timer: phase.timer || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }

    // Send waiting to non-eligible players
    for (const player of engine.players.list()) {
      if (!eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for other players...' });
      }
    }
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    const player = ctx.engine.players.find(socket.id);
    if (player && player.response) {
      socket.emit(EVENTS.WAITING, { message: 'Answer submitted. Waiting for others...' });
    } else {
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: ctx.phase.prompt, timer: null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
