import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { randomUUID } from 'crypto';
import { readdir, readFile, writeFile, mkdir, rm, access } from 'fs/promises';
import { RoomManager } from './engine/room-manager.js';
import { GameEngine } from './engine/game-engine.js';
import { loadGame, validate, getAllowedFields, listGames, resolveGamePath } from './engine/game-loader.js';
import { normalizeConfig } from './engine/normalizer.js';
import { PHASE_SCHEMAS, getFields } from './engine/phase-schemas.js';
import { loadAllRecipes, getRecipe, listRecipes, summarizeRecipe } from './engine/recipe-loader.js';
import { compileRecipe } from './engine/recipe-compiler.js';
import { extractCandidates, buildUserRecipe } from './engine/recipe-extractor.js';
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
import { resolveVideoEmbed } from './engine/video.js';
import {
  DB_ENABLED,
  initDb,
  getUserGame,
  listUserGames,
  saveUserGame,
  deleteUserGame,
  userGameExists
} from './db.js';
import { checkSubmission } from './engine/content-filter.js';
import { buildSubmissionList, isVisibleSubmission } from './engine/moderation.js';
import { validatePayload } from './engine/event-schemas.js';
import { scoreResponses } from './engine/speed-scoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {any} */
const app = express();
const server = createServer(app);
const io = new Server(server);
// Render (and most PaaS) assign a port via $PORT; default to 3000 locally.
const PORT = Number(process.env.PORT) || 3000;

const aiMode = process.env.ANTHROPIC_API_KEY ? 'real' : 'mock';
console.log(`[init] AI Service mode: ${aiMode}`);
if (aiMode === 'mock') {
  console.log('[init] No ANTHROPIC_API_KEY found — AI generation endpoints are disabled (set the key to enable them).');
}

// AI-powered generation needs a real Anthropic key. In mock mode these
// endpoints would return placeholder junk, which looks like a broken feature
// (especially on a deployed host). Fail loudly with a fixable message instead.
function requireRealAI(res) {
  if (aiMode === 'real') return true;
  res.status(503).json({
    error: 'AI features are turned off on this server because no API key is configured. ' +
      'The site owner needs to set the ANTHROPIC_API_KEY environment variable ' +
      '(on Render: Dashboard → your service → Environment → Add Environment Variable), then redeploy.'
  });
  return false;
}

const roomManager = new RoomManager(gamePhases);
const aiService = new AIService({ mode: aiMode });
const socketToRoom = new Map();
const roomToHost = new Map();

app.use(express.json());

// --- Teacher-area password gate ---
// Set SITE_PASSWORD on the deployment to require Basic Auth on teacher
// surfaces (/host, /designer, /prototype) and any write API. Student paths
// (/player, /shared, /games/<assets>, /socket.io, read-only GETs) stay open.
// Username can be anything — only the password is checked.
function teacherAreaGate(req, res, next) {
  if (!process.env.SITE_PASSWORD) return next(); // unset = disabled (dev)
  const path = req.path;

  // Open: student-facing + utility paths
  if (
    path === '/' ||
    path === '/favicon.ico' ||
    path.startsWith('/player') ||
    path.startsWith('/shared') ||
    path.startsWith('/games/') ||      // uploaded assets (in-game images)
    path.startsWith('/socket.io')
  ) return next();

  // Open: read-only API (loading game lists, recipes, schemas, room journals)
  if (req.method === 'GET' && (
    path === '/api/games' ||
    path.startsWith('/api/games/') ||
    path === '/api/recipes' ||
    path.startsWith('/api/recipes/') ||
    path === '/api/phase-schemas' ||
    path.startsWith('/api/rooms/')
  )) return next();

  // Everything else (teacher UI + writes) requires the password
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (password === process.env.SITE_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Classroom Games Teacher Area"');
  res.status(401).type('text/plain').send('Teacher area - password required.');
}
app.use(teacherAreaGate);

const DEFAULT_GAME = 'weekend-poem';
const GAMES_DIR = join(__dirname, 'games');
const USER_GAMES_DIR = join(GAMES_DIR, 'user');

// Card-friendly metadata fields surfaced from each game's config.json to the
// designer landing page. Optional — missing fields just don't render.
const GAME_CARD_META_FIELDS = ['playTime', 'classSize', 'tags', 'recommendedFor'];

function pickCardMeta(config) {
  const out = {};
  for (const f of GAME_CARD_META_FIELDS) {
    if (config[f] !== undefined && config[f] !== null && config[f] !== '') {
      out[f] = config[f];
    }
  }
  return out;
}

// --- DB helpers ---

// Loads a game by ID: built-in games from filesystem, user games from DB
// (falling back to filesystem when DB_ENABLED is false for local dev).
async function loadGameById(gameId) {
  try {
    return await loadGame(gameId); // checks built-in dir, then games/user/ dir
  } catch (err) {
    if (!err.message.startsWith('Game not found')) throw err;
  }
  if (DB_ENABLED) {
    const row = await getUserGame(gameId);
    if (row) {
      const config = row.config;
      validate(config, gameId);
      Object.defineProperty(config, '_source', { value: 'user', enumerable: false });
      return config;
    }
  }
  throw new Error(`Game not found: ${gameId}`);
}

// On first DB-enabled startup, migrate any games/user/* still on disk into
// the database. Safe to run repeatedly (upsert). Handles the transition from
// the old filesystem-only setup to the DB-backed one.
async function migrateFilesystemGames() {
  let count = 0;
  try {
    const entries = await readdir(USER_GAMES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      try {
        const raw = await readFile(join(USER_GAMES_DIR, entry.name, 'config.json'), 'utf-8');
        const config = JSON.parse(raw);
        await saveUserGame(entry.name, config);
        count++;
      } catch {}
    }
  } catch {} // user dir may not exist
  if (count > 0) console.log(`[init] Migrated ${count} filesystem game(s) to database.`);
}

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
    // .mine / .assigned have no recipient at this layer — host-friendly note
    if (/\.mine$/.test(trimmed)) return '(each student gets their own)';
    if (/\.assigned$/.test(trimmed)) return '(each student gets a different player\'s item)';
    const value = engine.resolve(trimmed);
    return value !== undefined ? String(value) : match;
  });
}

// Resolve {{X.mine}} and {{X.assigned}} per recipient.
//   .mine     — looks up phaseData[X].byPlayer[playerId] (ai-process perPlayer / collect)
//   .assigned — looks up phaseData[X].assigned[playerId] (collect with rotateFrom)
// Other refs resolve normally.
function resolvePerPlayerTemplate(template, engine, playerId) {
  if (!template) return '';
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_-]+)\.assigned\s*\}\}/g, (match, phaseId) => {
      const data = engine.phaseData[phaseId];
      if (data && data.assigned && data.assigned[playerId] !== undefined) {
        return String(data.assigned[playerId]);
      }
      return match;
    })
    .replace(/\{\{\s*([a-zA-Z0-9_-]+)\.mine\s*\}\}/g, (match, phaseId) => {
      const data = engine.phaseData[phaseId];
      if (data && data.byPlayer && data.byPlayer[playerId] !== undefined) {
        return String(data.byPlayer[playerId]);
      }
      return match;
    })
    .replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
      if (/\.(mine|assigned)\s*$/.test(ref)) return match;
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

// --- Rate helpers ---

async function closeRating(code, room) {
  const rs = room.phaseState;
  if (!rs || !rs.phaseId || !rs.scales) return;
  if (rs.timer) { clearTimeout(rs.timer); rs.timer = null; }

  const engine = room.engine;
  const phase = engine.config.phases[rs.phaseId];

  const { aggregateRatings } = await import('./engine/phase-handlers/rate.js');
  const { averages, distributions, byScale } = aggregateRatings(rs.scales, rs.submissions);

  engine.storePhaseData(rs.phaseId, {
    averages,
    distributions,
    byPlayer: rs.submissions,
    byScale,
    scales: rs.scales
  });

  console.log(`[closeRating] Phase '${rs.phaseId}' tallied ${Object.keys(rs.submissions).length} rater(s) across ${rs.scales.length} scale(s)`);

  // Broadcast results — host always gets them; players only if visibility=all.
  // Do NOT auto-advance to the next phase here: the host needs time to read
  // the chart and decide when to move on (and players need time to see it
  // too, when visibility=all). The host's "Continue" button on the rate
  // results view fires advance-phase, which the global handler picks up.
  const hostId = roomToHost.get(code);
  if (hostId) {
    io.to(hostId).emit(EVENTS.RATE_RESULTS, {
      scales: rs.scales, averages, distributions, raterCount: Object.keys(rs.submissions).length,
      visibility: rs.visibility, phaseInstanceId: room.phaseInstanceId
    });
  }
  if (rs.visibility === 'all') {
    for (const player of engine.players.list()) {
      io.to(player.id).emit(EVENTS.RATE_RESULTS, {
        scales: rs.scales, averages, distributions, raterCount: Object.keys(rs.submissions).length,
        visibility: rs.visibility, phaseInstanceId: room.phaseInstanceId
      });
    }
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

// Resolve a phase.image config value to a web URL the browser can fetch.
// Config stores a relative path like "assets/photo.jpg"; runtime path is
// "/games/<gameId>/assets/photo.jpg" for built-in games and
// "/games/user/<gameId>/assets/photo.jpg" for user-created ones (which live
// under games/user/). Absolute URLs (http://...) and already-rooted
// paths (/...) pass through unchanged.
function resolveImageUrl(rel, gameId, source) {
  if (!rel || typeof rel !== 'string') return null;
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.startsWith('/')) return rel;
  if (!gameId) return null;
  const cleaned = rel.replace(/^\.?\//, '');
  if (source === 'user') return `/games/user/${gameId}/${cleaned}`;
  return `/games/${gameId}/${cleaned}`;
}

// Push the live moderation list (submitter name + text + hidden flag) to the
// host so the teacher can hide/kick during a collect phase. No-op if there's no
// engine or current phase isn't a collect-type.
function emitSubmissionsUpdate(code, room) {
  if (!room || !room.engine) return;
  const phase = room.engine.getCurrentPhase();
  if (!phase || (phase.type !== 'collect' && phase.type !== 'collect-choice')) return;
  const hostSocketId = roomToHost.get(code);
  if (!hostSocketId) return;
  const eligible = getEligibleVoters(room.engine.players, phase.from || 'all');
  io.to(hostSocketId).emit(EVENTS.SUBMISSIONS_UPDATE, {
    submissions: buildSubmissionList(eligible)
  });
}

// Services bundle passed to phase handler context
const phaseServices = {
  io, roomToHost, aiService,
  resolveTemplate, resolvePerPlayerTemplate, resolveScreenControl, getNextPhaseId, getEligibleVoters,
  resolveImageUrl, resolveVideoEmbed,
  handlePhase: (code, room) => handlePhase(code, room),
  // Helpers needed by complex phase handlers
  generateMatchups,
  closeRanking: (code, room) => closeRanking(code, room),
  closeRating: (code, room) => closeRating(code, room),
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

// Per-game uploaded assets — served as /games/<id>/assets/<filename>.
// Matches the path stored in config (`"assets/photo.jpg"` becomes
// `/games/<id>/assets/photo.jpg` at runtime).
app.use('/games', express.static(GAMES_DIR));

// --- Asset upload (multer) ---
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter(req, file, cb) {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, GIF, or WebP images allowed'));
    }
    cb(null, true);
  }
});

function sanitizeAssetFilename(original) {
  const ext = (extname(original) || '').toLowerCase();
  const stem = original.replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'image';
  const safeExt = ALLOWED_IMAGE_EXT.has(ext) ? ext : '.jpg';
  const stamp = Date.now().toString(36);
  return `${stem}-${stamp}${safeExt}`;
}

app.post('/api/games/:gameId/assets', assetUpload.single('file'), async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(gameId)) {
      return res.status(400).json({ error: 'Invalid game id.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file in request (field name must be "file").' });
    }
    let gameDir, source;
    try {
      ({ gameDir, source } = await resolveGamePath(gameId));
    } catch {
      // Game may live in DB (not on filesystem). Use the user-game path for assets.
      // Note: assets written here are on ephemeral disk and won't survive a Render
      // redeploy. Blob storage (e.g. Cloudflare R2) is the permanent fix.
      if (DB_ENABLED && await userGameExists(gameId)) {
        gameDir = join(USER_GAMES_DIR, gameId);
        source = 'user';
      } else {
        return res.status(404).json({ error: `Game "${gameId}" not found.` });
      }
    }
    const assetsDir = join(gameDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    const filename = sanitizeAssetFilename(req.file.originalname);
    await writeFile(join(assetsDir, filename), req.file.buffer);
    // URL prefix differs depending on which root the game lives in.
    const urlPrefix = source === 'user' ? `/games/user/${gameId}` : `/games/${gameId}`;
    res.json({
      path: `assets/${filename}`,
      url: `${urlPrefix}/assets/${filename}`,
      size: req.file.size
    });
  } catch (error) {
    console.log(`[api/games/:gameId/assets] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/games/:gameId', async (req, res) => {
  try {
    const config = await loadGameById(req.params.gameId);
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

app.get('/api/phase-schemas', (req, res) => {
  const summary = {};
  for (const [type, schema] of Object.entries(PHASE_SCHEMAS)) {
    const allFields = getFields(type);
    const requiredFields = [];
    const enumFields = {};
    for (const [fname, fdef] of Object.entries(allFields)) {
      if (fdef.required) requiredFields.push(fname);
      if (fdef.type === 'enum') enumFields[fname] = fdef.values;
    }
    for (const [tname, tdef] of Object.entries(schema.transitions || {})) {
      if (tdef.required && tname !== 'next') requiredFields.push(tname);
    }
    summary[type] = {
      requiredFields,
      enumFields,
      hostToggles: (schema.ui && schema.ui.hostToggles) || [],
      playerToggles: (schema.ui && schema.ui.playerToggles) || []
    };
  }
  res.json(summary);
});

app.get('/api/recipes', (req, res) => {
  const recipes = listRecipes().map(summarizeRecipe);
  res.json(recipes);
});

app.get('/api/recipes/:id', (req, res) => {
  const recipe = getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: `Recipe "${req.params.id}" not found` });
  res.json(summarizeRecipe(recipe));
});

app.post('/api/recipes/:id/compile', (req, res) => {
  const recipe = getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: `Recipe "${req.params.id}" not found` });

  const params = (req.body && req.body.params) || {};
  const { config, diagnostics } = compileRecipe(recipe, params);

  if (!config) {
    return res.status(400).json({
      error: 'Recipe parameters did not validate.',
      diagnostics
    });
  }

  // Run the compiled config through the game-loader validator so a
  // recipe can never produce a broken game. Recipes themselves should
  // already be authored to compile cleanly; this is a safety net.
  const validation = validate(config, req.params.id, { returnResults: true });
  if (validation.errors && validation.errors.length > 0) {
    return res.status(500).json({
      error: 'Recipe compiled but produced an invalid game config (recipe-author bug).',
      diagnostics,
      configErrors: validation.errors
    });
  }

  res.json({ config, diagnostics });
});

// Save-as-recipe (R5) — turn a built game into a reusable recipe.
//
// Two endpoints, called in sequence by the editor:
//
//   POST /api/recipes/draft  { config }
//     Returns { candidates: [...] } — auto-detected parameter candidates
//     (every parameterizable field on every phase, with suggested name +
//     label). The modal renders this list with checkboxes.
//
//   POST /api/recipes/user   { config, params, metadata }
//     Builds the finalized recipe from the user's choices, validates it,
//     writes it to recipes/user/{id}.json, busts the recipe cache so the
//     new recipe shows up in subsequent /api/recipes calls.

app.post('/api/recipes/draft', (req, res) => {
  const config = req.body && req.body.config;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'A game config is required.' });
  }
  try {
    const candidates = extractCandidates(config);
    res.json({ candidates });
  } catch (err) {
    console.log(`[api/recipes/draft] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipes/user', async (req, res) => {
  const { config, params, metadata } = req.body || {};
  if (!config || !metadata) {
    return res.status(400).json({ error: 'Missing config or metadata.' });
  }

  // Refuse to overwrite a built-in recipe id (collision risk + confusion)
  // unless the caller explicitly opted in by setting `overwrite: true`.
  // For now: built-ins are read-only via this endpoint.
  const existing = getRecipe(metadata.id);
  if (existing && existing._source === 'built-in') {
    return res.status(400).json({
      error: `Recipe id "${metadata.id}" matches a built-in recipe. Choose a different id.`
    });
  }

  const { recipe, diagnostics } = buildUserRecipe(config, params || [], metadata);
  if (!recipe) {
    return res.status(400).json({
      error: 'Recipe could not be built.',
      diagnostics
    });
  }

  // Smoke-test: compile with each parameter's default and run through
  // the game validator. If it fails, the user's recipe has a real
  // structural issue; refuse to save.
  const sampleParams = {};
  for (const [name, spec] of Object.entries(recipe.parameters || {})) {
    if (spec.default !== undefined) sampleParams[name] = spec.default;
  }
  const compileResult = compileRecipe(recipe, sampleParams);
  if (!compileResult.config) {
    return res.status(400).json({
      error: 'Recipe compiled but produced an invalid game config.',
      diagnostics: compileResult.diagnostics
    });
  }
  const safetyValidation = validate(compileResult.config, recipe.id, { returnResults: true });
  if (safetyValidation.errors && safetyValidation.errors.length > 0) {
    return res.status(400).json({
      error: 'Recipe produced an invalid game config when compiled with default values.',
      configErrors: safetyValidation.errors
    });
  }

  // Write to recipes/user/{id}.json
  try {
    const userDir = join(__dirname, 'recipes', 'user');
    await mkdir(userDir, { recursive: true });
    const filePath = join(userDir, `${recipe.id}.json`);
    await writeFile(filePath, JSON.stringify(recipe, null, 2), 'utf-8');

    // Bust the cache so the next /api/recipes call sees this one
    await loadAllRecipes({ force: true });

    res.json({
      success: true,
      recipe: summarizeRecipe(recipe),
      diagnostics
    });
  } catch (err) {
    console.log(`[api/recipes/user] Save error: ${err.message}`);
    res.status(500).json({ error: `Could not save recipe: ${err.message}` });
  }
});

app.delete('/api/recipes/user/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid recipe id.' });
  }

  // Refuse to delete built-in recipes — only files in recipes/user/
  // are removable through this endpoint.
  const recipe = getRecipe(id);
  if (!recipe) {
    return res.status(404).json({ error: `Recipe "${id}" not found.` });
  }
  if (recipe._source !== 'user') {
    return res.status(400).json({
      error: `Recipe "${id}" is built-in and cannot be deleted.`
    });
  }

  const filePath = join(__dirname, 'recipes', 'user', `${id}.json`);
  try {
    await rm(filePath);
    await loadAllRecipes({ force: true });
    res.json({ success: true, id });
  } catch (err) {
    console.log(`[api/recipes/user/:id DELETE] Error: ${err.message}`);
    res.status(500).json({ error: `Could not delete recipe: ${err.message}` });
  }
});

app.get('/api/games', async (req, res) => {
  try {
    const loaded = await listGames();
    const games = loaded.map(({ id, source, config }) => ({
      id,
      source,
      name: config.name,
      description: config.description || '',
      phaseCount: Object.keys(config.phases).length,
      minPlayers: config.minPlayers || null,
      maxPlayers: config.maxPlayers || null,
      ...pickCardMeta(config)
    }));

    if (DB_ENABLED) {
      const userRows = await listUserGames();
      for (const row of userRows) {
        const config = row.config;
        games.push({
          id: row.id,
          source: 'user',
          name: config.name,
          description: config.description || '',
          phaseCount: Object.keys(config.phases || {}).length,
          minPlayers: config.minPlayers || null,
          maxPlayers: config.maxPlayers || null,
          ...pickCardMeta(config)
        });
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
    if (DB_ENABLED && await userGameExists(gameId)) {
      await saveUserGame(gameId, config);
    } else {
      const { configPath } = await resolveGamePath(gameId);
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }
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
    // Reject collision with built-in games (always on filesystem)
    try {
      await access(join(GAMES_DIR, id));
      return res.status(409).json({ error: `Game "${id}" already exists as a built-in. Pick a different id.` });
    } catch {}
    // Check for existing user game in DB or filesystem
    if (DB_ENABLED) {
      if (await userGameExists(id)) {
        return res.status(409).json({ error: `Game "${id}" already exists.` });
      }
    } else {
      try {
        await access(join(USER_GAMES_DIR, id));
        return res.status(409).json({ error: `Game "${id}" already exists.` });
      } catch {}
    }
    validate(config, id);
    if (DB_ENABLED) {
      await saveUserGame(id, config);
    } else {
      const userGameDir = join(USER_GAMES_DIR, id);
      await mkdir(userGameDir, { recursive: true });
      await writeFile(join(userGameDir, 'config.json'), JSON.stringify(config, null, 2));
    }
    res.json({ success: true, id, source: 'user' });
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
    if (!requireRealAI(res)) return;
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
    if (!requireRealAI(res)) return;
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
    if (!requireRealAI(res)) return;
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
    if (!requireRealAI(res)) return;
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
    if (!requireRealAI(res)) return;
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

// Recipe-based AI generation (R4). Replaces the fragile generateGame
// flow as the default — AI matches the teacher's description to one
// of the seed recipes and fills parameters. Compiler turns the small
// structured output into a guaranteed-valid game config.
app.post('/api/games/from-description', async (req, res) => {
  try {
    if (!requireRealAI(res)) return;
    const { description } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a game description (at least 10 characters).' });
    }

    const recipes = listRecipes().map(summarizeRecipe);
    if (recipes.length === 0) {
      return res.status(503).json({ error: 'No recipes are loaded. Restart the server or check recipes/.' });
    }

    console.log(`[api/games/from-description] Matching: "${description.substring(0, 80)}..."`);
    const match = await aiService.matchRecipe(description, recipes);

    if (match.noMatch) {
      return res.json({
        noMatch: true,
        reason: match.reason || 'No recipe fits this description.',
        suggestion: match.suggestion || ''
      });
    }

    const recipe = getRecipe(match.recipe);
    if (!recipe) {
      // AI invented a recipe id — fall through to no-match.
      return res.json({
        noMatch: true,
        reason: `AI suggested an unknown recipe "${match.recipe}".`,
        suggestion: 'Try the recipe picker directly.'
      });
    }

    const { config, diagnostics } = compileRecipe(recipe, match.params || {});
    if (!config) {
      const errors = diagnostics.filter(d => d.severity === 'error').map(d => d.message);
      console.log(`[api/games/from-description] AI params failed validation: ${errors.join('; ')}`);
      return res.json({
        noMatch: true,
        reason: 'AI matched a recipe but its parameters did not validate.',
        suggestion: 'Try the recipe picker — fill in the parameters manually.',
        diagnostics
      });
    }

    res.json({
      config,
      recipe: { id: recipe.id, name: recipe.name, icon: recipe.icon },
      params: match.params,
      explanation: match.explanation || ''
    });
  } catch (error) {
    console.log(`[api/games/from-description] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    if (gameId.startsWith('_')) {
      return res.status(400).json({ error: 'Cannot delete template directories.' });
    }
    if (DB_ENABLED && await userGameExists(gameId)) {
      await deleteUserGame(gameId);
    } else {
      const { gameDir } = await resolveGamePath(gameId);
      await rm(gameDir, { recursive: true });
    }
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
      const loaded = await listGames();
      const games = loaded.map(({ id, source, config }) => ({
        id,
        source,
        name: config.name,
        description: config.description || ''
      }));
      if (DB_ENABLED) {
        const userRows = await listUserGames();
        for (const row of userRows) {
          games.push({ id: row.id, source: 'user', name: row.name, description: row.config.description || '' });
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
      const config = await loadGameById(selectedGame);
      const hooks = await loadHooks(selectedGame);
      const code = roomManager.create();
      const room = roomManager.find(code);

      room.engine = new GameEngine(config);
      room.engine.hooks = hooks;
      room.gameId = selectedGame;
      room.gameSource = config._source || 'built-in';

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

    // Block players the host kicked from this room (same-session token).
    if (token && room.kickedTokens && room.kickedTokens.has(token)) {
      console.log(`[join-room] Blocked kicked player from rejoining ${code}`);
      socket.emit(EVENTS.JOIN_ERROR, { message: 'You have been removed from this game.' });
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

    // Safety gate — only free-text collect submissions. collect-choice answers
    // are teacher-authored choices, so they skip validation/filtering.
    const currentPhase = room.engine ? room.engine.getCurrentPhase() : null;
    if (currentPhase && currentPhase.type === 'collect') {
      const check = checkSubmission(response, { prompt: currentPhase.prompt });
      if (!check.ok) {
        console.log(`[submit-response] Rejected (${check.reason}) from ${player.name}`);
        recordEvent(room, 'submit-rejected', { player: player.name, reason: check.reason });
        socket.emit(EVENTS.RESPONSE_REJECTED, { reason: check.reason, message: check.message });
        return;
      }
    }

    players.update(socket.id, { response, responseAt: Date.now() });
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
      // Exclude unpaired players when this collect uses pairwise distribution
      if (phase.assign === 'pairwise') {
        const phaseData = room.engine.phaseData[phase.id];
        const pairedIds = phaseData && Array.isArray(phaseData.pairs)
          ? new Set(phaseData.pairs.flatMap(p => p.playerIds))
          : null;
        if (pairedIds) eligible = eligible.filter(p => pairedIds.has(p.id));
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

    // Push the live moderation list so the host can hide/kick before closing.
    emitSubmissionsUpdate(code, room);
  });

  // Host hides/unhides a submitted response. Hidden responses are excluded from
  // AI input and the reveal when submissions close (reversible until then).
  socket.on(EVENTS.MODERATE_HIDE, (payload = {}) => {
    if (!checkEventPayload(socket, 'moderate-hide', payload)) return;
    const { code, playerId, hidden } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    // Only the host may moderate.
    if (roomToHost.get(code) !== socket.id) return;
    const players = room.engine.players;
    const target = players.find(playerId);
    if (!target) return;
    const newHidden = hidden === undefined ? !target.responseHidden : !!hidden;
    players.update(playerId, { responseHidden: newHidden });
    recordEvent(room, 'moderate-hide', { player: target.name, hidden: newHidden });
    emitSubmissionsUpdate(code, room);
  });

  // Host kicks a player: remove from the game and block rejoin this session.
  socket.on(EVENTS.MODERATE_KICK, (payload = {}) => {
    if (!checkEventPayload(socket, 'moderate-kick', payload)) return;
    const { code, playerId } = payload;
    const room = roomManager.find(code);
    if (!room) return;
    if (roomToHost.get(code) !== socket.id) return;
    const players = room.engine ? room.engine.players : room.playerRegistry;
    const target = players.find(playerId);
    if (!target) return;

    // Block the kicked player's token (and id) from rejoining this room.
    room.kickedTokens = room.kickedTokens || new Set();
    if (target.token) room.kickedTokens.add(target.token);

    players.remove(playerId);
    socketToRoom.delete(playerId);
    recordEvent(room, 'moderate-kick', { player: target.name });

    // Notify and detach the kicked socket.
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
      kickedSocket.emit(EVENTS.KICKED, { message: 'You have been removed from the game by the teacher.' });
      kickedSocket.leave(code);
    }

    // Update the host's player list + moderation list.
    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit(EVENTS.PLAYER_LEFT, { id: playerId, players: players.listPublic() });
    }
    emitSubmissionsUpdate(code, room);
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

        // Gather responses from eligible players and store as phase data.
        // Host-hidden responses are excluded (kept off AI input + reveal).
        let eligible = getEligibleVoters(players, from);
        // Pairwise: only paired players are real submitters
        if (collectPhase.assign === 'pairwise') {
          const cpData = room.engine.phaseData[collectPhase.id];
          const pairedIds = cpData && Array.isArray(cpData.pairs)
            ? new Set(cpData.pairs.flatMap(p => p.playerIds))
            : null;
          if (pairedIds) eligible = eligible.filter(p => pairedIds.has(p.id));
        }
        const responses = eligible
          .filter(isVisibleSubmission)
          .map(p => {
            const r = p.response;
            // Multi-field responses come as objects with field keys
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              const textParts = Object.values(r);
              return { playerId: p.id, name: p.name, text: textParts.join(' | '), fields: r, responseAt: p.responseAt };
            }
            return { playerId: p.id, name: p.name, text: r, responseAt: p.responseAt };
          });

        // Build byPlayer map alongside responses array — used by .mine and
        // by downstream rotateFrom phases. Multi-field responses store the
        // joined text; rotation users wanting the structured fields can
        // dataRef into responses directly.
        const byPlayer = {};
        for (const r of responses) {
          if (r && r.playerId) byPlayer[r.playerId] = r.text;
        }

        // Preserve any data the phase handler wrote on enter (e.g. assigned)
        const existing = room.engine.phaseData[collectPhase.id] || {};

        // For collect-choice, also compute tally
        if (collectPhase.type === 'collect-choice') {
          const tally = {};
          for (const r of responses) {
            tally[r.text] = (tally[r.text] || 0) + 1;
          }
          // Store with choice field for clarity (preserve responseAt for grading)
          const choiceResponses = responses.map(r => ({ playerId: r.playerId, name: r.name, choice: r.text, text: r.text, responseAt: r.responseAt }));
          const stored = { ...existing, responses: choiceResponses, tally, byPlayer };

          // Speed-bonus scoring: when correctAnswer is set, grade each response.
          // The correct answer can be a literal or a {{ref}} resolved at phase close.
          if (collectPhase.correctAnswer) {
            const correctAnswer = resolveTemplate(collectPhase.correctAnswer, room.engine);
            const phaseStartAt = (room.phaseState && room.phaseState.phaseStartAt) || null;
            const scores = scoreResponses({
              responses: choiceResponses,
              correctAnswer,
              phaseStartAt,
              timerSeconds: collectPhase.timer,
              pointsCorrect: collectPhase.pointsCorrect != null ? collectPhase.pointsCorrect : 1000,
              speedBonus: collectPhase.speedBonus !== false
            });
            stored.scores = scores;
            stored.correctAnswer = correctAnswer;
            console.log(`[close-submissions] Graded ${choiceResponses.length} responses against "${correctAnswer}" — scores: ${JSON.stringify(scores)}`);
          }

          room.engine.storePhaseData(collectPhase.id, stored);
          console.log(`[close-submissions] Stored ${choiceResponses.length} choices for phase '${collectPhase.id}'`);
        } else {
          room.engine.storePhaseData(collectPhase.id, { ...existing, responses, byPlayer });
          console.log(`[close-submissions] Stored ${responses.length} responses for phase '${collectPhase.id}'`);
        }

        // Clear responses (and hidden flags) for next collect phase
        for (const p of players.list()) {
          if (p.response || p.responseHidden) players.update(p.id, { response: undefined, responseHidden: false });
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

  // --- Rate events ---

  socket.on(EVENTS.RATE_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'rate-submit', payload)) return;
    const { code, ratings, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'rate-submit')) return;
    const rs = room.phaseState;
    if (!rs.scales) return;
    if (!rs.eligibleIds.has(socket.id) || rs.completed.has(socket.id)) return;

    // Clamp values into each scale's [min, max] and round to int.
    const cleaned = {};
    for (const scale of rs.scales) {
      const raw = ratings && ratings[scale.id];
      if (raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      cleaned[scale.id] = Math.max(scale.min, Math.min(scale.max, Math.round(v)));
    }
    rs.submissions[socket.id] = cleaned;
    rs.completed.add(socket.id);
    socket.emit(EVENTS.WAITING, { message: 'Ratings submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.RATE_RECEIVED, { count: rs.completed.size, total: rs.eligibleIds.size });

    if (rs.completed.size >= rs.eligibleIds.size) {
      await closeRating(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_RATING, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-rating')) return;
    recordEvent(room, 'close-rating');
    await closeRating(code, room);
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

  // --- Turn (charades/describe-it) events ---

  socket.on(EVENTS.TURN_GOT_IT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'turn-got-it', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'turn-got-it')) return;
    const phase = room.engine && room.engine.getCurrentPhase();
    if (!phase || phase.type !== 'turn') return;

    const { handleGotIt, advanceItemInPhase } = await import('./engine/phase-handlers/turn.js');
    if (!handleGotIt(room, socket.id)) return;
    recordEvent(room, 'turn-got-it');
    const ctx = createPhaseContext(code, room, phaseServices);
    advanceItemInPhase(ctx);
  });

  socket.on(EVENTS.TURN_SKIP, async (payload = {}) => {
    if (!checkEventPayload(socket, 'turn-skip', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'turn-skip')) return;
    const phase = room.engine && room.engine.getCurrentPhase();
    if (!phase || phase.type !== 'turn') return;

    const { handleSkip, advanceItemInPhase } = await import('./engine/phase-handlers/turn.js');
    if (!handleSkip(room, socket.id)) return;
    recordEvent(room, 'turn-skip');
    const ctx = createPhaseContext(code, room, phaseServices);
    advanceItemInPhase(ctx);
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

// Load recipes + init DB before opening the listener.
async function startup() {
  const recipes = await loadAllRecipes();
  console.log(`[init] Loaded ${recipes.size} recipe(s).`);
  if (DB_ENABLED) {
    await initDb();
    console.log('[init] Database ready.');
    await migrateFilesystemGames();
  }
}

startup().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[init] Startup error:', err);
  // Still start the server — recipes + DB failures shouldn't block play.
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (degraded)`);
  });
});
