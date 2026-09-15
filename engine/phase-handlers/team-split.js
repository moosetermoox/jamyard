/**
 * Phase handler: team-split — divide players into teams or groups.
 *
 * Sizing: `teamCount` ("4 teams") OR `groupSize` ("groups of 4" — the
 * count comes from engine/phases/team-grouping.js, no singletons).
 *
 * Assignment `method`:
 *   - random / balanced: instant, snake-draft (the original behavior)
 *   - teacher: host screen shows the roster, teacher taps players into
 *     teams, Confirm finalizes (stragglers auto-filled)
 *   - choice: students tap the team they want (open spots only, re-pick
 *     allowed); closes when everyone's placed or the teacher confirms
 *
 * Every method ends in the same TEAM_SPLIT reveal and stores the same
 * output shape ({teams, playerTeam}), so downstream team consumers
 * (turn, relay, leaderboard) don't know or care how the teams were made.
 * Interactive closes live in server.closeTeamSplit (kind-guarded,
 * idempotent, reachable from the advance-phase routing switch).
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { groupCountFor, teamCapacities, defaultTeamNames } from '../phases/team-grouping.js';
import { openTeamSpot, seatInTeamData } from '../phases/late-seating.js';

/**
 * Resolve sizing + names + spot caps for a class of n. `capacity: "open"`
 * yields null capacities — no caps, for classes whose teams already exist
 * in the real world (students join their own team even when absences make
 * the sizes uneven).
 * @returns {{ teamCount: number, teamNames: string[], sizedGroups: boolean, capacities: number[]|null }}
 */
export function resolveTeamPlan(phase, n) {
  const sizedGroups = phase.groupSize != null && phase.teamCount == null;
  const teamCount = sizedGroups
    ? groupCountFor(n, phase.groupSize)
    : (phase.teamCount || 2);
  const teamNames = Array.isArray(phase.teamNames) && phase.teamNames.length === teamCount
    ? phase.teamNames
    : defaultTeamNames(teamCount, sizedGroups);
  const capacities = phase.capacity === 'open' ? null : teamCapacities(n, teamCount);
  return { teamCount, teamNames, sizedGroups, capacities };
}

// Live rosters for the choice screens / teacher setup: name lists + spots.
// Null capacities (capacity:"open") → capacity/open are null and the
// screens hide the spot counts.
export function buildTeamRosters(state, players) {
  return state.teamNames.map((name, i) => {
    const members = Object.entries(state.assignments)
      .filter(([, team]) => team === name)
      .map(([pid]) => ({ playerId: pid, name: (players.find(pid) || {}).name || '?' }));
    const capacity = state.capacities ? state.capacities[i] : null;
    return {
      name,
      members,
      capacity,
      open: capacity == null ? null : Math.max(0, capacity - members.length)
    };
  });
}

export function emitTeamSplitSetup(ctx, state) {
  const engine = ctx.engine;
  const rosters = buildTeamRosters(state, engine.players);
  const unassigned = [...state.eligibleIds]
    .filter(id => !state.assignments[id])
    .map(id => ({ playerId: id, name: (engine.players.find(id) || {}).name || '?' }));
  const payload = { rosters, unassigned, mode: state.mode };
  ctx.emitToHost(EVENTS.TEAM_SPLIT_SETUP, payload);
  ctx.emitToTeachers(EVENTS.TEAM_SPLIT_SETUP, payload);
}

export function emitTeamChoiceState(ctx, state) {
  const engine = ctx.engine;
  const rosters = buildTeamRosters(state, engine.players);
  const placed = Object.keys(state.assignments).length;
  const total = state.eligibleIds.size;
  ctx.emitToHost(EVENTS.TEAM_CHOICE_UPDATE, { rosters, placed, total });
  ctx.emitToTeachers(EVENTS.TEAM_CHOICE_UPDATE, { rosters, placed, total });
  for (const player of engine.players.list()) {
    if (state.eligibleIds.has(player.id)) {
      ctx.emitToPlayer(player.id, EVENTS.TEAM_CHOICE_UPDATE, {
        rosters, placed, total, yourTeam: state.assignments[player.id] || null
      });
    }
  }
}

registerHandler('team-split', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    const tsFrom = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(tsFrom);
    const { teamCount, teamNames, capacities } = resolveTeamPlan(phase, eligible.length);
    const method = phase.method || 'random';
    const sc = ctx.resolveScreenControl();

    if (method === 'teacher' || method === 'choice') {
      const state = {
        kind: 'team-split',
        phaseId: phase.id,
        mode: method,
        teamNames,
        capacities, // null = no caps (capacity:"open")
        assignments: {},               // playerId → teamName
        eligibleIds: new Set(eligible.map(p => p.id)),
        closed: false
      };
      room.phaseState = state;

      console.log(`[handlePhase] Team-split (${method}): ${eligible.length} players into ${teamCount} teams`);

      if (method === 'teacher') {
        emitTeamSplitSetup(ctx, state);
        for (const player of engine.players.list()) {
          ctx.emitToPlayer(player.id, EVENTS.WAITING, {
            message: 'Your teacher is arranging the teams...'
          });
        }
      } else {
        const rosters = buildTeamRosters(state, engine.players);
        ctx.emitToHost(EVENTS.TEAM_CHOICE_START, {
          rosters, placed: 0, total: eligible.length,
          prompt: sc.hostTemplate || 'Pick your team on your device!',
          hostTemplate: sc.hostTemplate, show: sc.hostShow
        });
        ctx.emitToTeachers(EVENTS.TEAM_CHOICE_START, { rosters, placed: 0, total: eligible.length });
        for (const player of engine.players.list()) {
          if (state.eligibleIds.has(player.id)) {
            ctx.emitToPlayer(player.id, EVENTS.TEAM_CHOICE_START, {
              rosters, yourTeam: null,
              playerTemplate: sc.playerTemplate, show: sc.playerShow
            });
          } else {
            ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Teams are forming...' });
          }
        }
      }
      return;
    }

    // --- Instant methods: random / balanced (the original flow) ---
    let ordered;
    if (method === 'balanced' && phase.balanceFrom) {
      const scores = engine.resolve(phase.balanceFrom) || {};
      ordered = [...eligible].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    } else {
      ordered = ctx.services.shuffleArray(eligible);
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

  // A student who joins after the split opened (engine/phases/late-seating.js):
  // still choosing or being arranged, they become eligible (a spot opens
  // for them); teams set, they join the smallest one and the projector's
  // team cards refresh. The newcomer's own screen follows from
  // onReconnect, which the join path sends next.
  onLateJoin(ctx, playerId) {
    const { phase, engine, room } = ctx;
    const state = room.phaseState;
    const name = (engine.players.find(playerId) || {}).name || '?';
    if (state && state.kind === 'team-split' && !state.closed) {
      openTeamSpot(state, playerId);
      if (state.mode === 'teacher') emitTeamSplitSetup(ctx, state);
      else emitTeamChoiceState(ctx, state);
      return { team: null, role: null, picking: true };
    }
    const data = engine.phaseData[phase.id];
    const team = seatInTeamData(data, playerId, name);
    if (!team) return null;
    const sc = ctx.resolveScreenControl();
    ctx.emitToHost(EVENTS.TEAM_SPLIT, {
      teams: data.teams, hostTemplate: sc.hostTemplate, show: sc.hostShow
    });
    return { team, role: null, picking: false };
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (state && state.kind === 'team-split' && !state.closed) {
      // Interactive assignment still in progress
      const sc = ctx.resolveScreenControl();
      if (state.mode === 'choice' && state.eligibleIds.has(socket.id)) {
        socket.emit(EVENTS.TEAM_CHOICE_START, {
          rosters: buildTeamRosters(state, ctx.engine.players),
          yourTeam: state.assignments[socket.id] || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else if (ctx.services.roomToHost.get(ctx.code) === socket.id) {
        // Host screen came back mid-arrangement
        if (state.mode === 'teacher') emitTeamSplitSetup(ctx, state);
        else emitTeamChoiceState(ctx, state);
      } else {
        socket.emit(EVENTS.WAITING, {
          message: state.mode === 'teacher'
            ? 'Your teacher is arranging the teams...'
            : 'Teams are forming...'
        });
      }
      return;
    }

    // Finalized (any method): replay the reveal from stored phase data
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
