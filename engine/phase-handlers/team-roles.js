/**
 * Phase handler: team-roles — give every member of an existing group a
 * job (Facilitator, Recorder, Timekeeper, ...).
 *
 * Groups come from `teamsFrom` (a team-split, or a pairwise collect via
 * the pairs/teams bridge). `method`:
 *   - random: dealt instantly, round-robin inside each group (pure logic
 *     in engine/phases/role-deal.js)
 *   - choice: students tap the role they want; per-group capacity is
 *     ceil(members / roles), re-picks allowed, stragglers auto-filled at
 *     close (server.closeTeamRoles — kind-guarded, idempotent, reachable
 *     from the advance-phase routing switch)
 *
 * Both methods store the same output: { playerRole, byPlayer,
 * roleMembers, rolesList, roles } — byPlayer means {{stepId.mine}}
 * resolves to "your role" in later announces and prompts.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { dealRoles, roleCapacity, buildRoleOutput } from '../phases/role-deal.js';
import { pairsAsTeams } from '../phases/checklist-state.js';
import { seatInTeamData, seatInRoleState, seatInRoleOutput, boardFromTeams } from '../phases/late-seating.js';

// Live claims to the projector, the consoles, and every member's menu
// (the server's emitTeamRolesUpdate, through the handler context)
function emitRolesLive(ctx, state) {
  const board = buildRoleBoard(state, ctx.engine.players);
  ctx.emitToHost(EVENTS.TEAM_ROLES_UPDATE, { ...board, roles: state.roles });
  ctx.emitToTeachers(EVENTS.TEAM_ROLES_UPDATE, { ...board, roles: state.roles });
  for (const player of ctx.engine.players.list()) {
    const menu = buildRoleMenu(state, player.id, ctx.engine.players);
    if (menu) ctx.emitToPlayer(player.id, EVENTS.TEAM_ROLES_UPDATE, menu);
  }
}

/**
 * Resolve teamsFrom into the {groups, playerGroup} shape role-deal
 * works on. Falls back to one whole-class group (with a warn) when the
 * source has no team or pair data — the activity still works.
 */
export function rolesGroupsFrom(engine, phase, eligible) {
  const data = phase.teamsFrom ? engine.phaseData[phase.teamsFrom] : null;
  let teamData = data && data.teams ? data : null;
  if (!teamData && data && Array.isArray(data.pairs)) {
    teamData = pairsAsTeams(data.pairs, id => (engine.players.find(id) || {}).name);
  }
  const groups = {};
  const playerGroup = {};
  if (teamData) {
    for (const [name, members] of Object.entries(teamData.teams)) {
      groups[name] = { label: name, memberIds: members.map(m => m.playerId) };
      for (const m of members) playerGroup[m.playerId] = name;
    }
  } else {
    console.warn(`[team-roles:${phase.id}] teamsFrom "${phase.teamsFrom}" has no teams or pairs data, treating the class as one group`);
    groups['The class'] = { label: 'The class', memberIds: eligible.map(p => p.id) };
    for (const p of eligible) playerGroup[p.id] = 'The class';
  }
  return { groups, playerGroup };
}

export function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.map(r => String(r).trim()).filter(Boolean);
}

// One player's pick menu: their group's roles with holders + open spots.
export function buildRoleMenu(state, playerId, players) {
  const groupKey = state.playerGroup[playerId];
  const group = groupKey != null ? state.groups[groupKey] : null;
  if (!group) return null;
  const cap = roleCapacity(group.memberIds.length, state.roles.length);
  return {
    groupLabel: group.label,
    yourRole: state.picks[playerId] || null,
    roles: state.roles.map(role => {
      const holders = group.memberIds.filter(pid => state.picks[pid] === role);
      return {
        name: role,
        takenBy: holders.map(pid => (players.find(pid) || {}).name || '?'),
        open: Math.max(0, cap - holders.length)
      };
    })
  };
}

// The projector's live view: who has picked what, per group. Names on
// the projector are fine here (same visibility as the team-split board).
export function buildRoleBoard(state, players) {
  const groups = Object.values(state.groups).map(g => ({
    label: g.label,
    picks: g.memberIds.map(pid => ({
      name: (players.find(pid) || {}).name || '?',
      role: state.picks[pid] || null
    }))
  }));
  const total = Object.values(state.groups).reduce((n, g) => n + g.memberIds.length, 0);
  return { groups, placed: Object.keys(state.picks).length, total };
}

registerHandler('team-roles', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    const eligible = ctx.getEligibleVoters(phase.from || 'all');
    const roles = normalizeRoles(phase.roles);
    const sc = ctx.resolveScreenControl();

    if (roles.length === 0) {
      console.warn(`[team-roles:${phase.id}] no usable roles, skipping the step`);
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        engine.storePhaseData(phase.id, {
          playerRole: {}, byPlayer: {}, roleMembers: {}, rolesList: '', roles: []
        });
        await ctx.advanceTo(nextId);
      }
      return;
    }

    const { groups, playerGroup } = rolesGroupsFrom(engine, phase, eligible);
    const method = phase.method || 'random';

    if (method === 'choice') {
      const state = {
        kind: 'team-roles',
        phaseId: phase.id,
        roles,
        groups,
        playerGroup,
        picks: {},
        closed: false
      };
      room.phaseState = state;
      console.log(`[handlePhase] Team-roles (choice): ${roles.length} roles across ${Object.keys(groups).length} group(s)`);

      const board = buildRoleBoard(state, engine.players);
      ctx.emitToHost(EVENTS.TEAM_ROLES_START, {
        ...board,
        roles,
        prompt: 'Pick your role on your device!',
        hostTemplate: sc.hostTemplate, show: sc.hostShow
      });
      ctx.emitToTeachers(EVENTS.TEAM_ROLES_START, { ...board, roles });
      for (const player of engine.players.list()) {
        const menu = buildRoleMenu(state, player.id, engine.players);
        if (menu) {
          ctx.emitToPlayer(player.id, EVENTS.TEAM_ROLES_START, {
            ...menu, playerTemplate: sc.playerTemplate, show: sc.playerShow
          });
        } else {
          ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Roles are being picked...' });
        }
      }
      return;
    }

    // --- random: deal instantly, host-paced reveal ---
    const state = { roles, groups, playerGroup, picks: dealRoles(groups, roles), closed: true };
    const output = buildRoleOutput(state, id => (engine.players.find(id) || {}).name);
    engine.storePhaseData(phase.id, output);
    console.log(`[handlePhase] Team-roles (random): dealt ${roles.length} roles across ${Object.keys(groups).length} group(s)`);

    ctx.emitToHost(EVENTS.TEAM_ROLES, {
      board: buildRoleBoard(state, engine.players),
      rolesList: output.rolesList,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.TEAM_ROLES, {
        myRole: output.playerRole[player.id] || null,
        groupLabel: (groups[playerGroup[player.id]] || {}).label || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  // A student who joins after the roles step opened (engine/phases/
  // late-seating.js): they take a seat on the smallest team in the split's
  // stored data, then pick from that group's menu while the step is open,
  // or get the group's least-held role once the roles are set (the
  // projector's lineup refreshes). Their own screen follows from
  // onReconnect, which the join path sends next.
  onLateJoin(ctx, playerId) {
    const { phase, engine, room } = ctx;
    const nameOf = id => (engine.players.find(id) || {}).name || '?';
    const name = nameOf(playerId);
    const teamData = phase.teamsFrom ? engine.phaseData[phase.teamsFrom] : null;
    const team = teamData && teamData.teams ? seatInTeamData(teamData, playerId, name) : null;
    const state = room.phaseState;
    if (state && state.kind === 'team-roles' && !state.closed) {
      // No teams behind the step = the whole-class fallback group
      const key = team || (state.groups['The class'] ? 'The class' : null);
      if (!key) return null;
      seatInRoleState(state, playerId, key, key);
      emitRolesLive(ctx, state);
      return { team, role: null, picking: true };
    }
    const output = engine.phaseData[phase.id];
    if (!output || !Array.isArray(output.roles) || output.roles.length === 0) return null;
    const label = team || 'The class';
    const memberIds = team && teamData.teams[team]
      ? teamData.teams[team].map(m => m.playerId)
      : Object.keys(output.playerRole || {}).concat([playerId]);
    const role = seatInRoleOutput(output, playerId, name, label, memberIds);
    if (!role) return null;
    const teamsForBoard = team ? teamData : { teams: { [label]: memberIds.map(id => ({ playerId: id, name: nameOf(id) })) } };
    const sc = ctx.resolveScreenControl();
    ctx.emitToHost(EVENTS.TEAM_ROLES, {
      board: boardFromTeams(teamsForBoard, output.playerRole),
      rolesList: output.rolesList,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });
    return { team, role, picking: false };
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    const sc = ctx.resolveScreenControl();
    if (state && state.kind === 'team-roles' && !state.closed) {
      if (ctx.services.roomToHost.get(ctx.code) === socket.id) {
        socket.emit(EVENTS.TEAM_ROLES_START, {
          ...buildRoleBoard(state, ctx.engine.players),
          roles: state.roles,
          prompt: 'Pick your role on your device!',
          hostTemplate: sc.hostTemplate, show: sc.hostShow
        });
        return;
      }
      const menu = buildRoleMenu(state, socket.id, ctx.engine.players);
      if (menu) {
        socket.emit(EVENTS.TEAM_ROLES_START, {
          ...menu, playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit(EVENTS.WAITING, { message: 'Roles are being picked...' });
      }
      return;
    }

    // Finalized (either method): replay the reveal from stored data.
    const data = ctx.engine.getPhaseData(ctx.phase.id);
    if (data && data.playerRole) {
      if (ctx.services.roomToHost.get(ctx.code) === socket.id) {
        socket.emit(EVENTS.TEAM_ROLES, {
          rolesList: data.rolesList,
          hostTemplate: sc.hostTemplate, show: sc.hostShow
        });
      } else {
        socket.emit(EVENTS.TEAM_ROLES, {
          myRole: data.playerRole[socket.id] || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    }
  }
});
