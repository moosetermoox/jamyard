/**
 * Phase handler: winner — declare the winner and show final standings from a
 * score source. The pick (including tie handling) is the pure winner-handler;
 * this wires it to the room and broadcasts the result.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { continueLabelForPhase } from '../phases/continue-labels.js';

registerHandler('winner', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const result = engine.runPhase(phase.id);
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Winner declared: ${result.winnerId} (${result.winnerScore} votes)`);

    // The crown is a payoff beat, so it is host-paced: it stays up until the
    // teacher presses the continue button, labelled for the next step (owner
    // 2026-10-02: ten seconds was not enough; it used to auto-advance).
    ctx.emitToRoom(EVENTS.WINNER_ANNOUNCED, {
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      winnerScore: result.winnerScore,
      winnerIds: result.winnerIds,
      winnerNames: result.winnerNames,
      winnerEntry: result.winnerEntry,
      winnerEntries: result.winnerEntries,
      winnerDrawing: result.winnerDrawing || null,
      isTie: result.isTie,
      standings: result.standings,
      // The crown's button says what comes next ("Finish up" before the
      // wrap-up screen), never a fixed "End Session" (a reviewer 2026-10-02)
      continueLabel: continueLabelForPhase(phase, engine.config.phases, engine.language),
      ...sc
    });
  },

  onReconnect(ctx, socket) {
    socket.emit(EVENTS.WAITING, { message: 'Game in progress...' });
  }
});
