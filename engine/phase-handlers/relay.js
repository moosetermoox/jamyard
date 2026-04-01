import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('relay', {
  async onEnter(ctx) {
    const { phase, engine, room, code } = ctx;
    const rlFrom = phase.from || 'all';
    const rlEligible = ctx.getEligibleVoters(rlFrom);
    const sc = ctx.resolveScreenControl();

    let turnOrder;
    if (phase.order === 'join-order') {
      turnOrder = rlEligible.map(p => p.id);
    } else {
      turnOrder = rlEligible.map(p => p.id).sort(() => Math.random() - 0.5);
    }

    room.phaseState = {
      phaseId: phase.id, turnOrder, currentTurnIndex: 0,
      sharedResult: [], sc, prompt: phase.prompt,
      timer: phase.timer || null,
      cleanup() { if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; } }
    };

    console.log(`[handlePhase] Relay: ${turnOrder.length} players, order=${phase.order || 'random'}`);

    ctx.services.emitRelayTurn(code, room);
  },

  onReconnect(ctx, socket) {
    const rlState = ctx.room.phaseState;
    if (rlState) {
      const sc = ctx.resolveScreenControl();
      const activeId = rlState.turnOrder[rlState.currentTurnIndex];
      const activePlayer = ctx.engine.players.find(activeId);
      const progress = (rlState.currentTurnIndex + 1) + ' / ' + rlState.turnOrder.length;

      if (socket.id === activeId) {
        socket.emit(EVENTS.RELAY_TURN, {
          prompt: rlState.prompt, sharedResult: rlState.sharedResult,
          timer: null, progress,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      } else {
        socket.emit(EVENTS.RELAY_WAITING, {
          activePlayerName: activePlayer ? activePlayer.name : 'Someone',
          sharedResult: rlState.sharedResult, progress,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
    }
  }
});
