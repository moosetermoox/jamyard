import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('ai-process', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom(EVENTS.PROCESSING_STARTED, { task: phase.task, ...sc });

    const input = phase.input ? engine.resolve(phase.input) : undefined;
    let instruction = phase.instruction;
    let responses;
    if (Array.isArray(input)) {
      responses = input;
    } else if (input != null) {
      responses = [{ text: String(input) }];
    } else {
      responses = [];
    }

    // perPlayer mode: ask AI to generate one item per eligible player and map them
    let perPlayerEligible = null;
    if (phase.perPlayer) {
      perPlayerEligible = ctx.getEligibleVoters(phase.from || 'all');
      const n = perPlayerEligible.length;
      instruction = `${instruction}\n\nIMPORTANT: Generate exactly ${n} distinct items, one per player. Return a JSON array of ${n} strings — no preamble, no keys, just the array.`;
    }

    console.log(`[handlePhase] AI instruction: ${instruction}`);
    const aiResult = await ctx.aiService.process({ instruction, responses });
    console.log(`[handlePhase] AI returned: ${aiResult.text}`);

    let result;
    const expectJson = phase.format === 'json' || phase.perPlayer;
    if (expectJson) {
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

    const dataToStore = { result };

    if (phase.perPlayer) {
      const arr = Array.isArray(result) ? result : [];
      const byPlayer = {};
      if (arr.length === 0) {
        throw new Error(`ai-process "${phase.id}" with perPlayer: true expected a JSON array but got ${typeof result}.`);
      }
      for (let i = 0; i < perPlayerEligible.length; i++) {
        byPlayer[perPlayerEligible[i].id] = arr[i % arr.length];
      }
      dataToStore.byPlayer = byPlayer;
    }

    engine.storePhaseData(phase.id, dataToStore);

    // Auto-advance to next phase
    await ctx.advanceToNext();
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    socket.emit(EVENTS.PROCESSING_STARTED, { task: ctx.phase.task, ...sc });
  }
});
