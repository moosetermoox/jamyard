/**
 * Late seating: a student who joins AFTER a team step has opened gets a
 * seat wherever the class currently is, instead of a waiting screen for
 * the rest of the period (2026-09-14, owner: "can the system add people
 * as they enter? If you pick a team you're then added to a team. If you
 * pick a role your role then shows up").
 *
 * Pure helpers over the three team steps' data. The handlers' onLateJoin
 * hooks call these and do the emitting; server.js fires the hook on a
 * FRESH join (never a reconnect, which follows its old seat) before it
 * sends the newcomer the current screen.
 *
 * Rules:
 *   - Team choice still open: the newcomer may pick; if the caps are
 *     full, the team with the fewest members grows by one spot (the caps
 *     always sum to the eligible count).
 *   - Teams set: the newcomer joins the team with the fewest members
 *     (ties: the first team), written into the split's stored data so
 *     later steps and the report see it too.
 *   - Role choice still open: they pick from their group's menu (the
 *     group's capacity grows with its size).
 *   - Roles set: they get the role with the fewest holders in their group
 *     (ties: the first role), the same rule the close uses for stragglers.
 *   - Checklist: they join their team's list; solo lists get a new one.
 */

/** The team with the fewest members; ties go to the first. null when none. */
export function smallestTeam(teams) {
  let best = null;
  let bestSize = Infinity;
  for (const [name, members] of Object.entries(teams || {})) {
    const size = Array.isArray(members) ? members.length : 0;
    if (size < bestSize) { best = name; bestSize = size; }
  }
  return best;
}

/**
 * Seat a newcomer in a finished split's stored output ({teams,
 * playerTeam}). Mutates teamData. Returns the team name, or null when
 * the data has no teams (nothing to seat into).
 */
export function seatInTeamData(teamData, playerId, name) {
  if (!teamData || !teamData.teams || typeof teamData.teams !== 'object') return null;
  if (teamData.playerTeam && teamData.playerTeam[playerId]) return teamData.playerTeam[playerId];
  const team = smallestTeam(teamData.teams);
  if (team == null) return null;
  teamData.teams[team].push({ playerId, name: name || '?' });
  if (!teamData.playerTeam) teamData.playerTeam = {};
  teamData.playerTeam[playerId] = team;
  return team;
}

/**
 * Open a spot for a newcomer in a team-split that is still choosing (or
 * being arranged): they become eligible, and when spots are capped the
 * team with the fewest members gains one so the caps still cover
 * everyone. Mutates state. Returns the team whose cap grew, or null.
 */
export function openTeamSpot(state, playerId) {
  if (!state || !state.eligibleIds) return null;
  if (state.eligibleIds.has(playerId)) return null;
  state.eligibleIds.add(playerId);
  if (!Array.isArray(state.capacities)) return null;
  const counts = state.teamNames.map(name =>
    Object.values(state.assignments || {}).filter(t => t === name).length);
  let idx = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] < counts[idx]) idx = i;
  state.capacities[idx] += 1;
  return state.teamNames[idx];
}

/** The role held by the fewest of `memberIds` (ties: the first role). */
export function leastHeldRole(roles, memberIds, roleOf) {
  if (!Array.isArray(roles) || roles.length === 0) return null;
  let best = roles[0];
  let bestCount = Infinity;
  for (const role of roles) {
    let n = 0;
    for (const pid of memberIds || []) if (roleOf(pid) === role) n++;
    if (n < bestCount) { best = role; bestCount = n; }
  }
  return best;
}

/**
 * Seat a newcomer in a team-roles step's live state (choice mode). They
 * join the group (created when the split never had it, e.g. the
 * whole-class fallback), and pick like everyone else; a closed state
 * hands them the least-held role at once. Mutates state. Returns the
 * role given, or null while they still get to pick.
 */
export function seatInRoleState(state, playerId, groupKey, groupLabel) {
  if (!state || !state.groups) return null;
  if (!state.groups[groupKey]) state.groups[groupKey] = { label: groupLabel || groupKey, memberIds: [] };
  const group = state.groups[groupKey];
  if (!group.memberIds.includes(playerId)) group.memberIds.push(playerId);
  state.playerGroup[playerId] = groupKey;
  if (!state.closed) return null;
  const role = leastHeldRole(state.roles, group.memberIds, pid => state.picks[pid]);
  if (role) state.picks[playerId] = role;
  return role;
}

/**
 * Seat a newcomer in a finished team-roles output ({playerRole, byPlayer,
 * roleMembers, rolesList, roles}): the least-held role among their
 * group-mates, and a place on the group's line. Mutates output. Returns
 * the role, or null when the output has no roles.
 */
export function seatInRoleOutput(output, playerId, name, groupLabel, groupMemberIds) {
  if (!output || !Array.isArray(output.roles) || output.roles.length === 0) return null;
  if (output.playerRole && output.playerRole[playerId]) return output.playerRole[playerId];
  const role = leastHeldRole(output.roles, groupMemberIds, pid => (output.playerRole || {})[pid]);
  if (!role) return null;
  if (!output.playerRole) output.playerRole = {};
  if (!output.byPlayer) output.byPlayer = {};
  if (!output.roleMembers) output.roleMembers = {};
  if (!output.roleMembers[role]) output.roleMembers[role] = [];
  output.playerRole[playerId] = role;
  output.byPlayer[playerId] = role;
  output.roleMembers[role].push({ playerId, name: name || 'Someone', group: groupLabel });
  const entry = `${name || 'Someone'} (${role})`;
  const lines = String(output.rolesList || '').split('\n').filter(Boolean);
  const at = lines.findIndex(line => line.startsWith(`${groupLabel}:`));
  if (at === -1) lines.push(`${groupLabel}: ${entry}`);
  else lines[at] = `${lines[at]}, ${entry}`;
  output.rolesList = lines.join('\n');
  return role;
}

/**
 * The projector's role board rebuilt from a finished split plus role
 * output (the live board comes from phaseState, which a random deal
 * never keeps). Same shape as team-roles' buildRoleBoard.
 */
export function boardFromTeams(teamData, playerRole) {
  const teams = (teamData && teamData.teams) || {};
  const groups = Object.entries(teams).map(([label, members]) => ({
    label,
    picks: members.map(m => ({ name: m.name || '?', role: (playerRole || {})[m.playerId] || null }))
  }));
  const total = groups.reduce((n, g) => n + g.picks.length, 0);
  return { groups, placed: Object.keys(playerRole || {}).length, total };
}

/**
 * Seat a newcomer in a checklist's live state: their team's list, or a
 * new solo list when the step runs without teams. Mutates state. Returns
 * the group key.
 */
export function seatInChecklistState(state, playerId, name, groupKey) {
  if (!state || !state.groups) return null;
  const blank = () => Array.from({ length: (state.items || []).length }, () => null);
  const key = state.solo ? playerId : groupKey;
  if (key == null) return null;
  if (!state.groups[key]) {
    state.groups[key] = { label: state.solo ? (name || '?') : key, memberIds: [], checked: blank() };
  }
  const group = state.groups[key];
  if (!group.memberIds.includes(playerId)) group.memberIds.push(playerId);
  state.playerGroup[playerId] = key;
  return key;
}
