/**
 * Turn phase — charades / describe-it / one-word style gameplay.
 *
 * Config:
 *   pool:        dataRef to an array of items (e.g. "phrases.responses")
 *   teamsFrom:   phaseRef to a team-split step
 *   timer:       seconds for each describer's turn
 *   allowSkip:   boolean — describer can skip an item (default true)
 *   instruction: templateString shown to describer (e.g. "Describe without
 *                saying the word", "Act it out, no words", "Say ONE word")
 *
 * One describer at a time draws items from a shared pool while a per-turn
 * timer drains. "Got It" captures the item for their team, "Skip" puts it
 * back at the bottom of the pool. When the timer expires, the next team
 * takes over with their next-up describer (round-robin within team). When
 * the pool is empty the phase ends.
 *
 * Output:
 *   teamScores:  { teamName: pointsEarnedThisRound }
 *   capturedBy:  { teamName: [item1, item2, ...] }
 *   itemCount:   total items in the original pool
 */

import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { sampleItems } from '../phases/sampling.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pull a flat list of strings out of whatever the pool ref resolves to. */
function extractPoolItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.text || item.choice || item.message || null;
      return null;
    })
    .filter(t => typeof t === 'string' && t.trim().length > 0)
    .map(t => t.trim());
}

/**
 * Per-recipient view: each player gets one of three perspectives. Host sees
 * the same as audience (item visible + scores).
 */
function emitItemViews(ctx, vs) {
  const item = vs.currentItem || null;
  const remaining = vs.pool.length;
  const describerId = vs.currentDescriberId;
  const describerName = vs.currentDescriberName;
  const teamName = vs.currentTeamName;

  // Host: everything
  ctx.emitToHost(EVENTS.TURN_ITEM, {
    role: 'host',
    item,
    teamName,
    describerName,
    teamScores: vs.teamScores,
    remaining,
    timerEndAt: vs.turnEndsAt,
    instruction: vs.instruction
  });

  // Players: role-filtered
  for (const player of ctx.engine.players.list()) {
    const myTeam = vs.playerTeam[player.id] || null;
    let role;
    if (player.id === describerId) role = 'describer';
    else if (myTeam === teamName) role = 'teammate';
    else role = 'audience';
    ctx.emitToPlayer(player.id, EVENTS.TURN_ITEM, {
      role,
      item: role === 'teammate' ? null : item,
      teamName,
      describerName,
      myTeam,
      teamScores: vs.teamScores,
      remaining,
      timerEndAt: vs.turnEndsAt,
      instruction: vs.instruction,
      allowSkip: vs.allowSkip
    });
  }
}

/** Pick the next describer for the upcoming team, advance the rotation counter. */
function pickNextDescriber(vs, teamName) {
  const team = vs.teams[teamName] || [];
  if (team.length === 0) return null;
  const idx = (vs.describerIdxByTeam[teamName] || 0) % team.length;
  vs.describerIdxByTeam[teamName] = idx + 1;
  return team[idx];
}

/** Begin a fresh turn for the team-after-the-current-team. */
function startNextTurn(ctx) {
  const vs = ctx.room.phaseState;
  if (!vs.pool.length) {
    return finishPhase(ctx);
  }
  vs.currentTeamIdx = (vs.currentTeamIdx + 1) % vs.teamNames.length;
  const teamName = vs.teamNames[vs.currentTeamIdx];
  const describer = pickNextDescriber(vs, teamName);
  if (!describer) {
    // Empty team — skip to next
    return startNextTurn(ctx);
  }
  vs.currentTeamName = teamName;
  vs.currentDescriberId = describer.playerId;
  vs.currentDescriberName = describer.name;
  vs.currentItem = vs.pool.shift();
  vs.turnEndsAt = Date.now() + vs.timer * 1000;

  ctx.emitToHost(EVENTS.TURN_START, {
    teamName,
    describerName: describer.name,
    timerEndAt: vs.turnEndsAt,
    teamScores: vs.teamScores
  });
  for (const player of ctx.engine.players.list()) {
    ctx.emitToPlayer(player.id, EVENTS.TURN_START, {
      teamName,
      describerName: describer.name,
      iAmDescriber: player.id === describer.playerId
    });
  }
  emitItemViews(ctx, vs);

  // Schedule timer expiry to roll to the next team. Server is authoritative —
  // clients show the countdown but can't end the turn themselves.
  if (vs.turnTimer) clearTimeout(vs.turnTimer);
  vs.turnTimer = setTimeout(() => endCurrentTurn(ctx, 'timeout'), vs.timer * 1000);
}

function endCurrentTurn(ctx, reason) {
  const vs = ctx.room.phaseState;
  if (!vs || vs.ended) return;
  if (vs.turnTimer) { clearTimeout(vs.turnTimer); vs.turnTimer = null; }

  // If an item was in the describer's hand when the turn ended, return it to
  // the bottom of the pool (it wasn't captured).
  if (vs.currentItem) {
    vs.pool.push(vs.currentItem);
    vs.currentItem = null;
  }

  ctx.emitToHost(EVENTS.TURN_END, {
    reason, teamName: vs.currentTeamName, teamScores: vs.teamScores
  });
  for (const player of ctx.engine.players.list()) {
    ctx.emitToPlayer(player.id, EVENTS.TURN_END, { reason, teamScores: vs.teamScores });
  }

  if (vs.pool.length === 0) return finishPhase(ctx);
  // Small pause so clients can show "Turn over" before the next turn begins
  setTimeout(() => startNextTurn(ctx), 1500);
}

function finishPhase(ctx) {
  const vs = ctx.room.phaseState;
  if (vs.ended) return;
  vs.ended = true;
  if (vs.turnTimer) { clearTimeout(vs.turnTimer); vs.turnTimer = null; }
  ctx.engine.storePhaseData(ctx.phase.id, {
    ...(ctx.engine.phaseData[ctx.phase.id] || {}), // keep `.pool` for later rounds
    teamScores: vs.teamScores,
    capturedBy: vs.capturedBy,
    itemCount: vs.itemCount
  });
  ctx.emitToHost(EVENTS.TURN_COMPLETE, {
    teamScores: vs.teamScores, capturedBy: vs.capturedBy
  });
  for (const player of ctx.engine.players.list()) {
    ctx.emitToPlayer(player.id, EVENTS.TURN_COMPLETE, { teamScores: vs.teamScores });
  }
  // Auto-advance to next phase
  ctx.advanceToNext();
}

registerHandler('turn', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;

    // Resolve the pool of items. `pool` can be a single dataRef or an array
    // of dataRefs to concatenate (e.g. ["round1.responses", "round2.responses",
    // "round3.responses"] to combine three collect rounds into one pool).
    let items;
    if (Array.isArray(phase.pool)) {
      items = [];
      for (const ref of phase.pool) {
        const part = engine.resolve(ref);
        for (const it of extractPoolItems(part)) items.push(it);
      }
    } else {
      items = extractPoolItems(phase.pool ? engine.resolve(phase.pool) : []);
    }

    // poolLimit: cap the bowl. Phrases scale with class size (3 per student =
    // a 75-phrase bowl at 25 kids = a 35-minute round), so draw a sample. The
    // DRAWN pool is stored as `.pool` so later rounds can ref it (Fishbowl's
    // same-pool-every-round memory mechanic requires all rounds to share the
    // draw — point round 2/3's pool at "round1.pool", not the raw collects).
    if (phase.poolLimit) {
      const before = items.length;
      items = sampleItems(items, phase.poolLimit);
      if (items.length < before) {
        console.log(`[turn:${phase.id}] poolLimit ${phase.poolLimit}: drew ${items.length} of ${before} phrases`);
      }
    }
    {
      const existingTurnData = engine.phaseData[phase.id] || {};
      engine.storePhaseData(phase.id, { ...existingTurnData, pool: [...items] });
    }

    if (items.length === 0) {
      console.warn(`[turn:${phase.id}] pool "${phase.pool}" resolved to no items, skipping phase`);
      ctx.engine.storePhaseData(phase.id, { teamScores: {}, capturedBy: {}, itemCount: 0 });
      return ctx.advanceToNext();
    }

    // Resolve team-split data
    const teamsRef = phase.teamsFrom;
    const teamData = teamsRef ? engine.phaseData[teamsRef] : null;
    if (!teamData || !teamData.teams) {
      console.warn(`[turn:${phase.id}] teamsFrom "${teamsRef}" has no teams data, skipping phase`);
      ctx.engine.storePhaseData(phase.id, { teamScores: {}, capturedBy: {}, itemCount: items.length });
      return ctx.advanceToNext();
    }

    const teamNames = Object.keys(teamData.teams);
    const teamScores = {};
    const capturedBy = {};
    const describerIdxByTeam = {};
    for (const t of teamNames) {
      teamScores[t] = 0;
      capturedBy[t] = [];
      describerIdxByTeam[t] = 0;
    }

    room.phaseState = {
      kind: 'turn',
      phaseId: phase.id,
      pool: shuffle(items),
      itemCount: items.length,
      teams: teamData.teams,
      playerTeam: teamData.playerTeam || {},
      teamNames,
      currentTeamIdx: -1, // startNextTurn() bumps this to 0
      describerIdxByTeam,
      teamScores,
      capturedBy,
      timer: Math.max(5, parseInt(phase.timer, 10) || 60),
      allowSkip: phase.allowSkip !== false,
      instruction: ctx.resolveTemplate(phase.instruction || ''),
      ended: false
    };

    console.log(`[turn:${phase.id}] starting with ${items.length} items, ${teamNames.length} teams, ${room.phaseState.timer}s/turn`);
    startNextTurn(ctx);
  },

  onReconnect(ctx, socket) {
    const vs = ctx.room.phaseState;
    if (!vs || vs.ended) return;
    // Re-emit the current item view to whichever role this player has
    emitItemViews(ctx, vs);
  }
});

// Exported so the server's socket layer can act on describer presses
export function handleGotIt(room, socketId) {
  const vs = room.phaseState;
  if (!vs || vs.ended) return false;
  if (socketId !== vs.currentDescriberId) return false;
  if (!vs.currentItem) return false;
  vs.teamScores[vs.currentTeamName] = (vs.teamScores[vs.currentTeamName] || 0) + 1;
  vs.capturedBy[vs.currentTeamName].push(vs.currentItem);
  vs.currentItem = null;
  return true;
}

export function handleSkip(room, socketId) {
  const vs = room.phaseState;
  if (!vs || vs.ended) return false;
  if (socketId !== vs.currentDescriberId) return false;
  if (!vs.currentItem) return false;
  if (!vs.allowSkip) return false;
  vs.pool.push(vs.currentItem);
  vs.currentItem = null;
  return true;
}

/**
 * After a Got It / Skip the server calls advanceItemInPhase to pull the
 * next item or end the current turn if the pool is empty.
 */
export function advanceItemInPhase(ctx) {
  const vs = ctx.room.phaseState;
  if (!vs || vs.ended) return;
  if (vs.pool.length === 0) {
    return endCurrentTurn(ctx, 'pool-empty');
  }
  vs.currentItem = vs.pool.shift();
  emitItemViews(ctx, vs);
}
