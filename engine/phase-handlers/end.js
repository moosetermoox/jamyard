import { registerHandler } from './phase-registry.js';

registerHandler('end', {
  async onEnter(ctx) {
    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom('game-ended', {
      message: ctx.phase.message || 'Game over!',
      ...sc
    });
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    socket.emit('game-ended', {
      message: ctx.phase.message || 'Game over!',
      ...sc
    });
  }
});
