import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('preview', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;

    let content = '';
    if (phase.template) {
      content = ctx.resolveTemplate(phase.template);
    } else if (phase.content) {
      const resolved = engine.resolve(phase.content);
      content = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    }

    // Gather responses if showResponses !== false
    let responses = [];
    if (phase.showResponses !== false) {
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'collect') {
          const data = engine.getPhaseData(id);
          if (data && data.responses) {
            responses = data.responses.map(r => ({ name: r.name, response: r.text }));
          }
        }
      }
    }

    engine.storePhaseData(phase.id, { content, responses });
    const sc = ctx.resolveScreenControl();

    // Send preview to host only
    ctx.emitToHost(EVENTS.PREVIEW_CONTENT, {
      content,
      responses,
      phaseId: phase.id,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Tell players to wait
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for teacher...' });
    }
  },

  async onHostEvent(ctx, event, socket, payload) {
    const { engine, room, code } = ctx;
    const currentPhase = engine.getCurrentPhase();

    if (event === EVENTS.PREVIEW_APPROVE) {
      console.log(`[preview-approve] Host approved preview in room ${code}`);
      if (currentPhase.approveNext) {
        await ctx.advanceTo(currentPhase.approveNext);
      }
    } else if (event === EVENTS.PREVIEW_REJECT) {
      console.log(`[preview-reject] Host rejected preview in room ${code}`);
      if (currentPhase.rejectNext) {
        await ctx.advanceTo(currentPhase.rejectNext);
      }
    } else if (event === EVENTS.PREVIEW_EDIT) {
      console.log(`[preview-edit] Host edited preview content in room ${code}`);
      const existingData = engine.getPhaseData(currentPhase.id) || {};
      engine.storePhaseData(currentPhase.id, { ...existingData, content: payload.content });
      if (currentPhase.approveNext) {
        await ctx.advanceTo(currentPhase.approveNext);
      }
    }
  },

  onReconnect(ctx, socket) {
    socket.emit(EVENTS.WAITING, { message: 'Waiting for teacher...' });
  }
});
