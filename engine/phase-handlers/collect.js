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

    // Resolve {{...}} refs in the prompt once for the host (no `.mine`/`.assigned` recipient yet)
    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');

    const image = ctx.services.resolveImageUrl(phase.image, ctx.room.gameId);

    // Send prompt to host
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt, image, timer: phase.timer || null, fields: phase.fields || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send prompt to eligible players — resolve `{{X.mine}}` and `{{X.assigned}}` per-recipient
    for (const player of eligible) {
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, timer: phase.timer || null, fields: phase.fields || null,
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
      const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId);
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, timer: null,
        fields: ctx.phase.fields || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
