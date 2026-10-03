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
 * An array item may be an object {text, role} — role-tagged for a
 * rolesFrom checklist; this function keeps just the text.
 * @returns {string[]}
 */
export function normalizeChecklistItems(items) {
  return normalizeChecklistItemsWithRoles(items).texts;
}

/**
 * Same normalization, but keeping each item's role tag (null when the
 * item is untagged or the input was a plain string list). texts and
 * roles stay index-aligned through trimming and blank-dropping.
 *
 * With `knownRoles` (the team-roles step's lineup), a plain line that
 * starts with one of those jobs and a colon ("Recorder: write it down")
 * is that job's task (2026-09-13: the make page edits tasks as plain
 * lines, so the tag has to come from the words). Case-insensitive; a
 * colon after anything else ("Final check: ...") tags nothing.
 * @param {Array|string} items
 * @param {string[]} [knownRoles]
 * @returns {{texts: string[], roles: (string|null)[]}}
 */
export function normalizeChecklistItemsWithRoles(items, knownRoles) {
  let list = items;
  if (typeof items === 'string') {
    list = items.split(/\r?\n/);
    if (list.length === 1) list = items.split(',');
  }
  if (!Array.isArray(list)) return { texts: [], roles: [] };
  const known = Array.isArray(knownRoles)
    ? knownRoles.map((r) => String(r || '').trim()).filter(Boolean)
    : [];
  const texts = [];
  const roles = [];
  for (const raw of list) {
    const isObj = raw && typeof raw === 'object';
    const text = String(isObj ? (raw.text || '') : raw).trim();
    if (!text) continue;
    let role = isObj && raw.role ? String(raw.role).trim() || null : null;
    if (!role && known.length > 0) {
      const colon = text.indexOf(':');
      if (colon > 0) {
        const head = text.slice(0, colon).trim().toLowerCase();
        const hit = known.find((r) => r.toLowerCase() === head);
        if (hit) role = hit;
      }
    }
    texts.push(text);
    roles.push(role);
  }
  return { texts, roles };
}

/**
 * Adapt a pairwise collect's pairs into the teams shape checklist groups
 * are built from (2026-08-26 pairs/teams bridge: partner task lists).
 * Groups are labeled by member names ("Maya & Sam"); colliding labels get
 * a numeric suffix so group keys stay unique.
 *
 * @param {Array<{playerIds?: string[]}>|null} pairs
 * @param {(id: string) => string|undefined} nameOf
 * @returns {{teams: Record<string, {playerId:string,name:string}[]>}|null}
 */
export function pairsAsTeams(pairs, nameOf) {
  const teams = {};
  for (const pair of pairs || []) {
    const members = (pair.playerIds || []).map(id => ({
      playerId: id,
      name: nameOf(id) || 'Someone'
    }));
    if (members.length === 0) continue;
    const label = members.map(m => m.name).join(' & ');
    let key = label;
    let n = 2;
    while (teams[key]) key = `${label} (${n++})`;
    teams[key] = members;
  }
  return Object.keys(teams).length > 0 ? { teams } : null;
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
 * One group's job tags (2026-10-02, an outside reviewer's jigsaw: a team of
 * two held Facilitator and Recorder, and its list still had Timekeeper's and
 * Reporter's jobs, which nobody in the team had). A task tagged with a role
 * nobody in the group holds goes to the held role with the fewest tasks so
 * far (members' order breaks ties); a group with no held role at all gets
 * the task untagged. Tags a member holds stay as written.
 *
 * @param {(string|null)[]} itemRoles  the list's tags, one per item
 * @param {string[]} memberIds
 * @param {Record<string,string>} playerRole  playerId -> role
 * @returns {(string|null)[]}
 */
export function rolesForGroup(itemRoles, memberIds, playerRole) {
  const tags = Array.isArray(itemRoles) ? itemRoles : [];
  const held = [];
  for (const id of memberIds || []) {
    const r = playerRole && playerRole[id];
    if (r && !held.includes(r)) held.push(r);
  }
  const load = new Map(held.map(r => [r, 0]));
  for (const r of tags) if (r && load.has(r)) load.set(r, load.get(r) + 1);
  return tags.map(r => {
    if (!r || load.has(r)) return r || null;
    if (held.length === 0) return null;
    let pick = held[0];
    for (const h of held) if (load.get(h) < load.get(pick)) pick = h;
    load.set(pick, load.get(pick) + 1);
    return pick;
  });
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
