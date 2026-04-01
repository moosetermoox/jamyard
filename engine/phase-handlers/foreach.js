import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('foreach', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const shuffleArray = ctx.services.shuffleArray;
    let feData = engine.resolve(phase.data) || [];

    // AI injection: generate fake responses and mix them in
    if (phase.aiInject) {
      const realResponses = Array.isArray(feData) ? feData : [];
      const injectCount = phase.aiInject.count || 1;
      const injectInstruction = phase.aiInject.instruction || 'Generate fake responses that match the style of the real ones.';
      console.log(`[foreach] '${phase.id}' injecting ${injectCount} AI responses`);

      const fakes = await ctx.aiService.generateFakeResponses({
        instruction: injectInstruction,
        responses: realResponses,
        count: injectCount
      });

      // Mark real items
      feData = realResponses.map(item => ({ ...item, isAI: false, isHuman: true }));

      // Add AI items
      for (let i = 0; i < fakes.length; i++) {
        feData.push({
          playerId: `_ai_${i}`,
          name: 'AI',
          text: fakes[i].text || fakes[i],
          isAI: true,
          isHuman: false
        });
      }
    }

    const items = (phase.shuffle !== false ? shuffleArray(feData) : feData).map(item => {
      if (typeof item === 'object' && item !== null) {
        return { ...item, playerName: item.name || (engine.players.find(item.playerId) || {}).name || 'Unknown' };
      }
      return { text: item, playerName: 'Unknown' };
    });

    if (items.length === 0) {
      console.log(`[foreach] '${phase.id}' has 0 items — skipping to next`);
      if (phase.next) {
        await ctx.advanceTo(phase.next);
      }
      return;
    }

    // pairMode: "human-vs-ai" — pair each human item with an AI item for side-by-side comparison
    let finalItems;
    if (phase.pairMode === 'human-vs-ai') {
      const humans = items.filter(it => it.isHuman);
      const ais = items.filter(it => it.isAI);
      if (ais.length === 0) {
        console.log(`[foreach] '${phase.id}' pairMode=human-vs-ai but no AI items — skipping`);
        if (phase.next) {
          await ctx.advanceTo(phase.next);
        }
        return;
      }
      finalItems = humans.map((human, idx) => {
        const ai = ais[idx % ais.length];
        const aiIsA = Math.random() < 0.5;
        return {
          a: aiIsA ? ai : human,
          b: aiIsA ? human : ai,
          aiPosition: aiIsA ? 'Idea A' : 'Idea B',
          humanPosition: aiIsA ? 'Idea B' : 'Idea A',
          human,
          ai
        };
      });
      finalItems = phase.shuffle !== false ? shuffleArray(finalItems) : finalItems;
    } else {
      finalItems = items;
    }

    engine.foreachState[phase.id] = {
      items: finalItems,
      currentIndex: 0,
      scores: {}
    };

    console.log(`[foreach] '${phase.id}' starting with ${finalItems.length} items${phase.pairMode ? ` (pairMode: ${phase.pairMode})` : ''}`);

    const firstSubId = ctx.services.setupForeachIteration(engine, phase.id, phase, 0);
    engine.transition(firstSubId);
    await ctx.services.handlePhase(code, room);
  }
});

registerHandler('_foreach_advance', {
  async onEnter(ctx) {
    const fePhaseId = ctx.phase.foreachPhaseId;
    await ctx.services.advanceForeach(ctx.code, ctx.room, fePhaseId);
  }
});
