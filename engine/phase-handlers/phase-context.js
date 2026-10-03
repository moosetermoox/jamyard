/**
 * Creates a context object passed to every phase handler.
 * Bundles room state, I/O, and utilities so handlers don't need
 * to reach into server.js globals.
 */
import { recordDeadline, secondsLeft } from '../phase-timer.js';

export function withPhaseSeq(data, room) {
  const seq = room.phaseInstanceId || 0;
  if (data == null) return { phaseInstanceId: seq };
  if (typeof data === 'object' && !Array.isArray(data)) {
    return { ...data, phaseInstanceId: seq };
  }
  return data;
}

/**
 * The socket a handler's `onReconnect` gets: every `emit` carries the
 * room's phaseInstanceId, like `ctx.emitToPlayer` does (2026-10-03, cause 4
 * of the architecture review). A payload without it made the student screen
 * echo the previous step's id and the server drop every follow-up as stale
 * (solo-quiz feedback 2026-09-02, the relay in real classes, #134). Handlers
 * only read `id` and call `emit`, so that is the whole surface.
 */
export function stampingSocket(socket, room) {
  return {
    id: socket.id,
    emit(event, data) { return socket.emit(event, withPhaseSeq(withTimeLeft(data, room), room)); }
  };
}

/**
 * The clock, one rule for every step (2026-10-03, cause 4): an enter
 * payload that carries a `timer` records the step's deadline, and a
 * payload re-sent to a screen that comes back mid-step gets the time left
 * in its `timer` instead of whatever the handler wrote (eleven handlers
 * wrote null, so a refreshed student saw no clock while the server still
 * closed the step on time). A handler whose clock restarts inside one step
 * (a relay's turns) calls recordDeadline itself.
 */
function recordingDeadline(data, room) {
  if (data && typeof data.timer === 'number' && data.timer > 0 && room.phaseState && !room.phaseState.timerEndsAt) {
    recordDeadline(room, data.timer);
  }
  return data;
}

function withTimeLeft(data, room) {
  if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'timer')) return data;
  if (!room.phaseState || !room.phaseState.timerEndsAt) return data;
  return { ...data, timer: secondsLeft(room) };
}

export function createPhaseContext(code, room, services) {
  const engine = room.engine;
  const phase = engine.getCurrentPhase();
  const hostSocketId = services.roomToHost.get(code);

  return {
    // Identity
    code,
    room,
    phase,
    engine,
    hostSocketId,
    phaseInstanceId: room.phaseInstanceId || 0,

    // I/O
    io: services.io,

    // Services. Simulated rooms (robot playtest) always get the mock AI —
    // a review must never spend API money or wait on a real model.
    aiService: (room.simulated && services.mockAiService) ? services.mockAiService : services.aiService,
    services,

    // Utilities
    resolveTemplate: (tpl) => services.resolveTemplate(tpl, engine),
    resolveScreenControl: () => services.resolveScreenControl(phase, engine),
    getNextPhaseId: () => services.getNextPhaseId(engine, phase),
    getEligibleVoters: (from) => services.getEligibleVoters(engine.players, from || phase.from || 'all'),

    // Emit helpers — auto-injects phaseInstanceId so clients can echo it back for staleness checks
    emitToHost(event, data) {
      if (hostSocketId) services.io.to(hostSocketId).emit(event, withPhaseSeq(recordingDeadline(data, room), room));
    },
    emitToRoom(event, data) {
      services.io.to(code).emit(event, withPhaseSeq(recordingDeadline(data, room), room));
    },
    emitToPlayer(playerId, event, data) {
      services.io.to(playerId).emit(event, withPhaseSeq(recordingDeadline(data, room), room));
    },
    // Teacher consoles (private /teacher devices) — distinct from the host
    // screen, which is projected to the class.
    emitToTeachers(event, data) {
      services.io.to(code + ':teachers').emit(event, withPhaseSeq(data, room));
    },

    // Staleness check — timers/callbacks capture phaseInstanceId, then check if still current
    isStale() {
      return room.phaseInstanceId !== (this.phaseInstanceId);
    },

    // Phase lifecycle — allows handlers to trigger next phase
    async advanceToNext() {
      const nextId = services.getNextPhaseId(engine, phase);
      if (nextId) {
        engine.transition(nextId);
        await services.handlePhase(code, room);
      }
    },
    async advanceTo(phaseId) {
      engine.transition(phaseId);
      await services.handlePhase(code, room);
    }
  };
}
