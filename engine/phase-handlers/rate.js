import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

/**
 * Rate phase — class rates a target (a presentation, an idea, a pitch
 * the teacher describes verbally) on one or more custom scales.
 *
 * Config:
 *   prompt       — optional instructions shown to raters
 *   scales       — array of { id, label, min?=1, max?=5, labels?={min: "...", max: "..."} }
 *   visibility   — "all" (default) shows results to everyone; "host-only"
 *                  shows results only on the teacher screen
 *   from         — who rates (all|remaining|eliminated, default 'all')
 *   timer        — optional seconds; auto-closes on expiry
 *
 * Output (engine.phaseData[id]):
 *   averages       — { scaleId: number }  (mean rounded to 2 dp)
 *   distributions  — { scaleId: { value: count, ... } }
 *   byPlayer       — { playerId: { scaleId: number } }
 *   byScale        — { scaleId: number[] }
 *   scales         — echo of input for downstream renderers
 */
function normalizeScales(scales) {
  return (scales || []).map(s => ({
    id: s.id,
    label: s.label,
    min: s.min == null ? 1 : s.min,
    max: s.max == null ? 5 : s.max,
    labels: s.labels || null
  }));
}

registerHandler('rate', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();
    const scales = normalizeScales(phase.scales);
    const visibility = phase.visibility || 'all';

    room.phaseState = {
      phaseId: phase.id,
      scales,
      visibility,
      submissions: {},                  // { playerId: { scaleId: value } }
      eligibleIds,
      completed: new Set(),
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };

    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');

    ctx.emitToHost(EVENTS.RATE_START, {
      prompt: hostPrompt,
      scales,
      visibility,
      totalRaters: eligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate,
      show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      if (eligibleIds.has(player.id)) {
        const playerPrompt = ctx.services.resolvePerPlayerTemplate(
          phase.prompt || '', engine, player.id
        );
        ctx.emitToPlayer(player.id, EVENTS.RATE_START, {
          prompt: playerPrompt,
          scales,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate,
          show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for the class to rate...' });
      }
    }

    if (phase.timer) {
      const capturedSeq = room.phaseInstanceId;
      room.phaseState.timer = setTimeout(async () => {
        if (room.phaseInstanceId === capturedSeq && room.phaseState && room.phaseState.phaseId === phase.id) {
          await ctx.services.closeRating(ctx.code, room);
        }
      }, phase.timer * 1000);
    }
  },

  onReconnect(ctx, socket) {
    const rs = ctx.room.phaseState;
    if (!rs) return;
    const sc = ctx.resolveScreenControl();
    if (rs.completed.has(socket.id)) {
      socket.emit(EVENTS.WAITING, { message: 'Ratings submitted. Waiting for others...' });
    } else if (rs.eligibleIds.has(socket.id)) {
      const player = ctx.engine.players.find(socket.id);
      const playerPrompt = player
        ? ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, player.id)
        : ctx.resolveTemplate(ctx.phase.prompt || '');
      socket.emit(EVENTS.RATE_START, {
        prompt: playerPrompt,
        scales: rs.scales,
        timer: null,
        playerTemplate: sc.playerTemplate,
        show: sc.playerShow
      });
    } else {
      socket.emit(EVENTS.WAITING, { message: 'Waiting for the class to rate...' });
    }
  }
});

/**
 * Aggregation helper — used by the server's closeRating().
 * Lives here so the math is easy to test in isolation.
 */
export function aggregateRatings(scales, submissions) {
  const averages = {};
  const distributions = {};
  const byScale = {};

  for (const scale of scales) {
    byScale[scale.id] = [];
    distributions[scale.id] = {};
    for (let v = scale.min; v <= scale.max; v++) distributions[scale.id][v] = 0;
  }

  for (const playerRatings of Object.values(submissions)) {
    for (const scale of scales) {
      const raw = playerRatings[scale.id];
      if (raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      // Clamp defensively (client should already enforce)
      const clamped = Math.max(scale.min, Math.min(scale.max, Math.round(v)));
      byScale[scale.id].push(clamped);
      distributions[scale.id][clamped] = (distributions[scale.id][clamped] || 0) + 1;
    }
  }

  for (const scale of scales) {
    const vals = byScale[scale.id];
    if (vals.length === 0) {
      averages[scale.id] = 0;
    } else {
      const sum = vals.reduce((a, b) => a + b, 0);
      averages[scale.id] = Math.round((sum / vals.length) * 100) / 100;
    }
  }

  return { averages, distributions, byScale };
}
