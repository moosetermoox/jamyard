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
import { buildGroups, buildAvoidSet, groupsFromSource, assignPromptsToGroups } from '../phases/pairing.js';
import { resolveDisplayDrawing } from '../phases/display-drawing.js';
import { shuffleDeal } from '../phases/deal.js';
import { withoutSitOut, sitOutMessage } from '../phases/sit-out.js';
import { tailOfWords } from '../phases/append-only.js';
import { isRolling, moreInputAhead, doneMessageFor } from '../phases/rolling.js';
import { translate } from '../i18n/index.js';

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
  if (!phase.rotateFrom) return buildDealAssignment(ctx);

  const sourceData = engine.phaseData[phase.rotateFrom];
  if (!sourceData) {
    console.warn(`[collect:${phase.id}] rotateFrom "${phase.rotateFrom}" has no data yet, skipping rotation`);
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
  if (orderedIds.length === 0) return {};

  // Only classmates who actually submitted can send. The circle is dealt
  // among THEM; a receiver who submitted nothing still gets an item (a
  // random submitter's), so nobody is left drawing a placeholder because
  // a classmate was slow (Doodle Bluff's blank-truth round, 2026-09-06).
  const senders = orderedIds.filter(id => sourceByPlayer[id] !== undefined);
  const N = senders.length;
  if (N === 0) {
    console.warn(`[collect:${phase.id}] rotateFrom "${phase.rotateFrom}" has no items to deal`);
    return {};
  }

  // Drawing sources also rotate their strokes (byPlayerDrawing) so the
  // recipient can see — or continue — the actual picture, not "[drawing]".
  const sourceDrawings = sourceData.byPlayerDrawing || null;

  // rotateShuffle: deal the pool in a random circle instead of the fixed
  // join-order shift (still exactly one classmate's item each, never your
  // own; who-got-whose is unpredictable).
  const shuffledSenderOf = phase.rotateShuffle ? shuffleDeal(senders) : null;

  const assignment = {};
  const assignedFrom = {};
  const drawingAssignment = {};
  const give = (receiverId, senderId) => {
    assignment[receiverId] = sourceByPlayer[senderId];
    assignedFrom[receiverId] = senderId;
    if (sourceDrawings && sourceDrawings[senderId]) {
      drawingAssignment[receiverId] = sourceDrawings[senderId];
    }
  };
  for (let i = 0; i < N; i++) {
    const receiverId = senders[i];
    const senderId = shuffledSenderOf
      ? shuffledSenderOf[receiverId]
      : senders[((i - offset) % N + N) % N];
    give(receiverId, senderId);
  }
  for (const receiverId of orderedIds) {
    if (assignment[receiverId] !== undefined) continue;
    give(receiverId, senders[Math.floor(Math.random() * N)]);
  }

  // Persist assignment under the SOURCE phase so {{<source>.assigned}}
  // resolves naturally — the template author writes "{{initial-idea.assigned}}"
  // when they're in a step that rotates from initial-idea, and the per-player
  // resolver reads engine.phaseData['initial-idea'].assigned[playerId].
  //
  // (One source can only be actively rotated by one downstream phase at a
  // time in a linear chain, so this doesn't conflict.)
  //
  // `assignedFrom` ({recipient: sender}) records the LINK, not just the
  // text — reveal scope:"own" walks these to return each chain to its
  // author (engine/phases/chain-reveal.js).
  const existing = engine.phaseData[phase.rotateFrom] || {};
  engine.storePhaseData(phase.rotateFrom, {
    ...existing,
    assigned: assignment,
    assignedFrom,
    ...(sourceDrawings ? { assignedDrawing: drawingAssignment } : {})
  });
  return assignment;
}

/**
 * A student who arrives (or comes back under a new id) AFTER the deal was
 * made has no item; hand them one now, in place, so their prompt and their
 * later round have a truth. Rotation: a random submitter's item, never
 * their own. dealItems: a random entry from the list.
 */
function ensureLateAssignment(ctx, playerId) {
  const { phase, engine } = ctx;
  if (!playerId) return;
  if (phase.rotateFrom) {
    const src = engine.phaseData[phase.rotateFrom];
    if (!src || !src.assigned || src.assigned[playerId] !== undefined) return;
    let byPlayer = src.byPlayer;
    if (!byPlayer && Array.isArray(src.responses)) {
      byPlayer = {};
      for (const r of src.responses) if (r && r.playerId) byPlayer[r.playerId] = r.text;
    }
    const senders = Object.keys(byPlayer || {}).filter(id => id !== playerId && byPlayer[id] !== undefined);
    if (senders.length === 0) return;
    const senderId = senders[Math.floor(Math.random() * senders.length)];
    src.assigned[playerId] = byPlayer[senderId];
    src.assignedFrom = src.assignedFrom || {};
    src.assignedFrom[playerId] = senderId;
    if (src.byPlayerDrawing && src.byPlayerDrawing[senderId]) {
      src.assignedDrawing = src.assignedDrawing || {};
      src.assignedDrawing[playerId] = src.byPlayerDrawing[senderId];
    }
  } else if (Array.isArray(phase.dealItems) && phase.dealItems.length > 0) {
    const own = engine.phaseData[phase.id];
    if (!own || !own.assigned || own.assigned[playerId] !== undefined) return;
    own.assigned[playerId] = phase.dealItems[Math.floor(Math.random() * phase.dealItems.length)];
  }
}

/**
 * dealItems: hand each player one item from a TEACHER list (no student
 * author), so `{{thisStep.assigned}}` works without an earlier collect.
 * Doodle Bluff's teacher-phrases mode. Items go out in a random order and
 * wrap when the class outnumbers the list; the deal is stored under THIS
 * phase (the list has no source step to store it under).
 */
function buildDealAssignment(ctx) {
  const { phase, engine } = ctx;
  if (!Array.isArray(phase.dealItems) || phase.dealItems.length === 0) return null;
  const items = phase.dealItems.map(s => String(s)).filter(s => s.trim() !== '');
  if (items.length === 0) return null;
  const eligible = ctx.getEligibleVoters(phase.from || 'all');
  const order = items.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const assignment = {};
  eligible.forEach((p, i) => { assignment[p.id] = order[i % order.length]; });
  const existing = engine.phaseData[phase.id] || {};
  engine.storePhaseData(phase.id, { ...existing, assigned: assignment });
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
 *     - `pairBy: {from: "<collect-choice id>", mode: "opposite"|"same"}` —
 *       prefer partners by their answer in that step (best-effort; a
 *       lopsided split pairs leftovers with each other, nobody benched)
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
      console.warn(`[collect:${phase.id}] pairsFrom "${phase.pairsFrom}" has no data yet, skipping pairing`);
      return null;
    }
    // Items can come from collect (.responses) or ai-process (.result is a JSON array)
    let rawItems = null;
    if (Array.isArray(sourceData.responses)) rawItems = sourceData.responses;
    else if (Array.isArray(sourceData.result)) rawItems = sourceData.result;
    if (!rawItems) {
      console.warn(`[collect:${phase.id}] pairsFrom "${phase.pairsFrom}" has no array of items (.responses or .result), skipping pairing`);
      return null;
    }
    // Keep authorship so no pair is handed its own member's item
    // (assignPromptsToGroups, interop review item #4).
    items = rawItems
      .map(r => (typeof r === 'string'
        ? { text: r, authorId: null }
        : r && { text: r.text || r.prompt || r.question, authorId: r.playerId || null }))
      .filter(it => it && typeof it.text === 'string' && it.text.length > 0);
    if (items.length === 0) return null;
  }

  // --- Grouping ------------------------------------------------------
  let groups = null;
  let leftover = null;

  if (phase.reusePairsFrom) {
    // Source is a pairwise collect (pairs) OR a team-split (teams) — the
    // 2026-08-26 bridge that lets teacher-arranged pairs feed the pair
    // pipeline. Keep the same groups, dropping anyone no longer eligible.
    const sourceGroups = groupsFromSource(engine.phaseData[phase.reusePairsFrom]);
    if (sourceGroups && sourceGroups.length > 0) {
      const eligibleIds = new Set(eligible.map(p => p.id));
      groups = sourceGroups
        .map(g => g.filter(id => eligibleIds.has(id)))
        .filter(g => g.length > 0);
    } else {
      console.warn(`[collect:${phase.id}] reusePairsFrom "${phase.reusePairsFrom}" has no pairs or teams, building a fresh pairing instead`);
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
        console.warn(`[collect:${phase.id}] rotatePairsFrom "${phase.rotatePairsFrom}" has no pairs, pairing without an avoid-set`);
      }
    }

    // pairBy: prefer partners by what they answered in an earlier
    // collect-choice ({from, mode: "opposite"|"same"}). The source's
    // byPlayer map (playerId -> chosen text) is the answer key; missing
    // data degrades to the plain shuffle with a loud warn (same policy
    // as pairsFrom above).
    let answerOf = null;
    let answerMode = null;
    if (phase.pairBy && phase.pairBy.from) {
      const pairBySrc = engine.phaseData[phase.pairBy.from];
      const byPlayer = pairBySrc && pairBySrc.byPlayer;
      if (byPlayer && Object.keys(byPlayer).length > 0) {
        answerOf = byPlayer;
        answerMode = phase.pairBy.mode === 'same' ? 'same' : 'opposite';
      } else {
        console.warn(`[collect:${phase.id}] pairBy source "${phase.pairBy.from}" has no answers yet, pairing randomly instead`);
      }
    }

    const built = buildGroups(playerIds, { oddHandling: phase.oddHandling, avoid, answerOf, answerMode });
    groups = built.groups;
    leftover = built.leftover;
  }

  if (groups.length === 0) return null;
  if (leftover) {
    console.log(`[collect:${phase.id}] odd player count (${eligible.length}), last player unpaired and skipped this round`);
  }

  // --- Assemble pairs + per-player prompt assignment ------------------
  // No pairsFrom → every pair shares this step's own resolved prompt
  // (becomes {{_pair.prompt}} in a downstream pair reveal).
  const ownPrompt = items ? null : ctx.resolveTemplate(phase.prompt || '');
  const groupPrompts = items ? assignPromptsToGroups(items, groups) : null;
  const pairs = [];
  const assignment = {};
  groups.forEach((memberIds, gi) => {
    const promptText = items ? groupPrompts[gi] : ownPrompt;
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
    // Rolling start: students begin at different moments, so a shared
    // countdown means nothing; the teacher ends the step.
    const timer = isRolling(engine.config) ? null : (phase.timer || null);

    // Clear previous responses for multi-round games
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined });
    }

    // Build rotation assignment (no-op if rotateFrom isn't set)
    const rotation = buildRotationAssignment(ctx);

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

    // drawingFrom: one shared drawing shown to EVERYONE (read-only), distinct
    // from assignedDrawing's per-player rotation. Doodle Bluff's title round.
    const displayDrawing = resolveDisplayDrawing(phase, engine);

    // Who counts toward "X of Y submitted" — must mirror the submit
    // handler's math (foreach author self-exclusion, unpaired players)
    // or the seeded total would disagree with the first live update.
    let countEligible = withoutSitOut(eligible, phase);
    if (pairedIds) {
      countEligible = countEligible.filter(p => pairedIds.has(p.id));
    }

    // Send prompt to host. count/total seed the progress counter — without
    // them the projector read "0 of 0 submitted" until the first answer
    // landed (2026-07-26 UI review; the console got this fix in June, the
    // host screen never did).
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt, image, video, displayDrawing, timer, fields: phase.fields || null,
      inputType,
      count: 0, total: countEligible.length,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send prompt to eligible players — resolve `{{X.mine}}` and `{{X.assigned}}` per-recipient.
    // For pairwise, players who weren't paired (odd count) skip the prompt and wait.
    for (const player of eligible) {
      // Foreach sit-out: the round's author and source sit this one out
      // (mirrors collect-choice; without it the Doodle Bluff artist, or the
      // classmate whose phrase it was, could write a decoy title for their
      // own round and farm fool points). engine/phases/sit-out.js
      const sitOut = sitOutMessage(phase, player.id);
      if (sitOut) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: sitOut });
        continue;
      }
      if (pairedIds && !pairedIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Sitting out this round, waiting for others...' });
        continue;
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      // prefillFromAssigned: the passed item lands IN the text box so the
      // recipient adds to it (accumulating lists — the +1-routine move).
      // Text only; drawings already preload via assignedDrawing.
      // showTail (the exquisite-corpse fold): with appendOnly on, the player
      // sees only the tail of the inherited text — the full copy stays
      // server-side, so the artifact still accumulates whole. Server-side
      // masking on purpose: nothing hidden ever reaches the client.
      let prefill = phase.prefillFromAssigned && rotation && typeof rotation[player.id] === 'string'
        ? rotation[player.id]
        : null;
      if (prefill !== null && phase.appendOnly && phase.showTail) {
        prefill = tailOfWords(prefill, phase.showTail);
      }
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, video, displayDrawing, timer, fields: phase.fields || null,
        inputType,
        assignedDrawing: (rotatedDrawings && rotatedDrawings[player.id]) || null,
        prefill,
        appendOnly: !!phase.appendOnly,
        maxLength: phase.maxLength || null,
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
    // Late joiners are the normal case: deal them an item before the prompt
    if (player) ensureLateAssignment(ctx, player.id);
    const sitOut = player ? sitOutMessage(ctx.phase, player.id) : null;
    if (sitOut) {
      socket.emit(EVENTS.WAITING, { message: sitOut });
    } else if (player && player.response) {
      if (isRolling(ctx.engine.config) && !moreInputAhead(ctx.engine.config, ctx.phase.id)) {
        socket.emit(EVENTS.PLAYER_DONE, { message: translate(ctx.engine.language, doneMessageFor(ctx.phase)) });
      } else {
        socket.emit(EVENTS.WAITING, { message: 'Answer submitted. Waiting for others...' });
      }
    } else {
      const playerPrompt = player
        ? ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, player.id)
        : ctx.resolveTemplate(ctx.phase.prompt || '');
      const image = ctx.services.resolveImageUrl(ctx.phase.image, ctx.room.gameId, ctx.room.gameSource);
      const video = ctx.services.resolveVideoEmbed(ctx.phase.video);
      const reconSource = ctx.phase.rotateFrom
        ? (ctx.engine.phaseData[ctx.phase.rotateFrom] || {})
        : {};
      const reconRotated = reconSource.assignedDrawing || null;
      let reconPrefill = ctx.phase.prefillFromAssigned && player && reconSource.assigned &&
        typeof reconSource.assigned[player.id] === 'string'
        ? reconSource.assigned[player.id]
        : null;
      // Same fold as onEnter: a reconnect must not leak the hidden head.
      if (reconPrefill !== null && ctx.phase.appendOnly && ctx.phase.showTail) {
        reconPrefill = tailOfWords(reconPrefill, ctx.phase.showTail);
      }
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt, image, video, timer: null,
        displayDrawing: resolveDisplayDrawing(ctx.phase, ctx.engine),
        fields: ctx.phase.fields || null,
        inputType: ctx.phase.inputType === 'drawing' ? 'drawing' : 'text',
        assignedDrawing: (player && reconRotated && reconRotated[player.id]) || null,
        prefill: reconPrefill,
        appendOnly: !!ctx.phase.appendOnly,
        maxLength: ctx.phase.maxLength || null,
        passAllowed: !!ctx.phase.passAllowed,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
