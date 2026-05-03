import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('leaderboard', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const rawScores = engine.resolve(phase.from) || {};
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

    // Sort by score descending
    standings.sort((a, b) => b.score - a.score);
    standings.forEach((s, i) => { s.rank = i + 1; });

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
