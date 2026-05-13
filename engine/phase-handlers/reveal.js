import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

const PER_PLAYER_REF = /\{\{\s*[a-zA-Z0-9_-]+\.mine\s*\}\}/;

registerHandler('reveal', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    const tpl = phase.template || '';
    const isPerPlayer = !!phase.template && PER_PLAYER_REF.test(tpl);

    // Generic content for host (and fallback when no template)
    let content = phase.template ? ctx.resolveTemplate(tpl) : '';
    let aiResult = content;
    let responses = [];

    if (!phase.template) {
      // Backward compat: scan most recent ai-process / collect when no template
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'ai-process') {
          const data = engine.getPhaseData(id);
          if (data && data.result) {
            aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
          }
        }
      }
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'collect') {
          const data = engine.getPhaseData(id);
          if (data && data.responses) {
            responses = data.responses.map(r => ({ name: r.name, response: r.text }));
          }
        }
      }
    }

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId);

    if (isPerPlayer) {
      ctx.emitToHost(EVENTS.SHOW_RESULTS, { content, aiResult: content, responses, image, ...sc });
      for (const player of engine.players.list()) {
        const playerContent = ctx.services.resolvePerPlayerTemplate(tpl, engine, player.id);
        ctx.emitToPlayer(player.id, EVENTS.SHOW_RESULTS, {
          content: playerContent, aiResult: playerContent, responses, image, ...sc
        });
      }
    } else {
      ctx.emitToRoom(EVENTS.SHOW_RESULTS, { content, aiResult, responses, image, ...sc });
    }
  },

  onReconnect(ctx, socket) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    const tpl = phase.template || '';
    const isPerPlayer = !!phase.template && PER_PLAYER_REF.test(tpl);

    let content = '';
    if (phase.template) {
      if (isPerPlayer) {
        const player = engine.players.find(socket.id);
        content = player
          ? ctx.services.resolvePerPlayerTemplate(tpl, engine, player.id)
          : ctx.resolveTemplate(tpl);
      } else {
        content = ctx.resolveTemplate(tpl);
      }
    }
    let aiResult = content;
    if (!phase.template) {
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'ai-process') {
          const data = engine.getPhaseData(id);
          if (data && data.result) {
            aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
          }
        }
      }
    }
    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId);
    socket.emit(EVENTS.SHOW_RESULTS, { content, aiResult, image, ...sc });
  }
});
