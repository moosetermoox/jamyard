import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('ai-process', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom(EVENTS.PROCESSING_STARTED, { task: phase.task, ...sc });

    const input = phase.input ? engine.resolve(phase.input) : undefined;
    const instruction = phase.instruction;
    const responses = Array.isArray(input) ? input : [];

    console.log(`[handlePhase] AI instruction: ${instruction}`);
    const aiResult = await ctx.aiService.process({ instruction, responses });
    console.log(`[handlePhase] AI returned: ${aiResult.text}`);

    let result;
    if (phase.format === 'json') {
      try {
        result = JSON.parse(aiResult.text);
      } catch {
        // AI may wrap JSON in preamble text — try to extract it
        const match = aiResult.text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (match) {
          try {
            result = JSON.parse(match[0]);
          } catch {
            result = aiResult.text;
          }
        } else {
          result = aiResult.text;
        }
      }
    } else {
      result = aiResult.text;
    }

    engine.storePhaseData(phase.id, { result });

    // Auto-advance to next phase
    await ctx.advanceToNext();
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    socket.emit(EVENTS.PROCESSING_STARTED, { task: ctx.phase.task, ...sc });
  }
});
