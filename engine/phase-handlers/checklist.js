import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import {
  normalizeChecklistItems,
  buildChecklistGroups,
  groupProgress
} from '../phases/checklist-state.js';

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
    const items = normalizeChecklistItems(phase.items);

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
    // back to solo checklists — the activity still works.
    const teamData = phase.teamsFrom ? engine.phaseData[phase.teamsFrom] : null;
    if (phase.teamsFrom && (!teamData || !teamData.teams)) {
      console.warn(`[checklist:${phase.id}] teamsFrom "${phase.teamsFrom}" has no teams data, falling back to solo checklists`);
    }
    const usableTeams = teamData && teamData.teams ? teamData : null;

    const { groups, playerGroup } = buildChecklistGroups(items, usableTeams, eligible);
    room.phaseState = {
      kind: 'checklist',
      phaseId: phase.id,
      items,
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
      prompt, items, groups: teacherDetail(state), solo: state.solo
    });

    for (const player of engine.players.list()) {
      const view = playerChecklistView(state, player.id);
      if (view) {
        ctx.emitToPlayer(player.id, EVENTS.CHECKLIST_START, {
          prompt,
          items,
          group: view,
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'The class is working on the checklist...' });
      }
    }

    if (phase.timer) {
      state.timer = setTimeout(async () => {
        if (room.phaseState && room.phaseState.phaseId === phase.id) {
          await ctx.services.closeChecklist(room.code || code, room);
        }
      }, phase.timer * 1000);
    }
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
