/**
 * Resolve a step's `teamsFrom` into the {groups, playerGroup} shape the
 * group-aware steps work on (team-roles, rank as groups, hand out
 * choices). The source is a team-split's stored {teams} or a pairwise
 * collect's {pairs} (through the pairs/teams bridge). Falls back to one
 * whole-class group (with a warn) when the source has no team or pair
 * data, so the activity still runs.
 *
 * Moved out of the team-roles handler on 2026-09-16 when rank and assign
 * started reading the same sources.
 */
import { pairsAsTeams } from './checklist-state.js';

/**
 * @param {object} engine       the room's GameEngine (phaseData + players)
 * @param {object} phase        the step carrying `teamsFrom`
 * @param {Array<{id: string}>} eligible  the players a whole-class fallback covers
 * @returns {{ groups: Record<string, {label: string, memberIds: string[]}>, playerGroup: Record<string, string>, fromTeams: boolean }}
 */
export function groupsFromTeamSource(engine, phase, eligible) {
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
    return { groups, playerGroup, fromTeams: true };
  }
  console.warn(`[${phase.type}:${phase.id}] teamsFrom "${phase.teamsFrom}" has no teams or pairs data, treating the class as one group`);
  groups['The class'] = { label: 'The class', memberIds: (eligible || []).map(p => p.id) };
  for (const p of eligible || []) playerGroup[p.id] = 'The class';
  return { groups, playerGroup, fromTeams: false };
}
