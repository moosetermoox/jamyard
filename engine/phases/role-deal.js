/**
 * Pure rules for the team-roles phase: hand every member of an existing
 * group a job (Facilitator, Recorder, Timekeeper, ...).
 *
 * Random mode deals roles round-robin after a shuffle, so the spread
 * inside each group is as even as possible. Choice mode lets students
 * claim a role with a per-group capacity of ceil(members / roles): a
 * role can repeat only once every other role in that group is equally
 * taken, and stragglers are auto-filled with the least-taken role at
 * close. Kept pure (no I/O) so capacity and balance rules are
 * unit-testable.
 *
 * State shape (choice mode, lives in room.phaseState):
 *   { kind:'team-roles', phaseId, roles, groups:{key:{label,memberIds}},
 *     playerGroup:{pid:groupKey}, picks:{pid:role}, closed }
 */

export function roleCapacity(memberCount, roleCount) {
  if (roleCount <= 0) return 0;
  return Math.ceil(memberCount / roleCount);
}

function shuffled(arr, rand) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Random mode: deal roles inside each group, round-robin over a shuffled
 * member order. Returns { playerId: role }.
 */
export function dealRoles(groups, roles, rand = Math.random) {
  const picks = {};
  for (const group of Object.values(groups)) {
    const order = shuffled(group.memberIds, rand);
    for (let i = 0; i < order.length; i++) {
      picks[order[i]] = roles[i % roles.length];
    }
  }
  return picks;
}

function countInGroup(state, groupKey, role, exceptId) {
  let n = 0;
  for (const pid of state.groups[groupKey].memberIds) {
    if (pid !== exceptId && state.picks[pid] === role) n++;
  }
  return n;
}

/**
 * Choice mode: a student claims (or re-picks) a role. Capacity is per
 * group; a re-pick frees the old role automatically since picks is one
 * value per player. Mutates state.picks on success.
 * @returns {{ok: boolean, reason?: 'closed'|'no-group'|'bad-role'|'full'}}
 */
export function claimRole(state, playerId, role) {
  if (state.closed) return { ok: false, reason: 'closed' };
  const groupKey = state.playerGroup[playerId];
  if (groupKey == null || !state.groups[groupKey]) return { ok: false, reason: 'no-group' };
  if (!state.roles.includes(role)) return { ok: false, reason: 'bad-role' };
  const cap = roleCapacity(state.groups[groupKey].memberIds.length, state.roles.length);
  if (countInGroup(state, groupKey, role, playerId) >= cap) {
    return { ok: false, reason: 'full' };
  }
  state.picks[playerId] = role;
  return { ok: true };
}

/**
 * Fill every unpicked member with the least-taken role in their group
 * (first-listed role wins ties, so the fill is deterministic). Mutates
 * state.picks.
 */
export function autoFillRoles(state) {
  for (const [groupKey, group] of Object.entries(state.groups)) {
    for (const pid of group.memberIds) {
      if (state.picks[pid]) continue;
      let best = state.roles[0];
      let bestCount = Infinity;
      for (const role of state.roles) {
        const n = countInGroup(state, groupKey, role, null);
        if (n < bestCount) { best = role; bestCount = n; }
      }
      state.picks[pid] = best;
    }
  }
  return state.picks;
}

/**
 * The stored phase output. byPlayer mirrors playerRole so {{X.mine}}
 * resolves to "your role"; rolesList reads per group:
 *   Group 1: Ana (Recorder), Ben (Facilitator)
 */
export function buildRoleOutput(state, nameOf) {
  const playerRole = { ...state.picks };
  const roleMembers = {};
  for (const role of state.roles) roleMembers[role] = [];
  const lines = [];
  for (const [groupKey, group] of Object.entries(state.groups)) {
    const parts = [];
    for (const pid of group.memberIds) {
      const role = playerRole[pid];
      if (!role) continue;
      const name = nameOf(pid) || 'Someone';
      roleMembers[role].push({ playerId: pid, name, group: group.label });
      parts.push(`${name} (${role})`);
    }
    if (parts.length > 0) lines.push(`${group.label}: ${parts.join(', ')}`);
  }
  return {
    playerRole,
    byPlayer: { ...playerRole },
    roleMembers,
    rolesList: lines.join('\n'),
    roles: state.roles.slice()
  };
}
