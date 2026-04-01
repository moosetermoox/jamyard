import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('team-split', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const tsFrom = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(tsFrom);
    const teamCount = phase.teamCount || 2;
    const teamNames = Array.isArray(phase.teamNames) && phase.teamNames.length === teamCount
      ? phase.teamNames
      : Array.from({length: teamCount}, (_, i) => 'Team ' + (i + 1));
    const sc = ctx.resolveScreenControl();

    let ordered;
    if (phase.method === 'balanced' && phase.balanceFrom) {
      const scores = engine.resolve(phase.balanceFrom) || {};
      ordered = [...eligible].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    } else {
      ordered = [...eligible].sort(() => Math.random() - 0.5);
    }

    // Distribute into teams via snake draft
    const teams = {};
    const playerTeam = {};
    for (const name of teamNames) teams[name] = [];

    for (let i = 0; i < ordered.length; i++) {
      const round = Math.floor(i / teamCount);
      const idx = round % 2 === 0 ? i % teamCount : teamCount - 1 - (i % teamCount);
      const tName = teamNames[idx];
      teams[tName].push({ playerId: ordered[i].id, name: ordered[i].name });
      playerTeam[ordered[i].id] = tName;
    }

    engine.storePhaseData(phase.id, { teams, playerTeam });

    console.log(`[handlePhase] Team-split: ${ordered.length} players into ${teamCount} teams`);

    ctx.emitToHost(EVENTS.TEAM_SPLIT, {
      teams, hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.TEAM_SPLIT, {
        myTeam: playerTeam[player.id] || null,
        teams,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const tsData = ctx.engine.getPhaseData(ctx.phase.id);
    if (tsData) {
      const sc = ctx.resolveScreenControl();
      socket.emit(EVENTS.TEAM_SPLIT, {
        myTeam: tsData.playerTeam[socket.id] || null,
        teams: tsData.teams,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
