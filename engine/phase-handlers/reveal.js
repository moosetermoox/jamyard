import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('reveal', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;

    let content = '';
    if (phase.template) {
      content = ctx.resolveTemplate(phase.template);
    }

    let aiResult = content;
    let responses = [];

    // Only scan for backward compat when no template is provided
    if (!phase.template) {
      // Find most recent AI result
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'ai-process') {
          const data = engine.getPhaseData(id);
          if (data && data.result) {
            aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
          }
        }
      }

      // Find most recent responses
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'collect') {
          const data = engine.getPhaseData(id);
          if (data && data.responses) {
            responses = data.responses.map(r => ({ name: r.name, response: r.text }));
          }
        }
      }
    }

    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom(EVENTS.SHOW_RESULTS, { content, aiResult, responses, ...sc });
  },

  onReconnect(ctx, socket) {
    const { phase, engine } = ctx;

    let content = '';
    if (phase.template) {
      content = ctx.resolveTemplate(phase.template);
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
    const sc = ctx.resolveScreenControl();
    socket.emit(EVENTS.SHOW_RESULTS, { content, aiResult, ...sc });
  }
});
