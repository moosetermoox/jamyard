import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('announce', {
  async onEnter(ctx) {
    let message = ctx.phase.message;
    if (message.includes('{{')) {
      message = ctx.resolveTemplate(message);
    }
    ctx.engine.storePhaseData(ctx.phase.id, { message });
    const sc = ctx.resolveScreenControl();

    ctx.emitToRoom(EVENTS.ANNOUNCE, { message, timer: ctx.phase.timer || null, ...sc });

    // Auto-advance after timer, or wait for host advance-phase
    if (ctx.phase.timer) {
      setTimeout(async () => {
        await ctx.advanceToNext();
      }, ctx.phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const announceData = ctx.engine.getPhaseData(ctx.phase.id);
    if (announceData) {
      const sc = ctx.resolveScreenControl();
      socket.emit(EVENTS.ANNOUNCE, { message: announceData.message, timer: null, ...sc });
    }
  }
});
