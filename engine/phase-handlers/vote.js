/**
 * Phase handler: vote — head-to-head or pick-one voting, tallied into a score
 * map. `matchupsFromPairs`/`excludeAuthors` support bluffing games, and
 * `nextByWinner` can branch the whole game by which option wins
 * (choose-your-own-adventure). The tally itself is the pure vote-handler.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { ballotFor, proposalsForProjector } from '../phases/vote-handler.js';
import { thumbnailStrokes } from '../drawing.js';

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
    } else if (Array.isArray(phase.candidates)) {
      // Literal (teacher-typed) option list — choose-your-own-adventure votes
      candidates = phase.candidates.filter(c => typeof c === 'string' && c.trim()).map(s => s.trim());
    } else {
      candidates = phase.candidates ? engine.resolve(phase.candidates) : [];
      // engine.resolve returns undefined for non-ref strings — treat a
      // comma-separated string as a literal option list (matches rank)
      if (candidates == null && typeof phase.candidates === 'string') {
        candidates = phase.candidates.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(candidates)) candidates = [];
      // Only a ballot can show: strings and answers ({playerId, text}).
      // A rank's {item, avgPosition} rows become their words; anything
      // else has no label (a black button on a reviewer's ballot,
      // 2026-09-24) and is left out with a note in the log.
      const kept = [];
      for (const c of candidates) {
        if (typeof c === 'string') { if (c.trim()) kept.push(c.trim()); continue; }
        if (c && typeof c === 'object') {
          if (c.playerId) { kept.push(c); continue; }
          const words = typeof c.item === 'string' ? c.item : (typeof c.text === 'string' ? c.text : null);
          if (words && words.trim()) { kept.push(words.trim()); continue; }
        }
        console.warn(`[vote:${phase.id}] a candidate had no words to show, left off the ballot`);
      }
      candidates = kept;
    }

    // Nothing to vote on (e.g. the source collect closed empty) — skip
    // rather than strand voters on an empty ballot. Same class of bug the
    // chaos simulator caught on rank.
    if (candidates.length === 0) {
      console.warn(`[vote:${phase.id}] no candidates, skipping the step`);
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        engine.storePhaseData(phase.id, { votes: [], scores: {}, winner: null, winnerText: null, tied: false, totalVotes: 0 });
        await ctx.advanceTo(nextId);
        return;
      }
    }

    // Drawings on the ballot (2026-09-20): a drawing step's responses carry
    // their strokes, and a whole class's drawings ride to every voter, so
    // the ballot gets a thin copy per drawing; the collect step keeps the
    // full strokes for the crown.
    candidates = candidates.map(c => (c && typeof c === 'object' && Array.isArray(c.drawing))
      ? { ...c, drawing: thumbnailStrokes(c.drawing) }
      : c);

    const candidateIds = candidates.map(c => (c && c.playerId ? c.playerId : c));

    room.phaseState = {
      kind: 'vote',
      phaseId: phase.id,
      mode: phase.mode,
      candidates,
      candidateIds,
      eligibleVoterIds: eligible.map(p => p.id),
      // Pick-one: the server refuses a self-vote when this is on.
      excludeAuthors: !!phase.excludeAuthors,
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
          ctx.emitToPlayer(voter.id, EVENTS.WAITING, { message: 'Nothing for you to vote on this round, waiting for others...' });
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
    } else if (phase.mode === 'pick-one' || phase.mode === 'approve') {
      // Approve (2026-09-25): the same ballot, but every entry takes a yes
      // or a no, so several can pass at once (clauses, norms, budget lines).
      const excludeAuthors = !!phase.excludeAuthors;
      for (const voter of eligible) {
        const ballot = ballotFor(candidates, voter.id, excludeAuthors);
        if (ballot.length === 0) {
          // Only their own answer to pick from: nothing to vote on, so
          // pre-mark them complete rather than block the room on them.
          room.phaseState.votersCompleted.add(voter.id);
          ctx.emitToPlayer(voter.id, EVENTS.WAITING, { message: 'Nothing for you to vote on this round, waiting for others...' });
          continue;
        }
        ctx.emitToPlayer(voter.id, EVENTS.VOTE_START, {
          mode: phase.mode,
          candidates: ballot,
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
      // A yes-or-no vote lists its proposals on the projector (words only)
      proposals: proposalsForProjector(phase.mode, candidates),
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
          mode: vs.mode === 'approve' ? 'approve' : 'pick-one',
          candidates: ballotFor(vs.candidates, socket.id, !!vs.excludeAuthors),
          timer: null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    } else {
      socket.emit(EVENTS.WAITING, { message: 'Waiting for votes...' });
    }
  }
});
