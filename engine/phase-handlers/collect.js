import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

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

  const assignment = {};
  for (let i = 0; i < N; i++) {
    const senderIdx = ((i - offset) % N + N) % N;
    const senderId = orderedIds[senderIdx];
    const item = sourceByPlayer[senderId];
    if (item !== undefined) {
      assignment[orderedIds[i]] = item;
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
  engine.storePhaseData(phase.rotateFrom, { ...existing, assigned: assignment });
  return assignment;
}

/**
 * Build a pairwise assignment for a collect phase with `assign: "pairwise"`.
 *
 * Eligible players are shuffled and paired into groups of 2. Each pair is
 * assigned one item (prompt) from `pairsFrom.responses`. Each player in the
 * pair sees the same prompt and writes their own answer. If there are an odd
 * number of eligible players, the last player is unpaired and is silently
 * skipped (no prompt shown — they get the standard waiting screen).
 *
 * Writes `assigned[playerId] = promptText` to the SOURCE phase so the standard
 * `{{<source>.assigned}}` template token works. Writes `pairs` to THIS phase's
 * own data so a downstream vote with `matchupsFromPairs` can consume it.
 */
function buildPairwiseAssignment(ctx) {
  const { phase, engine } = ctx;
  if (phase.assign !== 'pairwise') return null;
  const sourceId = phase.pairsFrom;
  if (!sourceId) {
    console.warn(`[collect:${phase.id}] assign:"pairwise" requires "pairsFrom" — skipping`);
    return null;
  }
  const sourceData = engine.phaseData[sourceId];
  if (!sourceData) {
    console.warn(`[collect:${phase.id}] pairsFrom "${sourceId}" has no data yet — skipping pairing`);
    return null;
  }

  // Items can come from collect (.responses) or ai-process (.result is a JSON array)
  let rawItems = null;
  if (Array.isArray(sourceData.responses)) rawItems = sourceData.responses;
  else if (Array.isArray(sourceData.result)) rawItems = sourceData.result;
  if (!rawItems) {
    console.warn(`[collect:${phase.id}] pairsFrom "${sourceId}" has no array of items (.responses or .result) — skipping pairing`);
    return null;
  }

  const items = rawItems
    .map(r => (typeof r === 'string' ? r : r && (r.text || r.prompt || r.question)))
    .filter(t => typeof t === 'string' && t.length > 0);
  if (items.length === 0) return null;

  const from = phase.from || 'all';
  const eligible = ctx.getEligibleVoters(from);
  // Stable shuffle of player ids
  const playerIds = eligible.map(p => p.id);
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }

  const pairs = [];
  const assignment = {};
  for (let i = 0; i + 1 < playerIds.length; i += 2) {
    const a = playerIds[i];
    const b = playerIds[i + 1];
    const promptText = items[(i / 2) % items.length];
    pairs.push({ promptText, playerIds: [a, b] });
    assignment[a] = promptText;
    assignment[b] = promptText;
  }
  // Odd player gets nothing — explicit, not silent
  if (playerIds.length % 2 === 1) {
    console.log(`[collect:${phase.id}] odd player count (${playerIds.length}) — last player unpaired and skipped this round`);
  }

  // Write assigned[] to source so {{source.assigned}} resolves per-player
  const existingSource = engine.phaseData[sourceId] || {};
  engine.storePhaseData(sourceId, { ...existingSource, assigned: { ...(existingSource.assigned || {}), ...assignment } });

  // Write pairs to this phase so a downstream vote with matchupsFromPairs reads them
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

    // Send prompt to host
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt, image, video, timer: phase.timer || null, fields: phase.fields || null,
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
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, video, timer: null,
        fields: ctx.phase.fields || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
