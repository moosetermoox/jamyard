import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

/**
 * Resolve and sum one or more score sources into a single { key: total } map.
 * `from` can be a single dataRef string OR an array of dataRef strings; in
 * the array case scores are summed by key across all sources. Used for
 * multi-round games (e.g. Fishbowl-style) where each round writes its own
 * scores phase and a final leaderboard totals them.
 */
function resolveCombinedScores(engine, from) {
  const refs = Array.isArray(from) ? from : [from];
  const combined = {};
  for (const ref of refs) {
    const part = ref ? engine.resolve(ref) : null;
    if (!part) continue;
    if (Array.isArray(part)) {
      for (const entry of part) {
        const key = entry.playerId || entry.id;
        if (!key) continue;
        combined[key] = (combined[key] || 0) + (entry.score || 0);
      }
    } else if (typeof part === 'object') {
      for (const [k, v] of Object.entries(part)) {
        if (typeof v === 'number') combined[k] = (combined[k] || 0) + v;
      }
    }
  }
  return combined;
}

registerHandler('leaderboard', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const rawScores = Array.isArray(phase.from)
      ? resolveCombinedScores(engine, phase.from)
      : (engine.resolve(phase.from) || {});
    const style = phase.style || 'full';

    // Build standings array — scores can be object { playerId: score } or array
    let standings = [];
    if (Array.isArray(rawScores)) {
      standings = rawScores.map((entry, i) => ({
        rank: i + 1,
        playerId: entry.playerId || entry.id,
        name: (engine.players.find(entry.playerId || entry.id) || {}).name || 'Unknown',
        score: entry.score || 0
      }));
    } else if (typeof rawScores === 'object') {
      standings = Object.entries(rawScores).map(([pid, score]) => ({
        playerId: pid,
        name: (engine.players.find(pid) || {}).name || pid,
        score: typeof score === 'number' ? score : 0
      }));
    }

    // Sort by score descending, then assign ranks using competition ranking
    // (Olympic-style 1, 1, 3, 4) so tied scores share a rank. Without this,
    // two players tied for 1st used to be shown as gold/silver instead of
    // both gold.
    standings.sort((a, b) => b.score - a.score);
    let prevScore = null;
    let rank = 0;
    standings.forEach((s, i) => {
      if (s.score !== prevScore) {
        rank = i + 1;
        prevScore = s.score;
      }
      s.rank = rank;
    });

    const display = style === 'top3' ? standings.slice(0, 3) : standings;
    engine.storePhaseData(phase.id, { standings, style });
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Leaderboard: ${standings.length} players, style=${style}`);

    // Send to host
    ctx.emitToHost(EVENTS.LEADERBOARD, {
      standings: display, allStandings: standings, style,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send to players — each gets their own rank highlighted
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.LEADERBOARD, {
        standings: display, allStandings: standings, style,
        timer: phase.timer || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }

    // Auto-advance with timer
    if (phase.timer) {
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        setTimeout(async () => {
          if (ctx.isStale()) return;
          await ctx.advanceTo(nextId);
        }, phase.timer * 1000);
      }
    }
  },

  onReconnect(ctx, socket) {
    const lbData = ctx.engine.getPhaseData(ctx.phase.id);
    if (lbData) {
      const sc = ctx.resolveScreenControl();
      const lbStyle = lbData.style || 'full';
      const lbDisplay = lbStyle === 'top3' ? lbData.standings.slice(0, 3) : lbData.standings;
      socket.emit(EVENTS.LEADERBOARD, {
        standings: lbDisplay, allStandings: lbData.standings, style: lbStyle,
        timer: null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
