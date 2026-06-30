/**
 * Phase handler: end — the terminal phase. Shows the closing message and stops
 * the game; there are no transitions out.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('end', {
  async onEnter(ctx) {
    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom(EVENTS.GAME_ENDED, {
      message: ctx.phase.message || 'Game over!',
      ...sc
    });
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    socket.emit(EVENTS.GAME_ENDED, {
      message: ctx.phase.message || 'Game over!',
      ...sc
    });
  }
});
