/**
 * Phase handler: reveal — display content to the class. With `scope:'pair'` it
 * instead shows each pair only its own two answers (`{{_pair.*}}`, Closer-style),
 * resolved per recipient; a Pass renders identically to a missing answer so it's
 * never attributable.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { buildPairViews, buildPairContent } from '../phases/pair-reveal.js';
import { buildChainViews, formatChainContent, buildChainRecords } from '../phases/chain-reveal.js';
import { continueLabelForPhase } from '../phases/continue-labels.js';
import { PER_PLAYER_TOKEN } from '../resolver-grammar.js';

// {{x.mine}} or {{x.assigned}}: each player gets their own resolved copy.
const PER_PLAYER_REF = PER_PLAYER_TOKEN;

// Default copy for pair-scoped reveals. The host screen is projected to the
// class, so it NEVER shows pair-private answers — only a neutral status line.
const PAIR_HOST_CONTENT = "Everyone is reading their pair's answers on their own screen.";
const PAIR_UNPAIRED_CONTENT = 'Sit tight, pairs are sharing this round.';

// Same discipline for return-to-author reveals: each chain is private to
// its author; the projector only narrates.
const OWN_HOST_CONTENT = 'Everyone is reading what became of the thing they started. Give it a minute, then ask who got the best surprise.';

// Chain views for a scope:"own" reveal: walk chainFrom's phase data
// (origin first) through the assignedFrom links the rotation stored.
function getChainViews(ctx) {
  const ids = Array.isArray(ctx.phase.chainFrom) ? ctx.phase.chainFrom : [];
  if (ids.length === 0) {
    throw new Error(`reveal "${ctx.phase.id}" has scope:"own" but no chainFrom, list the chain's collect steps in order`);
  }
  const chainDatas = ids.map(id => ctx.engine.phaseData[id] || {});
  return buildChainViews(chainDatas);
}

function ownContentFor(ctx, views, playerId) {
  return formatChainContent(views.get(playerId), {
    display: ctx.phase.chainDisplay, template: ctx.phase.chainTemplate,
    heading: ctx.phase.chainHeading, grewHeading: ctx.phase.chainGrewHeading
  });
}

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
    const continueLabel = continueLabelForPhase(phase, engine.config.phases, engine.language);

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

    if (phase.scope === 'own') {
      // Return-to-author: each player sees what became of THEIR item after
      // the rotation chain in chainFrom. Private per player, neutral host.
      const views = getChainViews(ctx);
      // Every finished chain is stored as a response row, keyed by its
      // starter: a later vote or gallery reads {{poem.responses}}, the
      // console lists them with Show, the report keeps them whole (an
      // outside reviewer's chains never reached the projector, 2026-09-25).
      const nameOf = (id) => { const p = engine.players.find(id); return p ? p.name : null; };
      const records = buildChainRecords(views, nameOf, {
        display: phase.chainDisplay, template: phase.chainTemplate
      });
      engine.storePhaseData(phase.id, records);
      ctx.emitToTeachers(EVENTS.TEACHER_CHAINS, {
        phaseId: phase.id,
        chains: records.responses.map(r => ({ playerId: r.playerId, name: r.name, text: r.text }))
      });
      // The projector line is neutral by default; a reveal may name its
      // own ("Everyone is reading the line a classmate wrote for them").
      const hostLine = (typeof phase.content === 'string' && phase.content.trim() !== '')
        ? phase.content.trim() : OWN_HOST_CONTENT;
      ctx.emitToHost(EVENTS.SHOW_RESULTS, {
        content: hostLine, aiResult: hostLine, responses: [], continueLabel, ...sc
      });
      for (const player of engine.players.list()) {
        const content = ownContentFor(ctx, views, player.id);
        ctx.emitToPlayer(player.id, EVENTS.SHOW_RESULTS, {
          // ownReveal: the student screen drops its generic "The Result:"
          // heading; the chain's own headings carry the moment.
          content, aiResult: content, responses: [], ownReveal: true, ...sc
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

    if (phase.scope === 'own') {
      const views = getChainViews(ctx);
      const player = engine.players.find(socket.id);
      const ownContent = player ? ownContentFor(ctx, views, player.id) : OWN_HOST_CONTENT;
      socket.emit(EVENTS.SHOW_RESULTS, {
        content: ownContent, aiResult: ownContent, ownReveal: !!player, ...sc
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
