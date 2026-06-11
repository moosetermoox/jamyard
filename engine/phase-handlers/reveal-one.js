import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

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
    // Render each item to its display string
    items = items.map(item => formatRevealItem(item, phase.itemTemplate));

    const roMessage = phase.message ? ctx.resolveTemplate(phase.message) : 'Reveal Time!';

    room.phaseState = { kind: 'reveal-one', phaseId: phase.id, items, revealed: 0, message: roMessage };
    engine.storePhaseData(phase.id, { items, revealed: 0 });
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Reveal-one: ${items.length} items to reveal`);

    // Send start to host
    ctx.emitToHost(EVENTS.REVEAL_ONE_START, {
      message: roMessage, total: items.length, revealed: 0,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send start to players
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, EVENTS.REVEAL_ONE_START, {
        message: roMessage, total: items.length, revealed: 0,
        timer: phase.timer || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const roState = ctx.room.phaseState;
    if (roState) {
      const sc = ctx.resolveScreenControl();
      socket.emit(EVENTS.REVEAL_ONE_START, {
        message: roState.message, total: roState.items.length, revealed: roState.revealed,
        timer: null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
      // Send already-revealed items
      for (let ri = 0; ri < roState.revealed; ri++) {
        socket.emit(EVENTS.REVEAL_ONE_ITEM, {
          item: roState.items[ri], index: ri + 1, total: roState.items.length
        });
      }
      if (roState.revealed >= roState.items.length) {
        socket.emit(EVENTS.REVEAL_ONE_COMPLETE, {});
      }
    }
  }
});
