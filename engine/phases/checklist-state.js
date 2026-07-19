/**
 * Pure state rules for the checklist phase — a shared to-do list every
 * group works through while the projector shows a live progress dashboard.
 *
 * Groups come from an earlier team-split (`teamsFrom`); without one, every
 * player gets their own solo checklist (same dashboard, per-name). Any
 * group member may check or un-check any item (the group polices itself —
 * merge's shared-draft trust model); checks carry attribution ({playerId,
 * name}) shown to the group and the teacher console, never the projector.
 *
 * Kept pure (no I/O) so membership rules, teacher overrides, and progress
 * math are unit-testable.
 */

/**
 * Normalize the teacher's item list. Arrays are trimmed and de-blanked;
 * strings split on newlines (or commas when it's a single line — AI
 * generators emit comma-separated lists, same lesson as rank candidates).
 * @returns {string[]}
 */
export function normalizeChecklistItems(items) {
  let list = items;
  if (typeof items === 'string') {
    list = items.split(/\r?\n/);
    if (list.length === 1) list = items.split(',');
  }
  if (!Array.isArray(list)) return [];
  return list.map(s => String(s).trim()).filter(Boolean);
}

/**
 * Build the per-group checklist state.
 *
 * @param {string[]} items
 * @param {{teams: Record<string, {playerId:string,name:string}[]>}|null} teamData
 *   output of a team-split phase, or null for solo mode
 * @param {{id:string,name:string}[]} players  eligible players (solo mode)
 * @returns {{ groups: Record<string, {label:string, memberIds:string[], checked:(null|{playerId:string,name:string})[]}>,
 *             playerGroup: Record<string,string> }}
 */
export function buildChecklistGroups(items, teamData, players) {
  const groups = {};
  const playerGroup = {};
  const blank = () => Array.from({ length: items.length }, () => null);

  if (teamData && teamData.teams) {
    for (const [teamName, members] of Object.entries(teamData.teams)) {
      groups[teamName] = {
        label: teamName,
        memberIds: members.map(m => m.playerId),
        checked: blank()
      };
      for (const m of members) playerGroup[m.playerId] = teamName;
    }
  } else {
    for (const p of players || []) {
      groups[p.id] = { label: p.name, memberIds: [p.id], checked: blank() };
      playerGroup[p.id] = p.id;
    }
  }
  return { groups, playerGroup };
}

/**
 * Apply a check/un-check. Mutates state. Players may only touch their own
 * group's list; a teacher (asTeacher) may touch any group by key.
 *
 * @param {object} state    { items, groups, playerGroup, closed }
 * @param {object} action   { playerId, playerName, index, checked,
 *                            asTeacher?:boolean, groupKey?:string }
 * @returns {{ok: boolean, groupKey?: string, reason?: string}}
 */
export function applyCheck(state, action) {
  const { playerId, playerName, index, checked } = action;
  if (state.closed) return { ok: false, reason: 'closed' };

  const groupKey = action.asTeacher && action.groupKey != null
    ? action.groupKey
    : state.playerGroup[playerId];
  const group = groupKey != null ? state.groups[groupKey] : null;
  if (!group) return { ok: false, reason: 'no-group' };
  if (!Number.isInteger(index) || index < 0 || index >= group.checked.length) {
    return { ok: false, reason: 'bad-index' };
  }

  group.checked[index] = checked ? { playerId, name: playerName } : null;
  return { ok: true, groupKey };
}

/**
 * Live progress for the dashboard, in group insertion order.
 * @returns {{key:string, label:string, done:number, total:number, complete:boolean}[]}
 */
export function groupProgress(state) {
  return Object.entries(state.groups).map(([key, g]) => {
    const done = g.checked.filter(Boolean).length;
    return {
      key,
      label: g.label,
      done,
      total: g.checked.length,
      complete: g.checked.length > 0 && done === g.checked.length
    };
  });
}

/**
 * Final phase output stored at close.
 * @returns {{results: {team:string, checked:number, total:number, done:boolean}[],
 *            resultsList: string, doneCount: number, groupCount: number, itemCount: number}}
 */
export function checklistResults(state) {
  const progress = groupProgress(state);
  const results = progress.map(p => ({
    team: p.label, checked: p.done, total: p.total, done: p.complete
  }));
  return {
    results,
    resultsList: results
      .map(r => `${r.team}: ${r.checked}/${r.total}${r.done ? ' ✓' : ''}`)
      .join('\n'),
    doneCount: results.filter(r => r.done).length,
    groupCount: results.length,
    itemCount: state.items.length
  };
}
