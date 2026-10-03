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
import { varietySpin } from '../phases/variety-spin.js';
import { inputIsEmpty, asksForInput, NO_ANSWERS_LINE } from '../phases/ai-empty-input.js';
import { translate } from '../i18n/index.js';

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
    // `inputFields`: the AI reads only these boxes of a multi-field answer.
    // Two Truths' summary read "truth | truth | lie" with an instruction to
    // ignore the last part, and one run presented the lie as a fact (a
    // reviewer, 2026-09-29). Rebuilding the text from the named keys makes
    // the prompt honest by construction.
    if (Array.isArray(phase.inputFields) && phase.inputFields.length) {
      responses = responses.map(r => {
        if (!r || typeof r !== 'object' || !r.fields || typeof r.fields !== 'object') return r;
        const kept = phase.inputFields.map(k => r.fields[k]).filter(v => typeof v === 'string' && v.trim());
        return { ...r, text: kept.join(' | ') };
      }).filter(r => !(r && typeof r === 'object' && 'fields' in r && !r.text));
    }

    // Generate tasks synthesize content from a byte-identical instruction
    // every session, and identical requests make the model converge on its
    // favorite answers (Trivia Bluff served the same "obscure" facts every
    // preview). A per-call variety spin breaks the convergence; tasks that
    // transform student input (summarize/compare/judge) vary naturally and
    // don't need it.
    if (phase.task === 'generate') {
      instruction = `${instruction}${varietySpin()}`;
    }

    // perPlayer mode: ask AI to generate one item per eligible player and map them
    let perPlayerEligible = null;
    if (phase.perPlayer) {
      perPlayerEligible = ctx.getEligibleVoters(phase.from || 'all');
      const n = perPlayerEligible.length;
      instruction = `${instruction}\n\nIMPORTANT: Generate exactly ${n} distinct items, one per player. Return a JSON array of ${n} strings, no preamble, no keys, just the array.`;
    }

    const expectJson = phase.format === 'json' || phase.perPlayer;

    // Nothing came in to read: never ask the model about nothing (its
    // "paste the list" reply went up on the projector). A prose step
    // stores a plain line in the room's language and moves on.
    const noAnswers = translate(engine.language, NO_ANSWERS_LINE);
    if (!expectJson && inputIsEmpty(phase, input)) {
      console.log(`[handlePhase] AI ${phase.task || 'process'} skipped: no answers came in for '${phase.id}'`);
      engine.storePhaseData(phase.id, { result: noAnswers, summedUp: { total: 0, leftOut: 0 } });
      await ctx.advanceToNext();
      return;
    }

    // Call AI with one auto-retry when perPlayer/JSON output fails to parse
    // into an array. Smaller models (Haiku on `generate`) occasionally ignore
    // the JSON instruction and return plain text or a numbered list, which
    // used to surface as a cryptic "expected array but got string" error.
    // Second attempt prepends `[` to the assistant message and uses an even
    // stricter system nudge.
    let result;
    let attempts = 0;
    let lastCount = null;
    // JSON output gets one retry too: a fact step that came back as prose
    // put {{fact2.result.question}} on the projector (a reviewer, 2026-09-26)
    const maxAttempts = (phase.perPlayer || expectJson) ? 2 : 1;
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
        rosterNames: engine.players.list().map(p => p.name),
        // The room's language, so the summary a Spanish class reads is
        // Spanish even when the answers were not (pretend students, a
        // bilingual class; the owner's re-check 2026-10-03)
        language: engine.language,
        // A prose step over answers counts what it left out; a JSON step
        // cannot carry the trailing line
        countSkipped: !expectJson && responses.length > 0,
        // The mock answers a JSON step with a JSON list, so a robot
        // playtest of a format: json step gets past it (2026-10-02)
        expectJson
      });
      lastCount = { total: responses.length, leftOut: Number(aiResult.leftOut) || 0 };
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
        // A reply that asks for the answers instead of reading them
        // never reaches the projector
        if (asksForInput(result)) {
          console.warn(`[handlePhase] AI reply for '${phase.id}' asked for its input; showing the no-answers line`);
          result = noAnswers;
        }
      }

      // For perPlayer we need a non-empty array; for any JSON step an
      // object or array (a string means the parse failed). Otherwise loop
      // and retry once.
      if (!phase.perPlayer && !expectJson) break;
      if (phase.perPlayer && Array.isArray(result) && result.length > 0) break;
      if (!phase.perPlayer && expectJson && result && typeof result === 'object') break;
    }
    // Still not the shape the step promised: stop here with a clear error
    // (the room pauses and the teacher can try again) rather than store
    // prose the next screens would show as raw {{tokens}}
    if (expectJson && !(result && typeof result === 'object')) {
      throw new Error("The AI's answer for this step did not come back in a usable shape. Press Try again.");
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

    // The teacher hears how many answers went in and how many were left
    // out (a trick answer vanished without a word, a reviewer 2026-09-26):
    // counts only, on the console and in the report, never on the projector
    if (lastCount && lastCount.total > 0 && !phase.perPlayer) {
      dataToStore.summedUp = lastCount;
      if (typeof ctx.emitToTeachers === 'function') {
        ctx.emitToTeachers(EVENTS.TEACHER_AI_NOTE, { phaseId: phase.id, task: phase.task || 'process', total: lastCount.total, leftOut: lastCount.leftOut });
      }
    }

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
