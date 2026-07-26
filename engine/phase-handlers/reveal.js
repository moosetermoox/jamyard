/**
 * Phase handler: reveal — display content to the class. With `scope:'pair'` it
 * instead shows each pair only its own two answers (`{{_pair.*}}`, Closer-style),
 * resolved per recipient; a Pass renders identically to a missing answer so it's
 * never attributable.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { buildPairViews, buildPairContent } from '../phases/pair-reveal.js';
import { continueLabelForPhase } from '../phases/continue-labels.js';

const PER_PLAYER_REF = /\{\{\s*[a-zA-Z0-9_-]+\.mine\s*\}\}/;

// Default copy for pair-scoped reveals. The host screen is projected to the
// class, so it NEVER shows pair-private answers — only a neutral status line.
const PAIR_HOST_CONTENT = "Everyone is reading their pair's answers on their own screen.";
const PAIR_UNPAIRED_CONTENT = 'Sit tight — pairs are sharing this round.';

// Build the per-pair views for a scope:"pair" reveal, or throw a clear error
// if the upstream pairwise collect hasn't produced pairing data. Surfacing
// this loudly (paused-error recovery) beats a silent blank screen.
function getPairViews(ctx) {
  const { phase, engine } = ctx;
  const sourceData = engine.phaseData[phase.pairsFrom];
  if (!sourceData || !Array.isArray(sourceData.pairs) || sourceData.pairs.length === 0) {
    throw new Error(
      `Pair reveal "${phase.id}" needs pairing data from "${phase.pairsFrom}" ` +
      `(a collect step with assign:"pairwise"), but none was found.`
    );
  }
  return buildPairViews(sourceData, engine.players.list());
}

// Content for one viewer in a pair reveal. Normal {{refs}} resolve first
// ({{_pair.*}} stays literal because the engine resolver returns undefined
// for pairScope refs); pair values are swapped in last so student-written
// text never runs through the resolver.
function pairContentFor(ctx, views, playerId) {
  const view = views.get(playerId);
  if (!view) return PAIR_UNPAIRED_CONTENT;
  const resolvedTpl = ctx.phase.template ? ctx.resolveTemplate(ctx.phase.template) : null;
  return buildPairContent(resolvedTpl, view);
}

registerHandler('reveal', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    const tpl = phase.template || '';
    const isPerPlayer = !!phase.template && PER_PLAYER_REF.test(tpl);
    // Host continue button says what happens next, not "Continue".
    const continueLabel = continueLabelForPhase(phase, engine.config.phases);

    if (phase.scope === 'pair') {
      const views = getPairViews(ctx);
      const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
      const video = ctx.services.resolveVideoEmbed(phase.video);
      ctx.emitToHost(EVENTS.SHOW_RESULTS, {
        content: PAIR_HOST_CONTENT, aiResult: PAIR_HOST_CONTENT, responses: [], image, video, continueLabel, ...sc
      });
      for (const player of engine.players.list()) {
        const content = pairContentFor(ctx, views, player.id);
        ctx.emitToPlayer(player.id, EVENTS.SHOW_RESULTS, {
          content, aiResult: content, responses: [], image, video, ...sc
        });
      }
      return;
    }

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

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(phase.video);

    if (isPerPlayer) {
      ctx.emitToHost(EVENTS.SHOW_RESULTS, { content, aiResult: content, responses, image, video, continueLabel, ...sc });
      for (const player of engine.players.list()) {
        const playerContent = ctx.services.resolvePerPlayerTemplate(tpl, engine, player.id);
        ctx.emitToPlayer(player.id, EVENTS.SHOW_RESULTS, {
          content: playerContent, aiResult: playerContent, responses, image, video, ...sc
        });
      }
    } else {
      ctx.emitToRoom(EVENTS.SHOW_RESULTS, { content, aiResult, responses, image, video, continueLabel, ...sc });
    }
  },

  onReconnect(ctx, socket) {
    const { phase, engine } = ctx;
    const sc = ctx.resolveScreenControl();
    const tpl = phase.template || '';
    const isPerPlayer = !!phase.template && PER_PLAYER_REF.test(tpl);

    if (phase.scope === 'pair') {
      const views = getPairViews(ctx);
      const player = engine.players.find(socket.id);
      const pairContent = player ? pairContentFor(ctx, views, player.id) : PAIR_UNPAIRED_CONTENT;
      const pairImage = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
      const pairVideo = ctx.services.resolveVideoEmbed(phase.video);
      socket.emit(EVENTS.SHOW_RESULTS, {
        content: pairContent, aiResult: pairContent, image: pairImage, video: pairVideo, ...sc
      });
      return;
    }

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
    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(phase.video);
    socket.emit(EVENTS.SHOW_RESULTS, { content, aiResult, image, video, ...sc });
  }
});
