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
import { sampleItems } from '../phases/sampling.js';
import { isRolling, moreInputAhead, doneMessageFor } from '../phases/rolling.js';
import { translate } from '../i18n/index.js';
import { audienceLine } from '../phases/audience-line.js';
import { resolveDisplayDrawing } from '../phases/display-drawing.js';
import { withoutSitOut, sitOutMessage } from '../phases/sit-out.js';

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
  // Literal entries (the injected truth, the house lie) are tracked so a
  // `poolLimit` sample can never drop them — only `from` entries get sampled.
  const literalKeys = new Set();
  if (Array.isArray(phase.choicePool)) {
    for (const src of phase.choicePool) {
      if (!src) continue;
      if (typeof src.literal === 'string') {
        // Resolve {{...}} in the literal via the standard template resolver
        const value = String(ctx.resolveTemplate ? ctx.resolveTemplate(src.literal) : src.literal).trim();
        if (value && !/^\{\{.*\}\}$/.test(value)) { raw.push(value); literalKeys.add(value.toLowerCase()); }
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
  out._literalKeys = literalKeys;
  return out;
}

/**
 * poolLimit: cap a player's ballot at a readable size. 25 students' fakes +
 * the truth is an unreadable wall on a Chromebook with a timer running —
 * sample the `from` entries down, but ALWAYS keep literals (the truth, the
 * house lie). Ballots are already per-player (excludeAuthored), so a
 * per-player sample just extends that.
 */
function capBallot(list, poolLimit, literalKeys) {
  if (!Number.isInteger(poolLimit) || poolLimit < 2 || list.length <= poolLimit) return list;
  const keys = literalKeys || new Set();
  const literals = list.filter(c => keys.has(c.toLowerCase()));
  const rest = list.filter(c => !keys.has(c.toLowerCase()));
  const room = poolLimit - literals.length;
  if (room <= 0) return literals; // sampleItems treats <1 as "no cap" — guard here
  return literals.concat(sampleItems(rest, room));
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

/**
 * ONE ballot for the whole room. The poolLimit sample and the shuffle
 * happen once per phase, not once per student, so everyone sees the same
 * options in the same order (students compare screens; per-player shuffles
 * read as "we got different questions", Trivia Bluff field report
 * 2026-09-04). A student's own fake is removed from THEIR copy only
 * (`ballotFor`), which keeps the shared order intact. The ballot is kept
 * on room.phaseState so a reconnecting student gets the same one.
 */
export function buildSharedBallot(baseChoices, phase) {
  const capped = capBallot(baseChoices, phase.poolLimit, baseChoices._literalKeys);
  const wantShuffle = !!phase.shuffle || Array.isArray(phase.choicePool);
  return wantShuffle ? shuffled(capped) : [...capped];
}

export function ballotFor(ballot, playerId, authorMap) {
  if (!authorMap || !authorMap[playerId]) return ballot;
  const own = authorMap[playerId];
  return ballot.filter(c => c.toLowerCase() !== own);
}

registerHandler('collect-choice', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();
    // Rolling start: no shared countdown (see collect.js).
    const timer = isRolling(engine.config) ? null : (phase.timer || null);

    // Foreach sit-out: the round's author and source never vote
    // (engine/phases/sit-out.js): they know the answer.

    // Build the choice pool. choicePool/choices are unified through one helper.
    const baseChoices = buildChoicePool(phase, ctx);
    const authorMap = buildAuthorMap(phase, engine);
    // The room's one ballot (sampled + shuffled once, see buildSharedBallot).
    const ballot = buildSharedBallot(baseChoices, phase);

    // Choices sent to host: the same ballot, same order, as the students.
    const hostChoices = ballot;

    // Clear previous responses (and any prior timing)
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined, responseAt: undefined });
    }

    // Record phase-start timestamp on the room's phaseState so the
    // submit-response handler can compute per-player elapsed time when
    // this is a graded (speed-bonus) question. The ballot rides along so
    // a reconnect hands back the same options in the same order.
    ctx.room.phaseState = ctx.room.phaseState || {};
    ctx.room.phaseState.phaseStartAt = Date.now();
    ctx.room.phaseState.ballot = ballot;

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(phase.video);
    const displayDrawing = resolveDisplayDrawing(phase, engine);

    // Send to host (resolve refs once for host view). count/total seed the
    // progress counter — mirrors the submit handler's eligibility math
    // (author self-exclusion) so the projector never reads "0 of 0".
    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');
    const countTotal = withoutSitOut(eligible, phase).length;
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt,
      choices: hostChoices,
      image,
      video,
      displayDrawing,
      timer,
      isChoice: true,
      // Live Poll: the projector draws the tally as answers land
      liveResults: !!phase.liveResults,
      count: 0, total: countTotal,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Per-player choices: the shared ballot minus their own authored entry.
    function choicesFor(playerId) {
      return ballotFor(ballot, playerId, authorMap);
    }

    // Send to eligible players (the round's author and source sit out)
    for (const player of eligible) {
      const sitOut = sitOutMessage(phase, player.id);
      if (sitOut) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: sitOut });
        continue;
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices: choicesFor(player.id),
        image,
        video,
        displayDrawing,
        timer: phase.timer || null,
        isChoice: true,
        phaseId: phase.id,
        ...audienceLine(engine.config, phase.id, engine.language),
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
    // A reconnecting sitter-out gets their waiting screen back, not a ballot
    const sitOut = choicePlayer ? sitOutMessage(ctx.phase, choicePlayer.id) : null;
    if (sitOut) {
      socket.emit(EVENTS.WAITING, { message: sitOut });
    } else if (choicePlayer && choicePlayer.response) {
      if (isRolling(ctx.engine.config) && !moreInputAhead(ctx.engine.config, ctx.phase.id)) {
        socket.emit(EVENTS.PLAYER_DONE, { message: translate(ctx.engine.language, doneMessageFor(ctx.phase)) });
      } else {
        socket.emit(EVENTS.WAITING, { message: translate(ctx.engine.language, "You're done for now. Look up at the class screen.") });
      }
    } else {
      // The room's shared ballot (same options, same order as everyone
      // else). A room restored from a snapshot without one rebuilds it.
      const stored = ctx.room && ctx.room.phaseState && Array.isArray(ctx.room.phaseState.ballot)
        ? ctx.room.phaseState.ballot : null;
      const ballot = stored || buildSharedBallot(buildChoicePool(ctx.phase, ctx), ctx.phase);
      const authorMap = buildAuthorMap(ctx.phase, ctx.engine);
      const choices = ballotFor(ballot, socket.id, authorMap);
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, socket.id);
      const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
      const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices,
        image,
        video,
        displayDrawing: resolveDisplayDrawing(ctx.phase, ctx.engine),
        timer: null,
        isChoice: true,
        phaseId: ctx.phase.id,
        ...audienceLine(ctx.engine.config, ctx.phase.id, ctx.engine.language),
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
