/**
 * Phase handler: reveal-one — host reveals items one at a time (countdown
 * style), each animating onto player screens as it lands. `itemTemplate`
 * renders object items via `{{_current.field}}`. Reconnect-safe (restores how
 * many have been revealed so far).
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { sampleItems } from '../phases/sampling.js';

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
    // The hot seat (2026-10-01): `to` names ONE student (a vote over the
    // students' pick, or {{players.random}}), resolved once here; every
    // item then goes to that student's screen only and everyone else,
    // the projector too, sees the count (server.js reveal-next). Their
    // own question is not one of theirs to answer.
    const seat = hotSeatFor(ctx);
    if (seat) items = items.filter(it => !(it && typeof it === 'object' && it.playerId === seat.id));

    items = sampleItems(items, phase.limit);

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
    if (seat) {
      room.phaseState.hotSeatId = seat.id;
      room.phaseState.hotSeatName = seat.name;
    }
    engine.storePhaseData(phase.id, seat ? { items, revealed: 0, hotSeat: seat.name } : { items, revealed: 0 });
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Reveal-one: ${items.length} items to reveal${seat ? ` to ${seat.name}'s screen` : ''}`);

    // Send start to host
    ctx.emitToHost(EVENTS.REVEAL_ONE_START, {
      message: roMessage, total: items.length, revealed: 0,
      timer: phase.timer || null,
      hotSeat: seat ? seat.name : null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send start to players
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.REVEAL_ONE_START, {
        message: roMessage, total: items.length, revealed: 0,
        timer: phase.timer || null,
        hotSeat: seat ? seat.name : null,
        inHotSeat: !!(seat && seat.id === player.id),
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const roState = ctx.room.phaseState;
    if (roState) {
      const sc = ctx.resolveScreenControl();
      const seatName = roState.hotSeatId ? roState.hotSeatName : null;
      const inHotSeat = !!(roState.hotSeatId && roState.hotSeatId === socket.id);
      socket.emit(EVENTS.REVEAL_ONE_START, {
        message: roState.message, total: roState.items.length, revealed: roState.revealed,
        timer: null,
        hotSeat: seatName, inHotSeat,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
      // Send already-revealed items (the hot seat's only to the hot seat;
      // everyone else gets the count)
      for (let ri = 0; ri < roState.revealed; ri++) {
        const hidden = roState.hotSeatId && !inHotSeat;
        socket.emit(EVENTS.REVEAL_ONE_ITEM, {
          item: hidden ? null : roState.items[ri], index: ri + 1, total: roState.items.length,
          ...(hidden ? { hotSeat: seatName } : {})
        });
      }
      if (roState.revealed >= roState.items.length) {
        socket.emit(EVENTS.REVEAL_ONE_COMPLETE, {});
      }
    }
  }
});
