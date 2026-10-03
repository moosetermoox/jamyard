/**
 * Phase handler: relay — turn-by-turn collaborative input (story chains, word
 * chains). One player contributes at a time and the turn passes around the
 * room, building a shared sequence.
 */
import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';
import { seatInRelayOrder } from '../phases/late-seating.js';
import { nobodyCanAnswer } from '../phases/nobody-can-answer.js';

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

    const resolvedPrompt = phase.prompt ? ctx.resolveTemplate(phase.prompt) : '';

    room.phaseState = {
      kind: 'relay',
      phaseId: phase.id, turnOrder, currentTurnIndex: 0,
      sharedResult: [], sc, prompt: resolvedPrompt,
      timer: phase.timer || null,
      cleanup() { if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; } }
    };

    console.log(`[handlePhase] Relay: ${turnOrder.length} players, order=${phase.order || 'random'}`);

    // Nobody in the room may write: finish it now with nothing added, the
    // way Finish all would (engine/phases/nobody-can-answer.js)
    if (nobodyCanAnswer(engine, turnOrder.length) && ctx.services.finishRelay) {
      console.log(`[handlePhase] '${phase.id}': nobody can write, finishing it`);
      await ctx.services.finishRelay(code, room);
      return;
    }

    ctx.services.emitRelayTurn(code, room);
  },

  // A student who joins mid-relay gets the last turn (cause 4 sweep,
  // 2026-10-03: the turn order was frozen at enter, so the story skipped
  // them). sendCurrentState sends them the waiting screen; the projector's
  // "2 / 5" and every waiting count follow at the next turn, since
  // re-sending the turn now would restart the active student's clock.
  onLateJoin(ctx, playerId) {
    seatInRelayOrder(ctx.room.phaseState, playerId, ctx.phase && ctx.phase.from);
    return null;
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
          playerTemplate: sc.playerTemplate, show: sc.playerShow,
          phaseInstanceId: ctx.phaseInstanceId
        });
      } else {
        socket.emit(EVENTS.RELAY_WAITING, {
          activePlayerName: activePlayer ? activePlayer.name : 'Someone',
          prompt: rlState.prompt, sharedResult: rlState.sharedResult, progress,
          playerTemplate: sc.playerTemplate, show: sc.playerShow,
          phaseInstanceId: ctx.phaseInstanceId
        });
      }
    }
  }
});
