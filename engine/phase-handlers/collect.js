/**
 * Phase handler: collect — gather free-text answers from players.
 *
 * The workhorse input phase. Beyond a plain text box it supports: multi-field
 * inputs, rotation chains (`rotateFrom` — each player gets another's prior item,
 * powers SCAMPER), pairwise assignment for bluffing/pair games, a Pass button,
 * and simultaneous (counts-only, no-names) reveal. Output `responses` is what
 * AI processing and most downstream phases read.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { buildGroups, buildAvoidSet } from '../phases/pairing.js';

/**
 * Build the rotation assignment map for a collect phase that has
 * `rotateFrom: "source-phase-id"` set.
 *
 * Each eligible player is assigned the item that the player at
 * (myIndex - offset) had in the source phase. Eligible players whose
 * source-phase counterpart had no item get nothing (skipped silently).
 *
 * Returns an `{ playerId: text }` map and writes it to phaseData
 * under the current phase's `assigned` field so {{X.assigned}} can
 * resolve via the standard byPlayer lookup.
 */
function buildRotationAssignment(ctx) {
  const { phase, engine } = ctx;
  if (!phase.rotateFrom) return null;

  const sourceData = engine.phaseData[phase.rotateFrom];
  if (!sourceData) {
    console.warn(`[collect:${phase.id}] rotateFrom "${phase.rotateFrom}" has no data yet — skipping rotation`);
    return {};
  }

  // Build a byPlayer view of the source. ai-process perPlayer already
  // stores byPlayer; collect now stores it too. Fall back to walking
  // responses array if neither exists.
  let sourceByPlayer = sourceData.byPlayer;
  if (!sourceByPlayer && Array.isArray(sourceData.responses)) {
    sourceByPlayer = {};
    for (const r of sourceData.responses) {
      if (r && r.playerId) sourceByPlayer[r.playerId] = r.text;
    }
  }
  if (!sourceByPlayer) {
    console.warn(`[collect:${phase.id}] rotateFrom "${phase.rotateFrom}" has no byPlayer data`);
    return {};
  }

  const offset = Math.max(1, parseInt(phase.rotateOffset, 10) || 1);
  const from = phase.from || 'all';
  const eligible = ctx.getEligibleVoters(from);
  const orderedIds = eligible.map(p => p.id);
  const N = orderedIds.length;
  if (N === 0) return {};

  // Drawing sources also rotate their strokes (byPlayerDrawing) so the
  // recipient can see — or continue — the actual picture, not "[drawing]".
  const sourceDrawings = sourceData.byPlayerDrawing || null;

  const assignment = {};
  const drawingAssignment = {};
  for (let i = 0; i < N; i++) {
    const senderIdx = ((i - offset) % N + N) % N;
    const senderId = orderedIds[senderIdx];
    const item = sourceByPlayer[senderId];
    if (item !== undefined) {
      assignment[orderedIds[i]] = item;
      if (sourceDrawings && sourceDrawings[senderId]) {
        drawingAssignment[orderedIds[i]] = sourceDrawings[senderId];
      }
    }
  }

  // Persist assignment under the SOURCE phase so {{<source>.assigned}}
  // resolves naturally — the template author writes "{{initial-idea.assigned}}"
  // when they're in a step that rotates from initial-idea, and the per-player
  // resolver reads engine.phaseData['initial-idea'].assigned[playerId].
  //
  // (One source can only be actively rotated by one downstream phase at a
  // time in a linear chain, so this doesn't conflict.)
  const existing = engine.phaseData[phase.rotateFrom] || {};
  engine.storePhaseData(phase.rotateFrom, {
    ...existing,
    assigned: assignment,
    ...(sourceDrawings ? { assignedDrawing: drawingAssignment } : {})
  });
  return assignment;
}

/**
 * Build a pairwise assignment for a collect phase with `assign: "pairwise"`.
 *
 * Two independent axes (docs/connection-pack-spec.md §2.4):
 *
 *   GROUPING — where the pairs come from:
 *     - default: shuffle eligible players, greedy-pair them
 *     - `rotatePairsFrom: "<phaseId>"` — fresh pairing that avoids repeat
 *       partners from the named pairwise step (greedy non-repeat)
 *     - `reusePairsFrom: "<phaseId>"` — exactly the same groups as the
 *       named pairwise step (same partner, next prompt)
 *     - `oddHandling: "triple"` — odd class forms one group of three
 *       instead of benching the leftover player (default "sit-out")
 *
 *   PROMPT — what each pair is asked:
 *     - `pairsFrom: "<phaseId>"` — one item per pair drawn from that
 *       step's responses/result; written to the source's `assigned` map
 *       so `{{<source>.assigned}}` resolves per player
 *     - no pairsFrom — every pair gets this step's own resolved prompt
 *
 * Writes `pairs` to THIS phase's data so downstream consumers
 * (vote.matchupsFromPairs, reveal scope:"pair") can read the grouping.
 */
function buildPairwiseAssignment(ctx) {
  const { phase, engine } = ctx;
  if (phase.assign !== 'pairwise') return null;

  const from = phase.from || 'all';
  const eligible = ctx.getEligibleVoters(from);
  if (eligible.length === 0) return null;

  // --- Prompt items (optional) -------------------------------------
  let items = null;
  if (phase.pairsFrom) {
    const sourceData = engine.phaseData[phase.pairsFrom];
    if (!sourceData) {
      console.warn(`[collect:${phase.id}] pairsFrom "${phase.pairsFrom}" has no data yet — skipping pairing`);
      return null;
    }
    // Items can come from collect (.responses) or ai-process (.result is a JSON array)
    let rawItems = null;
    if (Array.isArray(sourceData.responses)) rawItems = sourceData.responses;
    else if (Array.isArray(sourceData.result)) rawItems = sourceData.result;
    if (!rawItems) {
      console.warn(`[collect:${phase.id}] pairsFrom "${phase.pairsFrom}" has no array of items (.responses or .result) — skipping pairing`);
      return null;
    }
    items = rawItems
      .map(r => (typeof r === 'string' ? r : r && (r.text || r.prompt || r.question)))
      .filter(t => typeof t === 'string' && t.length > 0);
    if (items.length === 0) return null;
  }

  // --- Grouping ------------------------------------------------------
  let groups = null;
  let leftover = null;

  if (phase.reusePairsFrom) {
    const reuseData = engine.phaseData[phase.reusePairsFrom];
    if (reuseData && Array.isArray(reuseData.pairs) && reuseData.pairs.length > 0) {
      // Keep the same groups, dropping anyone no longer eligible (left/kicked)
      const eligibleIds = new Set(eligible.map(p => p.id));
      groups = reuseData.pairs
        .map(p => (p.playerIds || []).filter(id => eligibleIds.has(id)))
        .filter(g => g.length > 0);
    } else {
      console.warn(`[collect:${phase.id}] reusePairsFrom "${phase.reusePairsFrom}" has no pairs — building a fresh pairing instead`);
    }
  }

  if (!groups) {
    // Stable shuffle of player ids
    const playerIds = eligible.map(p => p.id);
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
    }

    let avoid = new Set();
    if (phase.rotatePairsFrom) {
      const rotData = engine.phaseData[phase.rotatePairsFrom];
      if (rotData && Array.isArray(rotData.pairs)) {
        avoid = buildAvoidSet(rotData.pairs);
      } else {
        console.warn(`[collect:${phase.id}] rotatePairsFrom "${phase.rotatePairsFrom}" has no pairs — pairing without an avoid-set`);
      }
    }

    const built = buildGroups(playerIds, { oddHandling: phase.oddHandling, avoid });
    groups = built.groups;
    leftover = built.leftover;
  }

  if (groups.length === 0) return null;
  if (leftover) {
    console.log(`[collect:${phase.id}] odd player count (${eligible.length}) — last player unpaired and skipped this round`);
  }

  // --- Assemble pairs + per-player prompt assignment ------------------
  // No pairsFrom → every pair shares this step's own resolved prompt
  // (becomes {{_pair.prompt}} in a downstream pair reveal).
  const ownPrompt = items ? null : ctx.resolveTemplate(phase.prompt || '');
  const pairs = [];
  const assignment = {};
  groups.forEach((memberIds, gi) => {
    const promptText = items ? items[gi % items.length] : ownPrompt;
    pairs.push({ promptText, playerIds: memberIds });
    if (items) {
      for (const id of memberIds) assignment[id] = promptText;
    }
  });

  // Write assigned[] to source so {{source.assigned}} resolves per-player
  // (only meaningful when items came from a source step).
  if (phase.pairsFrom && items) {
    const existingSource = engine.phaseData[phase.pairsFrom] || {};
    engine.storePhaseData(phase.pairsFrom, { ...existingSource, assigned: { ...(existingSource.assigned || {}), ...assignment } });
  }

  // Write pairs to this phase so downstream consumers read the grouping
  const existingSelf = engine.phaseData[phase.id] || {};
  engine.storePhaseData(phase.id, { ...existingSelf, pairs });

  return { pairs, assignment };
}

registerHandler('collect', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();

    // Clear previous responses for multi-round games
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined });
    }

    // Build rotation assignment (no-op if rotateFrom isn't set)
    buildRotationAssignment(ctx);

    // Build pairwise assignment (no-op if assign:"pairwise" isn't set)
    const pairwise = buildPairwiseAssignment(ctx);
    const pairedIds = pairwise
      ? new Set(pairwise.pairs.flatMap(p => p.playerIds))
      : null;

    // Resolve {{...}} refs in the prompt once for the host (no `.mine`/`.assigned` recipient yet)
    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId, ctx.room.gameSource);
    const video = ctx.services.resolveVideoEmbed(phase.video);

    // Rotated drawings (strokes) travel outside the text prompt — the
    // player screen preloads them onto the pad (drawing input: continue
    // it) or shows them read-only above a text box (caption it).
    const rotatedDrawings = phase.rotateFrom
      ? (engine.phaseData[phase.rotateFrom] || {}).assignedDrawing || null
      : null;
    const inputType = phase.inputType === 'drawing' ? 'drawing' : 'text';

    // Send prompt to host
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt, image, video, timer: phase.timer || null, fields: phase.fields || null,
      inputType,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send prompt to eligible players — resolve `{{X.mine}}` and `{{X.assigned}}` per-recipient.
    // For pairwise, players who weren't paired (odd count) skip the prompt and wait.
    for (const player of eligible) {
      if (pairedIds && !pairedIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Sitting out this round — waiting for others...' });
        continue;
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, video, timer: phase.timer || null, fields: phase.fields || null,
        inputType,
        assignedDrawing: (rotatedDrawings && rotatedDrawings[player.id]) || null,
        passAllowed: !!phase.passAllowed,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }

    // Send waiting to non-eligible players
    for (const player of engine.players.list()) {
      if (!eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for other players...' });
      }
    }
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    const player = ctx.engine.players.find(socket.id);
    if (player && player.response) {
      socket.emit(EVENTS.WAITING, { message: 'Answer submitted. Waiting for others...' });
    } else {
      const playerPrompt = player
        ? ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, player.id)
        : ctx.resolveTemplate(ctx.phase.prompt || '');
      const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
      const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
      const reconRotated = ctx.phase.rotateFrom
        ? (ctx.engine.phaseData[ctx.phase.rotateFrom] || {}).assignedDrawing || null
        : null;
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, video, timer: null,
        fields: ctx.phase.fields || null,
        inputType: ctx.phase.inputType === 'drawing' ? 'drawing' : 'text',
        assignedDrawing: (player && reconRotated && reconRotated[player.id]) || null,
        passAllowed: !!ctx.phase.passAllowed,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
