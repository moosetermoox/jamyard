import { registerHandler } from './phase-registry.js';

registerHandler('eliminate', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const result = engine.runPhase(phase.id);
    const sc = ctx.resolveScreenControl();

    const eliminatedNames = result.eliminated.map(id => {
      const player = engine.players.find(id);
      return player ? player.name : id;
    });

    console.log(`[handlePhase] Eliminated: ${eliminatedNames.join(', ')} (${result.remaining} remaining)`);

    const pauseSeconds = phase.pause || 3;
    ctx.emitToRoom('elimination-results', {
      eliminated: result.eliminated,
      eliminatedNames,
      remaining: result.remaining,
      pause: pauseSeconds,
      ...sc
    });

    // Auto-advance after pause
    const nextId = ctx.getNextPhaseId();
    if (nextId) {
      setTimeout(async () => {
        await ctx.advanceTo(nextId);
      }, pauseSeconds * 1000);
    }
  },

  onReconnect(ctx, socket) {
    socket.emit('waiting', { message: 'Game in progress...' });
  }
});
