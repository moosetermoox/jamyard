import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { armPhaseTimer } from '../phase-timer.js';
import { buildGroups } from '../phases/pairing.js';

/**
 * merge — the Connection Pack's cooperation primitive
 * (docs/connection-pack-spec.md §3.4, think-pair-share).
 *
 * Group members see each other's answers (seeds) and write ONE shared
 * answer in a live text box (last-write-wins, debounced client-side).
 * Submitting requires `agreeMode`:
 *   - "both"  (default): every member taps Agree; editing resets agreement
 *   - "any":   one member can submit for the group
 *   - "timer": only the timer or the host's force-close submits
 *
 * Grouping:
 *   - groupSize 2 (default): eligible players are shuffled and greedy-paired
 *     (odd class → one triple; nobody sits out of consensus building)
 *   - groupSize 4: seeds must come from an earlier merge — adjacent prior
 *     groups are joined deterministically (a leftover group joins the last
 *     quad rather than refining alone)
 *
 * Output: `merged: [{groupId, text, members}]` — capability responseArray,
 * so downstream reveal/rank/vote consume it exactly like collect.responses.
 *
 * @typedef {Object} MergeGroup
 * @property {string} groupId
 * @property {string[]} members   Player ids (socket ids)
 * @property {Array<{author: string|null, text: string}>} seeds
 * @property {string} draft       The shared text (one writer at a time)
 * @property {string|null} penHolder  Who may edit right now; null = pen is free.
 *                                    The pen is claimed by writing, released by
 *                                    agreeing, and goes stale after idle (the
 *                                    server checks lazily against penAt).
 * @property {number} penAt       Last accepted edit/claim (Date.now())
 * @property {Set<string>} agreed Player ids who tapped Agree on the current draft
 * @property {boolean} submitted
 *
 * @typedef {Object} MergePhaseState
 * @property {string} phaseId
 * @property {'merge'} kind
 * @property {MergeGroup[]} groups
 * @property {Object<string, MergeGroup>} byPlayer  playerId → their group
 * @property {'both'|'any'|'timer'} agreeMode
 * @property {NodeJS.Timeout|null} timer
 * @property {() => void} cleanup
 */

// How many Agrees a group needs before it auto-submits.
export function agreesNeeded(agreeMode, memberCount) {
  if (agreeMode === 'any') return 1;
  if (agreeMode === 'timer') return Infinity; // only timer/host close submits
  return memberCount; // 'both' (and triples: all three)
}

/**
 * Build merge groups + their seeds from the seed items.
 * Pure — unit-tested directly.
 *
 * @param {Array} seedItems        Resolved seedFrom array (collect responses
 *                                 or a prior merge's merged items)
 * @param {Array<{id: string, name: string}>} eligible
 * @param {2|4} groupSize
 * @param {string[]} shuffledIds   Pre-shuffled eligible ids (for groupSize 2)
 * @returns {{ groups: Array<{members: string[], seeds: Array<{author: string|null, text: string}>}> }}
 */
export function buildMergeGroups(seedItems, eligible, groupSize, shuffledIds) {
  if (groupSize === 4) {
    // Quads join adjacent prior groups. Seed items must carry `members`
    // (a prior merge's output does).
    const priorGroups = (seedItems || []).filter(it => it && Array.isArray(it.members));
    if (priorGroups.length === 0) {
      throw new Error('groupSize 4 needs seeds from an earlier merge step (items with members).');
    }
    const eligibleIds = new Set(eligible.map(p => p.id));
    const chunks = [];
    for (let i = 0; i < priorGroups.length; i += 2) {
      chunks.push(priorGroups.slice(i, i + 2));
    }
    // A leftover single group joins the last quad instead of refining alone.
    if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) {
      chunks[chunks.length - 2].push(...chunks.pop());
    }
    const groups = chunks.map(chunk => ({
      members: [...new Set(chunk.flatMap(g => g.members))].filter(id => eligibleIds.has(id)),
      seeds: chunk.map(g => ({ author: null, text: String(g.text || '') }))
    })).filter(g => g.members.length > 0);
    return { groups };
  }

  // groupSize 2/3: group the players; each member's own seed item (if any)
  // becomes a named seed.
  const byPlayer = {};
  for (const it of seedItems || []) {
    if (it && it.playerId) byPlayer[it.playerId] = it;
  }
  const nameOf = new Map(eligible.map(p => [p.id, p.name]));

  let idGroups;
  if (groupSize === 3) {
    // Trios — the canonical size for consulting/listening protocols (one
    // speaks, two listen). Remainder rule, never a singleton: n%3 === 2
    // leaves one pair; n%3 === 1 folds the leftover into the last trio
    // (a four beats someone alone).
    idGroups = [];
    const ids = shuffledIds.slice();
    while (ids.length >= 3) idGroups.push(ids.splice(0, 3));
    if (ids.length === 2) idGroups.push(ids.splice(0, 2));
    else if (ids.length === 1) {
      if (idGroups.length > 0) idGroups[idGroups.length - 1].push(ids.pop());
      else idGroups.push(ids.splice(0, 1)); // 1-2 player room: better than nobody
    }
  } else {
    ({ groups: idGroups } = buildGroups(shuffledIds, { oddHandling: 'triple' }));
  }

  const groups = idGroups.map(members => ({
    members,
    seeds: members
      .filter(id => byPlayer[id] && typeof byPlayer[id].text === 'string' && byPlayer[id].text.length > 0)
      .map(id => ({ author: nameOf.get(id) || null, text: byPlayer[id].text }))
  }));
  return { groups };
}

registerHandler('merge', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const sc = ctx.resolveScreenControl();
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const groupSize = phase.groupSize === 4 ? 4 : phase.groupSize === 3 ? 3 : 2;
    const agreeMode = ['any', 'timer'].includes(phase.agreeMode) ? phase.agreeMode : 'both';
    const instruction = ctx.resolveTemplate(
      phase.instruction || 'Combine your answers into one stronger answer.'
    );

    const seedItems = phase.seedFrom ? engine.resolve(phase.seedFrom) : [];
    if (!Array.isArray(seedItems)) {
      throw new Error(
        `Merge "${phase.id}": seedFrom "${phase.seedFrom}" did not resolve to a list of answers.`
      );
    }

    // Shuffle eligible ids for fresh pairing (groupSize 2 path)
    const shuffledIds = eligible.map(p => p.id);
    for (let i = shuffledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
    }

    const { groups: rawGroups } = buildMergeGroups(seedItems, eligible, groupSize, shuffledIds);
    if (rawGroups.length === 0) {
      throw new Error(`Merge "${phase.id}": no groups could be formed (no eligible players?).`);
    }

    /** @type {MergePhaseState} */
    const state = {
      phaseId: phase.id,
      kind: 'merge',
      agreeMode,
      groups: rawGroups.map((g, i) => ({
        groupId: `g${i + 1}`,
        members: g.members,
        seeds: g.seeds,
        draft: '',
        penHolder: null,
        penAt: 0,
        agreed: new Set(),
        submitted: false
      })),
      byPlayer: {},
      timer: null,
      cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
    };
    for (const g of state.groups) {
      for (const id of g.members) state.byPlayer[id] = g;
    }
    room.phaseState = state;

    console.log(`[handlePhase] Merge: ${state.groups.length} groups of ~${groupSize}, agreeMode=${agreeMode}`);

    ctx.emitToHost(EVENTS.MERGE_PROGRESS, {
      instruction,
      totalGroups: state.groups.length,
      submittedGroups: 0,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    const groupedIds = new Set(Object.keys(state.byPlayer));
    const nameOf = new Map(engine.players.list().map(p => [p.id, p.name]));
    for (const player of engine.players.list()) {
      const group = state.byPlayer[player.id];
      if (group) {
        ctx.emitToPlayer(player.id, EVENTS.MERGE_START, {
          instruction,
          seeds: group.seeds,
          draft: group.draft,
          memberNames: group.members.map(id => nameOf.get(id) || 'Someone'),
          agreeMode,
          agreedCount: 0,
          agreesNeeded: agreeMode === 'timer' ? null : agreesNeeded(agreeMode, group.members.length),
          timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else if (!groupedIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Groups are merging their answers, hang tight...' });
      }
    }

    if (phase.timer) {
      armPhaseTimer(room, phase.timer, () => ctx.services.closeMerge(room.code || code, room));
    }
  },

  onReconnect(ctx, socket) {
    const state = ctx.room.phaseState;
    if (!state || state.kind !== 'merge') return;
    const sc = ctx.resolveScreenControl();
    const group = state.byPlayer[socket.id];
    if (!group) {
      socket.emit(EVENTS.WAITING, { message: 'Groups are merging their answers, hang tight...' });
      return;
    }
    if (group.submitted) {
      socket.emit(EVENTS.WAITING, { message: 'Merged! Waiting for the other groups...' });
      return;
    }
    const nameOf = new Map(ctx.engine.players.list().map(p => [p.id, p.name]));
    const penHeld = !!group.penHolder;
    socket.emit(EVENTS.MERGE_START, {
      instruction: ctx.resolveTemplate(ctx.phase.instruction || 'Combine your answers into one stronger answer.'),
      seeds: group.seeds,
      draft: group.draft,
      memberNames: group.members.map(id => nameOf.get(id) || 'Someone'),
      agreeMode: state.agreeMode,
      agreedCount: group.agreed.size,
      agreesNeeded: state.agreeMode === 'timer' ? null : agreesNeeded(state.agreeMode, group.members.length),
      penHeld,
      penMine: group.penHolder === socket.id,
      penHolderName: penHeld ? (nameOf.get(group.penHolder) || 'Someone') : null,
      timer: null,
      playerTemplate: sc.playerTemplate, show: sc.playerShow
    });
  }
});
