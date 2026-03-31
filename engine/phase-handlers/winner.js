import { registerHandler } from './phase-registry.js';

registerHandler('winner', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const result = engine.runPhase(phase.id);
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Winner: ${result.winnerName} (${result.winnerScore} votes)`);

    const winnerPause = phase.pause || 5;
    ctx.emitToRoom('winner-announced', {
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      winnerScore: result.winnerScore,
      standings: result.standings,
      pause: winnerPause,
      ...sc
    });

    // Auto-advance after pause
    const nextId = ctx.getNextPhaseId();
    if (nextId) {
      setTimeout(async () => {
        await ctx.advanceTo(nextId);
      }, winnerPause * 1000);
    }
  },

  onReconnect(ctx, socket) {
    socket.emit('waiting', { message: 'Game in progress...' });
  }
});
