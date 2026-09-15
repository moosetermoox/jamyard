import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { armPhaseTimer } from '../phase-timer.js';
import {
  normalizeChecklistItemsWithRoles,
  buildChecklistGroups,
  pairsAsTeams,
  groupProgress
} from '../phases/checklist-state.js';
import { seatInTeamData, seatInRoleOutput, seatInChecklistState } from '../phases/late-seating.js';

/**
 * checklist — every group works through the same teacher-written to-do
 * list; the projector shows a live per-group progress dashboard. Groups
 * come from an earlier team-split (`teamsFrom`); without one, each player
 * gets a solo checklist (same dashboard, per-name).
 *
 * Any group member may check or un-check any item (merge's shared-draft
 * trust model). Checks carry attribution shown to the group and teacher
 * console, never the projector. Closing stores per-group results and shows
 * a final summary — like sort/match, the host clicks Continue to move on.
 *
 * @typedef {Object} ChecklistState
 * @property {'checklist'} kind
 * @property {string} phaseId
 * @property {string[]} items
 * @property {Object<string, {label:string, memberIds:string[], checked:(null|{playerId:string,name:string})[]}>} groups
 * @property {Object<string,string>} playerGroup  playerId → group key
 * @property {boolean} solo
 * @property {boolean} closed
 */

// One player's view of their own group (label + who-checked-what).
export function playerChecklistView(state, playerId) {
  const key = state.playerGroup[playerId];
  const group = key != null ? state.groups[key] : null;
  if (!group) return null;
  return {
    label: state.solo ? null : group.label, // solo players don't need "Group: Maya"
    checked: group.checked
  };
}

registerHandler('checklist', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const eligible = ctx.getEligibleVoters(phase.from || 'all');

    // rolesFrom: an earlier team-roles step whose playerRole map labels
    // items as "the Recorder's job" and highlights each student's own.
    // Missing data degrades to an untagged list — the activity still works.
    // Its lineup also tags plain "Job: ..." lines (the make page's tasks).
    const roleData = phase.rolesFrom ? engine.phaseData[phase.rolesFrom] : null;
    const { texts: items, roles: itemRoles } = normalizeChecklistItemsWithRoles(
      phase.items, roleData && Array.isArray(roleData.roles) ? roleData.roles : (phase.rolesFrom ? [] : undefined));
    const playerRole = (roleData && roleData.playerRole) || {};
    if (phase.rolesFrom && !roleData) {
      console.warn(`[checklist:${phase.id}] rolesFrom "${phase.rolesFrom}" has no role data, items render untagged`);
    }

    // An unplayable list (blank editor rows, bad AI output) — skip rather
    // than strand students on an empty screen.
    if (items.length === 0) {
      console.warn(`[checklist:${phase.id}] no usable items, skipping the step`);
      const nextId = ctx.getNextPhaseId();
      if (nextId) {
        engine.storePhaseData(phase.id, {
          results: [], resultsList: '', doneCount: 0, groupCount: 0, itemCount: 0
        });
        await ctx.advanceTo(nextId);
        return;
      }
    }

    // teamsFrom pointing at missing data (skipped split, bad ref) falls
    // back to solo checklists — the activity still works. A pairwise
    // collect works too (pairs/teams bridge): its pairs become groups
    // labeled by member names.
    const teamData = phase.teamsFrom ? engine.phaseData[phase.teamsFrom] : null;
    let usableTeams = teamData && teamData.teams ? teamData : null;
    if (!usableTeams && teamData && Array.isArray(teamData.pairs)) {
      usableTeams = pairsAsTeams(teamData.pairs, id => (engine.players.find(id) || {}).name);
    }
    if (phase.teamsFrom && !usableTeams) {
      console.warn(`[checklist:${phase.id}] teamsFrom "${phase.teamsFrom}" has no teams or pairs data, falling back to solo checklists`);
    }

    const { groups, playerGroup } = buildChecklistGroups(items, usableTeams, eligible);
    room.phaseState = {
      kind: 'checklist',
      phaseId: phase.id,
      items,
      itemRoles,
      playerRole,
      groups,
      playerGroup,
      solo: !usableTeams,
      closed: false,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };
    const state = room.phaseState;

    const sc = ctx.resolveScreenControl();
    const prompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : 'Work through today\'s tasks!';
    state.prompt = prompt;

    console.log(`[handlePhase] Checklist: ${items.length} items × ${Object.keys(groups).length} ${state.solo ? 'solo' : 'group'} checklist(s)`);

    ctx.emitToHost(EVENTS.CHECKLIST_START, {
      prompt,
      itemCount: items.length,
      progress: groupProgress(state),
      solo: state.solo,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });
    ctx.emitToTeachers(EVENTS.CHECKLIST_START, {
      prompt, items, itemRoles, groups: teacherDetail(state), solo: state.solo
    });

    for (const player of engine.players.list()) {
      const view = playerChecklistView(state, player.id);
      if (view) {
        ctx.emitToPlayer(player.id, EVENTS.CHECKLIST_START, {
          prompt,
          items,
          itemRoles,
          yourRole: playerRole[player.id] || null,
          group: view,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'The class is working on the checklist...' });
      }
    }

    if (phase.timer) {
      armPhaseTimer(room, phase.timer, () => ctx.services.closeChecklist(room.code || code, room));
    }
  },

  // A student who joins mid-checklist (engine/phases/late-seating.js):
  // a seat on the smallest team in the split's stored data (or a fresh
  // solo list), the group's least-held role when the step has roles, and
  // their team's list, which onReconnect sends them next. Progress on the
  // projector and the console's group detail refresh.
  onLateJoin(ctx, playerId) {
    const { phase, engine, room } = ctx;
    const state = room.phaseState;
    if (!state || state.kind !== 'checklist' || state.closed) return null;
    const name = (engine.players.find(playerId) || {}).name || '?';
    let team = null;
    if (!state.solo) {
      const teamData = phase.teamsFrom ? engine.phaseData[phase.teamsFrom] : null;
      team = seatInTeamData(teamData, playerId, name);
      // Pair-born groups (a pairwise collect) have no seat to give
      if (!team) return null;
    }
    const key = seatInChecklistState(state, playerId, name, team);
    if (key == null) return null;
    let role = null;
    const roleData = phase.rolesFrom ? engine.phaseData[phase.rolesFrom] : null;
    if (team && roleData && Array.isArray(roleData.roles) && roleData.roles.length > 0) {
      role = seatInRoleOutput(roleData, playerId, name, team, state.groups[key].memberIds);
      if (role) {
        if (!state.playerRole) state.playerRole = {};
        state.playerRole[playerId] = role;
      }
    }
    ctx.emitToHost(EVENTS.CHECKLIST_UPDATE, { progress: groupProgress(state) });
    ctx.emitToTeachers(EVENTS.CHECKLIST_UPDATE, { groups: teacherDetail(state) });
    return { team, role, picking: false };
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'checklist') return;
    const sc = ctx.resolveScreenControl();
    if (state.closed && state.resultsPayload) {
      socket.emit(EVENTS.CHECKLIST_RESULTS, state.resultsPayload);
      return;
    }
    if (ctx.services.roomToHost.get(ctx.code) === socket.id) {
      socket.emit(EVENTS.CHECKLIST_START, {
        prompt: state.prompt || '',
        itemCount: state.items.length,
        progress: groupProgress(state),
        solo: state.solo,
        timer: null,
        hostTemplate: sc.hostTemplate, show: sc.hostShow
      });
      return;
    }
    const view = playerChecklistView(state, socket.id);
    if (view) {
      socket.emit(EVENTS.CHECKLIST_START, {
        prompt: state.prompt || '',
        items: state.items,
        itemRoles: state.itemRoles || [],
        yourRole: (state.playerRole || {})[socket.id] || null,
        group: view,
        timer: null, // reconnectors don't restart the countdown
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    } else {
      socket.emit(EVENTS.WAITING, { message: 'The class is working on the checklist...' });
    }
  }
});

// Full per-group detail for the teacher console (items + attribution).
export function teacherDetail(state) {
  return Object.entries(state.groups).map(([key, g]) => ({
    key,
    label: g.label,
    checked: g.checked
  }));
}
