/**
 * Phase handler: ai-eliminate — the AI judges player answers against
 * teacher-written rules and removes the rule-breakers (e.g. "eliminate anyone
 * who wrote more than one sentence"). Feeds AIService a judge prompt, then
 * applies the eliminations to the PlayerRegistry.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('ai-eliminate', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    ctx.emitToRoom(EVENTS.PROCESSING_STARTED, { task: 'judge', ...sc });

    try {
      const input = engine.resolve(phase.input);
      const responses = Array.isArray(input) ? input : [];

      // Build AI prompt
      const playerList = responses.map(r =>
        `- ${r.playerId}: "${r.text || r.response || r.name}"`
      ).join('\n');

      const systemPrompt = `You are a game judge. Apply the rules strictly and return JSON only.
Return format: { "eliminate": [{"playerId":"...","reason":"..."}], "keep": [{"playerId":"...","reason":"..."}] }`;

      const userPrompt = `Rules: ${phase.instruction}

Player responses:
${playerList}

Apply the rules and return JSON indicating who to eliminate and who to keep.`;

      console.log(`[handlePhase] AI eliminate instruction: ${phase.instruction}`);
      console.log(`[handlePhase] AI eliminate input (${responses.length} responses): ${playerList}`);
      const aiResult = await ctx.aiService.process({
        instruction: userPrompt,
        responses: [],
        systemPrompt
      });
      console.log(`[handlePhase] AI eliminate returned: ${aiResult.text}`);

      // Parse AI response
      let parsed;
      try {
        parsed = JSON.parse(aiResult.text);
      } catch {
        const match = aiResult.text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            parsed = { eliminate: [], keep: [] };
          }
        } else {
          parsed = { eliminate: [], keep: [] };
        }
      }

      const eliminatedIds = [];
      const eliminatedNames = [];
      const reasons = {};

      if (parsed.eliminate && Array.isArray(parsed.eliminate)) {
        for (const entry of parsed.eliminate) {
          const pid = entry.playerId || entry.id;
          if (pid && engine.players.find(pid)) {
            engine.players.eliminate(pid);
            eliminatedIds.push(pid);
            const player = engine.players.find(pid);
            eliminatedNames.push(player ? player.name : pid);
            reasons[pid] = entry.reason || 'Rule violation';
          }
        }
      }

      const remaining = engine.players.getRemaining().length;

      // Build survivors list — input responses minus eliminated
      const eliminatedSet = new Set(eliminatedIds);
      const survivors = responses
        .filter(r => !eliminatedSet.has(r.playerId))
        .map(r => ({ playerId: r.playerId, name: r.name, text: r.text || r.response || '' }));

      engine.storePhaseData(phase.id, {
        eliminated: eliminatedIds,
        eliminatedNames,
        remaining,
        reasons,
        survivors
      });

      console.log(`[handlePhase] AI eliminated: ${eliminatedNames.join(', ')} (${remaining} remaining)`);

      const aiElimPause = phase.pause || 3;
      ctx.emitToRoom(EVENTS.ELIMINATION_RESULTS, {
        eliminated: eliminatedIds,
        eliminatedNames,
        remaining,
        reasons,
        pause: aiElimPause,
        ...sc
      });

      // Auto-advance after pause
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        setTimeout(async () => {
          if (ctx.isStale()) return;
          await ctx.advanceTo(nextId);
        }, aiElimPause * 1000);
      }
    } catch (error) {
      console.error(`[handlePhase] AI eliminate error: ${error.message}`);
      ctx.emitToRoom(EVENTS.ELIMINATION_RESULTS, {
        eliminated: [],
        eliminatedNames: [],
        remaining: engine.players.getRemaining().length,
        reasons: {},
        error: error.message
      });
    }
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    socket.emit(EVENTS.PROCESSING_STARTED, { task: 'judge', ...sc });
  }
});
