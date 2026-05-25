import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('vote', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    const votersField = phase.voters || 'all';
    const eligible = ctx.getEligibleVoters(votersField);
    const sc = ctx.resolveScreenControl();

    // Candidates can come from `candidates` (data ref) or, in head-to-head mode,
    // be derived from a paired-collect phase via `matchupsFromPairs`.
    let candidates = [];
    let matchupsOverride = null;
    if (phase.mode === 'head-to-head' && phase.matchupsFromPairs) {
      const src = engine.phaseData[phase.matchupsFromPairs];
      if (!src || !Array.isArray(src.pairs) || !Array.isArray(src.responses)) {
        console.warn(`[vote:${phase.id}] matchupsFromPairs "${phase.matchupsFromPairs}" has no pairs/responses`);
      } else {
        const byPlayer = {};
        for (const r of src.responses) {
          if (r && r.playerId) byPlayer[r.playerId] = r;
        }
        const seen = new Set();
        candidates = [];
        matchupsOverride = [];
        for (const pair of src.pairs) {
          const [a, b] = pair.playerIds || [];
          const ra = byPlayer[a];
          const rb = byPlayer[b];
          if (!ra || !rb) continue; // skip incomplete pairs
          if (!seen.has(a)) { candidates.push({ playerId: a, text: ra.text, name: ra.name, promptText: pair.promptText }); seen.add(a); }
          if (!seen.has(b)) { candidates.push({ playerId: b, text: rb.text, name: rb.name, promptText: pair.promptText }); seen.add(b); }
          matchupsOverride.push([a, b, pair.promptText]);
        }
      }
    } else {
      candidates = phase.candidates ? engine.resolve(phase.candidates) : [];
    }

    const candidateIds = candidates.map(c => c.playerId || c);

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
      let matchups, comparisons;
      if (matchupsOverride) {
        matchups = matchupsOverride.map(([a, b]) => [a, b]);
        comparisons = matchups.length;
      } else {
        const gen = ctx.services.generateMatchups(candidateIds);
        matchups = gen.matchups;
        comparisons = gen.comparisons;
      }
      room.phaseState.matchups = matchups;
      room.phaseState.comparisons = comparisons;
      // Side-car prompt text per matchup (parallel array) — only populated by matchupsFromPairs
      room.phaseState.matchupPrompts = matchupsOverride
        ? matchupsOverride.map(([, , prompt]) => prompt || null)
        : matchups.map(() => null);

      const excludeAuthors = !!phase.excludeAuthors;

      for (const voter of eligible) {
        const visible = matchups
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => !excludeAuthors || (m[0] !== voter.id && m[1] !== voter.id));
        if (visible.length === 0) {
          // Voter has nothing to vote on (excluded from every matchup) —
          // pre-mark them complete so the room isn't blocked waiting.
          room.phaseState.votersCompleted.add(voter.id);
          ctx.emitToPlayer(voter.id, EVENTS.WAITING, { message: 'Nothing for you to vote on this round — waiting for others...' });
          continue;
        }
        ctx.emitToPlayer(voter.id, EVENTS.VOTE_START, {
          mode: 'head-to-head',
          matchups: visible.map(({ m, i }) => ({
            optionA: candidates.find(c => (c.playerId || c) === m[0]) || { playerId: m[0] },
            optionB: candidates.find(c => (c.playerId || c) === m[1]) || { playerId: m[1] },
            promptText: room.phaseState.matchupPrompts[i] || null
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
        const excludeAuthors = !!ctx.phase.excludeAuthors;
        const visible = vs.matchups
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => !excludeAuthors || (m[0] !== socket.id && m[1] !== socket.id));
        socket.emit(EVENTS.VOTE_START, {
          mode: 'head-to-head',
          matchups: visible.map(({ m, i }) => ({
            optionA: vs.candidates.find(c => (c.playerId || c) === m[0]) || { playerId: m[0] },
            optionB: vs.candidates.find(c => (c.playerId || c) === m[1]) || { playerId: m[1] },
            promptText: (vs.matchupPrompts && vs.matchupPrompts[i]) || null
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
