/**
 * Phase handler: announce — show a message to everyone (round intros,
 * instructions, transitions). Optional image/video/timer. Auto-advances when
 * the timer expires, otherwise waits for the host to continue. If the message
 * contains a per-recipient `{{x.mine}}` token, each player gets their own
 * resolved copy while the host sees the generic version.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { continueLabelForPhase } from '../phases/continue-labels.js';
import { resolveDisplayDrawing } from '../phases/display-drawing.js';

const PER_PLAYER_REF = /\{\{\s*[a-zA-Z0-9_-]+\.mine\s*\}\}/;

registerHandler('announce', {
  async onEnter(ctx) {
    const rawMessage = ctx.phase.message || '';
    const sc = ctx.resolveScreenControl();
    const timer = ctx.phase.timer || null;
    const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
    const displayDrawing = resolveDisplayDrawing(ctx.phase, ctx.engine);
    // The host button says what happens next ("Start the voting"), not "Continue".
    const continueLabel = continueLabelForPhase(ctx.phase, ctx.engine.config.phases);

    if (PER_PLAYER_REF.test(rawMessage)) {
      // Per-recipient: host gets the generic resolved version, each player gets their own
      const hostMessage = ctx.resolveTemplate(rawMessage);
      ctx.engine.storePhaseData(ctx.phase.id, { message: hostMessage });
      ctx.emitToHost(EVENTS.ANNOUNCE, { message: hostMessage, image, video, displayDrawing, timer, continueLabel, ...sc });
      for (const player of ctx.engine.players.list()) {
        const msg = ctx.services.resolvePerPlayerTemplate(rawMessage, ctx.engine, player.id);
        ctx.emitToPlayer(player.id, EVENTS.ANNOUNCE, { message: msg, image, video, displayDrawing, timer, ...sc });
      }
    } else {
      const message = rawMessage.includes('{{') ? ctx.resolveTemplate(rawMessage) : rawMessage;
      ctx.engine.storePhaseData(ctx.phase.id, { message });
      ctx.emitToRoom(EVENTS.ANNOUNCE, { message, image, video, displayDrawing, timer, continueLabel, ...sc });
    }

    // Auto-advance after timer, or wait for host advance-phase
    if (ctx.phase.timer) {
      setTimeout(async () => {
        if (ctx.isStale()) return; // host already advanced (Skip / manual continue)
        await ctx.advanceToNext();
      }, ctx.phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const announceData = ctx.engine.getPhaseData(ctx.phase.id);
    const rawMessage = ctx.phase.message || '';
    const sc = ctx.resolveScreenControl();
    const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
    const displayDrawing = resolveDisplayDrawing(ctx.phase, ctx.engine);
    const continueLabel = continueLabelForPhase(ctx.phase, ctx.engine.config.phases);
    if (PER_PLAYER_REF.test(rawMessage)) {
      const player = ctx.engine.players.find(socket.id);
      const msg = player
        ? ctx.services.resolvePerPlayerTemplate(rawMessage, ctx.engine, player.id)
        : ctx.resolveTemplate(rawMessage);
      socket.emit(EVENTS.ANNOUNCE, { message: msg, image, video, displayDrawing, timer: null, continueLabel, ...sc });
    } else if (announceData) {
      socket.emit(EVENTS.ANNOUNCE, { message: announceData.message, image, video, displayDrawing, timer: null, continueLabel, ...sc });
    }
  }
});
