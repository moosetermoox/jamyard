import { registerHandler } from './phase-registry.js';

registerHandler('reveal-one', {
  async onEnter(ctx) {
    const { phase, engine, room } = ctx;
    let items = engine.resolve(phase.from) || [];

    // Normalize to array
    if (!Array.isArray(items)) {
      if (typeof items === 'object') {
        items = Object.entries(items).map(([key, val]) => {
          if (typeof val === 'object' && val.text) return val.text;
          if (typeof val === 'object' && val.name) return val.name + ': ' + (val.text || val.response || JSON.stringify(val));
          return String(val);
        });
      } else {
        items = [String(items)];
      }
    }
    // Normalize array items to strings
    items = items.map(item => {
      if (typeof item === 'string') return item;
      if (item && item.text) return item.text;
      if (item && item.name && item.response) return item.name + ': ' + item.response;
      return JSON.stringify(item);
    });

    const roMessage = phase.message ? ctx.resolveTemplate(phase.message) : 'Reveal Time!';

    room.revealOneState = { phaseId: phase.id, items, revealed: 0, message: roMessage };
    engine.storePhaseData(phase.id, { items, revealed: 0 });
    const sc = ctx.resolveScreenControl();

    console.log(`[handlePhase] Reveal-one: ${items.length} items to reveal`);

    // Send start to host
    ctx.emitToHost('reveal-one-start', {
      message: roMessage, total: items.length, revealed: 0,
      timer: phase.timer || null,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send start to players
    for (const player of engine.players.list()) {
      ctx.emitToPlayer(player.id, 'reveal-one-start', {
        message: roMessage, total: items.length, revealed: 0,
        timer: phase.timer || null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  },

  onReconnect(ctx, socket) {
    const roState = ctx.room.revealOneState;
    if (roState) {
      const sc = ctx.resolveScreenControl();
      socket.emit('reveal-one-start', {
        message: roState.message, total: roState.items.length, revealed: roState.revealed,
        timer: null,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
      // Send already-revealed items
      for (let ri = 0; ri < roState.revealed; ri++) {
        socket.emit('reveal-one-item', {
          item: roState.items[ri], index: ri + 1, total: roState.items.length
        });
      }
      if (roState.revealed >= roState.items.length) {
        socket.emit('reveal-one-complete', {});
      }
    }
  }
});
