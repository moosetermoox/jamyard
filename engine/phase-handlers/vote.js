import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('vote', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    const candidates = phase.candidates ? engine.resolve(phase.candidates) : [];
    const votersField = phase.voters || 'all';
    const eligible = ctx.getEligibleVoters(votersField);
    const candidateIds = candidates.map(c => c.playerId || c);
    const sc = ctx.resolveScreenControl();

    room.phaseState = {
      phaseId: phase.id,
      mode: phase.mode,
      candidates,
      candidateIds,
      eligibleVoterIds: eligible.map(p => p.id),
      votes: [],
      votersCompleted: new Set()
    };

    if (phase.mode === 'head-to-head') {
      const { matchups, comparisons } = ctx.services.generateMatchups(candidateIds);
      room.phaseState.matchups = matchups;
      room.phaseState.comparisons = comparisons;

      for (const voter of eligible) {
        ctx.emitToPlayer(voter.id, EVENTS.VOTE_START, {
          mode: 'head-to-head',
          matchups: matchups.map(([a, b]) => ({
            optionA: candidates.find(c => (c.playerId || c) === a) || { playerId: a },
            optionB: candidates.find(c => (c.playerId || c) === b) || { playerId: b }
          })),
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    } else if (phase.mode === 'pick-one') {
      for (const voter of eligible) {
        ctx.emitToPlayer(voter.id, EVENTS.VOTE_START, {
          mode: 'pick-one',
          candidates,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    }

    // Notify non-voters they're waiting
    const eligibleIds = new Set(eligible.map(p => p.id));
    for (const player of engine.players.list()) {
      if (!eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for votes...' });
      }
    }

    // Notify host
    ctx.emitToHost(EVENTS.VOTE_START, {
      mode: phase.mode,
      totalVoters: eligible.length,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    console.log(`[handlePhase] Vote started: ${phase.mode}, ${candidateIds.length} candidates, ${eligible.length} voters`);
  },

  onReconnect(ctx, socket) {
    const { room } = ctx;
    if (!room.phaseState) return;
    const vs = room.phaseState;
    const sc = ctx.resolveScreenControl();

    if (vs.votersCompleted.has(socket.id)) {
      socket.emit(EVENTS.WAITING, { message: 'Vote submitted. Waiting for results...' });
    } else if (vs.eligibleVoterIds.includes(socket.id)) {
      if (vs.mode === 'head-to-head') {
        socket.emit(EVENTS.VOTE_START, {
          mode: 'head-to-head',
          matchups: vs.matchups.map(([a, b]) => ({
            optionA: vs.candidates.find(c => (c.playerId || c) === a) || { playerId: a },
            optionB: vs.candidates.find(c => (c.playerId || c) === b) || { playerId: b }
          })),
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit(EVENTS.VOTE_START, {
          mode: 'pick-one',
          candidates: vs.candidates,
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    } else {
      socket.emit(EVENTS.WAITING, { message: 'Waiting for votes...' });
    }
  }
});
