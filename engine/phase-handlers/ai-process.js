/**
 * Phase handler: ai-process — hand collected data to the AI for a task
 * (summarize / generate / compare / rank / judge) and store the result for
 * later phases to display or branch on. `perPlayer:true` generates one item
 * per student, addressable downstream via `{{thisPhase.mine}}`. This is the
 * "Script → LLM handoff" — scripts gather data, the AI gets a summary.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { fillPlayerNames } from '../ai-name-fill.js';
import { contentLog } from '../content-log.js';

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
      instruction = `${instruction}\n\nIMPORTANT: Generate exactly ${n} distinct items, one per player. Return a JSON array of ${n} strings, no preamble, no keys, just the array.`;
    }

    const expectJson = phase.format === 'json' || phase.perPlayer;

    // Call AI with one auto-retry when perPlayer/JSON output fails to parse
    // into an array. Smaller models (Haiku on `generate`) occasionally ignore
    // the JSON instruction and return plain text or a numbered list, which
    // used to surface as a cryptic "expected array but got string" error.
    // Second attempt prepends `[` to the assistant message and uses an even
    // stricter system nudge.
    let result;
    let attempts = 0;
    const maxAttempts = phase.perPlayer ? 2 : 1;
    while (attempts < maxAttempts) {
      attempts++;
      const stricter = attempts > 1
        ? `${instruction}\n\nYour previous response wasn't valid JSON. Reply with ONLY a JSON array like ["item1","item2","item3"], nothing else, no numbering, no preamble.`
        : instruction;
      // Instructions can embed resolved student content via {{tokens}}, and
      // the result is derived from it — both stay out of production logs.
      console.log(`[handlePhase] AI ${phase.task || 'process'} attempt ${attempts}/${maxAttempts} (${responses.length} response(s) in)`);
      contentLog(`[handlePhase] AI instruction: ${stricter}`);
      const aiResult = await ctx.aiService.process({
        instruction: stricter, responses,
        rosterNames: engine.players.list().map(p => p.name)
      });
      console.log(`[handlePhase] AI returned ${String(aiResult.text || '').length} chars`);
      contentLog(`[handlePhase] AI returned: ${aiResult.text}`);

      if (expectJson) {
        try {
          result = JSON.parse(aiResult.text);
        } catch {
          // AI may wrap JSON in preamble text — try to extract it
          const match = aiResult.text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
          if (match) {
            try { result = JSON.parse(match[0]); } catch { result = aiResult.text; }
          } else {
            result = aiResult.text;
          }
        }
      } else {
        result = aiResult.text;
      }

      // For perPlayer we need a non-empty array; otherwise accept whatever
      // we got (the existing fallback path).
      if (!phase.perPlayer) break;
      if (Array.isArray(result) && result.length > 0) break;
      // Otherwise loop and retry once
    }

    // Data minimization round-trip: names never went TO the model, so fill
    // real names into any per-player objects it returned (templates render
    // {{_current.playerName}} from these — see engine/ai-name-fill.js).
    if (expectJson && result && typeof result === 'object') {
      fillPlayerNames(result, (id) => {
        const p = engine.players.find(id);
        return p ? p.name : null;
      });
    }

    const dataToStore = { result };

    if (phase.perPlayer) {
      const arr = Array.isArray(result) ? result : [];
      const byPlayer = {};
      if (arr.length === 0) {
        // Teacher-facing message — gets surfaced in the PHASE_ERROR pause
        // dialog with Retry / Skip buttons. The cryptic shape ("expected
        // a JSON array but got string") was the previous message.
        throw new Error(
          `The AI didn't return a list of items for "${phase.id}". This can happen on the first try with simple "generate" tasks. Click Retry, it usually works the second time. If it keeps failing, simplify the instruction or split it into smaller phases.`
        );
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
