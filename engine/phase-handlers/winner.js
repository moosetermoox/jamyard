/**
 * Phase handler: winner — declare the winner and show final standings from a
 * score source. The pick (including tie handling) is the pure winner-handler;
 * this wires it to the room and broadcasts the result.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('winner', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const result = engine.runPhase(phase.id);
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Winner declared: ${result.winnerId} (${result.winnerScore} votes)`);

    const winnerPause = phase.pause || 5;
    ctx.emitToRoom(EVENTS.WINNER_ANNOUNCED, {
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      winnerScore: result.winnerScore,
      winnerIds: result.winnerIds,
      winnerNames: result.winnerNames,
      isTie: result.isTie,
      standings: result.standings,
      pause: winnerPause,
      ...sc
    });

    // Auto-advance after pause
    const nextId = ctx.getNextPhaseId();
    if (nextId) {
      setTimeout(async () => {
        if (ctx.isStale()) return;
        await ctx.advanceTo(nextId);
      }, winnerPause * 1000);
    }
  },

  onReconnect(ctx, socket) {
    socket.emit(EVENTS.WAITING, { message: 'Game in progress...' });
  }
});
