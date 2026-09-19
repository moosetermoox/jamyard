import { GameEngine } from './game-engine.js';

/**
 * Room snapshots — survive a server restart/sleep mid-game.
 *
 * Why: all room state lives in memory in a single process. Before this,
 * a Render redeploy, free-tier sleep, or crash at minute 20 of a class
 * period silently killed every running game with no recovery — the one
 * failure mode that makes a teacher never trust the tool again.
 *
 * Semantic (deliberately simple): the server snapshots a room at every
 * phase transition. A restored room resumes at the START of the
 * interrupted phase — mid-phase progress in that one phase (votes cast,
 * half-written answers) is lost; everything else (completed phases'
 * data, players, scores, eliminations) survives. The teacher says
 * "vote again" and the period continues.
 *
 * Mid-foreach interruptions restore to the foreach ORCHESTRATOR phase
 * with its iteration state cleared — that loop replays from its first
 * item (virtual `_fe:` sub-phases don't exist in a fresh config, and
 * partially-replayed iteration state is worse than a clean rerun).
 *
 * Restored players come back `connected: false` with their tokens
 * intact; the existing token-reconnect path in join-room rebinds them
 * to their new sockets exactly like a live mid-game reconnect. The host
 * rebinds via `hostToken` (also how a host-screen F5 recovers).
 */

export const SNAPSHOT_VERSION = 1;

/**
 * JSON-safe snapshot of a live room, or null when the room shouldn't be
 * persisted (no engine yet, or a robot-playtest room).
 */
export function serializeRoom(room) {
  if (!room || !room.engine || room.simulated) return null;
  const engine = room.engine;
  return {
    v: SNAPSHOT_VERSION,
    code: room.code,
    gameId: room.gameId,
    gameSource: room.gameSource || 'built-in',
    teacherPin: room.teacherPin || null,
    hostToken: room.hostToken || null,
    // Rooms log row (services/room-log.js): a restored room keeps writing
    // its progress to the same row instead of vanishing from the log.
    logId: room.logId || null,
    kind: room.pretend ? 'pretend' : 'class',
    kickedTokens: Array.from(room.kickedTokens || []),
    phaseInstanceId: room.phaseInstanceId || 0,
    currentPhaseId: engine.stateMachine.getState(),
    phaseData: engine.phaseData || {},
    loopState: engine.loopState || {},
    foreachState: engine.foreachState || {},
    // Word help (engine/word-help.js): spends, cache and the tapped-word
    // log survive a restart with the room; a restart must not refill purses.
    wordHelp: room.wordHelp || null,
    // Early-bird joke (engine/early-joke.js): who got which joke, so a
    // restart neither re-deals nor opens the first seats again.
    earlyJoke: room.earlyJoke || null,
    players: engine.players.list().map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      token: p.token || null,
      responseHidden: p.responseHidden || false,
      connected: false
    })),
    savedAt: Date.now()
  };
}

/**
 * Rebuild a playable room object from a snapshot + the (re-loaded) game
 * config and hooks. The caller adopts it into the RoomManager and
 * re-enters the current phase once the host is back.
 */
export function restoreRoom(snapshot, config, hooks) {
  const engine = new GameEngine(config);
  engine.hooks = hooks || {};
  engine.phaseData = snapshot.phaseData || {};
  engine.loopState = snapshot.loopState || {};
  engine.foreachState = snapshot.foreachState || {};

  // Where to resume. Virtual foreach sub-phases (_fe:parent:sub) don't
  // exist in a fresh config — fall back to the parent foreach and clear
  // its iteration state so onEnter restarts that loop cleanly.
  let phaseId = snapshot.currentPhaseId;
  if (typeof phaseId === 'string' && phaseId.startsWith('_fe:')) {
    const parent = phaseId.split(':')[1];
    if (parent && config.phases[parent]) {
      phaseId = parent;
      delete engine.foreachState[parent];
    }
  }
  if (!config.phases[phaseId]) {
    // Config changed since the snapshot (phase renamed/deleted) — the
    // game can't resume meaningfully.
    throw new Error(`Snapshot phase "${phaseId}" no longer exists in game "${snapshot.gameId}".`);
  }
  // Direct restore — the state machine validates transitions FROM here on.
  engine.stateMachine.state = phaseId;

  for (const p of snapshot.players || []) {
    engine.players.players.set(p.id, {
      id: p.id,
      name: p.name,
      status: p.status || 'active',
      token: p.token || null,
      responseHidden: p.responseHidden || false,
      connected: false,
      disconnectedAt: Date.now()
    });
  }

  return {
    code: snapshot.code,
    engine,
    gameId: snapshot.gameId,
    gameSource: snapshot.gameSource || 'built-in',
    simulated: false,
    teacherPin: snapshot.teacherPin || null,
    hostToken: snapshot.hostToken || null,
    logId: snapshot.logId || null,
    pretend: snapshot.kind === 'pretend',
    kickedTokens: new Set(snapshot.kickedTokens || []),
    phaseInstanceId: snapshot.phaseInstanceId || 0,
    wordHelp: snapshot.wordHelp || null,
    earlyJoke: snapshot.earlyJoke || null,
    teacherSocketIds: new Set(),
    createdAt: Date.now(),
    journal: [],
    restored: true
  };
}
