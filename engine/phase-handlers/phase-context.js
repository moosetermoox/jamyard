/**
 * Creates a context object passed to every phase handler.
 * Bundles room state, I/O, and utilities so handlers don't need
 * to reach into server.js globals.
 */
function withPhaseSeq(data, room) {
  const seq = room.phaseInstanceId || 0;
  if (data == null) return { phaseInstanceId: seq };
  if (typeof data === 'object' && !Array.isArray(data)) {
    return { ...data, phaseInstanceId: seq };
  }
  return data;
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

    // Services
    aiService: services.aiService,
    services,

    // Utilities
    resolveTemplate: (tpl) => services.resolveTemplate(tpl, engine),
    resolveScreenControl: () => services.resolveScreenControl(phase, engine),
    getNextPhaseId: () => services.getNextPhaseId(engine, phase),
    getEligibleVoters: (from) => services.getEligibleVoters(engine.players, from || phase.from || 'all'),

    // Emit helpers — auto-injects phaseInstanceId so clients can echo it back for staleness checks
    emitToHost(event, data) {
      if (hostSocketId) services.io.to(hostSocketId).emit(event, withPhaseSeq(data, room));
    },
    emitToRoom(event, data) {
      services.io.to(code).emit(event, withPhaseSeq(data, room));
    },
    emitToPlayer(playerId, event, data) {
      services.io.to(playerId).emit(event, withPhaseSeq(data, room));
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
