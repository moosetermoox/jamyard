/**
 * Phase handler: assign — hand out choices (2026-09-16).
 *
 * After a rank step, every group (when that rank step ranked as groups)
 * or every student gets ONE of the ranked items: first choices first,
 * spots per item spread evenly, the pure rules in
 * engine/phases/choice-draft.js. A compute step like team-roles' random
 * deal: the hand-out is stored and shown at once, the projector holds it
 * until the teacher continues (payoff beats are host-paced), each student
 * sees their own (group's) item.
 *
 * Output { assignments, byPlayer, byChoice, choiceRank, assignedList,
 * choices, spots, perGroup, board }: byPlayer means {{stepId.mine}}
 * resolves to "your choice" in later announces and prompts.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { draftChoices, buildAssignOutput } from '../phases/choice-draft.js';
import { groupsFromTeamSource } from '../phases/groups-from.js';

/**
 * The units the draft hands items to: the rank step's groups when it
 * ranked as groups (every group in the split, ranked or not), else every
 * player in the room, keyed by id, labelled by name.
 */
export function assignUnits(engine, rankPhase, rankData) {
  const nameOf = id => (engine.players.find(id) || {}).name || 'Someone';
  if (rankPhase && rankPhase.teamsFrom && rankData && rankData.byGroup) {
    const { groups } = groupsFromTeamSource(engine, rankPhase, engine.players.list());
    const units = {};
    const prefs = {};
    for (const [key, g] of Object.entries(groups)) {
      units[key] = { label: g.label, memberIds: g.memberIds.slice(), memberNames: g.memberIds.map(nameOf) };
      prefs[key] = Array.isArray(rankData.byGroup[g.label]) ? rankData.byGroup[g.label] : [];
    }
    return { units, prefs, perGroup: true };
  }
  const units = {};
  const prefs = {};
  const responses = (rankData && rankData.responses) || {};
  for (const player of engine.players.list()) {
    units[player.id] = { label: player.name || 'Someone', memberIds: [player.id], memberNames: [] };
    prefs[player.id] = Array.isArray(responses[player.id]) ? responses[player.id] : [];
  }
  return { units, prefs, perGroup: false };
}

function hostPayload(ctx, data) {
  const sc = ctx.resolveScreenControl();
  const message = typeof ctx.phase.message === 'string' && ctx.phase.message.trim()
    ? ctx.resolveTemplate(ctx.phase.message) : null;
  return {
    // Names go to the projector (same visibility as the team-split board), ids never
    board: (data.board || []).map(r => ({ label: r.label, choice: r.choice, choiceRank: r.choiceRank, members: r.members || [] })),
    assignedList: data.assignedList || '',
    perGroup: data.perGroup !== false,
    message,
    hostTemplate: sc.hostTemplate, show: sc.hostShow
  };
}

function playerPayload(ctx, data, playerId) {
  const sc = ctx.resolveScreenControl();
  const choice = data.byPlayer ? data.byPlayer[playerId] : undefined;
  let groupLabel = null;
  let choiceRank = null;
  if (choice !== undefined && Array.isArray(data.board)) {
    const row = data.board.find(r => Array.isArray(r.memberIds) && r.memberIds.includes(playerId));
    if (row) {
      groupLabel = data.perGroup === false ? null : row.label;
      choiceRank = row.choiceRank === undefined ? null : row.choiceRank;
    }
  }
  return {
    mine: choice === undefined ? null : choice,
    perGroup: data.perGroup !== false,
    groupLabel,
    choiceRank,
    playerTemplate: sc.playerTemplate, show: sc.playerShow
  };
}

registerHandler('assign', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const rankPhase = phase.from ? engine.config.phases[phase.from] : null;
    const rankData = phase.from ? engine.phaseData[phase.from] : null;
    const choices = rankData && Array.isArray(rankData.candidates) ? rankData.candidates.filter(c => typeof c === 'string' && c.trim()) : [];

    // Nothing ranked (the rank step skipped itself, or the ref is stale):
    // skip rather than strand the class on an empty board.
    if (choices.length === 0) {
      console.warn(`[assign:${phase.id}] nothing to hand out from "${phase.from}", skipping the step`);
      engine.storePhaseData(phase.id, {
        assignments: {}, byPlayer: {}, byChoice: {}, choiceRank: {}, assignedList: '', choices: [], spots: 0, perGroup: false, board: []
      });
      const nextId = ctx.getNextPhaseId();
      if (nextId) await ctx.advanceTo(nextId);
      return;
    }

    const { units, prefs, perGroup } = assignUnits(engine, rankPhase, rankData);
    const draft = draftChoices(prefs, choices, { perChoice: phase.perChoice });
    const output = buildAssignOutput(draft, units, choices, { perGroup });
    engine.storePhaseData(phase.id, output);
    console.log(`[handlePhase] Assign: ${choices.length} choices handed to ${Object.keys(units).length} ${perGroup ? 'group(s)' : 'student(s)'}, ${output.spots} spot(s) each`);

    ctx.emitToHost(EVENTS.ASSIGN_FINAL, hostPayload(ctx, output));
    ctx.emitToTeachers(EVENTS.ASSIGN_FINAL, { board: hostPayload(ctx, output).board, perGroup });
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.ASSIGN_FINAL, playerPayload(ctx, output, player.id));
    }
  },

  onReconnect(ctx, socket) {
    const data = ctx.engine.getPhaseData(ctx.phase.id);
    if (!data || !data.byPlayer) return;
    if (ctx.services.roomToHost.get(ctx.code) === socket.id) {
      socket.emit(EVENTS.ASSIGN_FINAL, hostPayload(ctx, data));
    } else {
      socket.emit(EVENTS.ASSIGN_FINAL, playerPayload(ctx, data, socket.id));
    }
  }
});
