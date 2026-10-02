/**
 * Phase handler: reveal-one — host reveals items one at a time (countdown
 * style), each animating onto player screens as it lands. `itemTemplate`
 * renders object items via `{{_current.field}}`. Reconnect-safe (restores how
 * many have been revealed so far).
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { sampleItems } from '../phases/sampling.js';
import { planHotSeat, rankedFromScores } from '../phases/hot-seat.js';

/**
 * Pure: render one reveal item as a display string.
 *
 * With an itemTemplate, {{_current.path}} tokens pull values from the item
 * (missing paths render as empty string — never raw code). Without one,
 * fall back to readable defaults; objects with no recognizable text field
 * stringify as JSON (the validator nudges authors toward itemTemplate).
 */
export function formatRevealItem(item, itemTemplate) {
  if (itemTemplate) {
    return itemTemplate.replace(/\{\{\s*_current(?:\.([\w.]+))?\s*\}\}/g, (_m, path) => {
      if (!path) {
        if (typeof item === 'string') return item;
        return (item && (item.text || item.name)) || '';
      }
      let v = item;
      for (const seg of path.split('.')) {
        v = v == null ? undefined : v[seg];
      }
      return v == null ? '' : String(v);
    });
  }
  if (typeof item === 'string') return item;
  if (item && item.text) return item.text;
  if (item && item.name && item.response) return item.name + ': ' + item.response;
  return JSON.stringify(item);
}

/**
 * The student a hot-seat reveal goes to: `to` resolved once, matched to a
 * player id first, then to a name (case and spaces ignored). Null when the
 * step has no `to` or nobody matches (the items then go to everyone, as a
 * plain reveal-one, and the log says so).
 */
export function hotSeatFor(ctx) {
  const raw = ctx.phase && ctx.phase.to;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = String(raw.includes('{{') ? ctx.resolveTemplate(raw) : raw).trim();
  const players = ctx.engine.players.list();
  const byId = players.find(p => p.id === value);
  if (byId) return { id: byId.id, name: byId.name };
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const byName = players.find(p => norm(p.name) === norm(value));
  if (byName) return { id: byName.id, name: byName.name };
  console.warn(`[reveal-one:${ctx.phase.id}] hot seat "${value}" matched no student, showing to everyone`);
  return null;
}

/**
 * One hot-seat question as a screen receives it: the words, who answers,
 * the place in that student's run, and `mine` for the student in the seat.
 * @param {object} roState  room.phaseState of the reveal-one
 * @param {number} i        the item's index
 * @param {string} [viewerId]
 */
export function hotSeatItem(roState, i, viewerId) {
  const seat = roState.seatPlan[i];
  const t = (roState.turns && roState.turns[i]) || { turn: i + 1, of: roState.items.length };
  return {
    item: roState.items[i], index: i + 1, total: roState.items.length,
    hotSeat: seat.name, turn: t.turn, turns: t.of,
    mine: !!(viewerId && seat.id === viewerId)
  };
}

registerHandler('reveal-one', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    let items = engine.resolve(phase.from) || [];

    // Normalize to array (objects keep their shape so itemTemplate can
    // reference their fields; only non-array containers are unwrapped)
    if (!Array.isArray(items)) {
      if (typeof items === 'object') {
        items = Object.values(items);
      } else {
        items = [items];
      }
    }
    // limit: cap the reveal at a random sample (a 25-item gallery is a
    // slideshow — sample the highlights instead). Careful where fairness IS
    // the point (encouragement walls, return-to-author): leave limit unset
    // there so every student's item lands.
    items = sampleItems(items, phase.limit);

    // The hot seat (2026-10-01, reworked after the owner tried it): `to`
    // names the first student (a vote over the students' pick, or
    // {{players.random}}), resolved once here; `rotateEvery` moves the seat
    // every N questions (in vote order with `seatOrderFrom`, else random).
    // Each question shows on the projector and every screen with who
    // answers it; the seat's own screen says it is theirs. Nobody gets
    // their own question when a swap can avoid it (engine/phases/hot-seat.js).
    const rotateEvery = Number.isInteger(phase.rotateEvery) && phase.rotateEvery > 0 ? phase.rotateEvery : null;
    const firstSeat = hotSeatFor(ctx);
    let plan = null;
    if (firstSeat || rotateEvery) {
      const voteData = phase.seatOrderFrom ? (engine.phaseData[phase.seatOrderFrom] || {}) : {};
      plan = planHotSeat({
        items, players: engine.players.list().map(p => ({ id: p.id, name: p.name })),
        firstId: firstSeat ? firstSeat.id : null, rotateEvery,
        ranked: rankedFromScores(voteData.scores)
      });
      items = plan.items;
    }

    // Render each item to its display string. Items carrying a drawing
    // (collect responses with inputType:"drawing") keep their strokes so
    // the clients can paint them — everything else flattens to text.
    items = items.map(item => {
      const text = formatRevealItem(item, phase.itemTemplate);
      if (item && typeof item === 'object' && Array.isArray(item.drawing)) {
        // A drawing's caption: the itemTemplate when the author gave one
        // ("{{_current.name}}: {{_current.assigned}}"), else the artist.
        const caption = phase.itemTemplate ? text : (item.name ? `✏️ ${item.name}` : text);
        return { text: caption, drawing: item.drawing };
      }
      return text;
    });

    const roMessage = phase.message ? ctx.resolveTemplate(phase.message) : 'Reveal Time!';

    // Nothing to reveal (a closing gallery when every drawing already got
    // a round): skip the step rather than project an empty stage.
    if (items.length === 0 && phase.next) {
      console.log(`[handlePhase] Reveal-one '${phase.id}': nothing to reveal, moving on`);
      engine.storePhaseData(phase.id, { items: [], revealed: 0 });
      await ctx.advanceToNext();
      return;
    }

    room.phaseState = { kind: 'reveal-one', phaseId: phase.id, items, revealed: 0, message: roMessage };
    const first = plan && plan.seats[0] ? plan.seats[0] : null;
    if (plan) {
      room.phaseState.seatPlan = plan.seats.map(s => ({ id: s.id, name: s.name }));
      room.phaseState.turns = plan.turns;
      room.phaseState.hotSeatId = first ? first.id : null;
    }
    engine.storePhaseData(phase.id, plan
      ? { items, revealed: 0, hotSeats: [...new Set(plan.seats.map(s => s.name))] }
      : { items, revealed: 0 });
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Reveal-one: ${items.length} items to reveal${plan ? `, hot seat ${plan.seats.map(s => s.name).join(' > ')}` : ''}`);

    // Send start to host
    ctx.emitToHost(EVENTS.REVEAL_ONE_START, {
      message: roMessage, total: items.length, revealed: 0,
      timer: phase.timer || null,
      hotSeat: first ? first.name : null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send start to players
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.REVEAL_ONE_START, {
        message: roMessage, total: items.length, revealed: 0,
        timer: phase.timer || null,
        hotSeat: first ? first.name : null,
        inHotSeat: !!(first && first.id === player.id),
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const roState = ctx.room.phaseState;
    if (roState) {
      const sc = ctx.resolveScreenControl();
      const plan = Array.isArray(roState.seatPlan) ? roState.seatPlan : null;
      const now = plan ? plan[Math.max(0, roState.revealed - 1)] : null;
      socket.emit(EVENTS.REVEAL_ONE_START, {
        message: roState.message, total: roState.items.length, revealed: roState.revealed,
        timer: null,
        hotSeat: now ? now.name : null,
        inHotSeat: !!(now && now.id === socket.id),
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
      if (plan) {
        // The hot seat shows one question at a time: the current one, with
        // who answers it (the seat's own screen knows it is theirs)
        if (roState.revealed > 0) socket.emit(EVENTS.REVEAL_ONE_ITEM, hotSeatItem(roState, roState.revealed - 1, socket.id));
      } else {
        // Send already-revealed items
        for (let ri = 0; ri < roState.revealed; ri++) {
          socket.emit(EVENTS.REVEAL_ONE_ITEM, {
            item: roState.items[ri], index: ri + 1, total: roState.items.length
          });
        }
      }
      if (roState.revealed >= roState.items.length) {
        socket.emit(EVENTS.REVEAL_ONE_COMPLETE, {});
      }
    }
  }
});
