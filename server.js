import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { readdir, writeFile, mkdir, rm, access } from 'fs/promises';
import { RoomManager } from './engine/room-manager.js';
import { GameEngine } from './engine/game-engine.js';
import { loadGame, validate, getAllowedFields } from './engine/game-loader.js';
import { normalizeConfig } from './engine/normalizer.js';
import { VALIDATION_MODES, DIAGNOSTIC_CODES } from './engine/diagnostics.js';
import { loadHooks } from './engine/hooks-loader.js';
import { gamePhases } from './config/game-phases.js';
import { AIService } from './services/ai-service.js';
import {
  generateMatchups,
  getEligibleVoters,
  tallyPickOne,
  tallyHeadToHead
} from './engine/phases/vote-handler.js';
import { getHandler, hasHandler, createPhaseContext } from './engine/phase-handlers/index.js';
import { EVENTS } from './engine/events.js';
import { validatePayload } from './engine/event-schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {any} */
const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = 3000;

const aiMode = process.env.ANTHROPIC_API_KEY ? 'real' : 'mock';
console.log(`[init] AI Service mode: ${aiMode}`);

const roomManager = new RoomManager(gamePhases);
const aiService = new AIService({ mode: aiMode });
const socketToRoom = new Map();
const roomToHost = new Map();

app.use(express.json());

const DEFAULT_GAME = 'weekend-poem';
const GAMES_DIR = join(__dirname, 'games');

// --- Helper Functions ---

function getNextPhaseId(engine, phase) {
  if (phase.loopBack && phase.loopCount) {
    const loopKey = phase.id || Object.keys(engine.config.phases).find(
      k => engine.config.phases[k] === phase
    );
    if (!engine.loopState[loopKey]) {
      engine.loopState[loopKey] = { iteration: 1, total: phase.loopCount };
    }
    const state = engine.loopState[loopKey];
    if (state.iteration < state.total) {
      state.iteration++;
      return phase.loopBack;
    }
    // Loop complete — fall through to next
    return phase.next;
  }
  return phase.next;
}

// Check incoming payload against its schema; on failure, log + tell the client.
// Returns true if payload is valid (handler should proceed).
function checkEventPayload(socket, eventName, payload) {
  const result = validatePayload(eventName, payload);
  if (!result.ok) {
    console.log(`[invalid-payload] "${eventName}" from ${socket.id}: ${result.reason}`);
    socket.emit('event-rejected', { event: eventName, reason: result.reason });
    return false;
  }
  return true;
}

const JOURNAL_MAX_ENTRIES = 100;

// Append an entry to the room's event journal (ring buffer).
// Used for debugging stalls: see what events arrived, when phases changed, what was rejected.
function recordEvent(room, type, data) {
  if (!room) return;
  if (!room.journal) room.journal = [];
  room.journal.push({
    t: Date.now(),
    phaseId: room.engine ? room.engine.getCurrentPhase().id : null,
    phaseInstanceId: room.phaseInstanceId || 0,
    type,
    ...(data || {})
  });
  if (room.journal.length > JOURNAL_MAX_ENTRIES) {
    room.journal.splice(0, room.journal.length - JOURNAL_MAX_ENTRIES);
  }
}

// Reject events arriving from a client that already moved past the current phase.
// Clients echo back the phaseInstanceId they received in the last phase-start event.
// Mismatch = the phase advanced server-side before this event arrived. Drop it silently.
// Undefined/missing client value = accept (backward compat for events not yet wired).
function isStalePhaseEvent(room, clientPhaseInstanceId, eventName) {
  if (!room) return false;
  if (clientPhaseInstanceId === undefined || clientPhaseInstanceId === null) return false;
  const current = room.phaseInstanceId;
  if (clientPhaseInstanceId !== current) {
    console.log(`[stale-event] Dropping "${eventName}" — client saw phase ${clientPhaseInstanceId}, current ${current}`);
    recordEvent(room, 'stale-dropped', { event: eventName, clientSeq: clientPhaseInstanceId });
    return true;
  }
  return false;
}

function resolveTemplate(template, engine) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
    const trimmed = ref.trim();
    // .mine has no recipient at this layer — replace with a host-friendly note
    if (/\.mine$/.test(trimmed)) return '(each student gets their own)';
    const value = engine.resolve(trimmed);
    return value !== undefined ? String(value) : match;
  });
}

// Resolve {{X.mine}} per recipient, using the byPlayer map an ai-process step
// produced when phase.perPlayer === true. Other refs resolve normally.
function resolvePerPlayerTemplate(template, engine, playerId) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\.mine\s*\}\}/g, (match, phaseId) => {
    const data = engine.phaseData[phaseId];
    if (data && data.byPlayer && data.byPlayer[playerId] !== undefined) {
      return String(data.byPlayer[playerId]);
    }
    return match;
  }).replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
    if (/\.mine\s*$/.test(ref)) return match;
    const value = engine.resolve(ref.trim());
    return value !== undefined ? String(value) : match;
  });
}

function resolveScreenControl(phase, engine) {
  const sc = {};
  sc.hostTemplate = phase.hostTemplate ? resolveTemplate(phase.hostTemplate, engine) : null;
  sc.playerTemplate = phase.playerTemplate ? resolveTemplate(phase.playerTemplate, engine) : null;
  sc.hostShow = phase.hostShow || null;
  sc.playerShow = phase.playerShow || null;
  return sc;
}

// --- Rank helpers ---

async function closeRanking(code, room) {
  const rs = room.phaseState;
  if (!rs || !rs.phaseId) return;
  if (rs.timer) { clearTimeout(rs.timer); rs.timer = null; }

  const engine = room.engine;
  const phase = engine.config.phases[rs.phaseId];

  // Aggregate rankings by average position
  const positionSums = {};
  const positionCounts = {};
  for (const item of rs.candidates) {
    positionSums[item] = 0;
    positionCounts[item] = 0;
  }

  for (const [, ranking] of Object.entries(rs.submissions)) {
    for (let i = 0; i < ranking.length; i++) {
      const item = typeof ranking[i] === 'string' ? ranking[i] : JSON.stringify(ranking[i]);
      if (positionSums[item] !== undefined) {
        positionSums[item] += i + 1; // 1-based position
        positionCounts[item]++;
      }
    }
  }

  const rankings = rs.candidates.map(item => ({
    item,
    avgRank: positionCounts[item] > 0 ? positionSums[item] / positionCounts[item] : rs.candidates.length,
    score: positionCounts[item] > 0 ? Math.round((rs.candidates.length - positionSums[item] / positionCounts[item] + 1) * 100) / 100 : 0
  }));
  rankings.sort((a, b) => a.avgRank - b.avgRank);

  // Also store a human-readable ranked list for templates
  const rankedList = rankings.map((r, i) => `${i + 1}. ${r.item}`).join('\n');

  engine.storePhaseData(rs.phaseId, { rankings, rankedList, responses: rs.submissions });

  console.log(`[closeRanking] Aggregated ${Object.keys(rs.submissions).length} rankings for ${rs.candidates.length} items`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// --- Wager helpers ---

async function closeWager(code, room) {
  const ws = room.phaseState;
  if (!ws || !ws.phaseId) return;
  if (ws.timer) { clearTimeout(ws.timer); ws.timer = null; }

  // If correctOption is set, auto-resolve
  let correct = ws.correctOption;
  if (correct && correct.includes && correct.includes('.')) {
    correct = room.engine.resolve(correct);
  }

  if (correct) {
    await resolveWager(code, room, correct);
  } else {
    // Host needs to pick winner
    const hostId = roomToHost.get(code);
    if (hostId) {
      io.to(hostId).emit(EVENTS.WAGER_NEED_RESOLVE, { options: ws.options });
    }
  }
}

async function resolveWager(code, room, winningOption) {
  const ws = room.phaseState;
  if (!ws || !ws.phaseId) return;

  const engine = room.engine;
  const phase = engine.config.phases[ws.phaseId];
  const newScores = { ...ws.scores };

  for (const [playerId, wager] of Object.entries(ws.wagers)) {
    if (wager.option === winningOption) {
      newScores[playerId] = (newScores[playerId] || 0) + wager.amount;
    } else {
      newScores[playerId] = (newScores[playerId] || 0) - wager.amount;
    }
  }

  engine.storePhaseData(ws.phaseId, { wagers: ws.wagers, scores: newScores, resolved: winningOption });

  console.log(`[resolveWager] Winner: "${winningOption}", updated ${Object.keys(ws.wagers).length} scores`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// --- Relay helpers ---

function emitRelayTurn(code, room) {
  const rs = room.phaseState;
  const activePlayerId = rs.turnOrder[rs.currentTurnIndex];
  const activePlayer = room.engine.players.find(activePlayerId);
  const progress = (rs.currentTurnIndex + 1) + ' / ' + rs.turnOrder.length;
  const hostId = roomToHost.get(code);

  // Tell active player
  io.to(activePlayerId).emit(EVENTS.RELAY_TURN, {
    prompt: rs.prompt, sharedResult: rs.sharedResult,
    timer: rs.timer, progress,
    playerTemplate: rs.sc.playerTemplate, show: rs.sc.playerShow
  });

  // Tell other players to wait
  for (const pid of rs.turnOrder) {
    if (pid !== activePlayerId) {
      io.to(pid).emit(EVENTS.RELAY_WAITING, {
        activePlayerName: activePlayer ? activePlayer.name : 'Someone',
        prompt: rs.prompt, sharedResult: rs.sharedResult, progress,
        playerTemplate: rs.sc.playerTemplate, show: rs.sc.playerShow
      });
    }
  }

  // Tell host
  if (hostId) {
    io.to(hostId).emit(EVENTS.RELAY_UPDATE, {
      activePlayerName: activePlayer ? activePlayer.name : 'Someone',
      sharedResult: rs.sharedResult, progress,
      timer: rs.timer,
      hostTemplate: rs.sc.hostTemplate, show: rs.sc.hostShow
    });
  }

  // Per-turn timer
  if (rs.turnTimer) { clearTimeout(rs.turnTimer); rs.turnTimer = null; }
  if (rs.timer) {
    rs.turnTimer = setTimeout(async () => {
      if (room.phaseState && room.phaseState.phaseId === rs.phaseId &&
          room.phaseState.currentTurnIndex === rs.currentTurnIndex) {
        // Auto-skip: submit empty
        const player = room.engine.players.find(activePlayerId);
        rs.sharedResult.push({ playerId: activePlayerId, name: player ? player.name : 'Unknown', text: '(skipped)' });
        rs.currentTurnIndex++;

        if (rs.currentTurnIndex >= rs.turnOrder.length) {
          const engine = room.engine;
          const phase = engine.config.phases[rs.phaseId];
          const fullText = rs.sharedResult.map(r => r.text).join(' ');
          engine.storePhaseData(rs.phaseId, { result: rs.sharedResult, text: fullText });
          const nextId = getNextPhaseId(engine, phase);
          if (nextId) {
            engine.transition(nextId);
            await handlePhase(code, room);
          }
        } else {
          emitRelayTurn(code, room);
        }
      }
    }, rs.timer * 1000);
  }
}

// --- Foreach helpers ---

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateForeachCandidates(currentItem, allPlayers, decoyCount) {
  // Build candidate list: real author + N random decoys
  const authorId = currentItem.playerId;
  const others = allPlayers.filter(p => p.id !== authorId);
  const numDecoys = Math.min(decoyCount || 3, others.length);
  const decoys = shuffleArray(others).slice(0, numDecoys);
  const candidates = shuffleArray([
    ...decoys.map(p => p.name),
    allPlayers.find(p => p.id === authorId)?.name || 'Unknown'
  ]);
  return candidates;
}

function setupForeachIteration(engine, foreachPhaseId, feConfig, index) {
  const state = engine.foreachState[foreachPhaseId];
  const item = state.items[index];
  state.currentIndex = index;

  // Set current item for template resolution
  engine._currentForeachItem = item;

  // Generate candidates if configured
  if (feConfig.candidateSource === 'players') {
    const allPlayers = engine.players.list();
    engine._foreachCandidates = generateForeachCandidates(item, allPlayers, feConfig.decoyCount);
  } else {
    engine._foreachCandidates = null;
  }

  // Inject virtual sub-phases into the engine config and register transitions
  const subNames = Object.keys(feConfig.subPhases);
  const virtualIds = subNames.map(name => `_fe:${foreachPhaseId}:${name}`);

  for (let i = 0; i < subNames.length; i++) {
    const subName = subNames[i];
    const subConfig = { ...feConfig.subPhases[subName], id: virtualIds[i] };

    // Resolve _candidates in choices/candidates field
    if (subConfig.choices === '_candidates') {
      subConfig.choices = engine._foreachCandidates || [];
    }
    if (subConfig.candidates === '_candidates') {
      subConfig.candidates = engine._foreachCandidates || [];
    }

    // Resolve _current.shuffledFields — shuffled array of the current item's field values
    // (excludes prompt-style fields like "question"/"prompt"/"scenario" so the question
    //  itself doesn't appear as one of the answer choices)
    if (subConfig.choices === '_current.shuffledFields') {
      if (item.fields && typeof item.fields === 'object') {
        const PROMPT_KEYS = new Set(['question', 'prompt', 'scenario', 'topic']);
        const answerValues = Object.keys(item.fields)
          .filter(k => !PROMPT_KEYS.has(k))
          .map(k => item.fields[k]);
        subConfig.choices = shuffleArray(answerValues);
      } else {
        subConfig.choices = [];
      }
    }

    // Mark collect-choice sub-phases with self-exclusion info
    if ((subConfig.type === 'collect-choice' || subConfig.type === 'collect') && feConfig.selfExclude !== false) {
      subConfig._foreachAuthorId = item.playerId || null;
    }

    // Resolve _current references in templates (but preserve other {{refs}} for runtime)
    if (subConfig.message) {
      subConfig.message = subConfig.message.replace(/\{\{(_current[^}]*)\}\}/g, (match, ref) => {
        const value = engine.resolve(ref.trim());
        return value !== undefined ? String(value) : match;
      });
    }
    if (subConfig.prompt) {
      subConfig.prompt = subConfig.prompt.replace(/\{\{(_current[^}]*)\}\}/g, (match, ref) => {
        const value = engine.resolve(ref.trim());
        return value !== undefined ? String(value) : match;
      });
    }

    // Remap data refs: sub-phase names -> virtual IDs (e.g. "generate-roast.result" -> "_fe:roast-loop:generate-roast.result")
    function remapSubPhaseRefs(str) {
      return str.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
        const refId = ref.trim().split('.')[0];
        if (subNames.includes(refId)) {
          return '{{' + ref.trim().replace(refId, `_fe:${foreachPhaseId}:${refId}`) + '}}';
        }
        return match;
      });
    }
    if (subConfig.message) {
      subConfig.message = remapSubPhaseRefs(subConfig.message);
    }
    if (subConfig.prompt) {
      subConfig.prompt = remapSubPhaseRefs(subConfig.prompt);
    }
    if (subConfig.input && subNames.includes(subConfig.input.split('.')[0])) {
      const refParts = subConfig.input.split('.');
      subConfig.input = `_fe:${foreachPhaseId}:${refParts[0]}` + (refParts.length > 1 ? '.' + refParts.slice(1).join('.') : '');
    }
    if (subConfig.content && subNames.includes(subConfig.content.split('.')[0])) {
      const refParts = subConfig.content.split('.');
      subConfig.content = `_fe:${foreachPhaseId}:${refParts[0]}` + (refParts.length > 1 ? '.' + refParts.slice(1).join('.') : '');
    }

    // Set next: chain sub-phases, last one loops back to foreach orchestrator
    if (i < subNames.length - 1) {
      subConfig.next = virtualIds[i + 1];
    } else {
      subConfig.next = `_fe:${foreachPhaseId}:_advance`;
    }

    engine.config.phases[virtualIds[i]] = subConfig;
  }

  // Create the _advance virtual phase (triggers next iteration or exit)
  const advanceId = `_fe:${foreachPhaseId}:_advance`;
  engine.config.phases[advanceId] = { type: '_foreach_advance', id: advanceId, foreachPhaseId };

  // Register all transitions
  const currentState = engine.stateMachine.getState();
  engine.stateMachine.addDynamicTransition(currentState, virtualIds[0]);
  for (let i = 0; i < virtualIds.length; i++) {
    if (i < virtualIds.length - 1) {
      engine.stateMachine.addDynamicTransition(virtualIds[i], virtualIds[i + 1]);
    } else {
      engine.stateMachine.addDynamicTransition(virtualIds[i], advanceId);
    }
  }
  // _advance can go to next iteration's first sub-phase, or the foreach's next phase
  const fePhase = engine.config.phases[foreachPhaseId];
  if (fePhase.next) {
    engine.stateMachine.addDynamicTransition(advanceId, fePhase.next);
  }
  // Allow transition to next iteration's first sub-phase
  engine.stateMachine.addDynamicTransition(advanceId, virtualIds[0]);

  return virtualIds[0];
}

async function advanceForeach(code, room, foreachPhaseId) {
  const engine = room.engine;
  const state = engine.foreachState[foreachPhaseId];
  const feConfig = engine.config.phases[foreachPhaseId];

  // Apply scoring for this iteration if configured
  if (feConfig.scoring) {
    const scoringSubId = `_fe:${foreachPhaseId}:${feConfig.scoring.subPhase}`;
    const subData = engine.getPhaseData(scoringSubId);
    if (subData) {
      const item = state.items[state.currentIndex];
      const scoringMode = feConfig.scoring.mode || 'correct';
      const responses = subData.responses || [];

      if (scoringMode === 'tally') {
        // Tally mode: award points to the ITEM'S AUTHOR based on what others picked
        const authorId = item.playerId;
        const pointMap = feConfig.scoring.pointMap || {};
        if (authorId) {
          if (!state.scores[authorId]) state.scores[authorId] = 0;
          for (const r of responses) {
            const choice = r.choice || r.text;
            const points = pointMap[choice] !== undefined ? pointMap[choice] : 0;
            state.scores[authorId] += points;
          }
        }
      } else {
        // Correct mode (default): award points to the GUESSER for correct guesses
        const correctRef = feConfig.scoring.correctAnswer;
        let correctAnswer;
        if (correctRef === '_current.playerId') {
          correctAnswer = item.playerId;
        } else if (correctRef === '_current.playerName') {
          correctAnswer = item.playerName;
        } else if (correctRef === '_current.isHuman') {
          correctAnswer = item.isAI ? 'AI' : 'Human';
        } else if (correctRef === '_current.aiPosition') {
          correctAnswer = item.aiPosition;
        } else if (correctRef === '_current.humanPosition') {
          correctAnswer = item.humanPosition;
        } else if (correctRef && correctRef.startsWith('_current.')) {
          correctAnswer = engine.resolve(correctRef);
        } else {
          correctAnswer = correctRef;
        }

        const pointsCorrect = feConfig.scoring.pointsCorrect || 100;
        const pointsDecoy = feConfig.scoring.pointsDecoy || 0;

        for (const r of responses) {
          if (!state.scores[r.playerId]) state.scores[r.playerId] = 0;
          const playerChoice = r.choice || r.text;
          const chosenPlayer = engine.players.list().find(p => p.name === playerChoice);
          const isCorrect = (playerChoice === correctAnswer) ||
                            (chosenPlayer && chosenPlayer.id === correctAnswer);
          state.scores[r.playerId] += isCorrect ? pointsCorrect : pointsDecoy;
        }
      }

      console.log(`[foreach] Iteration ${state.currentIndex + 1}/${state.items.length} scored (${scoringMode}). Scores:`,
        Object.fromEntries(Object.entries(state.scores).map(([pid, s]) => [engine.players.find(pid)?.name || pid, s]))
      );
    }
  }

  // Move to next iteration or finish
  const nextIndex = state.currentIndex + 1;
  if (nextIndex < state.items.length) {
    const firstSubId = setupForeachIteration(engine, foreachPhaseId, feConfig, nextIndex);
    engine.transition(firstSubId);
    await handlePhase(code, room);
  } else {
    // Foreach complete — store final data
    engine.storePhaseData(foreachPhaseId, {
      scores: state.scores,
      itemCount: state.items.length
    });
    engine._currentForeachItem = null;
    engine._foreachCandidates = null;

    console.log(`[foreach] '${foreachPhaseId}' complete. ${state.items.length} iterations.`);

    const nextId = feConfig.next;
    if (nextId) {
      engine.stateMachine.addDynamicTransition(engine.stateMachine.getState(), nextId);
      engine.transition(nextId);
      await handlePhase(code, room);
    }
  }
}

async function tallyAndAdvance(code, room) {
  const engine = room.engine;
  const vs = room.phaseState;

  let result;
  if (vs.mode === 'pick-one') {
    result = tallyPickOne(vs.votes, vs.candidateIds);
  } else {
    result = tallyHeadToHead(vs.votes, vs.candidateIds, vs.matchups);
  }

  engine.storePhaseData(vs.phaseId, {
    votes: vs.votes,
    scores: result.scores,
    winner: result.winner,
    tied: result.tied,
    totalVotes: result.totalVotes
  });

  console.log(`[tally] Phase '${vs.phaseId}' tallied: winner=${result.winner}, totalVotes=${result.totalVotes}`);

  const phaseConfig = engine.config.phases[vs.phaseId];
  phaseConfig.id = vs.phaseId;

  const nextId = getNextPhaseId(engine, phaseConfig);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// Services bundle passed to phase handler context
const phaseServices = {
  io, roomToHost, aiService,
  resolveTemplate, resolvePerPlayerTemplate, resolveScreenControl, getNextPhaseId, getEligibleVoters,
  handlePhase: (code, room) => handlePhase(code, room),
  // Helpers needed by complex phase handlers
  generateMatchups,
  closeRanking: (code, room) => closeRanking(code, room),
  closeWager: (code, room) => closeWager(code, room),
  emitRelayTurn: (code, room) => emitRelayTurn(code, room),
  shuffleArray,
  setupForeachIteration,
  advanceForeach: (code, room, id) => advanceForeach(code, room, id)
};

async function handlePhase(code, room) {
  const engine = room.engine;
  const phase = engine.getCurrentPhase();
  const hostSocketId = roomToHost.get(code);

  console.log(`[handlePhase] Room ${code} handling '${phase.id}' (type: ${phase.type})`);

  // Auto-wipe previous phase state (cleanup timers first)
  if (room.phaseState && room.phaseState.cleanup) {
    room.phaseState.cleanup();
  }
  room.phaseState = {};
  room.phaseInstanceId = (room.phaseInstanceId || 0) + 1;
  recordEvent(room, 'phase-enter', { phaseType: phase.type });

  // Dispatch to registered handler
  const handler = getHandler(phase.type);
  if (handler) {
    const ctx = createPhaseContext(code, room, phaseServices);
    try {
      return await handler.onEnter(ctx);
    } catch (err) {
      console.error(`[handlePhase] Error in '${phase.id}' (type: ${phase.type}):`, err.message);
      recordEvent(room, 'phase-error', { phaseType: phase.type, error: err.message });
      room.paused = true;
      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) {
        const nextId = getNextPhaseId(engine, phase);
        io.to(hostSocketId).emit(EVENTS.PHASE_ERROR, {
          phaseId: phase.id,
          phaseType: phase.type,
          message: err.message,
          canRetry: true,
          canSkip: !!nextId
        });
      }
      // Tell players the game is paused so they don't stare at a stale screen
      io.to(code).emit(EVENTS.PHASE_PAUSED, {
        message: 'The teacher is resolving an issue. Please wait...'
      });
      return;
    }
  }

  console.warn(`[handlePhase] No handler registered for phase type: ${phase.type}`);
}

// --- Reconnection: send current state to a reconnecting player ---

function sendCurrentState(socket, code, room) {
  if (!room.engine) return;

  const phase = room.engine.getCurrentPhase();
  if (!phase) return;

  console.log(`[sendCurrentState] Sending phase '${phase.id}' (${phase.type}) to ${socket.id}`);

  // Dispatch to registered handler
  const handler = getHandler(phase.type);
  if (handler && handler.onReconnect) {
    const ctx = createPhaseContext(code, room, phaseServices);
    return handler.onReconnect(ctx, socket);
  }

  // lobby: nothing extra — they'll see the waiting screen
}

// --- Disconnect grace period tracking ---
const disconnectTimers = new Map();

// --- Express Routes ---

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Classroom Games</title>
      <style>
        body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        a { display: block; margin: 20px 0; font-size: 1.5em; }
      </style>
    </head>
    <body>
      <h1>Classroom Games</h1>
      <a href="/host">Host Screen</a>
      <a href="/player">Player Screen</a>
      <a href="/designer">Game Designer</a>
      <a href="/prototype">Prototype Mode</a>
    </body>
    </html>
  `);
});

app.use('/host', express.static(join(__dirname, 'screens/host')));
app.use('/player', express.static(join(__dirname, 'screens/player')));
app.use('/shared', express.static(join(__dirname, 'screens/shared')));
app.use('/prototype', express.static(join(__dirname, 'screens/prototype')));

app.get('/designer/edit', (req, res) => {
  res.sendFile('editor.html', { root: join(__dirname, 'screens', 'designer') });
});

app.use('/designer', express.static(join(__dirname, 'screens/designer')));

app.get('/api/games/:gameId', async (req, res) => {
  try {
    const config = await loadGame(req.params.gameId);
    res.json(config);
  } catch (error) {
    console.log(`[api/games/:gameId] Error: ${error.message}`);
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/rooms/:code/journal', (req, res) => {
  const room = roomManager.find(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    code: room.code,
    currentPhaseId: room.engine ? room.engine.getCurrentPhase().id : null,
    phaseInstanceId: room.phaseInstanceId || 0,
    journal: room.journal || []
  });
});

app.get('/api/games', async (req, res) => {
  try {
    const entries = await readdir(GAMES_DIR, { withFileTypes: true });
    const games = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      try {
        const config = await loadGame(entry.name);
        games.push({
          id: entry.name,
          name: config.name,
          description: config.description || '',
          phaseCount: Object.keys(config.phases).length,
          minPlayers: config.minPlayers || null,
          maxPlayers: config.maxPlayers || null
        });
      } catch {
        // Skip games with invalid configs
      }
    }

    res.json({ games });
  } catch (error) {
    console.log(`[api/games] Error: ${error.message}`);
    res.status(500).json({ games: [], error: 'Failed to load games' });
  }
});

app.put('/api/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const config = req.body;
    const stripped = stripUnknownFields(config);
    if (stripped.length) {
      console.log(`[api/games PUT] Stripped ${stripped.length} unknown field(s): ${stripped.join(', ')}`);
    }
    validate(config, gameId);
    const configPath = join(GAMES_DIR, gameId, 'config.json');
    await access(configPath);
    await writeFile(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true, stripped });
  } catch (error) {
    console.log(`[api/games PUT] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Thin wrapper: delegates to engine/normalizer.js's normalizeConfig in
// ai-cleanup mode, then mutates the input config in place to preserve
// the existing API contract (callers expect `config` to be mutated and
// receive a `string[]` of stripped paths). Other normalizer behaviors
// (alias rewrite, type coercion) are also applied — verified to be
// no-ops on all currently-shipping games.
function stripUnknownFields(config) {
  const { config: cleaned, diagnostics } = normalizeConfig(config, VALIDATION_MODES.AI_CLEANUP);
  // Copy cleaned phases back into the caller's object
  if (cleaned && cleaned.phases) {
    config.phases = cleaned.phases;
  }
  return diagnostics
    .filter(d => d.code === DIAGNOSTIC_CODES.UNKNOWN_FIELD_REMOVED)
    .map(d => (d.path || '').replace(/^phases\./, ''));
}

app.post('/api/games', async (req, res) => {
  try {
    const { id, config } = req.body;
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return res.status(400).json({ error: 'Invalid game ID. Use lowercase letters, numbers, and hyphens. Must not start with a hyphen.' });
    }
    const gameDir = join(GAMES_DIR, id);
    try {
      await access(gameDir);
      return res.status(409).json({ error: `Game "${id}" already exists.` });
    } catch {
      // Directory doesn't exist — good
    }
    validate(config, id);
    await mkdir(gameDir, { recursive: true });
    await writeFile(join(gameDir, 'config.json'), JSON.stringify(config, null, 2));
    res.json({ success: true, id });
  } catch (error) {
    console.log(`[api/games POST] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/games/review', async (req, res) => {
  try {
    const { config, depth } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    const structural = validate(config, 'review', { returnResults: true });
    const ai = await aiService.review({ config, depth: depth || 'light' });
    res.json({ structural, ai });
  } catch (error) {
    console.log(`[api/games/review] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/fix-issue', async (req, res) => {
  try {
    const { config, phaseId, issue } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    if (!phaseId || !config.phases[phaseId]) {
      return res.status(400).json({ error: 'Invalid phaseId' });
    }
    if (!issue || !issue.message) {
      return res.status(400).json({ error: 'Missing issue' });
    }
    const phase = config.phases[phaseId];
    const otherPhaseIds = Object.keys(config.phases).filter(id => id !== phaseId);
    const result = await aiService.fixIssue({ phase, phaseId, issue, otherPhaseIds });
    res.json(result);
  } catch (error) {
    console.log(`[api/games/fix-issue] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/revise', async (req, res) => {
  try {
    const { config, request } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    if (!request || typeof request !== 'string' || !request.trim()) {
      return res.status(400).json({ error: 'Missing request' });
    }
    const result = await aiService.reviseGame({ config, request });
    // Validate the AI's revised config; surface errors so the client can show them
    const structural = validate(result.updatedConfig, 'revise', { returnResults: true });
    res.json({ ...result, structural });
  } catch (error) {
    console.log(`[api/games/revise] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/revise-phase', async (req, res) => {
  try {
    const { config, phaseId, request } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    if (!phaseId || !config.phases[phaseId]) {
      return res.status(400).json({ error: 'Invalid phaseId' });
    }
    if (!request || typeof request !== 'string' || !request.trim()) {
      return res.status(400).json({ error: 'Missing request' });
    }
    const result = await aiService.revisePhase({ config, phaseId, request });
    res.json(result);
  } catch (error) {
    console.log(`[api/games/revise-phase] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/generate-theme', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Missing description' });
    }
    const colors = await aiService.generateTheme(description);
    res.json({ colors });
  } catch (error) {
    console.log(`[api/games/generate-theme] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/generate-questions', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a game description (at least 10 characters)' });
    }
    console.log(`[api/games/generate-questions] Analyzing: "${description.substring(0, 80)}..."`);
    const result = await aiService.generateQuestions(description);
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.log(`[api/games/generate-questions] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/generate', async (req, res) => {
  try {
    const { description, answers } = req.body;
    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a game description (at least 10 characters)' });
    }
    console.log(`[api/games/generate] Generating game from: "${description.substring(0, 80)}..."`);
    const config = await aiService.generateGame(description, answers);
    if (config.error) {
      return res.status(500).json({ error: config.error, raw: config.raw });
    }
    if (config.unsupported) {
      return res.json({ unsupported: true, reason: config.reason, suggestion: config.suggestion });
    }
    res.json({ config });
  } catch (error) {
    console.log(`[api/games/generate] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    if (gameId.startsWith('_')) {
      return res.status(400).json({ error: 'Cannot delete template directories.' });
    }
    const gameDir = join(GAMES_DIR, gameId);
    await access(gameDir);
    await rm(gameDir, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    console.log(`[api/games DELETE] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log(`[connect] Socket ${socket.id} connected`);

  socket.on(EVENTS.GET_GAMES, async () => {
    try {
      const entries = await readdir(GAMES_DIR, { withFileTypes: true });
      const games = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
        try {
          const config = await loadGame(entry.name);
          games.push({
            id: entry.name,
            name: config.name,
            description: config.description || ''
          });
        } catch {
          // Skip games with invalid configs
        }
      }

      socket.emit(EVENTS.GAMES_LIST, { games });
    } catch (error) {
      console.log(`[get-games] Error: ${error.message}`);
      socket.emit(EVENTS.GAMES_LIST, { games: [] });
    }
  });

  socket.on(EVENTS.CREATE_ROOM, async (payload = {}) => {
    if (!checkEventPayload(socket, 'create-room', payload)) return;
    const { gameId } = payload;
    const selectedGame = gameId || DEFAULT_GAME;

    try {
      const config = await loadGame(selectedGame);
      const hooks = await loadHooks(selectedGame);
      const code = roomManager.create();
      const room = roomManager.find(code);

      room.engine = new GameEngine(config);
      room.engine.hooks = hooks;

      roomToHost.set(code, socket.id);
      socket.join(code);
      console.log(`[create-room] Room ${code} created by ${socket.id} (game: ${selectedGame})`);
      socket.emit(EVENTS.ROOM_CREATED, { code, game: config.name, theme: config.theme || null });
    } catch (error) {
      console.log(`[create-room] Error loading game "${selectedGame}": ${error.message}`);
      socket.emit(EVENTS.CREATE_ROOM_ERROR, { message: error.message });
    }
  });

  socket.on(EVENTS.JOIN_ROOM, (payload = {}) => {
    if (!checkEventPayload(socket, 'join-room', payload)) return;
    const { code, name, token } = payload;
    console.log(`[join-room] ${socket.id} trying to join ${code} as "${name}"`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[join-room] Room ${code} not found`);
      socket.emit(EVENTS.JOIN_ERROR, { message: 'Room not found' });
      return;
    }

    const players = room.engine ? room.engine.players : room.playerRegistry;

    try {
      // Check for reconnection: token match first, then name fallback
      const existing = (token && players.findByToken(token))
        || (() => { const processedName = name || 'Anonymous'; const p = players.findByName(processedName); return p && !p.connected ? p : null; })();
      if (existing && !existing.connected) {
        console.log(`[join-room] Reconnecting ${existing.name} via ${token ? 'token' : 'name'} (old: ${existing.id} -> new: ${socket.id})`);
        players.reconnect(existing.id, socket.id);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        const player = players.find(socket.id);
        const theme = room.engine ? (room.engine.config.theme || null) : null;
        socket.emit(EVENTS.JOIN_SUCCESS, { name: player.name, reconnected: true, token: player.token, theme });

        const hostSocketId = roomToHost.get(code);
        if (hostSocketId) {
          io.to(hostSocketId).emit(EVENTS.PLAYER_RECONNECTED, {
            id: socket.id,
            name: player.name,
            players: players.listPublic()
          });
        }

        // Send current game state to reconnecting player
        sendCurrentState(socket, code, room);
        return;
      }

      const playerToken = randomUUID();
      players.add(socket.id, name, playerToken);
      const player = players.find(socket.id);
      socketToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[join-room] ${player.name} (${socket.id}) joined room ${code}`);
      const theme = room.engine ? (room.engine.config.theme || null) : null;
      socket.emit(EVENTS.JOIN_SUCCESS, { name: player.name, token: playerToken, theme });

      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) {
        io.to(hostSocketId).emit(EVENTS.PLAYER_JOINED, {
          id: socket.id,
          name: player.name,
          players: players.listPublic()
        });
      }
    } catch (error) {
      console.log(`[join-room] Error: ${error.message}`);
      socket.emit(EVENTS.JOIN_ERROR, { message: error.message });
    }
  });

  socket.on(EVENTS.START_GAME, async (payload = {}) => {
    if (!checkEventPayload(socket, 'start-game', payload)) return;
    const { code } = payload;
    console.log(`[start-game] Starting game in room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[start-game] Room ${code} not found`);
      return;
    }

    try {
      if (room.engine) {
        const lobby = room.engine.getCurrentPhase();
        room.engine.transition(lobby.next);
        console.log(`[start-game] Room ${code} now in '${room.engine.getCurrentPhase().id}' phase`);
        await handlePhase(code, room);
      } else {
        room.stateMachine.transition('collect');
        const prompt = "What did you do this weekend?";
        console.log(`[start-game] Room ${code} now in 'collect' state`);
        io.to(code).emit(EVENTS.GAME_STARTED, { prompt });
      }
    } catch (error) {
      console.log(`[start-game] Error: ${error.message}`);
    }
  });

  socket.on(EVENTS.SUBMIT_RESPONSE, (payload = {}) => {
    if (!checkEventPayload(socket, 'submit-response', payload)) return;
    const { code, response, phaseInstanceId } = payload;
    console.log(`[submit-response] Response from ${socket.id} in room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[submit-response] Room ${code} not found`);
      return;
    }
    if (isStalePhaseEvent(room, phaseInstanceId, 'submit-response')) return;

    const players = room.engine ? room.engine.players : room.playerRegistry;
    const player = players.find(socket.id);
    if (!player) {
      console.log(`[submit-response] Player ${socket.id} not found in room`);
      return;
    }

    players.update(socket.id, { response });
    console.log(`[submit-response] Stored response from ${player.name}`);
    recordEvent(room, 'submit-response', { player: player.name });

    // Count based on eligible players for current collect phase
    let eligible;
    if (room.engine) {
      const phase = room.engine.getCurrentPhase();
      const from = phase.from || 'all';
      eligible = getEligibleVoters(room.engine.players, from);
      // Exclude self-excluded author in foreach
      if (phase._foreachAuthorId) {
        eligible = eligible.filter(p => p.id !== phase._foreachAuthorId);
      }
    } else {
      eligible = players.list();
    }
    const submitted = eligible.filter(p => p.response).length;
    const total = eligible.length;

    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit(EVENTS.RESPONSE_RECEIVED, {
        playerName: player.name,
        count: submitted,
        total
      });
    }
  });

  socket.on(EVENTS.CLOSE_SUBMISSIONS, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-submissions', payload)) return;
    const { code, phaseInstanceId } = payload;
    console.log(`[close-submissions] Closing submissions for room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[close-submissions] Room ${code} not found`);
      return;
    }
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-submissions')) return;
    recordEvent(room, 'close-submissions');

    try {
      if (room.engine) {
        const collectPhase = room.engine.getCurrentPhase();
        const players = room.engine.players;
        const from = collectPhase.from || 'all';

        // Gather responses from eligible players and store as phase data
        const eligible = getEligibleVoters(players, from);
        const responses = eligible
          .filter(p => p.response)
          .map(p => {
            const r = p.response;
            // Multi-field responses come as objects with field keys
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              const textParts = Object.values(r);
              return { playerId: p.id, name: p.name, text: textParts.join(' | '), fields: r };
            }
            return { playerId: p.id, name: p.name, text: r };
          });

        // For collect-choice, also compute tally
        if (collectPhase.type === 'collect-choice') {
          const tally = {};
          for (const r of responses) {
            tally[r.text] = (tally[r.text] || 0) + 1;
          }
          // Store with choice field for clarity
          const choiceResponses = responses.map(r => ({ playerId: r.playerId, name: r.name, choice: r.text, text: r.text }));
          room.engine.storePhaseData(collectPhase.id, { responses: choiceResponses, tally });
          console.log(`[close-submissions] Stored ${choiceResponses.length} choices for phase '${collectPhase.id}'`);
        } else {
          room.engine.storePhaseData(collectPhase.id, { responses });
          console.log(`[close-submissions] Stored ${responses.length} responses for phase '${collectPhase.id}'`);
        }

        // Clear responses for next collect phase
        for (const p of players.list()) {
          if (p.response) players.update(p.id, { response: undefined });
        }

        // Advance to next phase and let handlePhase take over
        const collectNextId = getNextPhaseId(room.engine, collectPhase);
        if (collectNextId) {
          room.engine.transition(collectNextId);
          await handlePhase(code, room);
        }
      } else {
        // Legacy path (no engine)
        room.stateMachine.transition('process');
        console.log(`[close-submissions] Room ${code} now in 'process' state`);
        io.to(code).emit(EVENTS.PROCESSING_STARTED);

        const players = room.playerRegistry.list();
        const responses = players
          .filter(p => p.response)
          .map(p => ({ name: p.name, text: p.response }));
        console.log(`[close-submissions] Gathered ${responses.length} responses`);

        const aiResult = await aiService.process({
          instruction: 'Write a short, funny poem combining all these weekend activities',
          responses
        });
        console.log(`[close-submissions] AI returned: ${aiResult.text}`);

        room.stateMachine.transition('reveal');
        console.log(`[close-submissions] Room ${code} now in 'reveal' state`);

        io.to(code).emit(EVENTS.SHOW_RESULTS, {
          aiResult: aiResult.text,
          responses: responses.map(r => ({ name: r.name, response: r.text }))
        });
      }
    } catch (error) {
      console.log(`[close-submissions] Error: ${error.message}`);
    }
  });

  socket.on(EVENTS.SUBMIT_VOTE, async (payload = {}) => {
    if (!checkEventPayload(socket, 'submit-vote', payload)) return;
    const { code, choice, votes: votesList, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'submit-vote')) return;

    const vs = room.phaseState;
    if (!vs.eligibleVoterIds) return;
    if (!vs.eligibleVoterIds.includes(socket.id)) return;
    if (vs.votersCompleted.has(socket.id)) return;

    if (vs.mode === 'pick-one') {
      vs.votes.push({ voterId: socket.id, choice });
    } else if (vs.mode === 'head-to-head' && Array.isArray(votesList)) {
      for (const vote of votesList) {
        vs.votes.push({ voterId: socket.id, choice: vote.choice });
      }
    }

    vs.votersCompleted.add(socket.id);
    console.log(`[submit-vote] ${socket.id} voted (${vs.votersCompleted.size}/${vs.eligibleVoterIds.length})`);

    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit(EVENTS.VOTE_RECEIVED, {
        count: vs.votersCompleted.size,
        total: vs.eligibleVoterIds.length
      });
    }

    // Auto-tally when all eligible voters have voted
    if (vs.votersCompleted.size >= vs.eligibleVoterIds.length) {
      await tallyAndAdvance(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_VOTING, async ({ code, phaseInstanceId } = {}) => {
    console.log(`[close-voting] Host closing voting for room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-voting')) return;
    recordEvent(room, 'close-voting');

    await tallyAndAdvance(code, room);
  });

  socket.on(EVENTS.ADVANCE_PHASE, async ({ code, phaseInstanceId } = {}) => {
    console.log(`[advance-phase] Advancing phase in room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'advance-phase')) return;
    recordEvent(room, 'advance-phase');

    try {
      const currentPhase = room.engine.getCurrentPhase();
      const advNextId = getNextPhaseId(room.engine, currentPhase);
      if (advNextId) {
        room.engine.transition(advNextId);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.log(`[advance-phase] Error: ${error.message}`);
    }
  });

  socket.on(EVENTS.RETRY_PHASE, async ({ code } = {}) => {
    console.log(`[retry-phase] Retrying current phase in room ${code}`);
    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    recordEvent(room, 'retry-phase');
    room.paused = false;
    try {
      await handlePhase(code, room);
    } catch (error) {
      console.error(`[retry-phase] Error: ${error.message}`);
    }
  });

  socket.on(EVENTS.SKIP_PHASE, async ({ code } = {}) => {
    console.log(`[skip-phase] Skipping current phase in room ${code}`);
    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    recordEvent(room, 'skip-phase');
    room.paused = false;
    try {
      const currentPhase = room.engine.getCurrentPhase();
      const nextId = getNextPhaseId(room.engine, currentPhase);
      if (nextId) {
        room.engine.transition(nextId);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.error(`[skip-phase] Error: ${error.message}`);
    }
  });

  socket.on(EVENTS.REVEAL_NEXT, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'reveal-next')) return;

    const state = room.phaseState;
    if (state.revealed >= state.items.length) return;

    const item = state.items[state.revealed];
    state.revealed++;
    room.engine.storePhaseData(state.phaseId, { items: state.items, revealed: state.revealed });

    console.log(`[reveal-next] Revealed item ${state.revealed}/${state.items.length} in room ${code}`);

    // Send to everyone
    io.to(code).emit(EVENTS.REVEAL_ONE_ITEM, {
      item, index: state.revealed, total: state.items.length
    });

    // If all revealed, send complete and allow advance
    if (state.revealed >= state.items.length) {
      io.to(code).emit(EVENTS.REVEAL_ONE_COMPLETE, {});
    }
  });

  // --- Rank events ---

  socket.on(EVENTS.RANK_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'rank-submit', payload)) return;
    const { code, ranking, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'rank-submit')) return;
    const rs = room.phaseState;
    if (!rs.eligibleIds.has(socket.id) || rs.completed.has(socket.id)) return;

    rs.submissions[socket.id] = ranking;
    rs.completed.add(socket.id);
    socket.emit(EVENTS.WAITING, { message: 'Ranking submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.RANK_RECEIVED, { count: rs.completed.size, total: rs.eligibleIds.size });

    if (rs.completed.size >= rs.eligibleIds.size) {
      await closeRanking(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_RANKING, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-ranking')) return;
    await closeRanking(code, room);
  });

  // --- Wager events ---

  socket.on(EVENTS.WAGER_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'wager-submit', payload)) return;
    const { code, option, amount, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'wager-submit')) return;
    const ws = room.phaseState;
    if (!ws.eligibleIds.has(socket.id) || ws.completed.has(socket.id)) return;

    const availPts = ws.scores[socket.id] || 0;
    const maxBet = Math.floor(availPts * (ws.maxBetPercent / 100));
    const clampedAmt = Math.max(ws.minBet, Math.min(amount || ws.minBet, maxBet));

    ws.wagers[socket.id] = { option, amount: clampedAmt };
    ws.completed.add(socket.id);
    socket.emit(EVENTS.WAITING, { message: 'Wager placed. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.WAGER_RECEIVED, { count: ws.completed.size, total: ws.eligibleIds.size });

    if (ws.completed.size >= ws.eligibleIds.size) {
      await closeWager(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_WAGER, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-wager')) return;
    await closeWager(code, room);
  });

  socket.on(EVENTS.WAGER_RESOLVE, async ({ code, winningOption, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'wager-resolve')) return;
    await resolveWager(code, room, winningOption);
  });

  // --- Relay events ---

  socket.on(EVENTS.RELAY_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'relay-submit', payload)) return;
    const { code, text, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'relay-submit')) return;
    const rs = room.phaseState;
    if (rs.turnOrder[rs.currentTurnIndex] !== socket.id) return;

    if (rs.turnTimer) { clearTimeout(rs.turnTimer); rs.turnTimer = null; }

    const player = room.engine.players.find(socket.id);
    rs.sharedResult.push({ playerId: socket.id, name: player ? player.name : 'Unknown', text: text || '' });
    rs.currentTurnIndex++;

    if (rs.currentTurnIndex >= rs.turnOrder.length) {
      const engine = room.engine;
      const phase = engine.config.phases[rs.phaseId];
      const fullText = rs.sharedResult.map(r => r.text).join(' ');
      engine.storePhaseData(rs.phaseId, { result: rs.sharedResult, text: fullText });

      const nextId = getNextPhaseId(engine, phase);
      if (nextId) {
        engine.transition(nextId);
        await handlePhase(code, room);
      }
    } else {
      emitRelayTurn(code, room);
    }
  });

  // Host-only: fast-forward all remaining relay turns. Each remaining player
  // gets a "(skipped)" entry; then the phase advances. Used by prototype Skip
  // Timer and could be wired to a host UI button later.
  socket.on(EVENTS.RELAY_FINISH_ALL, async ({ code } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    const rs = room.phaseState;
    const phase = room.engine && room.engine.config.phases[rs.phaseId];
    if (!phase || phase.type !== 'relay') return;
    if (rs.turnTimer) { clearTimeout(rs.turnTimer); rs.turnTimer = null; }

    while (rs.currentTurnIndex < rs.turnOrder.length) {
      const pid = rs.turnOrder[rs.currentTurnIndex];
      const player = room.engine.players.find(pid);
      rs.sharedResult.push({ playerId: pid, name: player ? player.name : 'Unknown', text: '(skipped)' });
      rs.currentTurnIndex++;
    }

    const fullText = rs.sharedResult.map(r => r.text).join(' ');
    room.engine.storePhaseData(rs.phaseId, { result: rs.sharedResult, text: fullText });
    console.log(`[relay-finish-all] Skipped remaining turns in room ${code}`);

    const nextId = getNextPhaseId(room.engine, phase);
    if (nextId) {
      room.engine.transition(nextId);
      await handlePhase(code, room);
    }
  });

  // Preview events — delegated to handler
  for (const previewEvent of ['preview-approve', 'preview-reject', 'preview-edit']) {
    socket.on(previewEvent, async (payload = {}) => {
      const { code, phaseInstanceId } = payload;
      const room = roomManager.find(code);
      if (!room || !room.engine) return;
      if (isStalePhaseEvent(room, phaseInstanceId, previewEvent)) return;

      try {
        const handler = getHandler(room.engine.getCurrentPhase().type);
        if (handler && handler.onHostEvent) {
          const ctx = createPhaseContext(code, room, phaseServices);
          await handler.onHostEvent(ctx, previewEvent, socket, payload);
        }
      } catch (error) {
        console.log(`[${previewEvent}] Error: ${error.message}`);
      }
    });
  }

  socket.on(EVENTS.END_GAME, ({ code } = {}) => {
    console.log(`[end-game] Ending game in room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[end-game] Room ${code} not found`);
      return;
    }

    try {
      if (room.engine) {
        const currentPhase = room.engine.getCurrentPhase();
        const nextPhaseId = currentPhase.next;
        if (nextPhaseId) {
          room.engine.transition(nextPhaseId);
        }
      } else {
        room.stateMachine.transition('end');
      }
      console.log(`[end-game] Room ${code} now in 'end' state`);
      io.to(code).emit(EVENTS.GAME_ENDED);
    } catch (error) {
      console.log(`[end-game] Error: ${error.message}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] Socket ${socket.id} disconnected`);

    const code = socketToRoom.get(socket.id);
    if (code) {
      const room = roomManager.find(code);
      if (room) {
        const players = room.engine ? room.engine.players : room.playerRegistry;
        const player = players.find(socket.id);
        if (player) {
          console.log(`[disconnect] Marking ${player.name} as disconnected in room ${code}`);
          players.disconnect(socket.id);

          const hostSocketId = roomToHost.get(code);
          if (hostSocketId) {
            io.to(hostSocketId).emit(EVENTS.PLAYER_DISCONNECTED, {
              id: socket.id,
              name: player.name,
              players: players.listPublic()
            });
          }

          // Set grace period — remove after 30s if still disconnected
          const timerId = setTimeout(() => {
            disconnectTimers.delete(socket.id);
            const p = players.find(socket.id);
            if (p && !p.connected) {
              console.log(`[disconnect] Grace period expired, removing ${p.name} from room ${code}`);
              players.remove(socket.id);
              const hid = roomToHost.get(code);
              if (hid) {
                io.to(hid).emit(EVENTS.PLAYER_LEFT, {
                  id: socket.id,
                  players: players.listPublic()
                });
              }
            }
          }, 30000);
          disconnectTimers.set(socket.id, timerId);
        }
      }
      socketToRoom.delete(socket.id);
    }

    for (const [roomCode, hostId] of roomToHost) {
      if (hostId === socket.id) {
        console.log(`[disconnect] Host left, deleting room ${roomCode}`);
        roomManager.delete(roomCode);
        roomToHost.delete(roomCode);
        io.to(roomCode).emit(EVENTS.ROOM_CLOSED);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
