/**
 * Phase handler: collect-choice — players pick from a fixed set of options.
 *
 * Powers polls and quizzes. Supports Kahoot-style speed scoring
 * (`correctAnswer` + `speedBonus`, graded at close) and bluffing pools
 * (`choicePool` injects the real answer among decoys, `excludeAuthored` keeps
 * authors from picking their own). Stores both the chosen option and its text
 * so AI/templates can read either.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

/**
 * Resolve the base choice array for a collect-choice phase.
 *
 * Two shapes are supported:
 *   - `choices`: a literal array, or a data-ref string that resolves to an array.
 *   - `choicePool`: an array of source descriptors that get concatenated. Each
 *     source is one of:
 *       { from: "<phase>.<field>", field?: "text" } — pull from a phase data array
 *       { literal: "{{phase.field}}" or "fixed string" } — single literal entry
 *       { optional: true } on either marks it skippable when the value is empty.
 *
 * Returns a deduped (case-insensitive trim) array of strings. The order is the
 * source order; shuffling is applied per-recipient downstream so each player
 * sees a different randomization.
 *
 * `authoredByPlayer` is an optional map of playerId -> their authored entry,
 * used downstream by `excludeAuthored` to hide a player's own contribution.
 */
function buildChoicePool(phase, ctx) {
  const engine = ctx.engine;
  let raw = [];
  if (Array.isArray(phase.choicePool)) {
    for (const src of phase.choicePool) {
      if (!src) continue;
      if (typeof src.literal === 'string') {
        // Resolve {{...}} in the literal via the standard template resolver
        const value = String(ctx.resolveTemplate ? ctx.resolveTemplate(src.literal) : src.literal).trim();
        if (value && !/^\{\{.*\}\}$/.test(value)) raw.push(value);
        else if (!src.optional) console.warn(`[collect-choice:${phase.id}] literal "${src.literal}" resolved to nothing`);
      } else if (typeof src.from === 'string') {
        // Walk the data ref to the array, then optionally pluck `field`
        const arr = engine.resolve(src.from);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (typeof item === 'string') raw.push(item);
            else if (item && typeof item === 'object') {
              const text = src.field ? item[src.field] : (item.text != null ? item.text : item.choice);
              if (text != null) raw.push(String(text));
            }
          }
        } else if (!src.optional) {
          console.warn(`[collect-choice:${phase.id}] choicePool source "${src.from}" did not resolve to an array`);
        }
      }
    }
  } else if (typeof phase.choices === 'string') {
    const resolved = engine.resolve(phase.choices);
    if (Array.isArray(resolved)) raw = resolved.map(c => (typeof c === 'string' ? c : (c && (c.text || c.choice || c.playerId)) || ''));
  } else if (Array.isArray(phase.choices)) {
    raw = phase.choices.map(c => (typeof c === 'string' ? c : String(c)));
  }

  // Dedupe (case-insensitive trim), preserving first occurrence's casing
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const trimmed = String(c).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * For `excludeAuthored: "<phaseId>"`, build a map of playerId -> their authored
 * choice text (lowercased for case-insensitive removal). The source phase
 * must store `responses: [{playerId, text}, ...]` (standard collect output).
 */
function buildAuthorMap(phase, engine) {
  if (!phase.excludeAuthored) return null;
  const src = engine.phaseData[phase.excludeAuthored];
  if (!src || !Array.isArray(src.responses)) return null;
  const map = {};
  for (const r of src.responses) {
    if (r && r.playerId && r.text != null) map[r.playerId] = String(r.text).trim().toLowerCase();
  }
  return map;
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

registerHandler('collect-choice', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();

    // Self-exclusion: if inside foreach and author is set, exclude them
    const authorId = phase._foreachAuthorId || null;

    // Build the choice pool. choicePool/choices are unified through one helper.
    const baseChoices = buildChoicePool(phase, ctx);
    const authorMap = buildAuthorMap(phase, engine);
    const wantShuffle = !!phase.shuffle || Array.isArray(phase.choicePool);

    // Choices sent to host: full pool (host sees everything, deterministic order)
    const hostChoices = baseChoices;

    // Clear previous responses (and any prior timing)
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined, responseAt: undefined });
    }

    // Record phase-start timestamp on the room's phaseState so the
    // submit-response handler can compute per-player elapsed time when
    // this is a graded (speed-bonus) question.
    ctx.room.phaseState = ctx.room.phaseState || {};
    ctx.room.phaseState.phaseStartAt = Date.now();

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(phase.video);

    // Send to host (resolve refs once for host view)
    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt,
      choices: hostChoices,
      image,
      video,
      timer: phase.timer || null,
      isChoice: true,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Per-player choices: filter out their authored entry, then shuffle if requested.
    function choicesFor(playerId) {
      let list = baseChoices;
      if (authorMap && authorMap[playerId]) {
        const own = authorMap[playerId];
        list = list.filter(c => c.toLowerCase() !== own);
      }
      return wantShuffle ? shuffled(list) : list;
    }

    // Send to eligible players (excluding author if self-exclude)
    for (const player of eligible) {
      if (authorId && player.id === authorId) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'This one is yours! Waiting for others to guess...' });
        continue;
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices: choicesFor(player.id),
        image,
        video,
        timer: phase.timer || null,
        isChoice: true,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }

    // Send waiting to non-eligible players
    for (const player of engine.players.list()) {
      if (!eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for other players...' });
      }
    }
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    const choicePlayer = ctx.engine.players.find(socket.id);
    if (choicePlayer && choicePlayer.response) {
      socket.emit(EVENTS.WAITING, { message: 'Answer submitted. Waiting for others...' });
    } else {
      const baseChoices = buildChoicePool(ctx.phase, ctx);
      const authorMap = buildAuthorMap(ctx.phase, ctx.engine);
      let choices = baseChoices;
      if (authorMap && authorMap[socket.id]) {
        const own = authorMap[socket.id];
        choices = choices.filter(c => c.toLowerCase() !== own);
      }
      // Re-shuffle on reconnect so the order is stable enough — same player same order
      // would be nice, but for first pass a fresh shuffle is acceptable.
      if (ctx.phase.shuffle || Array.isArray(ctx.phase.choicePool)) choices = shuffled(choices);
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, socket.id);
      const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
      const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices,
        image,
        video,
        timer: null,
        isChoice: true,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
