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
import { PHASE_SCHEMAS, getFields, getTopLevelOnlyFieldNames } from './engine/phase-schemas.js';
import { loadAllRecipes, getRecipe, listRecipes, summarizeRecipe } from './engine/recipe-loader.js';
import { compileRecipe, carryRecipeStamp } from './engine/recipe-compiler.js';
import { holdPendingSubmit, settlePendingSubmits } from './engine/pending-submits.js';
import { parseRequestedMinutes, timingReport, paramsForTrim, estimateDuration } from './engine/duration-estimate.js';
import { extractCandidates, buildUserRecipe } from './engine/recipe-extractor.js';
import { VALIDATION_MODES, DIAGNOSTIC_CODES } from './engine/diagnostics.js';
import { loadHooks } from './engine/hooks-loader.js';
import { buildActivityMap } from './engine/activity-map.js';
import { homeGlimpse, activityHook } from './engine/home-glimpse.js';
import { printFor, applyEdits, nameFor } from './engine/make-print.js';
import { resolvePerPlayerTemplate } from './engine/per-player-template.js';
import { effectiveRange, clampGuess } from './engine/phases/estimate-range.js';
import { foreachSitOut, withoutSitOut } from './engine/phases/sit-out.js';
import { shouldStopLooping } from './engine/phases/eliminate-handler.js';
import { restoreSubPhaseOrder } from './engine/subphase-order.js';

// Saved copies that went through the old jsonb column came back with a
// foreach's sub-phases sorted by key length (the vote before the fakes).
// A recipe-born copy carries its stamp, so a fresh compile of it is the
// written order: restore it on every read. Never throws; a config whose
// recipe is gone is returned as-is.
function repairSavedConfig(config) {
  try {
    const stamp = config && config.recipe;
    if (!stamp || !stamp.id) return config;
    const recipe = getRecipe(stamp.id);
    if (!recipe) return config;
    const { config: compiled } = compileRecipe(recipe, stamp.params || {});
    const fixed = restoreSubPhaseOrder(config, compiled);
    if (fixed.length) console.log(`[repair] "${config.name}": sub-phase order restored on ${fixed.join(', ')}`);
  } catch (err) {
    console.log(`[repair] skipped for "${config && config.name}": ${err.message}`);
  }
  return config;
}
async function getUserGameRepaired(id) {
  const row = await getUserGame(id);
  if (row && row.config) repairSavedConfig(row.config);
  return row;
}
async function listUserGamesRepaired() {
  const rows = await listUserGames();
  for (const row of rows) if (row && row.config) repairSavedConfig(row.config);
  return rows;
}
import { resolveDisplayDrawing } from './engine/phases/display-drawing.js';
import {
  createWordHelpState, normalizeWord, remaining as wordHelpRemaining, spend as wordHelpSpend,
  refund as wordHelpRefund, recordLookup, summarize as summarizeWordHelp,
  cachedTranslation, cacheTranslation, publicSettings as wordHelpSettings
} from './engine/word-help.js';
import { createEarlyJokeState, dealJoke, jokeFor, splitJoke, isEarlyJokeOn } from './engine/early-joke.js';

// The joke as the student screen tells it: setup first, punchline held
// back (engine/early-joke.js splitJoke); null when this seat got none.
function jokePayload(text) {
  return typeof text === 'string' ? splitJoke(text) : null;
}
import { gamePhases } from './config/game-phases.js';
import { AIService } from './services/ai-service.js';
import {
  generateMatchups,
  getEligibleVoters,
  tallyPickOne,
  tallyHeadToHead,
  resolveBranchTarget,
  isOwnCandidate
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
  userGameExists,
  getAiUsage,
  saveAiUsage,
  saveRoomSnapshot,
  getRoomSnapshot,
  deleteRoomSnapshot,
  sweepRoomSnapshots,
  listUserRecipes,
  saveUserRecipe,
  insertUserRecipeIfAbsent,
  deleteUserRecipe,
  addFeedback,
  listFeedback,
  setFeedbackStatus,
  recordActivityRun,
  activityRunSummary,
  getFeaturedOverrides,
  setFeaturedOverride,
  clearFeaturedOverride
} from './db.js';
import { applyFeaturedOverrides } from './engine/featured-merge.js';
import { validateSuggestions } from './engine/suggest-validate.js';
import { createFeedbackStore } from './services/feedback-store.js';
import { validateFeedback } from './engine/feedback-validate.js';
import { createRateLimiter } from './engine/simple-rate-limit.js';
import { createAnalytics, parseClientEvent, replayConfig } from './services/analytics.js';
import { mintCopyId, prepareSharedCopy } from './engine/share-copy.js';
import { ensureMeadowState, meadowIndexFor, allowNudge, clampFrac } from './engine/meadow-sync.js';
import { serializeRoom, restoreRoom } from './engine/room-snapshot.js';
import { migrateIdsInPlace } from './engine/id-migration.js';
import { classifyJoin } from './engine/join-policy.js';
import { extendPhaseTimer } from './engine/phase-timer.js';
import { checkSubmission, filterContent } from './engine/content-filter.js';
import { combineAppendOnly } from './engine/phases/append-only.js';
import { foolPoints, mergeScores } from './engine/phases/bluff-scoring.js';
import { remapForeachSubConfig, resolveCurrentRefsInSubConfig } from './engine/phases/foreach-remap.js';
import { applyIterationScoring } from './engine/phases/foreach-scoring.js';
import { agreesNeeded } from './engine/phase-handlers/merge.js';
import { adjudicateTap, oneVoiceStats, RESET_LOCKOUT_MS, SUCCESS_ADVANCE_MS } from './engine/phase-handlers/one-voice.js';
import { applyBuzz, applyJudge, applyNextQuestion } from './engine/phase-handlers/buzz.js';
import { scoreEstimates, estimateStats } from './engine/phases/estimate-scoring.js';
import { scoreMatching, matchStats, buildResultsList } from './engine/phases/match-scoring.js';
import { autoFill } from './engine/phases/team-grouping.js';
import { scoreSorting, sortStats, buildSortResultsList } from './engine/phases/sort-scoring.js';
import { buildTeamRosters } from './engine/phase-handlers/team-split.js';
import { buildRoleMenu, buildRoleBoard } from './engine/phase-handlers/team-roles.js';
import { claimRole, autoFillRoles, buildRoleOutput } from './engine/phases/role-deal.js';
import { applyCheck, groupProgress, checklistResults } from './engine/phases/checklist-state.js';
import { playerChecklistView, teacherDetail } from './engine/phase-handlers/checklist.js';
import { continueLabelForPhase, closeLabelFor } from './engine/phases/continue-labels.js';
import { stringsFor, translate } from './engine/i18n/index.js';
import { isRolling, moreInputAhead, doneMessageFor } from './engine/phases/rolling.js';
import { buildLiveTally } from './engine/phases/live-tally.js';
import { isCorrectAnswer, scoreSoloQuiz } from './engine/phases/solo-quiz-scoring.js';
import { hostProgressPayload as soloQuizHostPayload, playerQuestionPayload as soloQuizPlayerPayload, pointsFor as soloQuizPoints } from './engine/phase-handlers/solo-quiz.js';
import { simulateGame } from './services/simulator.js';
import { checkTeacherAccess, generateTeacherPin } from './engine/teacher-auth.js';
import { buildActivityReport } from './engine/report.js';
import { createPinThrottle } from './engine/pin-throttle.js';
import { contentLog } from './engine/content-log.js';
import { buildSubmissionList, isVisibleSubmission, collectPassedIds, PASS_RESPONSE, responseToText } from './engine/moderation.js';
import { createModerationLadder } from './services/moderation-ladder.js';
import { validateDrawing, isDrawingResponse } from './engine/drawing.js';
import { validatePayload } from './engine/event-schemas.js';
import { pickAnonymousName } from './engine/anonymous-names.js';
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
  console.log('[init] No ANTHROPIC_API_KEY found, AI generation endpoints are disabled (set the key to enable them).');
}

// --- Robot playtest support (deep review) -----------------------------
// Simulated rooms (games with the _sim-tmp- prefix) always run with this
// mock AI instance so a review never spends API money. phase-context.js
// picks it over the real service when room.simulated is set.
const mockAiService = new AIService({ mode: 'mock' });

// Temp games: a deep review simulates the config AS POSTED (which may
// differ from what's saved). registerTempGame parks it in memory under a
// hidden id that loadGameById serves and create-room flags as simulated.
const tempGames = new Map();
function registerTempGame(config) {
  const id = '_sim-tmp-' + Math.random().toString(36).slice(2, 10);
  tempGames.set(id, config);
  return id;
}
function unregisterTempGame(id) {
  tempGames.delete(id);
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
// Cost guard: per-minute throttle + daily cap on real AI calls (see
// services/ai-budget.js). The day counter persists in Neon when available
// so a redeploy can't reset the cap.
const aiService = new AIService({
  mode: aiMode,
  budgetStore: DB_ENABLED ? { load: getAiUsage, save: saveAiUsage } : null
});
// Moderation ladder: OpenAI scores block the obvious, Haiku judges the
// uncertain band, the teacher console gets what neither could settle.
// Off without OPENAI_API_KEY (exactly the blocklist-only behavior);
// simulated rooms always skip it. See services/moderation-ladder.js.
const moderationLadder = createModerationLadder({
  apiKey: process.env.OPENAI_API_KEY,
  aiService,
  blockAt: Number(process.env.MODERATION_BLOCK_AT) || undefined,
  reviewAt: Number(process.env.MODERATION_REVIEW_AT) || undefined
});
console.log(`[init] Moderation ladder: ${moderationLadder.enabled ? 'on (OpenAI scores + Haiku review)' : 'off, no OPENAI_API_KEY, blocklist only'}`);
// Site analytics (services/analytics.js): PostHog as a sink behind our own
// relay. Off without POSTHOG_KEY. No browser ever talks to PostHog; the
// student screen and the projector send nothing at all.
const analytics = createAnalytics({
  key: process.env.POSTHOG_KEY,
  host: process.env.POSTHOG_HOST
});
console.log(`[init] Analytics: ${analytics.enabled ? 'on (relay to PostHog)' : 'off, no POSTHOG_KEY'}`);

// The label an activity gets in analytics: a built-in's slug, or "custom"
// for anything a teacher made or copied (its id and name are theirs).
function analyticsGameLabel(room) {
  return room && room.gameSource !== 'user' && !room.simulated ? room.gameId : 'custom';
}

// Once per room, whichever way it starts (Start pressed, or the first
// join of a rolling room). A headcount and the activity label, no more.
function trackActivityStarted(room) {
  if (!room || room.simulated || room.analyticsStarted || !room.analyticsId) return;
  room.analyticsStarted = true;
  analytics.track('activity_started', {
    game: analyticsGameLabel(room),
    players: room.engine ? room.engine.players.list().length : 0
  }, room.analyticsId);
}

const socketToRoom = new Map();
const roomToHost = new Map();

app.use(express.json());

// --- Owner password gate ---
// SITE_PASSWORD is the site OWNER's password (2026-07-26 rework: the site is
// public by design — visitors can host featured activities and build their
// own — so the old lock-all-teacher-surfaces gate is gone). The password now
// protects only owner surfaces: the feedback inbox and the owner-mode check
// that unlocks the full activity list. It also still works as a teacher-
// console credential (engine/teacher-auth.js) and guards edits/deletes of
// BUILT-IN activities. Unset = everything open (local dev).
// Username can be anything — only the password is checked.
function isOwnerRequest(req) {
  if (!process.env.SITE_PASSWORD) return true; // unset = local dev, no owner concept
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return password === process.env.SITE_PASSWORD;
}

function ownerAreaGate(req, res, next) {
  const path = req.path;
  const needsOwner =
    path === '/api/owner-check' ||
    path === '/api/activity-runs' ||                                 // runs-not-builds gauge
    path.startsWith('/feedback') ||                                  // inbox UI
    (path.startsWith('/api/feedback') && req.method !== 'POST');     // list/status; submitting stays open
  if (!needsOwner) return next();
  if (isOwnerRequest(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Jamyard Owner Area"');
  res.status(401).type('text/plain').send('Owner area - password required.');
}
app.use(ownerAreaGate);

const DEFAULT_GAME = 'weekend-poem';
const GAMES_DIR = join(__dirname, 'games');
const USER_GAMES_DIR = join(GAMES_DIR, 'user');

// Card-friendly metadata fields surfaced from each game's config.json to the
// designer landing page. Optional — missing fields just don't render.
// `featured` marks the curated public set: visitors who haven't unlocked
// owner mode only see featured built-ins (plus activities made on their
// own device) in the host/designer/prototype pickers.
// keywords: searchable subject/topic terms (2026-08-08 field test: a teacher's
// first search is her subject — "history" matched nothing because the shells
// are topic-agnostic and nothing said so).
// `start` rides along so the yard, the home shelf, and the hover cards can
// tag rolling-start activities (students begin as they arrive).
const GAME_CARD_META_FIELDS = ['playTime', 'classSize', 'tags', 'recommendedFor', 'featured', 'family', 'keywords', 'start'];

// Owner curation of built-ins lives in Neon (featured_overrides) because the
// deployed filesystem resets on every push. A read failure must never take
// down the pickers — fall back to the repo defaults.
async function featuredOverridesSafe() {
  if (!DB_ENABLED) return {};
  try {
    return await getFeaturedOverrides();
  } catch (err) {
    console.log(`[featured] Override read failed (using repo defaults): ${err.message}`);
    return {};
  }
}

// The yard plank's hook line and computed minutes (outside review,
// 2026-09-06): the hook is the recipe's tagline for recipe-born activities
// or the description's first sentence; the minutes come from the timers
// (engine/duration-estimate.js), never from the hand-written playTime.
function yardCardExtras(config) {
  const stamp = config && config.recipe && config.recipe.id ? getRecipe(config.recipe.id) : null;
  // The chip must agree with the number printed on the plank: a hand-written
  // playTime ("~15–20 min" reads as 20) wins; the estimate covers the rest.
  let minutes = parseRequestedMinutes(config && config.playTime);
  if (minutes === null) {
    try { minutes = estimateDuration(config).minutes; } catch { minutes = null; }
  }
  return { hook: activityHook(config, stamp), minutes };
}

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
  // In-memory temp games (robot playtest) take precedence — they hold the
  // exact config under review, already validated by the review endpoint.
  if (tempGames.has(gameId)) {
    return tempGames.get(gameId);
  }
  try {
    return await loadGame(gameId); // checks built-in dir, then games/user/ dir
  } catch (err) {
    if (!err.message.startsWith('Game not found')) throw err;
  }
  if (DB_ENABLED) {
    const row = await getUserGameRepaired(gameId);
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

// Same transition story for user recipes: "Save as Recipe" used to write
// only to recipes/user/, which Render's filesystem resets on every deploy
// (2026-07-19 review — teachers silently lost saved recipes). Insert-if-
// absent so a newer DB copy is never clobbered by a stale file.
async function migrateFilesystemRecipes() {
  let count = 0;
  const userDir = join(__dirname, 'recipes', 'user');
  try {
    const entries = await readdir(userDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(userDir, entry.name), 'utf-8');
        const recipe = JSON.parse(raw);
        if (recipe && recipe.id && await insertUserRecipeIfAbsent(recipe.id, recipe)) count++;
      } catch {}
    }
  } catch {} // user dir may not exist
  if (count > 0) console.log(`[init] Migrated ${count} filesystem recipe(s) to database.`);
}

// Reload the recipe cache from every source. With the DB enabled, user
// recipes come from Neon (durable across deploys) and win over any
// same-id file in recipes/user/.
async function reloadRecipes(opts = {}) {
  let userRecipes = [];
  if (DB_ENABLED) {
    try {
      userRecipes = (await listUserRecipes()).map(r => r.recipe);
    } catch (e) {
      console.warn(`[recipes] Could not load user recipes from DB (continuing with files): ${e.message}`);
    }
  }
  return loadAllRecipes({ ...opts, userRecipes });
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
    // An elimination loop ends as soon as few enough players remain
    // (eliminate.untilRemaining): the round count follows the class size.
    if (phase.type === 'eliminate' && shouldStopLooping({
      untilRemaining: phase.untilRemaining,
      remaining: engine.players.getRemaining().length
    })) {
      return phase.next;
    }
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
  // Before the first phase starts (lobby) no instance id exists yet — nothing
  // can be stale. Without this, the teacher console's very first "Start"
  // click was dropped (snapshot said 0, room said undefined; 2026-07-27).
  if (current === undefined || current === null) return false;
  if (clientPhaseInstanceId !== current) {
    console.log(`[stale-event] Dropping "${eventName}", client saw phase ${clientPhaseInstanceId}, current ${current}`);
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
  // kind guard + idempotence: the all-ranked auto-close can race a late
  // host click, which would run this against the NEXT phase's state.
  if (!rs || rs.kind !== 'rank' || rs.closed) return;
  rs.closed = true;
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

// --- Merge helpers (Connection Pack, think-pair-share) ---

// Close the merge phase: every group's current draft becomes its merged
// answer (the host force-close / timer path submits in-progress drafts —
// spec §3.4). Empty drafts and content-filtered drafts are dropped.
async function closeMerge(code, room) {
  const ms = room.phaseState;
  if (!ms || ms.kind !== 'merge' || ms.closed) return;
  ms.closed = true;
  if (ms.timer) { clearTimeout(ms.timer); ms.timer = null; }

  const engine = room.engine;
  const phase = engine.config.phases[ms.phaseId];

  const merged = [];
  for (const g of ms.groups) {
    const text = String(g.draft || '').trim();
    if (!text) continue;
    const check = checkSubmission(text, { prompt: phase.instruction });
    if (!check.ok) {
      console.log(`[closeMerge] Dropping group ${g.groupId}'s draft (${check.reason})`);
      continue;
    }
    merged.push({ groupId: g.groupId, text, members: g.members });
  }

  engine.storePhaseData(ms.phaseId, { merged });
  console.log(`[closeMerge] Stored ${merged.length}/${ms.groups.length} merged answers for phase '${ms.phaseId}'`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// A group satisfied its agree requirement (or the host closed): mark it
// submitted, park its members on the waiting screen, update the host's
// progress counter, and close the phase when every group is done.
async function submitMergeGroup(code, room, group) {
  const ms = room.phaseState;
  if (!ms || ms.kind !== 'merge' || group.submitted) return;
  group.submitted = true;

  for (const id of group.members) {
    io.to(id).emit(EVENTS.WAITING, { message: 'Merged! Waiting for the other groups...' });
  }
  const hostId = roomToHost.get(code);
  const submittedGroups = ms.groups.filter(g => g.submitted).length;
  if (hostId) {
    io.to(hostId).emit(EVENTS.MERGE_PROGRESS, { totalGroups: ms.groups.length, submittedGroups });
  }
  recordEvent(room, 'merge-group-submitted', { groupId: group.groupId });

  if (ms.groups.every(g => g.submitted)) {
    await closeMerge(code, room);
  }
}

// --- One Voice helpers (Connection Pack, cooperative counting) ---

// Store the run's stats as phase data and advance. Reached on success
// (after the celebration pause), on the attempt cap, or when the host
// clicks Move On.
async function closeOneVoice(code, room) {
  const ovs = room.phaseState;
  if (!ovs || ovs.kind !== 'one-voice' || ovs.closed) return;
  ovs.closed = true;
  ovs.cleanup();

  const engine = room.engine;
  const phase = engine.config.phases[ovs.phaseId];

  engine.storePhaseData(ovs.phaseId, {
    success: ovs.finished && ovs.count >= ovs.target,
    attempts: ovs.attempt,
    resets: ovs.resets,
    bestRun: ovs.bestRun,
    target: ovs.target,
    finalCount: ovs.count,
    history: ovs.history
  });
  console.log(`[closeOneVoice] target ${ovs.target}: ${ovs.count >= ovs.target ? 'SUCCESS' : 'ended'} after ${ovs.attempt} attempt(s), best run ${ovs.bestRun}`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// Finish a buzzer round: store the score map (feeds leaderboard/winner) and
// advance. Idempotent — double-clicks on "Finish round" are harmless.
async function closeBuzz(code, room) {
  const state = room.phaseState;
  if (!state || state.kind !== 'buzz' || state.closed) return;
  state.closed = true;

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId];
  engine.storePhaseData(state.phaseId, {
    scores: state.scores,
    questions: state.question
  });
  console.log(`[closeBuzz] ${state.question} question(s), ${Object.keys(state.scores).length} scorer(s)`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

function emitEstimateProgress(code, room, state) {
  const count = Object.keys(state.guesses).length;
  const total = room.engine.players.list().length;
  // Everyone sees the room fill up — counts only, never names. (Estimate
  // players stay on their own screen, but eliminated/late viewers wait.)
  io.to(code).emit(EVENTS.ROOM_PROGRESS, { count, total });
  const hostId = roomToHost.get(code);
  if (!hostId) return;
  io.to(hostId).emit(EVENTS.ESTIMATE_PROGRESS, { count, total });
}

// Close estimating: score by closeness, reveal answer + distribution.
// Does NOT auto-advance (the reveal is a discussion moment, like rate) —
// the host clicks Continue.
async function closeEstimates(code, room) {
  const state = room.phaseState;
  if (!state || state.kind !== 'estimate' || state.closed) return;
  state.closed = true;

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};
  const points = Number.isInteger(phase.points) && phase.points > 0 ? phase.points : 10;
  const mode = phase.scoring === 'graduated' ? 'graduated' : 'closest';

  const scores = scoreEstimates(state.guesses, state.answer, points, mode);
  const stats = estimateStats(state.guesses, state.answer);
  engine.storePhaseData(state.phaseId, { scores, ...stats });
  console.log(`[closeEstimates] ${stats.count} guess(es), answer=${state.answer ?? '(poll mode)'}`);

  const players = engine.players;
  const guesses = Object.entries(state.guesses)
    .map(([pid, value]) => ({
      playerId: pid,
      name: (players.find(pid) || {}).name || '?',
      value,
      score: scores[pid] || 0,
      distance: state.answer != null ? Math.abs(value - state.answer) : null
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.value - b.value);

  // Kept on the phase state so a player reconnecting after the close sees
  // the results, not a dead input box. phaseInstanceId rides along so
  // client stale-echo (and the sims' dedupe keys) stay correct.
  state.resultsPayload = {
    answer: state.answer,
    unit: phase.unit || '',
    stats,
    scores,
    guesses,
    phaseInstanceId: room.phaseInstanceId
  };
  io.to(code).emit(EVENTS.ESTIMATE_RESULTS, state.resultsPayload);
  notifyTeachersClosed(code, room);
}

// --- Solo quiz (self-paced) helpers ---

// The projector and consoles follow every answer: counts and per-question
// rates only. A question never reaches the projector, nor does a name.
function emitSoloQuizProgress(code, room) {
  const state = room.phaseState;
  if (!state || state.kind !== 'solo-quiz') return;
  const payload = { ...soloQuizHostPayload(state, room.engine), phaseInstanceId: room.phaseInstanceId };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.SOLO_QUIZ_PROGRESS, payload);
  io.to(teachersChannel(code)).emit(EVENTS.SOLO_QUIZ_PROGRESS, payload);
}

// Close the quiz: grade everyone (a student mid-quiz keeps what they have),
// store scores/results, show the class board on the projector and each
// student their own line. Two-stage like rate/estimate: the next click
// advances.
async function closeSoloQuiz(code, room) {
  const state = room.phaseState;
  if (!state || state.kind !== 'solo-quiz' || state.closed) return;
  state.closed = true;

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};
  const points = soloQuizPoints(phase);
  const nameOf = (id) => { const p = engine.players.find(id); return p ? p.name : null; };
  const graded = scoreSoloQuiz(state.progress, state.questions, points, nameOf);
  const existing = engine.phaseData[state.phaseId] || {};
  engine.storePhaseData(state.phaseId, {
    ...existing,
    progress: state.progress,
    scores: graded.scores,
    results: graded.results,
    perQuestion: graded.perQuestion,
    averagePct: graded.averagePct,
    questionCount: state.questions.length
  });
  state.resultsPayload = {
    perQuestion: graded.perQuestion,
    started: graded.started,
    finished: graded.finished,
    total: engine.players.list().length,
    averagePct: graded.averagePct,
    questionCount: state.questions.length,
    phaseInstanceId: room.phaseInstanceId
  };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.SOLO_QUIZ_RESULTS, state.resultsPayload);
  io.to(teachersChannel(code)).emit(EVENTS.SOLO_QUIZ_RESULTS, state.resultsPayload);
  for (const player of engine.players.list()) {
    io.to(player.id).emit(EVENTS.SOLO_QUIZ_DONE, {
      ...soloQuizPlayerPayload(state, player.id, points),
      closed: true,
      phaseInstanceId: room.phaseInstanceId
    });
  }
  console.log(`[closeSoloQuiz] ${graded.finished}/${engine.players.list().length} finished, class average ${graded.averagePct}%`);
  notifyTeachersClosed(code, room);
}

// --- Match helpers ---

// Score + reveal per-pair class accuracy. Like estimate, this does NOT
// auto-advance — the correct pairs are a discussion moment ("half the room
// missed this one — why?"); the host clicks Continue.
async function closeMatching(code, room) {
  const state = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!state || state.kind !== 'match' || state.closed) return;
  state.closed = true;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};
  const points = Number.isInteger(phase.pointsPerMatch) && phase.pointsPerMatch > 0
    ? phase.pointsPerMatch : 10;

  const { scores, correctCounts } = scoreMatching(state.pairs, state.submissions, points);
  const results = matchStats(state.pairs, state.submissions);
  engine.storePhaseData(state.phaseId, {
    scores, results, resultsList: buildResultsList(results), pairCount: state.pairs.length
  });
  console.log(`[closeMatching] ${Object.keys(state.submissions).length} submission(s) across ${state.pairs.length} pairs`);

  const players = engine.players;
  const playerResults = Object.keys(state.submissions)
    .map(pid => ({
      playerId: pid,
      name: (players.find(pid) || {}).name || '?',
      correct: correctCounts[pid] || 0,
      score: scores[pid] || 0
    }))
    .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));

  // Kept on the phase state so a player reconnecting after the close sees
  // the results, not a dead board (see closeEstimates).
  state.resultsPayload = {
    pairs: state.pairs,
    results,
    players: playerResults,
    pairCount: state.pairs.length,
    phaseInstanceId: room.phaseInstanceId
  };
  io.to(code).emit(EVENTS.MATCH_RESULTS, state.resultsPayload);
  notifyTeachersClosed(code, room);
}

// --- Sort helpers ---

// Score (graded mode) + reveal per-item distributions. Like estimate and
// match, this does NOT auto-advance — "half the room called that line a
// simile" is a discussion moment; the host clicks Continue.
async function closeSorting(code, room) {
  const state = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!state || state.kind !== 'sort' || state.closed) return;
  state.closed = true;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};
  const points = Number.isInteger(phase.pointsPerItem) && phase.pointsPerItem > 0
    ? phase.pointsPerItem : 10;

  const { scores, correctCounts } = scoreSorting(state.items, state.submissions, points);
  const results = sortStats(state.items, state.buckets, state.submissions);
  engine.storePhaseData(state.phaseId, {
    scores, results, resultsList: buildSortResultsList(results), itemCount: state.items.length
  });
  console.log(`[closeSorting] ${Object.keys(state.submissions).length} submission(s) across ${state.items.length} items (${state.graded ? 'graded' : 'consensus'})`);

  const players = engine.players;
  const playerResults = state.graded
    ? Object.keys(state.submissions)
        .map(pid => ({
          playerId: pid,
          name: (players.find(pid) || {}).name || '?',
          correct: correctCounts[pid] || 0,
          score: scores[pid] || 0
        }))
        .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name))
    : [];

  // Kept on the phase state so a player reconnecting after the close sees
  // the results, not a dead board (see closeEstimates).
  state.resultsPayload = {
    graded: state.graded,
    buckets: state.buckets,
    results,
    players: playerResults,
    itemCount: state.items.length,
    phaseInstanceId: room.phaseInstanceId
  };
  io.to(code).emit(EVENTS.SORT_RESULTS, state.resultsPayload);
  notifyTeachersClosed(code, room);
}

// End the checklist work time: store per-group results, show the final
// summary. Like sort/match, does NOT auto-advance — "two groups didn't
// finish" is a conversation; the host clicks Continue.
async function closeChecklist(code, room) {
  const state = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!state || state.kind !== 'checklist' || state.closed) return;
  state.closed = true;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }

  const out = checklistResults(state);
  room.engine.storePhaseData(state.phaseId, out);
  console.log(`[closeChecklist] ${out.doneCount}/${out.groupCount} ${state.solo ? 'students' : 'groups'} finished all ${out.itemCount} item(s)`);

  // Kept on the phase state so a reconnect after close sees the summary,
  // not a dead board (see closeEstimates).
  state.resultsPayload = {
    results: out.results,
    doneCount: out.doneCount,
    groupCount: out.groupCount,
    itemCount: out.itemCount,
    solo: state.solo,
    phaseInstanceId: room.phaseInstanceId
  };
  io.to(code).emit(EVENTS.CHECKLIST_RESULTS, state.resultsPayload);
  io.to(teachersChannel(code)).emit(EVENTS.CHECKLIST_RESULTS, state.resultsPayload);
  notifyTeachersClosed(code, room);
}

// Fan out a checklist change: the touched group sees its items, the
// dashboard (host + consoles) sees progress. Attribution never reaches
// the projector — the host payload is counts only.
function emitChecklistUpdate(code, room, state, groupKey) {
  const group = state.groups[groupKey];
  const base = { phaseInstanceId: room.phaseInstanceId };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.CHECKLIST_UPDATE, { ...base, progress: groupProgress(state) });
  io.to(teachersChannel(code)).emit(EVENTS.CHECKLIST_UPDATE, { ...base, groups: teacherDetail(state) });
  if (group) {
    for (const memberId of group.memberIds) {
      io.to(memberId).emit(EVENTS.CHECKLIST_UPDATE, {
        ...base, group: { label: state.solo ? null : group.label, checked: group.checked }
      });
    }
  }
}

// --- Team-split helpers (interactive teacher/choice modes) ---

// Roster snapshot for the teacher-assign screen (host + consoles).
function emitTeamSetupUpdate(code, room, state) {
  const players = room.engine.players;
  const rosters = buildTeamRosters(state, players);
  const unassigned = [...state.eligibleIds]
    .filter(id => !state.assignments[id])
    .map(id => ({ playerId: id, name: (players.find(id) || {}).name || '?' }));
  const payload = { rosters, unassigned, mode: state.mode, phaseInstanceId: room.phaseInstanceId };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.TEAM_SPLIT_SETUP, payload);
  io.to(teachersChannel(code)).emit(EVENTS.TEAM_SPLIT_SETUP, payload);
}

// Live rosters/open-spot counts for choice mode (players see their pick).
function emitTeamChoiceUpdate(code, room, state) {
  const engine = room.engine;
  const rosters = buildTeamRosters(state, engine.players);
  const placed = Object.keys(state.assignments).length;
  const total = state.eligibleIds.size;
  const base = { rosters, placed, total, phaseInstanceId: room.phaseInstanceId };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.TEAM_CHOICE_UPDATE, base);
  io.to(teachersChannel(code)).emit(EVENTS.TEAM_CHOICE_UPDATE, base);
  for (const player of engine.players.list()) {
    if (state.eligibleIds.has(player.id)) {
      io.to(player.id).emit(EVENTS.TEAM_CHOICE_UPDATE, {
        ...base, yourTeam: state.assignments[player.id] || null
      });
    }
  }
}

// Finalize an interactive team-split: auto-fill stragglers into the
// emptiest teams, store the SAME output shape as the instant methods
// ({teams, playerTeam}), and run the standard TEAM_SPLIT reveal. Does not
// advance — the host's Continue button does, exactly like random mode.
async function closeTeamSplit(code, room) {
  const state = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!state || state.kind !== 'team-split' || state.closed) return;
  state.closed = true;

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};

  const unassigned = [...state.eligibleIds].filter(id => !state.assignments[id]);
  Object.assign(state.assignments, autoFill(state.assignments, unassigned, state.teamNames, state.capacities));

  const teams = {};
  const playerTeam = {};
  for (const name of state.teamNames) teams[name] = [];
  for (const [pid, teamName] of Object.entries(state.assignments)) {
    if (!teams[teamName]) teams[teamName] = [];
    teams[teamName].push({ playerId: pid, name: (engine.players.find(pid) || {}).name || '?' });
    playerTeam[pid] = teamName;
  }

  engine.storePhaseData(state.phaseId, { teams, playerTeam });
  console.log(`[closeTeamSplit] ${Object.keys(playerTeam).length} players into ${state.teamNames.length} teams (${state.mode} mode, ${unassigned.length} auto-filled)`);

  const sc = resolveScreenControl(phase, engine);
  const hostId = roomToHost.get(code);
  if (hostId) {
    io.to(hostId).emit(EVENTS.TEAM_SPLIT, {
      teams, hostTemplate: sc.hostTemplate, show: sc.hostShow,
      phaseInstanceId: room.phaseInstanceId
    });
  }
  for (const player of engine.players.list()) {
    io.to(player.id).emit(EVENTS.TEAM_SPLIT, {
      myTeam: playerTeam[player.id] || null, teams,
      playerTemplate: sc.playerTemplate, show: sc.playerShow,
      phaseInstanceId: room.phaseInstanceId
    });
  }
}

// --- Team-roles helpers (choice mode) ---

// Live role claims: the projector/consoles get the per-group board, each
// player gets their own group's menu with open-spot counts.
function emitTeamRolesUpdate(code, room, state) {
  const engine = room.engine;
  const board = buildRoleBoard(state, engine.players);
  const base = { ...board, roles: state.roles, phaseInstanceId: room.phaseInstanceId };
  const hostId = roomToHost.get(code);
  if (hostId) io.to(hostId).emit(EVENTS.TEAM_ROLES_UPDATE, base);
  io.to(teachersChannel(code)).emit(EVENTS.TEAM_ROLES_UPDATE, base);
  for (const player of engine.players.list()) {
    const menu = buildRoleMenu(state, player.id, engine.players);
    if (menu) {
      io.to(player.id).emit(EVENTS.TEAM_ROLES_UPDATE, {
        ...menu, phaseInstanceId: room.phaseInstanceId
      });
    }
  }
}

// Finalize a choice-mode team-roles: auto-fill unpicked members with the
// least-taken role in their group, store the SAME output shape as random
// mode, and run the standard TEAM_ROLES reveal. Does not advance — the
// host's Continue does, exactly like team-split.
async function closeTeamRoles(code, room) {
  const state = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!state || state.kind !== 'team-roles' || state.closed) return;
  state.closed = true;

  const engine = room.engine;
  const phase = engine.config.phases[state.phaseId] || {};
  const unpicked = Object.values(state.groups)
    .flatMap(g => g.memberIds).filter(id => !state.picks[id]).length;
  autoFillRoles(state);

  const output = buildRoleOutput(state, id => (engine.players.find(id) || {}).name);
  engine.storePhaseData(state.phaseId, output);
  console.log(`[closeTeamRoles] ${Object.keys(output.playerRole).length} players given ${state.roles.length} roles (${unpicked} auto-filled)`);

  const sc = resolveScreenControl(phase, engine);
  const hostId = roomToHost.get(code);
  if (hostId) {
    io.to(hostId).emit(EVENTS.TEAM_ROLES, {
      board: buildRoleBoard(state, engine.players),
      rolesList: output.rolesList,
      hostTemplate: sc.hostTemplate, show: sc.hostShow,
      phaseInstanceId: room.phaseInstanceId
    });
  }
  for (const player of engine.players.list()) {
    io.to(player.id).emit(EVENTS.TEAM_ROLES, {
      myRole: output.playerRole[player.id] || null,
      groupLabel: (state.groups[state.playerGroup[player.id]] || {}).label || null,
      playerTemplate: sc.playerTemplate, show: sc.playerShow,
      phaseInstanceId: room.phaseInstanceId
    });
  }
  notifyTeachersClosed(code, room);
}

// --- Rate helpers ---

async function closeRating(code, room) {
  const rs = room.phaseState;
  // kind guard + idempotence (see closeRanking)
  if (!rs || rs.kind !== 'rate' || rs.closed || !rs.scales) return;
  rs.closed = true;
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
  notifyTeachersClosed(code, room);
}

// --- Wager helpers ---

async function closeWager(code, room) {
  const ws = room.phaseState;
  // kind guard + idempotence (see closeRanking). Note: `closed` only gates
  // the close itself — host resolution (resolveWager) still runs after.
  if (!ws || ws.kind !== 'wager' || ws.closed) return;
  ws.closed = true;
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
  // kind guard + idempotence: a double "resolve" click (or one racing the
  // phase advance) must not pay out twice or run against the next phase.
  if (!ws || ws.kind !== 'wager' || ws.resolved) return;
  ws.resolved = true;

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

    // Who sits this round out: the item's author, and the author of what
    // the item was made from (Doodle Bluff: the drawer AND the classmate
    // whose phrase was drawn, both know the answer). engine/phases/sit-out.js
    if ((subConfig.type === 'collect-choice' || subConfig.type === 'collect') && feConfig.selfExclude !== false) {
      const out = foreachSitOut(item, feConfig, state.items.concat(state.skipped || []));
      subConfig._foreachAuthorId = out.authorId;
      subConfig._foreachSourceId = out.sourceId;
      subConfig._foreachSitOutIds = out.ids;
    }

    // Resolve _current references eagerly (message, prompt, correctAnswer,
    // choicePool literals), preserving other {{refs}} for runtime.
    // engine/phases/foreach-remap.js explains why this must happen here.
    resolveCurrentRefsInSubConfig(subConfig, (ref) => engine.resolve(ref));

    // Remap data refs naming sibling sub-phases -> virtual IDs, in templates
    // (message/prompt), bare refs (input/content), and the bluff-vote fields
    // (choicePool sources, excludeAuthored). engine/phases/foreach-remap.js.
    remapForeachSubConfig(subConfig, subNames, foreachPhaseId);

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

  // Apply scoring for this iteration if configured. Modes: correct (guessers
  // earn points), tally (item author earns points), scores (adopt the
  // sub-phase's own computed map, the bluff-vote pattern). Logic lives in
  // engine/phases/foreach-scoring.js.
  if (feConfig.scoring) {
    const scoringSubId = `_fe:${foreachPhaseId}:${feConfig.scoring.subPhase}`;
    const subData = engine.getPhaseData(scoringSubId);
    if (subData) {
      applyIterationScoring({
        scores: state.scores,
        scoring: feConfig.scoring,
        subData,
        item: state.items[state.currentIndex],
        resolve: (ref) => engine.resolve(ref),
        players: engine.players.list()
      });
      console.log(`[foreach] Iteration ${state.currentIndex + 1}/${state.items.length} scored (${feConfig.scoring.mode || 'correct'}). Scores:`,
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
      itemCount: state.items.length,
      // The items the round sample left out ({{X.skipped}}): a closing
      // gallery shows the drawings that never got a round.
      skipped: state.skipped || []
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

  // Guard against the all-votes-in auto-advance racing a late "Close
  // Voting" click: by then phaseState belongs to the NEXT phase (this used
  // to crash the server). Also idempotent against double clicks.
  if (!vs || vs.kind !== 'vote' || vs.tallied) return;
  vs.tallied = true;

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

  // Head-to-head winners are student answer text — content stays out of logs
  console.log(`[tally] Phase '${vs.phaseId}' tallied: totalVotes=${result.totalVotes}${result.tied ? ' (tied)' : ''}`);
  contentLog(`[tally] winner=${result.winner}`);

  const phaseConfig = engine.config.phases[vs.phaseId];
  phaseConfig.id = vs.phaseId;

  // Branching votes: the winner can route the game (choose-your-own-
  // adventure). Falls back to the normal `next` when there's no map or
  // the winner isn't in it.
  const branchTarget = resolveBranchTarget(phaseConfig, result.winner, vs.candidates);
  if (branchTarget) {
    console.log(`[tally] Branching to phase "${branchTarget}"`);
  }

  const nextId = branchTarget || getNextPhaseId(engine, phaseConfig);
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

// --- Teacher console helpers ---
// The host screen is projected to the class, so "teacher-only" controls
// (moderation, preview approval) also live on /teacher — a private page on
// the teacher's phone/second device, joined with the room's PIN (or the
// site password via the socket handshake's basic-auth header).

const teacherSocketToRoom = new Map(); // console socketId → room code (disconnect cleanup)

// Brute-force lockout for the 4-digit console PIN (5 wrong tries in 10 min
// locks the room's console joins for 5 min). See engine/pin-throttle.js.
const pinThrottle = createPinThrottle();

function teachersChannel(code) {
  return code + ':teachers';
}

// Is this socket allowed to take teacher actions in this room?
// True for the host screen's socket and any joined teacher console.
function isTeacherSocket(code, room, socketId) {
  if (roomToHost.get(code) === socketId) return true;
  return !!(room && room.teacherSocketIds && room.teacherSocketIds.has(socketId));
}

// "A bit more time": how much one press adds, and which phase types accept
// it. Two regimes:
//  - host-clock phases (EXTENDABLE_TIMER_PHASES): no server timeout exists,
//    the projector countdown closes the phase, so the timer-extended
//    broadcast alone stretches everything.
//  - server-timed phases (SERVER_TIMED_EXTENDABLE): a server setTimeout
//    closes the phase, so the deadline must ALSO be re-armed via
//    engine/phase-timer.js or the server would close at the original time.
// Deliberately out: relay and turn (per-turn clocks — more time there
// stretches ONE student's turn, and turn's clock is a fairness mechanic),
// announce and leaderboard (pacing beats, not student work time).
// The rule teachers see: the button appears whenever the whole class is
// working against one shared countdown.
const EXTEND_TIMER_SECONDS = 30;
const EXTENDABLE_TIMER_PHASES = new Set(['collect', 'collect-choice', 'vote', 'estimate']);
const SERVER_TIMED_EXTENDABLE = new Set(['merge', 'rank', 'match', 'sort', 'rate', 'checklist', 'wager']);

// A two-stage phase just closed (host click, console click, all-in
// auto-close, or timer expiry): results are on the projector, so every
// console must relabel its button from the close action to the advance
// action. Without this the console reads "Reveal the answers" after the
// answers are already up.
function notifyTeachersClosed(code, room) {
  const engine = room && room.engine;
  const phase = engine && engine.getCurrentPhase();
  if (!phase) return;
  io.to(teachersChannel(code)).emit(EVENTS.TEACHER_PHASE, {
    phaseId: phase.id,
    phaseType: phase.type,
    phaseInstanceId: room.phaseInstanceId,
    continueLabel: continueLabelForPhase(phase, engine.config.phases, engine.language),
    closeLabel: null,
    closed: true,
    discussionPrompt: discussionPromptFor(phase)
  });
}

// The step's discussion prompt for the console (a teacher-authored
// question; the projector only sees it on the teacher's say-so).
function discussionPromptFor(phase) {
  const text = phase && phase.discussionPrompt;
  return (typeof text === 'string' && text.trim() !== '') ? text.trim() : null;
}

// Everything a console needs to render when it joins mid-game.
function buildTeacherSnapshot(code, room) {
  const engine = room.engine;
  const phase = engine ? engine.getCurrentPhase() : null;
  const snap = {
    code,
    gameName: (engine && engine.config && engine.config.name) || '',
    phaseId: phase ? phase.id : null,
    phaseType: phase ? phase.type : null,
    phaseInstanceId: room.phaseInstanceId || 0,
    playerCount: engine ? engine.players.list().length : 0,
    hostConnected: roomToHost.has(code),
    submissions: [],
    preview: null
  };
  if (phase && (phase.type === 'collect' || phase.type === 'collect-choice')) {
    const eligible = withoutSitOut(getEligibleVoters(engine.players, phase.from || 'all'), phase);
    snap.submissions = buildSubmissionList(eligible);
  }
  if (phase && phase.type === 'preview') {
    const data = engine.getPhaseData(phase.id);
    if (data) snap.preview = { content: data.content, responses: data.responses || [] };
  }
  const ps = room.phaseState;
  if (ps && ps.kind === 'checklist' && !ps.closed) {
    snap.checklist = { items: ps.items, groups: teacherDetail(ps), solo: ps.solo };
  }
  // Word help: which words the class has tapped so far (counts, no names)
  snap.wordHelp = room.wordHelp ? summarizeWordHelp(room.wordHelp) : null;
  snap.displayDrawing = phase ? resolveDisplayDrawing(phase, engine) : null;
  if (engine && phase) {
    snap.continueLabel = continueLabelForPhase(phase, engine.config.phases, engine.language);
    snap.closeLabel = closeLabelFor(phase.type, engine.language);
    snap.closed = !!(ps && ps.closed);
    snap.players = engine.players.listPublic();
    snap.timer = phase.timer || null;
    snap.discussionPrompt = discussionPromptFor(phase);
  }
  return snap;
}

// Live joined-player roster for the consoles (names are fine — the console
// is the teacher's private screen, unlike the projected host).
function emitTeacherRoster(code, room) {
  if (!room || !room.engine) return;
  const players = room.engine.players.listPublic();
  io.to(teachersChannel(code)).emit(EVENTS.TEACHER_ROSTER, {
    count: players.length,
    players,
    // The projector's socket is the only thing that paints the class's
    // screen: when it has dropped (a wifi blip, a tab the browser put to
    // sleep behind the console), the console says so instead of letting
    // the teacher wonder why students land here and nowhere else.
    hostConnected: roomToHost.has(code)
  });
}

// Live roster for the player lobby's holding screen (names + count). LOBBY
// ONLY: the projected host roster already makes this public to the class,
// but mid-game the roster stays off student devices.
function emitRoomRoster(code, room) {
  if (!room || !room.engine) return;
  const phase = room.engine.getCurrentPhase();
  if (!phase || phase.type !== 'lobby') return;
  const names = room.engine.players.list()
    .filter(p => p.connected)
    .map(p => p.name);
  io.to(code).emit(EVENTS.ROOM_ROSTER, { count: names.length, names });
}

// Push the live moderation list (submitter name + text + hidden flag) to the
// teacher consoles only so the teacher can hide/kick during a collect phase.
// Deliberately NOT sent to the host: that screen is projected to the class, so
// names + answers must never reach it. No-op if there's no engine or current
// phase isn't a collect-type.
function emitSubmissionsUpdate(code, room) {
  if (!room || !room.engine) return;
  const phase = room.engine.getCurrentPhase();
  if (!phase || (phase.type !== 'collect' && phase.type !== 'collect-choice')) return;
  const eligible = withoutSitOut(getEligibleVoters(room.engine.players, phase.from || 'all'), phase);
  const payload = { submissions: buildSubmissionList(eligible) };
  io.to(teachersChannel(code)).emit(EVENTS.SUBMISSIONS_UPDATE, payload);
}

// Live Poll (collect-choice with liveResults): the projector's chart
// follows every answer and every hide. Counts only, host screen only.
function emitLiveTally(code, room) {
  if (!room || !room.engine) return;
  const phase = room.engine.getCurrentPhase();
  if (!phase || phase.type !== 'collect-choice' || !phase.liveResults) return;
  const hostSocketId = roomToHost.get(code);
  if (!hostSocketId) return;
  const eligible = getEligibleVoters(room.engine.players, phase.from || 'all');
  const choices = Array.isArray(phase.choices) ? phase.choices : [];
  const { rows, answered } = buildLiveTally(eligible, choices);
  io.to(hostSocketId).emit(EVENTS.LIVE_TALLY, { rows, answered, total: eligible.length, phaseInstanceId: room.phaseInstanceId });
}

// Services bundle passed to phase handler context
const phaseServices = {
  io, roomToHost, aiService, mockAiService,
  resolveTemplate, resolvePerPlayerTemplate, resolveScreenControl, getNextPhaseId, getEligibleVoters,
  resolveImageUrl, resolveVideoEmbed,
  handlePhase: (code, room) => handlePhase(code, room),
  // Helpers needed by complex phase handlers
  generateMatchups,
  closeRanking: (code, room) => closeRanking(code, room),
  closeMatching: (code, room) => closeMatching(code, room),
  closeSorting: (code, room) => closeSorting(code, room),
  closeChecklist: (code, room) => closeChecklist(code, room),
  closeRating: (code, room) => closeRating(code, room),
  closeWager: (code, room) => closeWager(code, room),
  closeMerge: (code, room) => closeMerge(code, room),
  emitRelayTurn: (code, room) => emitRelayTurn(code, room),
  shuffleArray,
  setupForeachIteration,
  advanceForeach: (code, room, id) => advanceForeach(code, room, id)
};

// --- Room snapshots: survive a server restart/sleep mid-game -------------
// Snapshot on every phase transition + roster change; restore lazily when a
// host or player tries to rejoin a room the (restarted) server doesn't know.
// See engine/room-snapshot.js for the resume-at-phase-start semantic.

const SNAPSHOT_DEBOUNCE_MS = 300;
const ROOM_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // stale rooms aren't worth resurrecting
const HOST_GRACE_MS = 5 * 60 * 1000;             // host F5/crash: hold the room, don't kill it
const PLAYER_GRACE_MS = 3 * 60 * 1000;           // dropped student: keep identity (scores, team, answers) for rejoin — school wifi blips outlast 30s

const pendingSnapshots = new Map(); // code → debounce timer

function persistRoom(code, room) {
  if (!DB_ENABLED || !room || room.simulated) return;
  if (pendingSnapshots.has(code)) return; // a write is already queued
  pendingSnapshots.set(code, setTimeout(async () => {
    pendingSnapshots.delete(code);
    try {
      const live = roomManager.find(code);
      if (!live) return;
      const snap = serializeRoom(live);
      if (snap) await saveRoomSnapshot(code, live.gameId, snap);
    } catch (e) {
      console.warn(`[snapshot] save failed for ${code} (continuing): ${e.message}`);
    }
  }, SNAPSHOT_DEBOUNCE_MS));
}

function discardRoomSnapshot(code) {
  if (!DB_ENABLED) return;
  const t = pendingSnapshots.get(code);
  if (t) { clearTimeout(t); pendingSnapshots.delete(code); }
  deleteRoomSnapshot(code).catch(e =>
    console.warn(`[snapshot] delete failed for ${code} (continuing): ${e.message}`));
}

const restoreInFlight = new Map(); // code → Promise (dedupe concurrent rejoiners)

async function tryRestoreRoom(code) {
  if (!DB_ENABLED) return null;
  const live = roomManager.find(code);
  if (live) return live;
  if (restoreInFlight.has(code)) return restoreInFlight.get(code);

  const p = (async () => {
    try {
      const snap = await getRoomSnapshot(code);
      if (!snap) return null;
      if (Date.now() - (snap.savedAt || 0) > ROOM_SNAPSHOT_TTL_MS) {
        discardRoomSnapshot(code);
        return null;
      }
      const config = await loadGameById(snap.gameId);
      const hooks = await loadHooks(snap.gameId);
      const room = restoreRoom(snap, config, hooks);
      roomManager.adopt(room);
      console.log(`[restore] Room ${code} restored at phase '${room.engine.getCurrentPhase().id}' (${(snap.players || []).length} player(s))`);
      return room;
    } catch (e) {
      console.warn(`[restore] Failed for ${code}: ${e.message}`);
      return null;
    } finally {
      restoreInFlight.delete(code);
    }
  })();
  restoreInFlight.set(code, p);
  return p;
}

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

  // Survive restarts: snapshot at every transition (a restored room resumes
  // at the START of the current phase). A finished game has nothing to restore.
  if (phase.type === 'end') {
    discardRoomSnapshot(code);
    // A room restored from a snapshot has no analytics id: it sends
    // nothing rather than a made-up one.
    if (room.analyticsId && !room.simulated) {
      analytics.track('activity_ended', {
        game: analyticsGameLabel(room),
        players: engine.players.list().length,
        minutes: Math.max(0, Math.round((Date.now() - (room.createdAt || Date.now())) / 60_000))
      }, room.analyticsId);
    }
  } else {
    persistRoom(code, room);
  }

  // Keep teacher consoles oriented: which step is running decides which
  // controls the console shows (close submissions vs next step vs approve).
  io.to(teachersChannel(code)).emit(EVENTS.TEACHER_PHASE, {
    phaseId: phase.id,
    phaseType: phase.type,
    phaseInstanceId: room.phaseInstanceId,
    // Lets the console's next-step button say what advancing DOES
    // ("Start the voting"), not a generic "Next step".
    continueLabel: continueLabelForPhase(phase, engine.config.phases, engine.language),
    // Two-stage phases: while open, the console button CLOSES (results
    // show on the projector first), so it must say the close action.
    closeLabel: closeLabelFor(phase.type, engine.language),
    // Lets the console decide whether "A bit more time" applies.
    timer: phase.timer || null,
    // The drawing the class is looking at (Doodle Bluff rounds): the
    // teacher moderates titles better seeing the picture they are for.
    displayDrawing: resolveDisplayDrawing(phase, engine),
    // A question to ask during this step (console only until shown)
    discussionPrompt: discussionPromptFor(phase)
  });

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

// --- Late seating: a FRESH join that lands in a team step already open ---
// The handler's onLateJoin (team-split, team-roles, checklist; engine/
// phases/late-seating.js) gives the newcomer a seat wherever the class is
// and refreshes the projector; the consoles get one line saying where
// they landed. Runs before sendCurrentState so the newcomer's first
// screen is their seat, not the waiting screen. Reconnects never come
// here (they follow their old seat).
function seatLateJoiner(socket, code, room) {
  if (!room.engine) return null;
  const phase = room.engine.getCurrentPhase();
  if (!phase || phase.type === 'lobby') return null;
  const handler = getHandler(phase.type);
  if (!handler || !handler.onLateJoin) return null;
  const ctx = createPhaseContext(code, room, phaseServices);
  const seat = handler.onLateJoin(ctx, socket.id);
  if (!seat) return null;
  const name = (room.engine.players.find(socket.id) || {}).name || '?';
  console.log(`[join-room] Late seat for ${name} in '${phase.id}': team ${seat.team || '(picking)'}, role ${seat.role || (seat.picking ? '(picking)' : 'none')}`);
  io.to(teachersChannel(code)).emit(EVENTS.TEACHER_LATE_SEAT, {
    name, team: seat.team || null, role: seat.role || null, picking: !!seat.picking, phaseId: phase.id
  });
  return seat;
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
  res.sendFile('index.html', { root: join(__dirname, 'screens', 'home') });
});

app.use('/host', express.static(join(__dirname, 'screens/host')));
// Carousel activity shots (screens/home/shots/, made by
// scripts/regen-carousel-shots.js). A missing shot 404s and the carousel
// falls back to its text-only card.
app.use('/home-shots', express.static(join(__dirname, 'screens/home/shots')));
// The printable activity report (registered before the static mount so the
// extensionless path resolves to the page, not a directory miss).
app.get('/teacher/report', (req, res) => {
  res.sendFile('report.html', { root: join(__dirname, 'screens', 'teacher') });
});
app.use('/teacher', express.static(join(__dirname, 'screens/teacher')));
app.use('/player', express.static(join(__dirname, 'screens/player')));
app.use('/shared', express.static(join(__dirname, 'screens/shared')));
app.use('/prototype', express.static(join(__dirname, 'screens/prototype')));
// Make it yours as a page (2026-09-09): the first student step as the
// class will see it, the question editable in place, one red TRY IT.
app.use('/make', express.static(join(__dirname, 'screens/make')));
// The yard page folded into the home (one yard, 2026-09-13: "it's
// confusing when there's a different yard"). /library is the owner's
// curation console now, reached through /owner (?owner=1); every other
// visit lands on the home's yard with its deep links carried over:
// ?about= (a popup), ?highlight= (the editor's way back), ?q= (a search);
// ?customize= goes straight to the make page.
app.get(['/library', '/library/'], (req, res, next) => {
  const params = new URL(req.originalUrl, 'http://localhost').searchParams;
  if (params.get('owner') === '1') return next();
  if (params.get('customize')) {
    return res.redirect('/make?game=' + encodeURIComponent(params.get('customize')) + '&from=yard');
  }
  const carried = new URLSearchParams();
  for (const key of ['about', 'highlight', 'q']) {
    if (params.get(key)) carried.set(key, params.get(key));
  }
  const qs = carried.toString();
  res.redirect('/' + (qs ? '?' + qs : '') + '#yard');
});
app.use('/library', express.static(join(__dirname, 'screens/library')));
// Owner doorway: replaces the old in-page "Show full library (site owner)"
// link, which read to teachers as content being withheld from them.
app.get('/owner', (req, res) => {
  res.redirect('/library?owner=1');
});
// One-page teacher guide: what you need, the first five minutes, what you
// control live, and what to do when something goes wrong.
app.use('/guide', express.static(join(__dirname, 'screens/guide')));
// Public privacy page (2026-08-08 field test: admins need practice they can
// cite; the careful engineering was invisible).
app.use('/privacy', express.static(join(__dirname, 'screens/privacy')));
// Owner-only feedback inbox (ownerAreaGate runs first and demands the password).
app.use('/feedback', express.static(join(__dirname, 'screens/feedback')));

app.get('/designer/edit', (req, res) => {
  res.sendFile('editor.html', { root: join(__dirname, 'screens', 'designer') });
});

app.use('/designer', express.static(join(__dirname, 'screens/designer')));

// --- Share links (the sharing system, docs/NEXT-STEPS) ---
// jamyard.org/share/<id> is what a teacher hands a colleague: it lands on
// an import page whose one button saves a COPY into the visitor's own
// activities (POST /api/games/:id/copy below). Built-ins already have a
// public home, so their share links go straight to the library popup.
// A dead link (deleted activity) still gets the page, which fetches the
// config itself and says honestly that the activity is gone.
app.get('/share/:gameId', async (req, res) => {
  try {
    const { source } = await resolveGamePath(req.params.gameId);
    if (source === 'built-in') {
      return res.redirect('/?about=' + encodeURIComponent(req.params.gameId) + '#yard');
    }
  } catch {} // DB-backed user games and dead links both fall through to the page
  res.sendFile('index.html', { root: join(__dirname, 'screens', 'share') });
});
app.get('/share', (req, res) => res.redirect('/#yard'));

// --- Vanity URLs (vanity-urls.json) ---
// A memorable path per activity: jamyard.org/good-question opens the host
// screen for that activity. Config, not code: add a "slug": "game-id" pair
// to vanity-urls.json to mint one. Slugs that collide with a real surface
// are refused loudly at startup.
const VANITY_RESERVED = new Set([
  'api', 'host', 'player', 'teacher', 'library', 'designer', 'prototype',
  'guide', 'owner', 'feedback', 'privacy', 'shared', 'home-shots', 'socket.io',
  'share', 'make'
]);
try {
  const vanityUrls = JSON.parse(await readFile(join(__dirname, 'vanity-urls.json'), 'utf8'));
  for (const [slug, gameId] of Object.entries(vanityUrls)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || VANITY_RESERVED.has(slug) || typeof gameId !== 'string') {
      console.error(`[vanity-urls] Refusing invalid or reserved slug "${slug}"`);
      continue;
    }
    app.get('/' + slug, (req, res) => {
      res.redirect('/host?game=' + encodeURIComponent(gameId));
    });
    console.log(`[vanity-urls] /${slug} -> ${gameId}`);
  }
} catch (error) {
  console.error('[vanity-urls] Could not load vanity-urls.json:', error.message);
}

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

// The activity's treasure map: an ordered summary of what happens, drawn in
// the activity popups (engine/activity-map.js). Public like the config
// itself: activity structure only, never student data.
app.get('/api/games/:gameId/map', async (req, res) => {
  try {
    const config = await loadGameById(req.params.gameId);
    res.json(buildActivityMap(config));
  } catch (error) {
    console.log(`[api/games/:gameId/map] Error: ${error.message}`);
    res.status(404).json({ error: error.message });
  }
});

// The Make it yours page's print: the first student step's words, timer,
// and audience line, from the same modules the host uses at game time.
app.get('/api/games/:gameId/print', async (req, res) => {
  try {
    const config = await loadGameById(req.params.gameId);
    const print = printFor(config);
    if (!print) return res.status(404).json({ error: 'This activity has no step students answer, nothing to draw.' });
    res.json(print);
  } catch (error) {
    console.log(`[api/games/:gameId/print] Error: ${error.message}`);
    res.status(404).json({ error: error.message });
  }
});

// The teacher's edits from that page, applied to a working copy of the
// config (never saved here: the page saves through POST /api/games like
// every other Make it yours door). Edits are teacher text: bounded,
// applied by engine/make-print.js, untrusted for rendering downstream.
// The What happens map of a config the page already holds (the make
// page's AI-fitted copy, before it is saved): the same pure builder the
// per-game route uses. Nothing is stored.
app.post('/api/games/map', express.json({ limit: '256kb' }), (req, res) => {
  const config = req.body && req.body.config;
  if (!config || typeof config !== 'object' || !config.phases || typeof config.phases !== 'object') {
    return res.status(400).json({ error: 'Missing config or phases' });
  }
  try {
    res.json(buildActivityMap(config));
  } catch (error) {
    console.log(`[api/games/map] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// The print (what the class will see on the first student step) of a
// config the page already holds: the make page redraws the top of the
// page from the AI-fitted copy. Nothing is stored.
app.post('/api/games/print', express.json({ limit: '256kb' }), (req, res) => {
  const config = req.body && req.body.config;
  if (!config || typeof config !== 'object' || !config.phases || typeof config.phases !== 'object') {
    return res.status(400).json({ error: 'Missing config or phases' });
  }
  try {
    const print = printFor(config);
    if (!print) return res.status(404).json({ error: 'Nothing students answer in this activity' });
    res.json(print);
  } catch (error) {
    console.log(`[api/games/print] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/games/:gameId/make', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const config = await loadGameById(req.params.gameId);
    const body = req.body || {};
    const edits = {};
    if (typeof body.prompt === 'string') edits.prompt = body.prompt.slice(0, 500);
    if (body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)) {
      edits.fields = {};
      for (const [key, label] of Object.entries(body.fields)) {
        if (typeof key === 'string' && typeof label === 'string') edits.fields[key.slice(0, 64)] = label.slice(0, 300);
      }
    }
    if (typeof body.timer === 'number') edits.timer = body.timer;
    // The pairs of match steps (Vocab Match), by step id, capped
    if (body.pairs && typeof body.pairs === 'object' && !Array.isArray(body.pairs)) {
      edits.pairs = {};
      for (const [id, list] of Object.entries(body.pairs).slice(0, 12)) {
        if (typeof id !== 'string' || !Array.isArray(list)) continue;
        edits.pairs[id.slice(0, 64)] = list.slice(0, 40).map((p) => ({
          left: typeof p?.left === 'string' ? p.left.slice(0, 120) : '',
          right: typeof p?.right === 'string' ? p.right.slice(0, 120) : ''
        }));
      }
    }
    // New rounds ("+ round"), each a list of pairs, capped
    if (Array.isArray(body.newRounds)) {
      edits.newRounds = body.newRounds.slice(0, 8).map((r) => ({
        pairs: (Array.isArray(r?.pairs) ? r.pairs : []).slice(0, 40).map((p) => ({
          left: typeof p?.left === 'string' ? p.left.slice(0, 120) : '',
          right: typeof p?.right === 'string' ? p.right.slice(0, 120) : ''
        }))
      }));
    }
    const out = applyEdits(config, edits);
    const working = out.config;
    let changed = out.changed;
    if (typeof body.anonymous === 'boolean' && body.anonymous !== !!config.anonymous) {
      working.anonymous = body.anonymous;
      changed = true;
    }
    // Early-bird joke: the page's checkbox is on/off. It is on by default,
    // so turning it on again just drops the `false`; off writes `false`.
    if (typeof body.earlyJoke === 'boolean' && body.earlyJoke !== isEarlyJokeOn(config)) {
      if (body.earlyJoke) delete working.earlyJoke;
      else working.earlyJoke = false;
      changed = true;
    }
    working.name = nameFor(config.name || 'Activity', changed && typeof edits.prompt === 'string' && edits.prompt.trim() !== String(config.phases?.[out.phaseId || '']?.prompt || '').trim() ? edits.prompt : '');
    delete working.featured;
    // The What happens map of the edited copy rides along, so the make
    // page can redraw it the moment the question changes (2026-09-13)
    res.json({ config: working, changed, map: buildActivityMap(working) });
  } catch (error) {
    console.log(`[api/games/:gameId/make] Error: ${error.message}`);
    res.status(404).json({ error: error.message });
  }
});

// Teacher-only: journal entries carry player names and moderation events
// (hides/kicks), and the room code is projected on a wall — anyone in the
// class could otherwise watch which named student got kicked (2026-07-19
// review). Auth: the room's teacher PIN (?pin=1234) or the site password
// via basic auth.
app.get('/api/rooms/:code/journal', (req, res) => {
  const room = roomManager.find(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const allowed = checkTeacherAccess(
    { pin: typeof req.query.pin === 'string' ? req.query.pin : '', authHeader: req.headers.authorization },
    { teacherPin: room.teacherPin, sitePassword: process.env.SITE_PASSWORD }
  );
  if (!allowed) {
    return res.status(403).json({ error: 'Teacher access required. Add ?pin=<teacher PIN> (shown on the host screen).' });
  }
  res.json({
    code: room.code,
    currentPhaseId: room.engine ? room.engine.getCurrentPhase().id : null,
    phaseInstanceId: room.phaseInstanceId || 0,
    journal: room.journal || []
  });
});

// Teacher-only: the printable activity report — student names and work,
// built on demand from live room state (engine/report.js). Deliberately
// never stored server-side: it goes straight to the teacher's device, and
// when the room expires the data is gone. Same auth as the journal.
app.get('/api/rooms/:code/report', (req, res) => {
  const room = roomManager.find(req.params.code.toUpperCase());
  if (!room || !room.engine) return res.status(404).json({ error: 'Room not found. Reports are only available while the room is open.' });
  const allowed = checkTeacherAccess(
    { pin: typeof req.query.pin === 'string' ? req.query.pin : '', authHeader: req.headers.authorization },
    { teacherPin: room.teacherPin, sitePassword: process.env.SITE_PASSWORD }
  );
  if (!allowed) {
    return res.status(403).json({ error: 'Teacher access required. Open the report from your teacher console.' });
  }
  res.json(buildActivityReport(room.engine, {
    code: room.code,
    wordHelp: room.wordHelp ? summarizeWordHelp(room.wordHelp) : null
  }));
});

// Public pre-join lookup: the player screen asks whether a room collects
// names before showing the "Your name" box (anonymous mode). Only facts
// already projected on the wall leave here: the room exists, the activity's
// name, and the anonymous flag. No roster, no PINs, no phase state.
app.get('/api/rooms/:code/info', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = roomManager.find(code);
  if (!room || !room.engine) return res.status(404).json({ error: 'Room not found' });
  res.json({
    code,
    game: room.engine.config.name || null,
    anonymous: !!room.engine.config.anonymous,
    // The join form's fixed labels speak the activity's language
    language: room.engine.language,
    strings: stringsFor(room.engine.language)
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
      playerToggles: (schema.ui && schema.ui.playerToggles) || [],
      // Fields that exist at top level but not inside a For Each round
      // (rotation/pairing) — the editor mirrors the server's sub-phase guard.
      topLevelOnlyFields: getTopLevelOnlyFieldNames(type)
    };
  }
  res.json(summary);
});

// --- Recipe endpoints (the recipe layer: list / compile / save user recipes) ---
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

  // The treasure map rides along so recipe surfaces can draw the same
  // what-happens trail the library's activity popups show.
  res.json({ config, diagnostics, map: buildActivityMap(config) });
});

// The recipe's map with its parameters at their defaults: what this
// recipe builds, drawn before the teacher fills anything in. Garnish
// endpoint — clients ignore any non-OK response.
app.get('/api/recipes/:id/map', (req, res) => {
  const recipe = getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: `Recipe "${req.params.id}" not found` });
  const defaults = {};
  for (const [name, spec] of Object.entries(recipe.parameters || {})) {
    if (spec && spec.default !== undefined) defaults[name] = spec.default;
  }
  const { config } = compileRecipe(recipe, defaults);
  if (!config) {
    return res.status(400).json({ error: 'Recipe needs parameters before it can be drawn.' });
  }
  res.json(buildActivityMap(config));
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

  // Durable store first (survives redeploys); filesystem only as the
  // no-DB local-dev fallback.
  try {
    if (DB_ENABLED) {
      await saveUserRecipe(recipe.id, recipe);
    } else {
      const userDir = join(__dirname, 'recipes', 'user');
      await mkdir(userDir, { recursive: true });
      const filePath = join(userDir, `${recipe.id}.json`);
      await writeFile(filePath, JSON.stringify(recipe, null, 2), 'utf-8');
    }

    // Bust the cache so the next /api/recipes call sees this one
    await reloadRecipes({ force: true });

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
    if (DB_ENABLED) {
      await deleteUserRecipe(id);
      // Also remove any migrated file copy so it can't resurrect the
      // recipe on the next local restart.
      await rm(filePath).catch(() => {});
    } else {
      await rm(filePath);
    }
    await reloadRecipes({ force: true });
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
      // Some configs declare minPlayers on the lobby phase instead of
      // top-level — the host lobby's start hint needs either.
      minPlayers: config.minPlayers || (config.phases.lobby && config.phases.lobby.minPlayers) || null,
      maxPlayers: config.maxPlayers || null,
      // The home page's drawn projector frame (engine/home-glimpse.js)
      glimpse: homeGlimpse(config),
      ...yardCardExtras(config),
      ...pickCardMeta(config)
    }));

    if (DB_ENABLED) {
      const userRows = await listUserGamesRepaired();
      for (const row of userRows) {
        const config = row.config;
        games.push({
          id: row.id,
          source: 'user',
          name: config.name,
          description: config.description || '',
          phaseCount: Object.keys(config.phases || {}).length,
          minPlayers: config.minPlayers || (config.phases && config.phases.lobby && config.phases.lobby.minPlayers) || null,
          maxPlayers: config.maxPlayers || null,
          glimpse: homeGlimpse(config),
          ...yardCardExtras(config),
          ...pickCardMeta(config)
        });
      }
    }

    res.json({ games: applyFeaturedOverrides(games, await featuredOverridesSafe()) });
  } catch (error) {
    console.log(`[api/games] Error: ${error.message}`);
    res.status(500).json({ games: [], error: 'Failed to load games' });
  }
});

// AI budget status — today's usage vs the configured guards. Handy when a
// teacher hits the cap and wants to know how close they are after a reset.
app.get('/api/ai-budget', async (req, res) => {
  res.json({ mode: aiMode, ...(await aiService.budget.peek()) });
});

// --- Site feedback (the 💬 widget → owner inbox at /feedback) ---
// Submissions are anonymous by design (no name/email fields exist). Neon
// when available; data/feedback.ndjson for local dev.
const feedbackStore = createFeedbackStore(
  DB_ENABLED
    ? { db: { addFeedback, listFeedback, setFeedbackStatus } }
    : { filePath: join(__dirname, 'data', 'feedback.ndjson') }
);
const feedbackLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });

// Site analytics relay: teacher pages post {event, props, aid} here
// (screens/shared/analytics.js). Always 204, whether or not analytics is
// on and whether or not the event passed the allowlist: the page has
// nothing to do with the answer, and a refused event is not an error a
// visitor needs to hear about. Rate-limited per IP like feedback.
// Session replay config for the six teacher authoring pages
// (screens/shared/replay.js): the project token and hosts, or null when
// replay is off (no POSTHOG_KEY, or POSTHOG_REPLAY=0). The token is
// public by design; nothing else about the project leaves the server.
const REPLAY = replayConfig({ key: process.env.POSTHOG_KEY, host: process.env.POSTHOG_HOST, replay: process.env.POSTHOG_REPLAY });
console.log(`[init] Session replay: ${REPLAY ? 'on (teacher authoring pages only)' : 'off'}`);
app.get('/api/analytics-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ replay: REPLAY });
});

const trackLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });
app.post('/api/track', express.json({ limit: '2kb' }), (req, res) => {
  try {
    if (analytics.enabled) {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      const ip = forwarded || req.socket?.remoteAddress || 'unknown';
      const parsed = trackLimiter.allow(ip) ? parseClientEvent(req.body) : null;
      // The teacher's address rides along for country and region only
      // (PostHog discards it after the lookup); never on server events.
      // The host the page was served on (jamyard.org) names the page for
      // PostHog's own dashboards; validated inside track.
      if (parsed) analytics.track(parsed.event, parsed.props, parsed.distinctId, { ip, host: req.hostname });
    }
  } catch (err) {
    console.log(`[api/track] ${err.message}`);
  }
  res.status(204).end();
});
setInterval(() => feedbackLimiter.sweep(), 10 * 60_000);

// Open to everyone — visitors are exactly who we want feedback from.
app.post('/api/feedback', async (req, res) => {
  try {
    // Behind Render's proxy the socket address is the load balancer, which
    // would make the per-IP limit global — prefer the forwarded address.
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket?.remoteAddress || 'unknown';
    if (!feedbackLimiter.allow(ip)) {
      return res.status(429).json({ error: 'Thanks, that\'s a lot of feedback at once! Try again in a minute.' });
    }
    const checked = validateFeedback(req.body);
    if (!checked.ok) {
      return res.status(400).json({ error: checked.error });
    }
    const id = await feedbackStore.add(checked.cleaned);
    // The category only; the message never leaves the inbox.
    analytics.track('feedback_sent', { category: checked.cleaned.category }, 'site:feedback');
    res.json({ success: true, id });
  } catch (err) {
    console.log(`[api/feedback POST] Error: ${err.message}`);
    res.status(500).json({ error: 'Could not save feedback. Please try again.' });
  }
});

// Owner-gated by ownerAreaGate (everything /api/feedback except POST).
app.get('/api/feedback', async (req, res) => {
  try {
    res.json({ feedback: await feedbackStore.list() });
  } catch (err) {
    console.log(`[api/feedback GET] Error: ${err.message}`);
    res.status(500).json({ error: 'Could not load feedback.' });
  }
});

app.patch('/api/feedback/:id', async (req, res) => {
  try {
    const ok = await feedbackStore.setStatus(req.params.id, req.body && req.body.status);
    if (!ok) return res.status(404).json({ error: 'No such feedback entry.' });
    res.json({ success: true });
  } catch (err) {
    console.log(`[api/feedback PATCH] Error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Owner-mode check: ownerAreaGate demands the owner password before this
// handler runs, so reaching it IS the proof. The browser caches the Basic
// Auth credentials for the realm, so subsequent owner requests just work.
app.get('/api/owner-check', (req, res) => {
  res.json({ owner: true });
});

// Prompt banks (library-first workstream B): curated, attributed prompt
// decks the recipe form's deck picker reads. Read-only, open — the same
// content ships in the repo.
app.get('/api/prompt-banks/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid bank id.' });
  }
  try {
    const raw = await readFile(join(__dirname, 'recipes', 'prompt-banks', `${id}.json`), 'utf-8');
    res.type('application/json').send(raw);
  } catch (err) {
    res.status(404).json({ error: `No prompt bank named "${id}".` });
  }
});

// Owner-gated (ownerAreaGate): the runs-not-builds gauge.
app.get('/api/activity-runs', async (req, res) => {
  try {
    if (!DB_ENABLED) return res.json({ enabled: false, totals: [], lastSevenDays: 0 });
    res.json({ enabled: true, ...(await activityRunSummary()) });
  } catch (err) {
    console.log(`[api/activity-runs] Error: ${err.message}`);
    res.status(500).json({ error: 'Could not load run counts.' });
  }
});

// Owner curation: flip a game's featured flag DURABLY. Built-in flags flipped
// via the old whole-config PUT landed on Render's ephemeral disk and silently
// reverted on every deploy — with the DB on, built-ins now persist to the
// featured_overrides table (repo flags stay the defaults). User games keep the
// flag inside their config (already durable in user_games / local disk).
app.post('/api/games/:gameId/featured', async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!req.body || typeof req.body.featured !== 'boolean') {
      return res.status(400).json({ error: 'Body must be { "featured": true|false }.' });
    }
    const featured = req.body.featured;

    if (DB_ENABLED && await userGameExists(gameId)) {
      const row = await getUserGameRepaired(gameId);
      const config = { ...row.config, featured };
      await saveUserGame(gameId, config);
      return res.json({ success: true, featured, storage: 'user-config' });
    }

    const { configPath, source } = await resolveGamePath(gameId);
    if (source === 'built-in' && !isOwnerRequest(req)) {
      res.set('WWW-Authenticate', 'Basic realm="Jamyard Owner Area"');
      return res.status(401).json({ error: 'Curating a built-in activity requires the owner password.' });
    }
    if (source === 'built-in' && DB_ENABLED) {
      // Flipping back to the repo default clears the override instead of
      // storing a redundant row — no drift marker, repo regains control.
      const repoConfig = JSON.parse(await readFile(configPath, 'utf-8'));
      if (featured === !!repoConfig.featured) {
        await clearFeaturedOverride(gameId);
        return res.json({ success: true, featured, storage: 'default' });
      }
      await setFeaturedOverride(gameId, featured);
      return res.json({ success: true, featured, storage: 'override' });
    }
    // Local dev (no DB) or filesystem user game: the disk IS durable here.
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    config.featured = featured;
    await writeFile(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true, featured, storage: 'config' });
  } catch (error) {
    console.log(`[api/games featured] Error: ${error.message}`);
    const missing = /not found|ENOENT/i.test(error.message);
    res.status(missing ? 404 : 500).json({ error: missing ? 'Activity not found.' : 'Could not change featured.' });
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
      const { configPath, source } = await resolveGamePath(gameId);
      // The site is public: anyone may create and edit their own activities,
      // but only the owner may modify the shipped built-ins.
      if (source === 'built-in' && !isOwnerRequest(req)) {
        res.set('WWW-Authenticate', 'Basic realm="Jamyard Owner Area"');
        return res.status(401).json({ error: 'Editing a built-in activity requires the owner password.' });
      }
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

// Import-a-copy, the receiving half of a share link (engine/share-copy.js
// has the why). Public like config reads: shared content is teacher-authored
// by construction (teacher-save purity), and the recipient's browser adds
// the new id to its own My Activities list. Rate-limited per IP because
// every call writes a row.
const copyLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
setInterval(() => copyLimiter.sweep(), 10 * 60_000).unref();

// True when a candidate id is already a built-in, a filesystem user game,
// or a DB user game — the same three stores POST /api/games collides on.
async function gameIdTaken(id) {
  try { await access(join(GAMES_DIR, id, 'config.json')); return true; } catch {}
  try { await access(join(USER_GAMES_DIR, id, 'config.json')); return true; } catch {}
  if (DB_ENABLED && await userGameExists(id)) return true;
  return false;
}

app.post('/api/games/:gameId/copy', async (req, res) => {
  try {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket?.remoteAddress || 'unknown';
    if (!copyLimiter.allow(ip)) {
      return res.status(429).json({ error: 'That\'s a lot of copies at once! Try again in a minute.' });
    }
    const source = await loadGameById(req.params.gameId);
    const config = prepareSharedCopy(source);
    const newId = await mintCopyId(req.params.gameId, gameIdTaken);
    validate(config, newId);
    if (DB_ENABLED) {
      await saveUserGame(newId, config);
    } else {
      const userGameDir = join(USER_GAMES_DIR, newId);
      await mkdir(userGameDir, { recursive: true });
      await writeFile(join(userGameDir, 'config.json'), JSON.stringify(config, null, 2));
    }
    console.log(`[api/games copy] ${req.params.gameId} -> ${newId}`);
    res.json({ success: true, id: newId, name: config.name });
  } catch (error) {
    console.log(`[api/games copy] Error: ${error.message}`);
    const status = error.message.startsWith('Game not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

// --- AI authoring endpoints (review, fix, revise, generate, theme, recipe match) ---
// All gated by requireRealAI + the ai-budget throttle; they return 429 when capped.
app.post('/api/games/review', async (req, res) => {
  try {
    const { config, depth } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    const structural = validate(config, 'review', { returnResults: true });

    // Deep review: run the AI review AND a robot playtest in parallel.
    // The playtest drives this server with bot clients (mock AI, temp room)
    // and reports what actually happens at runtime — stalls, crashed
    // phases, blank screens — the bug class static review can't see.
    // Skipped when structural errors exist (the game can't even load).
    if ((depth || 'light') === 'deep' && structural.errors.length === 0) {
      const tempId = registerTempGame(config);
      try {
        const [ai, simulation] = await Promise.all([
          aiService.review({ config, depth: 'deep' }),
          simulateGame({
            serverUrl: `http://localhost:${PORT}`,
            gameId: tempId,
            config,
            numPlayers: 4
          }).catch(err => {
            console.log(`[api/games/review] Simulation failed: ${err.message}`);
            return { failed: true, error: err.message, completed: false, findings: [], phaseLog: [] };
          })
        ]);
        return res.json({ structural, ai, simulation });
      } finally {
        unregisterTempGame(tempId);
      }
    }

    const ai = await aiService.review({ config, depth: depth || 'light' });
    res.json({ structural, ai });
  } catch (error) {
    console.log(`[api/games/review] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// POST /api/games/fix-issue was REMOVED 2026-08-22: the per-issue fix
// pipeline is gone from the editor. Review findings flow into the design
// chat (/api/games/chat), which proposes one validated change to approve.

// Library Customize: short tailoring questions for a built-in's copy.
// Works in mock mode too (canned questions) so the flow is always testable.
app.post('/api/games/customize-questions', async (req, res) => {
  try {
    const { config, classDescription, knownSettings } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    const classDesc = typeof classDescription === 'string' ? classDescription : '';
    const result = await aiService.generateCustomizeQuestions(config, classDesc, knownSettings);
    res.json(result);
  } catch (error) {
    console.log(`[api/games/customize-questions] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Library quiz Customize panel: topic in, multiple-choice questions out
// (quiz-show recipe param shape). Works in mock mode too (canned
// questions) so the flow is always testable; no student data involved.
app.post('/api/games/quiz-questions', async (req, res) => {
  try {
    const { topic, count, classDescription } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Give a topic of at least a few characters.' });
    }
    const result = await aiService.generateQuizQuestions({
      topic,
      count: Number.isInteger(count) ? count : parseInt(count, 10) || undefined,
      classDescription: typeof classDescription === 'string' ? classDescription : ''
    });
    res.json(result);
  } catch (error) {
    console.log(`[api/games/quiz-questions] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Library bluff Customize panel (Trivia Bluff prepared mode): topic in,
// fill-in-the-blank facts out (trivia-bluff recipe `questions` param
// shape). Works in mock mode too (canned facts) so the flow is always
// testable; no student data involved.
app.post('/api/games/bluff-facts', async (req, res) => {
  try {
    const { topic, count, classDescription } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Give a topic of at least a few characters.' });
    }
    const result = await aiService.generateBluffFacts({
      topic,
      count: Number.isInteger(count) ? count : parseInt(count, 10) || undefined,
      classDescription: typeof classDescription === 'string' ? classDescription : ''
    });
    res.json(result);
  } catch (error) {
    console.log(`[api/games/bluff-facts] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// A list of short phrases on a topic, written on the make page so the
// teacher reads and changes them before class (Doodle Bluff's "the AI
// writes the phrases": setup.writes in the recipe).
app.post('/api/games/phrase-list', async (req, res) => {
  try {
    const { topic, count, classDescription } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Give a topic of at least a few characters.' });
    }
    const result = await aiService.generatePhraseList({
      topic,
      count: Number.isInteger(count) ? count : parseInt(count, 10) || undefined,
      classDescription: typeof classDescription === 'string' ? classDescription : ''
    });
    res.json(result);
  } catch (error) {
    console.log(`[api/games/phrase-list] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
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
    // The AI rebuilds the whole config and loses the provenance stamp;
    // restore it so recipe-born copies keep their Customize knobs.
    carryRecipeStamp(config, result.updatedConfig);
    carryAnonymousFlag(config, result.updatedConfig);
    carryLanguage(config, result.updatedConfig);
    carryWordHelp(config, result.updatedConfig);
    carryEarlyJoke(config, result.updatedConfig);
    carrySubPhaseOrder(config, result.updatedConfig);
    carryStart(config, result.updatedConfig);
    // Validate the AI's revised config; surface errors so the client can show them
    const structural = validate(result.updatedConfig, 'revise', { returnResults: true });
    res.json({ ...result, structural });
  } catch (error) {
    console.log(`[api/games/revise] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// One turn of the editor's design chat panel. Discussion turns come back
// as { kind: 'chat', reply }; edit turns chain into the revise pipeline
// server-side and come back as { kind: 'proposal', reply, proposal:
// { updatedConfig, summary, structural } }. History is client-held (and
// re-trimmed in the service); this endpoint is stateless.
// The revise/chat AI rebuilds the whole config and doesn't know about the
// top-level anonymous flag; a teacher's "play anonymously" choice must
// survive an unrelated AI edit. (Same reasoning as carryRecipeStamp.)
function carryAnonymousFlag(original, updated) {
  if (original && original.anonymous === true && updated && updated.anonymous === undefined) {
    updated.anonymous = true;
  }
}

// Sub-phase ORDER inside a foreach is the key order of `subPhases`, and a
// model rewriting the whole config can hand the keys back shuffled
// (Doodle Bluff's copy came back guess, titles, reveal: the vote ran
// before anyone wrote a fake, 2026-09-06). When the set of sub-phases is
// unchanged, keep the original order; a real restructure (added or
// removed sub-phase) is left as the model wrote it.
function carrySubPhaseOrder(original, updated) {
  if (!original || !updated || !original.phases || !updated.phases) return;
  for (const [id, phase] of Object.entries(updated.phases)) {
    const src = original.phases[id];
    if (!phase || !src || phase.type !== 'foreach' || src.type !== 'foreach') continue;
    if (!phase.subPhases || !src.subPhases || typeof phase.subPhases !== 'object' || typeof src.subPhases !== 'object') continue;
    const before = Object.keys(src.subPhases);
    const after = Object.keys(phase.subPhases);
    if (before.length !== after.length || before.some(k => !after.includes(k))) continue;
    if (before.every((k, i) => after[i] === k)) continue;
    const ordered = {};
    for (const k of before) ordered[k] = phase.subPhases[k];
    phase.subPhases = ordered;
  }
}

// And for the word-help budget (editor Settings, engine/word-help.js).
// Same for the early-bird joke (engine/early-joke.js): a top-level
// teacher choice the model rebuilding the config knows nothing about.
function carryEarlyJoke(original, updated) {
  if (!original || !updated || original.earlyJoke === undefined || updated.earlyJoke !== undefined) return;
  // `false` (turned off) matters as much as a count: absent means on.
  updated.earlyJoke = original.earlyJoke && typeof original.earlyJoke === 'object' ? { ...original.earlyJoke } : original.earlyJoke;
}

function carryWordHelp(original, updated) {
  if (original && original.wordHelp && typeof original.wordHelp === 'object' && updated && updated.wordHelp === undefined) {
    updated.wordHelp = { ...original.wordHelp };
  }
}

// Same again for the teacher's explicit language pick (editor Settings).
function carryLanguage(original, updated) {
  if (original && typeof original.language === 'string' && updated && updated.language === undefined) {
    updated.language = original.language;
  }
}

// And the start mode (rolling start is a teacher choice the AI never sees).
function carryStart(original, updated) {
  if (original && typeof original.start === 'string' && updated && updated.start === undefined) {
    updated.start = original.start;
  }
}

app.post('/api/games/chat', async (req, res) => {
  try {
    if (!requireRealAI(res)) return;
    const { config, messages, focusPhaseId, classDescription, forceEdit } = req.body;
    if (!config || !config.phases) {
      return res.status(400).json({ error: 'Missing config or phases' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages' });
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || typeof last.content !== 'string' || !last.content.trim()) {
      return res.status(400).json({ error: 'Last message must be from the teacher' });
    }
    const result = await aiService.designChat({
      config,
      messages,
      focusPhaseId: typeof focusPhaseId === 'string' ? focusPhaseId : null,
      classDescription: typeof classDescription === 'string' ? classDescription : '',
      forceEdit: forceEdit === true
    });
    if (result.kind !== 'proposal') {
      return res.json({ kind: 'chat', reply: result.reply });
    }
    // Same treatment as /api/games/revise: restore the provenance stamp
    // the AI drops, then validate so the client can gate Apply on errors.
    carryRecipeStamp(config, result.updatedConfig);
    carryAnonymousFlag(config, result.updatedConfig);
    carryLanguage(config, result.updatedConfig);
    carryWordHelp(config, result.updatedConfig);
    carryEarlyJoke(config, result.updatedConfig);
    carrySubPhaseOrder(config, result.updatedConfig);
    carryStart(config, result.updatedConfig);
    const structural = validate(result.updatedConfig, 'chat', { returnResults: true });
    res.json({
      kind: 'proposal',
      reply: result.reply,
      proposal: { updatedConfig: result.updatedConfig, summary: result.summary, structural }
    });
  } catch (error) {
    console.log(`[api/games/chat] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
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
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// The legacy whole-config generator endpoints (/api/games/generate +
// /api/games/generate-questions) were REMOVED 2026-08-07: if an activity
// can't be assembled from validated storyboard bricks, it shouldn't be
// makeable — raw-config generation added too many ways to break.

// "Not sure what to make" concierge: fixed teacher answers in, up to 3
// suggestions out. Every suggestion must resolve to something real (a
// featured activity, a recipe with legal params, or a bricks-only
// storyboard) via engine/suggest-validate.js, so the AI structurally
// cannot show a teacher something the platform can't deliver.
app.post('/api/games/suggest', async (req, res) => {
  try {
    const { occasion, topic, time } = req.body || {};
    if (!occasion && !topic) {
      return res.status(400).json({ error: 'Tell us the occasion or a topic first' });
    }
    const loaded = await listGames();
    let games = loaded.map(({ id, config }) => ({
      id,
      featured: !!config.featured,
      name: config.name,
      description: config.description || '',
      playTime: config.playTime || null
    }));
    games = applyFeaturedOverrides(games, await featuredOverridesSafe())
      .filter(g => g.featured);
    const recipes = listRecipes();

    const raw = await aiService.generateSuggestions({
      occasion, topic, time,
      games,
      recipes: recipes.map(r => ({
        id: r.id, name: r.name, description: r.description, parameters: r.parameters
      }))
    });

    const recipesById = {};
    for (const r of recipes) recipesById[r.id] = r;
    const checked = validateSuggestions(raw.suggestions, {
      gameIds: games.map(g => g.id),
      recipes: recipesById
    });

    // Enrich with real catalog data so the cards never rely on AI prose.
    const gamesById = {};
    for (const g of games) gamesById[g.id] = g;
    const suggestions = checked.suggestions.map(s => {
      if (s.kind === 'host') {
        const g = gamesById[s.id];
        return { ...s, name: g.name, description: g.description, playTime: g.playTime };
      }
      if (s.kind === 'recipe') {
        const r = recipesById[s.id];
        return { ...s, name: r.name, description: r.description || '' };
      }
      return s;
    });

    res.json({ suggestions, note: raw.note, dropped: checked.dropped });
  } catch (error) {
    console.log(`[api/games/suggest] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Storyboard-before-generate: AI proposes a step outline in the
// Builder's brick vocabulary; the CLIENT compiles it deterministically
// (StepSuggestions.compileStoryboard) so structure is never AI-written.
app.post('/api/games/storyboard', async (req, res) => {
  try {
    if (!requireRealAI(res)) return;
    const { description } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please describe the activity (at least 10 characters).' });
    }
    console.log(`[api/games/storyboard] Planning: "${description.substring(0, 80)}..."`);
    const storyboard = await aiService.generateStoryboard(description);
    if (storyboard.error) {
      return res.status(500).json({ error: storyboard.error });
    }
    // Honest refusal, not an error: the idea's core needs a mechanic no
    // brick provides, and a hollow lookalike would be worse than saying so.
    if (storyboard.cantBuild) {
      return res.json({ cantBuild: true, reason: storyboard.reason || '' });
    }
    res.json({ storyboard });
  } catch (error) {
    console.log(`[api/games/storyboard] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Recipe-based AI generation (R4). Replaces the fragile generateGame
// flow as the default — AI matches the teacher's description to one
// of the seed recipes and fills parameters. Compiler turns the small
// structured output into a guaranteed-valid game config.
app.post('/api/games/from-description', async (req, res) => {
  try {
    if (!requireRealAI(res)) return;
    const { description, recipeId } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a description (at least 10 characters).' });
    }

    // recipeId narrows the matcher to one recipe — the "or maybe this
    // one instead" alternate cards re-run the same idea against a chosen
    // recipe so AI only fills its parameters.
    let candidates = listRecipes();
    if (recipeId) {
      candidates = candidates.filter(r => r.id === recipeId);
      if (candidates.length === 0) {
        return res.status(404).json({ error: `Recipe "${recipeId}" not found.` });
      }
    }
    const recipes = candidates.map(summarizeRecipe);
    if (recipes.length === 0) {
      return res.status(503).json({ error: 'No recipes are loaded. Restart the server or check recipes/.' });
    }

    // Ready-made built-ins ride along on unforced matches so an idea that
    // already exists as a finished activity ("Human or AI") gets pointed
    // at it instead of falling through to the storyboard (2026-08-22).
    let matchGames = [];
    let loadedGames = [];
    if (!recipeId) {
      loadedGames = await listGames();
      matchGames = loadedGames
        .filter(g => g.source === 'built-in')
        .map(({ id, config }) => ({
          id,
          name: config.name,
          description: config.description || '',
          playTime: config.playTime || null
        }));
    }

    // The time budget the teacher named ("a five-minute warm up"), checked
    // by the server against the real configuration below. The AI is told
    // never to claim a timing fit (engine/duration-estimate.js).
    const requestedMinutes = parseRequestedMinutes(description);

    console.log(`[api/games/from-description] Matching: "${description.substring(0, 80)}..."`);
    const match = await aiService.matchRecipe(description, recipes, { forced: !!recipeId, games: matchGames });

    // Resolve alternate ids to real recipes; anything unknown (or echoing
    // the main pick) drops silently so an invented id never renders.
    const resolveAlternates = (list, excludeRecipeId) => (list || [])
      .map(a => {
        const alt = getRecipe(a.recipe);
        if (!alt || alt.id === excludeRecipeId) return null;
        return { id: alt.id, name: alt.name, icon: alt.icon, description: alt.description, why: a.why || '' };
      })
      .filter(Boolean);

    // The matcher pointed at a finished activity instead of a recipe.
    if (match.game) {
      const existing = matchGames.find(g => g.id === match.game);
      if (existing) {
        const existingConfig = (loadedGames.find(g => g.id === match.game) || {}).config;
        return res.json({
          existingGame: existing,
          explanation: match.explanation || '',
          alternates: resolveAlternates(match.alternates, null),
          // Report only: the teacher copies this one from the yard, so a
          // trimmed config has nowhere to go here.
          timing: existingConfig ? timingReport(existingConfig, requestedMinutes, { trim: false }) : null
        });
      }
      // AI invented an activity id — fall through to no-match.
      return res.json({
        noMatch: true,
        reason: `AI pointed at an unknown activity "${match.game}".`,
        suggestion: 'Try the recipe picker directly.'
      });
    }

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
        suggestion: 'Try the recipe picker, fill in the parameters manually.',
        diagnostics
      });
    }

    const alternates = resolveAlternates(match.alternates, recipe.id);

    // A contextual name ("Snowball: Causes of WWI") beats the recipe's
    // generic one on a saved copy; the recipe name alone is left as is.
    if (match.title && match.title.toLowerCase() !== String(recipe.name || '').toLowerCase()) {
      config.name = match.title;
    }

    // Human labels for the preview's param list — the recipe's own
    // parameter labels, so the teacher never reads raw ids like
    // "tier1Prompts".
    const paramLabels = {};
    for (const [pname, spec] of Object.entries(recipe.parameters || {})) {
      if (spec && spec.label) paramLabels[pname] = spec.label;
    }

    // Computed from the timers, never from the AI: the estimate, the
    // teacher's requested minutes, and a trimmed copy when it runs over.
    // A trimmed timer that came from a recipe parameter moves the
    // parameter too (settings list, provenance stamp) so nothing lies.
    const timing = timingReport(config, requestedMinutes);
    if (timing.trim) {
      const mapped = paramsForTrim((recipe.template || {}).phases, match.params || {}, timing.trim.changes);
      timing.trim.params = mapped.params;
      if (mapped.changed.length && timing.trim.config.recipe && timing.trim.config.recipe.params) {
        timing.trim.config.recipe.params = { ...timing.trim.config.recipe.params, ...mapped.params };
      }
    }

    res.json({
      config,
      recipe: { id: recipe.id, name: recipe.name, icon: recipe.icon },
      params: match.params,
      paramLabels,
      explanation: match.explanation || '',
      alternates,
      map: buildActivityMap(config),
      timing
    });
  } catch (error) {
    console.log(`[api/games/from-description] Error: ${error.message}`);
    res.status(error.statusCode || 500).json({ error: error.message });
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
      const { gameDir, source } = await resolveGamePath(gameId);
      // Public site: deleting a shipped built-in is owner-only.
      if (source === 'built-in' && !isOwnerRequest(req)) {
        res.set('WWW-Authenticate', 'Basic realm="Jamyard Owner Area"');
        return res.status(401).json({ error: 'Deleting a built-in activity requires the owner password.' });
      }
      await rm(gameDir, { recursive: true });
    }
    res.json({ success: true });
  } catch (error) {
    console.log(`[api/games DELETE] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// =======================================================================
// Socket.io connection — all real-time gameplay events live here. Handlers
// below are grouped: room/lobby, collect & submit, phase control, then the
// per-phase-type events (rank / vote / merge / buzz / estimate / ...). Every
// handler is wrapped so one throwing room can't crash the whole process.
// =======================================================================
io.on('connection', (socket) => {
  console.log(`[connect] Socket ${socket.id} connected`);

  // Safety net: a throwing event handler must never kill the process — that
  // would end EVERY classroom on this server, not just the broken room.
  // (This class of crash happened: a late "Close Voting" click used to take
  // the whole server down.) Handlers stay responsible for their own
  // user-facing error replies; this only prevents the crash and logs loudly.
  const rawOn = socket.on.bind(socket);
  socket.on = (event, handler) => rawOn(event, async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      console.error(`[socket:${String(event)}] Unhandled handler error (room kept alive):`, err);
    }
  });

  socket.on(EVENTS.GET_GAMES, async () => {
    try {
      const loaded = await listGames();
      // minPlayers feeds the host lobby's start hint (falls back to the
      // lobby phase's value — some configs declare it there).
      const games = loaded.map(({ id, source, config }) => ({
        id,
        source,
        name: config.name,
        description: config.description || '',
        featured: !!config.featured,
        minPlayers: config.minPlayers || (config.phases && config.phases.lobby && config.phases.lobby.minPlayers) || null
      }));
      if (DB_ENABLED) {
        const userRows = await listUserGamesRepaired();
        for (const row of userRows) {
          games.push({
            id: row.id,
            source: 'user',
            name: row.name,
            description: row.config.description || '',
            featured: !!row.config.featured,
            minPlayers: row.config.minPlayers || (row.config.phases && row.config.phases.lobby && row.config.phases.lobby.minPlayers) || null
          });
        }
      }
      socket.emit(EVENTS.GAMES_LIST, { games: applyFeaturedOverrides(games, await featuredOverridesSafe()) });
    } catch (error) {
      console.log(`[get-games] Error: ${error.message}`);
      socket.emit(EVENTS.GAMES_LIST, { games: [] });
    }
  });

  // --- Room & lobby events: create/join a room, teacher console, start game ---
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
      // Robot-playtest rooms run with the mock AI service (see phase-context)
      room.simulated = selectedGame.startsWith('_sim-tmp-');
      // Teacher console PIN — carried inside the "Copy teacher link" deep
      // link on the host screen; it never displays on the projector.
      room.teacherPin = generateTeacherPin();
      room.teacherSocketIds = new Set();
      // Host rebind credential: lets the host screen recover from an F5 or
      // a server restart (stored in the host page's sessionStorage).
      room.hostToken = randomUUID();
      // Word help (engine/word-help.js): the per-student translation
      // budget, null when the activity has none.
      room.wordHelp = createWordHelpState(config, room.engine.language);
      // Early-bird joke (engine/early-joke.js): who among the first N
      // joiners got which joke, null when the activity has none.
      room.earlyJoke = createEarlyJokeState(config);

      roomToHost.set(code, socket.id);
      socket.join(code);
      console.log(`[create-room] Room ${code} created by ${socket.id} (game: ${selectedGame})`);
      // Analytics identity for this room: a random id, never the code, so
      // the room's three events (created, started, ended) line up in
      // PostHog without naming the room. Robot playtests send nothing.
      if (!room.simulated) {
        room.analyticsId = 'room:' + randomUUID();
        analytics.track('room_created', {
          game: analyticsGameLabel(room),
          source: room.gameSource === 'user' ? 'custom' : 'built-in',
          start: isRolling(config) ? 'rolling' : 'together'
        }, room.analyticsId);
      }
      socket.emit(EVENTS.ROOM_CREATED, { code, game: config.name, theme: config.theme || null, teacherPin: room.teacherPin, hostToken: room.hostToken, start: config.start || 'together', language: room.engine.language, strings: stringsFor(room.engine.language) });

      // Rolling start: no lobby wait. The room opens straight into the
      // first step; students land in it as they arrive (join-room already
      // sends late joiners the current step).
      if (isRolling(config)) {
        const lobby = room.engine.getCurrentPhase();
        if (lobby && lobby.type === 'lobby' && lobby.next) {
          room.engine.transition(lobby.next);
          console.log(`[create-room] Rolling start: room ${code} opened straight into '${lobby.next}'`);
          await handlePhase(code, room);
        }
      }
    } catch (error) {
      console.log(`[create-room] Error loading game "${selectedGame}": ${error.message}`);
      socket.emit(EVENTS.CREATE_ROOM_ERROR, { message: error.message });
    }
  });

  // Teacher console joins: private second-device view. Proof of teacher-ness
  // is the room PIN (delivered via the host screen's copy-link deep link) or,
  // when the site password is set, the basic-auth header the page was loaded with.
  socket.on(EVENTS.JOIN_TEACHER, (payload = {}) => {
    if (!checkEventPayload(socket, 'join-teacher', payload)) return;
    const { code, pin } = payload;
    const room = roomManager.find(code);
    if (!room) {
      socket.emit(EVENTS.TEACHER_JOIN_ERROR, { message: 'Room not found. Check the code on the projector.' });
      return;
    }
    // Brute-force lockout: too many wrong PINs freezes console joins for
    // this room — even with the right PIN (that's the point). Keyed by
    // room code so reconnecting with a fresh socket doesn't reset it.
    const gate = pinThrottle.check(code, Date.now());
    if (!gate.allowed) {
      const mins = Math.max(1, Math.ceil(gate.retryAfterMs / 60000));
      console.log(`[join-teacher] Room ${code} console locked (brute-force throttle, ${mins} min left)`);
      socket.emit(EVENTS.TEACHER_JOIN_ERROR, {
        message: `Too many wrong PINs. The teacher view is locked for about ${mins} minute${mins === 1 ? '' : 's'}. The projected host screen still works.`
      });
      return;
    }
    const allowed = checkTeacherAccess(
      { pin, authHeader: socket.handshake && socket.handshake.headers && socket.handshake.headers.authorization },
      { teacherPin: room.teacherPin, sitePassword: process.env.SITE_PASSWORD }
    );
    if (!allowed) {
      const fail = pinThrottle.recordFailure(code, Date.now());
      console.log(`[join-teacher] Rejected console for room ${code} (bad PIN${fail.locked ? ', room now locked' : ''})`);
      socket.emit(EVENTS.TEACHER_JOIN_ERROR, {
        message: fail.locked
          ? 'Too many wrong PINs. The teacher view is locked for a few minutes.'
          : 'Wrong PIN. Use "🔗 Copy teacher link" on the host screen to get a working link.'
      });
      return;
    }
    pinThrottle.recordSuccess(code);
    room.teacherSocketIds = room.teacherSocketIds || new Set();
    room.teacherSocketIds.add(socket.id);
    teacherSocketToRoom.set(socket.id, code);
    socket.join(teachersChannel(code));
    recordEvent(room, 'teacher-console-joined');
    console.log(`[join-teacher] Console ${socket.id} joined room ${code}`);
    socket.emit(EVENTS.TEACHER_JOINED, buildTeacherSnapshot(code, room));
    // Pairing must be VISIBLE: the PIN can be glimpsed off the projector, so
    // the host screen (and any earlier console) announces every new pairing —
    // a hijacked console can't connect silently. deviceCount lets the teacher
    // judge "that's my phone" vs "that's a third device I don't own".
    const hostSocketId = roomToHost.get(code);
    const notice = { deviceCount: room.teacherSocketIds.size };
    if (hostSocketId) io.to(hostSocketId).emit(EVENTS.TEACHER_CONSOLE_JOINED, notice);
    socket.to(teachersChannel(code)).emit(EVENTS.TEACHER_CONSOLE_JOINED, notice);
  });

  socket.on(EVENTS.JOIN_ROOM, async (payload = {}) => {
    if (!checkEventPayload(socket, 'join-room', payload)) return;
    const { code, name, token } = payload;
    console.log(`[join-room] ${socket.id} trying to join ${code}`);

    // Unknown room? It may have died with a server restart — try the snapshot.
    const room = roomManager.find(code) || await tryRestoreRoom(code);
    if (!room) {
      console.log(`[join-room] Room ${code} not found`);
      socket.emit(EVENTS.JOIN_ERROR, { message: 'Room not found' });
      return;
    }

    // Block players the host kicked from this room (same-session token).
    if (token && room.kickedTokens && room.kickedTokens.has(token)) {
      console.log(`[join-room] Blocked kicked player from rejoining ${code}`);
      socket.emit(EVENTS.JOIN_ERROR, { message: 'You have been removed from this session.' });
      return;
    }

    const players = room.engine ? room.engine.players : room.playerRegistry;
    // Anonymous mode: the config says this room never collects names — the
    // server assigns a play name and whatever the client typed is discarded
    // unread (privacy holds even against a modified client that sends one).
    const anonymousRoom = !!(room.engine && room.engine.config && room.engine.config.anonymous);

    try {
      // What does this attempt MEAN? Reconnect, duplicated-tab takeover,
      // name collision with a connected student, or a genuinely new player.
      const verdict = classifyJoin(players, { token, name, anonymousRoom });

      // A typed name that a still-connected student is using: refuse
      // instead of silently seating "Alex2" (field feedback 2026-08-24:
      // students were joining twice). A real classmate with the same name
      // adds an initial; a ghost tab clears itself within the ping timeout.
      if (verdict.kind === 'name-taken') {
        console.log(`[join-room] Name "${verdict.player.name}" already connected in ${code}, refusing duplicate`);
        socket.emit(EVENTS.JOIN_ERROR, {
          message: `Someone here is already playing as "${verdict.player.name}". If that's you on another screen, keep using that one (or wait a moment and try again). If a classmate got the name first, add your last initial.`
        });
        return;
      }

      if (verdict.kind === 'reconnect' || verdict.kind === 'takeover') {
        const existing = verdict.player;
        const oldId = existing.id;
        // Takeover: the same student (same token) opened the room in a
        // second tab while the first is still connected. Their seat moves
        // to the new socket; the old tab is told and cut loose so it can't
        // auto-rejoin and ping-pong the seat back.
        const oldSocket = verdict.kind === 'takeover' ? io.sockets.sockets.get(oldId) : null;
        console.log(`[join-room] ${verdict.kind === 'takeover' ? 'Taking over session' : 'Reconnecting player'} via ${token ? 'token' : 'name'} (old: ${oldId} -> new: ${socket.id})`);
        players.reconnect(oldId, socket.id);
        if (oldSocket) {
          socketToRoom.delete(oldId);
          oldSocket.emit(EVENTS.SESSION_REPLACED, { message: 'You joined again on another screen, so this one signed off.' });
          oldSocket.disconnect(true);
        }
        // Follow the player across the rebind: phase state (turn describer,
        // relay turn order, vote eligibility, merge groups…) and completed-
        // phase data (score maps feeding leaderboards) all hold the old id.
        if (room.engine) {
          migrateIdsInPlace(room.phaseState, oldId, socket.id);
          migrateIdsInPlace(room.engine.phaseData, oldId, socket.id);
          migrateIdsInPlace(room.engine.foreachState, oldId, socket.id);
          // Shared-meadow order/cooldowns are keyed by player id too.
          migrateIdsInPlace(room.meadowState, oldId, socket.id);
          migrateIdsInPlace(room.wordHelp, oldId, socket.id);
          migrateIdsInPlace(room.earlyJoke, oldId, socket.id);
        }
        socketToRoom.set(socket.id, code);
        socket.join(code);

        const player = players.find(socket.id);
        const theme = room.engine ? (room.engine.config.theme || null) : null;
        const language = room.engine ? room.engine.language : 'en';
        // The same joke as before, never a fresh roll (a refresh must not
        // re-deal, and a late reconnect must not steal an eleventh seat).
        socket.emit(EVENTS.JOIN_SUCCESS, { name: player.name, reconnected: true, token: player.token, theme, anonymous: anonymousRoom, language, strings: stringsFor(language), wordHelp: room.wordHelp ? wordHelpSettings(room.wordHelp, socket.id) : null, joke: jokePayload(jokeFor(room.earlyJoke, socket.id)) });

        const hostSocketId = roomToHost.get(code);
        if (hostSocketId) {
          io.to(hostSocketId).emit(EVENTS.PLAYER_RECONNECTED, {
            id: socket.id,
            name: player.name,
            players: players.listPublic()
          });
        }

        // Send current game state to reconnecting player. A restored room
        // has no live phase screen yet — that returns when the host does.
        sendCurrentState(socket, code, room);
        emitRoomRoster(code, room);
        if (room.restored && !roomToHost.get(code)) {
          socket.emit(EVENTS.WAITING, { message: 'Reconnecting, waiting for your teacher\'s screen…' });
        }
        persistRoom(code, room);
        return;
      }

      const playerToken = randomUUID();
      const joinName = anonymousRoom
        ? pickAnonymousName(players.list().map(p => p.name))
        : name;
      players.add(socket.id, joinName, playerToken);
      const player = players.find(socket.id);
      socketToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[join-room] Player ${socket.id} joined room ${code}`);
      const theme = room.engine ? (room.engine.config.theme || null) : null;
      const language = room.engine ? room.engine.language : 'en';
      // Early-bird joke: a new seat among the first N draws one (engine/
      // early-joke.js keeps the count and the deal; past N this is null).
      socket.emit(EVENTS.JOIN_SUCCESS, { name: player.name, token: playerToken, theme, anonymous: anonymousRoom, language, strings: stringsFor(language), wordHelp: room.wordHelp ? wordHelpSettings(room.wordHelp, socket.id) : null, joke: jokePayload(dealJoke(room.earlyJoke, socket.id)) });

      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) {
        io.to(hostSocketId).emit(EVENTS.PLAYER_JOINED, {
          id: socket.id,
          name: player.name,
          players: players.listPublic()
        });
      }
      emitTeacherRoster(code, room);
      emitRoomRoster(code, room);

      // Late join: the game may already be running. A team step that has
      // opened seats the newcomer first (a team, a role, a list), then
      // the current phase is sent — the onReconnect handlers tolerate a
      // player they've never seen (collect offers the input box, merge/vote
      // fall back to a contextual waiting message). Without this, a student
      // joining two minutes late stares at lobby copy while the class is
      // mid-activity, AND blocks every "all submitted" auto-advance (the
      // eligible count includes them the moment they join). No-op in the
      // lobby phase.
      try {
        seatLateJoiner(socket, code, room);
      } catch (seatError) {
        // A seat that can't be given is a waiting screen, never a failed join.
        console.warn(`[join-room] Late seating failed for ${socket.id}: ${seatError.message}`);
      }
      try {
        sendCurrentState(socket, code, room);
      } catch (stateError) {
        // A phase that can't seat a late joiner degrades to the waiting
        // screen — never fail the join itself over it.
        console.warn(`[join-room] Late-join state send failed for ${socket.id}: ${stateError.message}`);
      }

      // Rolling rooms never pass through Start, so the activity-run metric
      // fires on the first join instead (same fire-and-forget rule).
      if (room.engine && isRolling(room.engine.config)) trackActivityStarted(room);
      if (DB_ENABLED && !room.simulated && !room.runRecorded && room.engine && isRolling(room.engine.config)) {
        room.runRecorded = true;
        recordActivityRun(room.gameId, room.engine.players.list().length)
          .catch(err => console.log(`[activity-runs] record failed: ${err.message}`));
      }

      persistRoom(code, room);
    } catch (error) {
      console.log(`[join-room] Error: ${error.message}`);
      socket.emit(EVENTS.JOIN_ERROR, { message: error.message });
    }
  });

  // Host rebind: the host screen recovering from an F5, a browser crash, or
  // a full server restart (where the room is resurrected from its snapshot).
  // Re-entering the current phase restarts it fresh — same resume-at-phase-
  // start semantic as a restore; infinitely better than the old behavior
  // (host refresh = room deleted, class kicked out).
  socket.on(EVENTS.HOST_REJOIN, async (payload = {}) => {
    if (!checkEventPayload(socket, 'host-rejoin', payload)) return;
    const { code, hostToken } = payload;
    const room = roomManager.find(code) || await tryRestoreRoom(code);
    if (!room || !room.hostToken || room.hostToken !== hostToken) {
      socket.emit(EVENTS.HOST_REJOIN_ERROR, { message: 'That room is no longer running.' });
      return;
    }

    if (room.hostGraceTimer) { clearTimeout(room.hostGraceTimer); room.hostGraceTimer = null; }
    room.hostDisconnectedAt = null;
    roomToHost.set(code, socket.id);
    socket.join(code);
    recordEvent(room, 'host-rejoined');
    // The consoles drop their "projector not connected" line.
    emitTeacherRoster(code, room);

    const config = room.engine.config;
    socket.emit(EVENTS.ROOM_CREATED, {
      code,
      game: config.name,
      theme: config.theme || null,
      teacherPin: room.teacherPin,
      hostToken: room.hostToken,
      start: config.start || 'together',
      language: room.engine.language,
      strings: stringsFor(room.engine.language),
      restored: true
    });
    socket.emit(EVENTS.PLAYER_JOINED, { players: room.engine.players.listPublic() });

    const phase = room.engine.getCurrentPhase();
    console.log(`[host-rejoin] Host rebound to ${code} at '${phase.id}'${room.restored ? ' (restored from snapshot)' : ''}`);
    if (phase && phase.type !== 'lobby') {
      await handlePhase(code, room);
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
    // Flow control is teacher-only (host screen or joined console) — any
    // student with devtools could otherwise start/skip/close the class's
    // activity (2026-07-19 review, P0).
    if (!isTeacherSocket(code, room, socket.id)) return;

    try {
      if (room.engine) {
        const lobby = room.engine.getCurrentPhase();
        // A rolling room started itself at creation; a stray Start (a sim
        // harness, a double click) must never blow past the first step.
        if (lobby.type !== 'lobby') {
          console.log(`[start-game] Room ${code} is already past the lobby ('${lobby.id}'), ignoring`);
          return;
        }
        room.engine.transition(lobby.next);
        console.log(`[start-game] Room ${code} now in '${room.engine.getCurrentPhase().id}' phase`);
        // Library-first metric: count activities RUN (once per room; never
        // simulated rooms; a game id + headcount + timestamp, nothing else).
        // Fire-and-forget — the class never waits on analytics.
        trackActivityStarted(room);
        if (DB_ENABLED && !room.simulated && !room.runRecorded) {
          room.runRecorded = true;
          recordActivityRun(room.gameId, room.engine.players.list().length)
            .catch(err => console.log(`[activity-runs] record failed: ${err.message}`));
        }
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

  socket.on(EVENTS.SUBMIT_RESPONSE, async (payload = {}) => {
    if (!checkEventPayload(socket, 'submit-response', payload)) return;
    const { code, response, pass, phaseInstanceId } = payload;
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

    const currentPhase = room.engine ? room.engine.getCurrentPhase() : null;

    // Pass path — only honored on a collect phase with passAllowed. Stored as
    // the PASS_RESPONSE sentinel so it counts toward "all submitted" but never
    // flows into responses/byPlayer/AI input. Deliberately journaled as a
    // plain submit-response: a pass must never be attributable, anywhere.
    if (pass === true) {
      if (!currentPhase || currentPhase.type !== 'collect' || !currentPhase.passAllowed) {
        console.log(`[submit-response] Pass ignored, current phase doesn't allow passing`);
        return;
      }
      players.update(socket.id, { response: PASS_RESPONSE, responseAt: Date.now(), responseFlagged: null });
      recordEvent(room, 'submit-response', { player: player.name });
    } else if (currentPhase && currentPhase.type === 'collect' && currentPhase.inputType === 'drawing') {
      // Drawing submissions: structural validation only (the blocklist
      // can't read a picture — the safety story is attribution, the live
      // moderation thumbnails, and teacher preview).
      const check = validateDrawing(response);
      if (!check.ok) {
        console.log(`[submit-response] Rejected drawing (${check.reason}) from ${socket.id}`);
        recordEvent(room, 'submit-rejected', { player: player.name, reason: check.reason });
        socket.emit(EVENTS.RESPONSE_REJECTED, { reason: check.reason, message: check.message });
        return;
      }
      players.update(socket.id, { response: { strokes: check.strokes }, responseAt: Date.now(), responseFlagged: null });
      console.log(`[submit-response] Stored drawing (${check.strokes.length} strokes) from ${socket.id}`);
      recordEvent(room, 'submit-response', { player: player.name });
    } else {
      // Safety gate — only free-text collect submissions. collect-choice answers
      // are teacher-authored choices, so they skip validation/filtering.
      // appendOnly: an empty addition is legal (the inherited list passes
      // through unchanged — e.g. timer auto-submit with nothing typed).
      const isAppendOnly = !!(currentPhase && currentPhase.type === 'collect' &&
        currentPhase.appendOnly && currentPhase.rotateFrom && room.engine);
      const typedNothing = typeof response === 'string' && response.trim() === '';
      if (currentPhase && currentPhase.type === 'collect' && !(isAppendOnly && typedNothing)) {
        const check = checkSubmission(response, {
          prompt: currentPhase.prompt,
          maxLength: currentPhase.maxLength || undefined
        });
        if (!check.ok) {
          console.log(`[submit-response] Rejected (${check.reason}) from ${socket.id}`);
          recordEvent(room, 'submit-rejected', { player: player.name, reason: check.reason });
          socket.emit(EVENTS.RESPONSE_REJECTED, { reason: check.reason, message: check.message });
          return;
        }
      }

      // Moderation ladder (owner design 2026-08-30): the blocklist above
      // caught words; this catches meaning (unkind messages to classmates,
      // threats, clean-language cruelty). Only the student's OWN typed text
      // is checked — for appendOnly, the inherited part was checked when
      // its author submitted it. The await opens a gap, so the staleness
      // guard and player lookup run AGAIN after it (the phase may have
      // closed, or the student reconnected, while we waited).
      let flaggedCategory = null;
      // Held for the length of the moderation await so a Close that lands
      // in the gap waits for this answer (engine/pending-submits.js).
      // Released after the store, or on every early exit.
      let releaseHold = null;
      const modText = responseToText(response);
      if (moderationLadder.enabled && !room.simulated &&
          currentPhase && currentPhase.type === 'collect' && modText.trim()) {
        const rosterNames = players.list().map(p => p.name);
        releaseHold = holdPendingSubmit(room);
        let verdict;
        try {
          verdict = await moderationLadder.check(modText, { rosterNames });
        } catch (err) {
          releaseHold();
          throw err;
        }
        if (isStalePhaseEvent(room, phaseInstanceId, 'submit-response')) { releaseHold(); return; }
        if (!players.find(socket.id)) { releaseHold(); return; }
        if (verdict.action === 'reject') {
          console.log(`[submit-response] Rejected by moderation ladder (${verdict.rung}: ${verdict.category || '?'}) from ${socket.id}`);
          recordEvent(room, 'submit-rejected', { player: player.name, reason: 'moderation' });
          socket.emit(EVENTS.RESPONSE_REJECTED, {
            reason: 'moderation',
            message: 'That message can\'t go to the class. Reword it and try again.'
          });
          releaseHold();
          return;
        }
        if (verdict.action === 'flag') {
          flaggedCategory = verdict.category || 'uncertain';
          recordEvent(room, 'moderation-flag', { player: player.name, category: flaggedCategory });
        }
      }

      // appendOnly: rebuild the stored response from the server's own copy of
      // the inherited text + the (filtered) addition — the client only ever
      // submits the addition, so a vandal can't gut a classmate's list.
      let storedResponse = response;
      if (isAppendOnly) {
        const srcData = room.engine.phaseData[currentPhase.rotateFrom];
        const inherited = srcData && srcData.assigned ? srcData.assigned[player.id] : undefined;
        if (typeof inherited === 'string') {
          storedResponse = combineAppendOnly(inherited, response);
        }
      }

      // responseFlagged always written so a re-submission that comes back
      // clean clears an earlier flag (and vice versa).
      players.update(socket.id, { response: storedResponse, responseAt: Date.now(), responseFlagged: flaggedCategory });
      console.log(`[submit-response] Stored response from ${socket.id}`);
      recordEvent(room, 'submit-response', { player: player.name });
      if (releaseHold) releaseHold();
    }

    // The student's screen says "Answer submitted" only now: the server has
    // stored it. Until this lands the student sees "Sending..." (a filtered
    // or lost answer must never look submitted; reviewer finding 2026-09-06).
    socket.emit(EVENTS.RESPONSE_ACCEPTED, { phaseInstanceId: room.phaseInstanceId });

    // Count based on eligible players for current collect phase
    let eligible;
    if (room.engine) {
      const phase = room.engine.getCurrentPhase();
      const from = phase.from || 'all';
      eligible = getEligibleVoters(room.engine.players, from);
      // Foreach: the round's author and source sit out (engine/phases/sit-out.js)
      eligible = withoutSitOut(eligible, phase);
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

    // Shared meadow: this submitter's canonical block index (assigned once
    // per phase, submission order), told only to THEM — the room broadcast
    // below stays counts-only, and moves relay as anonymous indexes.
    room.meadowState = ensureMeadowState(room.meadowState, room.phaseInstanceId || 0);
    socket.emit(EVENTS.MEADOW_YOU, { index: meadowIndexFor(room.meadowState, socket.id) });

    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      // simultaneousReveal: the host screen is projected to the class, so the
      // live ticker carries numbers only — no names — until the step closes.
      const suppressNames = !!(currentPhase && currentPhase.simultaneousReveal);
      io.to(hostSocketId).emit(EVENTS.RESPONSE_RECEIVED, {
        playerName: suppressNames ? null : player.name,
        count: submitted,
        total
      });
    }
    // Teacher consoles are private — they always get the full picture.
    io.to(teachersChannel(code)).emit(EVENTS.RESPONSE_RECEIVED, {
      playerName: player.name,
      count: submitted,
      total
    });

    // Everyone waiting sees the room fill up — counts only, never names.
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: submitted, total });

    // Push the live moderation list so the host can hide/kick before closing.
    emitSubmissionsUpdate(code, room);
    emitLiveTally(code, room);

    // Rolling start: a student whose last input just landed is done with
    // the activity; say so instead of "waiting for everyone".
    if (room.engine && isRolling(room.engine.config) && currentPhase && !moreInputAhead(room.engine.config, currentPhase.id)) {
      socket.emit(EVENTS.PLAYER_DONE, {
        message: translate(room.engine.language, doneMessageFor(currentPhase)),
        phaseInstanceId: room.phaseInstanceId
      });
    }
  });

  // Host hides/unhides a submitted response. Hidden responses are excluded from
  // AI input and the reveal when submissions close (reversible until then).
  socket.on(EVENTS.MODERATE_HIDE, (payload = {}) => {
    if (!checkEventPayload(socket, 'moderate-hide', payload)) return;
    const { code, playerId, hidden } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    // Only the host screen or a joined teacher console may moderate.
    if (!isTeacherSocket(code, room, socket.id)) return;
    const players = room.engine.players;
    const target = players.find(playerId);
    if (!target) return;
    const newHidden = hidden === undefined ? !target.responseHidden : !!hidden;
    players.update(playerId, { responseHidden: newHidden });
    recordEvent(room, 'moderate-hide', { player: target.name, hidden: newHidden });
    emitSubmissionsUpdate(code, room);
    emitLiveTally(code, room);
  });

  // Teacher console puts the current step's discussion prompt on the
  // projector. The text comes from the CONFIG (the step's own field),
  // never from the client, so a console can only show what the activity
  // carries; a step without one shows nothing.
  socket.on(EVENTS.SHOW_DISCUSSION, (payload = {}) => {
    try {
      if (!checkEventPayload(socket, 'show-discussion', payload)) return;
      const { code } = payload;
      const room = roomManager.find(code);
      if (!room || !room.engine) return;
      if (!isTeacherSocket(code, room, socket.id)) return;
      const phase = room.engine.getCurrentPhase();
      const text = discussionPromptFor(phase);
      if (!text) return;
      recordEvent(room, 'show-discussion', { phaseId: phase.id });
      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) io.to(hostSocketId).emit(EVENTS.DISCUSSION_PROMPT, { text, phaseId: phase.id });
    } catch (err) {
      console.error('[show-discussion] error:', err.message);
    }
  });

  // Host kicks a player: remove from the game and block rejoin this session.
  socket.on(EVENTS.MODERATE_KICK, (payload = {}) => {
    if (!checkEventPayload(socket, 'moderate-kick', payload)) return;
    const { code, playerId } = payload;
    const room = roomManager.find(code);
    if (!room) return;
    if (!isTeacherSocket(code, room, socket.id)) return;
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
      kickedSocket.emit(EVENTS.KICKED, { message: 'You have been removed by the teacher.' });
      kickedSocket.leave(code);
    }

    // Update the host's player list + moderation list.
    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit(EVENTS.PLAYER_LEFT, { id: playerId, players: players.listPublic() });
    }
    emitTeacherRoster(code, room);
    emitSubmissionsUpdate(code, room);
  });

  // --- "A bit more time": teacher adds seconds to a running input timer ---
  // Covers every phase where the whole class works against one shared
  // countdown. Host-clock phases only need the broadcast; server-timed
  // phases also re-arm their setTimeout (see the sets' comment, v2
  // 2026-08-24). Clients shift their countdowns via timer-extended.
  socket.on(EVENTS.EXTEND_TIMER, (payload = {}) => {
    if (!checkEventPayload(socket, 'extend-timer', payload)) return;
    const { code, phaseInstanceId } = payload;
    try {
      const room = roomManager.find(code);
      if (!room) return;
      if (isStalePhaseEvent(room, phaseInstanceId, 'extend-timer')) return;
      if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
      const phase = room.engine && room.engine.getCurrentPhase();
      if (!phase || !phase.timer) return;
      const serverTimed = SERVER_TIMED_EXTENDABLE.has(phase.type);
      if (!serverTimed && !EXTENDABLE_TIMER_PHASES.has(phase.type)) return;
      // Two-stage phases stay current after closing; more time only makes
      // sense while inputs are still open.
      if (room.phaseState && room.phaseState.closed) return;
      // Server-timed: push the server's own deadline back too, or it would
      // still close at the original time. No armed timer left (it already
      // fired, or a manual close cleared it) = nothing to extend.
      if (serverTimed && !extendPhaseTimer(room, EXTEND_TIMER_SECONDS)) return;
      recordEvent(room, 'extend-timer');
      const message = { addSeconds: EXTEND_TIMER_SECONDS };
      io.to(code).emit(EVENTS.TIMER_EXTENDED, message);
      io.to(teachersChannel(code)).emit(EVENTS.TIMER_EXTENDED, message);
    } catch (error) {
      console.log(`[extend-timer] Error: ${error.message}`);
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
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only

    // Only meaningful while a collect-style phase is actually running — a
    // late/stray close used to store empty "responses" under whatever phase
    // happened to be current (found by the chaos simulator).
    const currentPhase = room.engine && room.engine.getCurrentPhase();
    if (!currentPhase || (currentPhase.type !== 'collect' && currentPhase.type !== 'collect-choice')) {
      console.log(`[close-submissions] Ignored, current phase is ${currentPhase ? currentPhase.type : 'unknown'}`);
      return;
    }
    // Answers still inside the moderation ladder land first, so the gather
    // below sees every student who pressed Submit before the teacher
    // pressed Close (engine/pending-submits.js). The step is re-checked
    // after the wait: a second Close or a timer may have moved the room on.
    const instanceBefore = room.phaseInstanceId;
    const waited = await settlePendingSubmits(room);
    if (waited > 0) {
      const still = room.engine && room.engine.getCurrentPhase();
      if (!still || still.id !== currentPhase.id || room.phaseInstanceId !== instanceBefore) {
        console.log(`[close-submissions] Ignored, room moved on while ${waited} submission(s) settled`);
        return;
      }
      console.log(`[close-submissions] Waited for ${waited} in-flight submission(s) in room ${code}`);
    }
    recordEvent(room, 'close-submissions');

    try {
      if (room.engine) {
        const collectPhase = room.engine.getCurrentPhase();
        const players = room.engine.players;
        const from = collectPhase.from || 'all';

        // Gather responses from eligible players and store as phase data.
        // Host-hidden responses are excluded (kept off AI input + reveal).
        let eligible = getEligibleVoters(players, from);
        // Foreach sit-out: the round's author and source never count as
        // submitters (they get a waiting screen, but a crafted socket
        // event could still try to plant a response).
        eligible = withoutSitOut(eligible, collectPhase);
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
            // Drawings: strokes ride alongside a placeholder text (text
            // consumers show "[drawing]"; galleries/rotation use strokes)
            if (isDrawingResponse(r)) {
              return { playerId: p.id, name: p.name, text: '[drawing]', drawing: r.strokes, responseAt: p.responseAt };
            }
            // Multi-field responses come as objects with field keys
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              const textParts = Object.values(r);
              return { playerId: p.id, name: p.name, text: textParts.join(' | '), fields: r, responseAt: p.responseAt };
            }
            return { playerId: p.id, name: p.name, text: r, responseAt: p.responseAt };
          });

        // Rotation: stamp what each responder was assigned onto their response
        // record, so downstream reveals can show it ({{_current.assigned}} in
        // a reveal-one itemTemplate) instead of asking students to re-type the
        // thing they were handed (whose-eyes shipped that busywork field).
        // The LINK rides along too (assignedFromId/Name): a foreach round
        // over these responses can then keep the classmate who wrote the
        // phrase out of the bluffing (engine/phases/sit-out.js) and name
        // them in the reveal.
        if (collectPhase.rotateFrom) {
          const srcData = room.engine.phaseData[collectPhase.rotateFrom];
          const assignedMap = (srcData && srcData.assigned) || {};
          // Only a STUDENT-made source has a writer to name (and to sit
          // out); an AI-written per-player deal has none.
          const srcPhase = room.engine.config.phases[collectPhase.rotateFrom];
          const studentSource = !!srcPhase && (srcPhase.type === 'collect' || srcPhase.type === 'collect-choice');
          const fromMap = (studentSource && srcData && srcData.assignedFrom) || {};
          for (const r of responses) {
            if (r && r.playerId && assignedMap[r.playerId] !== undefined) {
              r.assigned = assignedMap[r.playerId];
              const fromId = fromMap[r.playerId];
              if (fromId) {
                r.assignedFromId = fromId;
                const fromPlayer = players.find(fromId);
                if (fromPlayer) r.assignedFromName = fromPlayer.name;
              }
            }
          }
        } else if (Array.isArray(collectPhase.dealItems)) {
          // Dealt from a teacher list: the item has no author, only text.
          const dealt = (room.engine.phaseData[collectPhase.id] || {}).assigned || {};
          for (const r of responses) {
            if (r && r.playerId && dealt[r.playerId] !== undefined) r.assigned = dealt[r.playerId];
          }
        }

        // Build byPlayer map alongside responses array — used by .mine and
        // by downstream rotateFrom phases. Multi-field responses store the
        // joined text; rotation users wanting the structured fields can
        // dataRef into responses directly. Drawings keep a parallel
        // byPlayerDrawing map so rotation can pass the actual strokes.
        const byPlayer = {};
        const byPlayerDrawing = {};
        for (const r of responses) {
          if (r && r.playerId) {
            byPlayer[r.playerId] = r.text;
            if (r.drawing) byPlayerDrawing[r.playerId] = r.drawing;
          }
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
            console.log(`[close-submissions] Graded ${choiceResponses.length} responses against "${correctAnswer}", scores: ${JSON.stringify(scores)}`);
          }

          // Bluffing payoff: `foolPoints` pays the AUTHOR of a fake for every
          // classmate who picked it (needs excludeAuthored so authorship is
          // known). Merged into .scores alongside any truth-picking points.
          if (collectPhase.foolPoints && collectPhase.excludeAuthored) {
            const bluffSrc = (room.engine.phaseData[collectPhase.excludeAuthored] || {}).responses || [];
            const authorsByText = {};
            for (const br of bluffSrc) {
              if (br && br.playerId && br.text != null) {
                authorsByText[String(br.text).trim().toLowerCase()] = br.playerId;
              }
            }
            const fooled = foolPoints({
              responses: choiceResponses,
              authorsByText,
              correctAnswer: stored.correctAnswer != null ? stored.correctAnswer : null,
              pointsPerFool: collectPhase.foolPoints
            });
            stored.scores = mergeScores(stored.scores, fooled);
            stored.foolScores = fooled;
            console.log(`[close-submissions] Fool points: ${JSON.stringify(fooled)}`);
          }

          room.engine.storePhaseData(collectPhase.id, stored);
          console.log(`[close-submissions] Stored ${choiceResponses.length} choices for phase '${collectPhase.id}'`);
        } else {
          // passedIds: who used the Pass button (collect + passAllowed only).
          // Internal phase data for the pair-scoped reveal's neutral card —
          // excluded from responses/byPlayer so it never reaches AI or lists.
          const passedIds = collectPhase.passAllowed ? collectPassedIds(eligible) : [];
          room.engine.storePhaseData(collectPhase.id, {
            ...existing, responses, byPlayer, passedIds,
            ...(Object.keys(byPlayerDrawing).length > 0 ? { byPlayerDrawing } : {})
          });
          console.log(`[close-submissions] Stored ${responses.length} responses for phase '${collectPhase.id}' (${passedIds.length} passed)`);
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
          responses,
          rosterNames: players.map(p => p.name)
        });
        contentLog(`[close-submissions] AI returned: ${aiResult.text}`);

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
      // The ballot already left the voter's own answer off; a stale or
      // hand-crafted client can still send it, so the server refuses too.
      if (vs.excludeAuthors && isOwnCandidate(vs.candidates, socket.id, choice)) {
        console.log(`[submit-vote] ${socket.id} tried to vote for their own answer, refused`);
        return;
      }
      vs.votes.push({ voterId: socket.id, choice });
    } else if (vs.mode === 'head-to-head' && Array.isArray(votesList)) {
      for (const vote of votesList) {
        vs.votes.push({ voterId: socket.id, choice: vote.choice });
      }
    }

    vs.votersCompleted.add(socket.id);
    console.log(`[submit-vote] ${socket.id} voted (${vs.votersCompleted.size}/${vs.eligibleVoterIds.length})`);

    // Shared meadow on the vote wait screen: same canonical-index deal as
    // the collect path (see submit-response).
    room.meadowState = ensureMeadowState(room.meadowState, room.phaseInstanceId || 0);
    socket.emit(EVENTS.MEADOW_YOU, { index: meadowIndexFor(room.meadowState, socket.id) });

    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit(EVENTS.VOTE_RECEIVED, {
        count: vs.votersCompleted.size,
        total: vs.eligibleVoterIds.length
      });
    }
    // Everyone waiting sees the count climb — counts only, never names.
    io.to(code).emit(EVENTS.ROOM_PROGRESS, {
      count: vs.votersCompleted.size,
      total: vs.eligibleVoterIds.length
    });

    // Auto-tally when all eligible voters have voted
    if (vs.votersCompleted.size >= vs.eligibleVoterIds.length) {
      await tallyAndAdvance(code, room);
    }
  });

  // Shared meadow: relay a player's block nudge to the whole room as an
  // anonymous { index, fx, fy } (normalized field fractions — screens of
  // different widths agree). Only players the meadow knows (they submitted
  // this phase) may move, on the server-enforced 3s cooldown. Deliberately
  // NOT recordEvent'd: nudges are high-frequency cosmetic garnish and would
  // flush real gameplay events out of the capped journal.
  socket.on(EVENTS.MEADOW_NUDGE, (payload = {}) => {
    if (!checkEventPayload(socket, 'meadow-nudge', payload)) return;
    const { code, fx, fy, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'meadow-nudge')) return;
    const state = room.meadowState;
    if (!state || state.phaseInstanceId !== (room.phaseInstanceId || 0)) return;
    if (state.order[socket.id] === undefined) return;
    if (!allowNudge(state, socket.id, Date.now())) return;
    io.to(code).emit(EVENTS.MEADOW_MOVED, {
      index: state.order[socket.id],
      fx: clampFrac(fx),
      fy: clampFrac(fy)
    });
  });

  // --- Word help: tap a word, spend a token, see it translated (engine/word-help.js) ---
  // No stale-phase guard on purpose: a lookup is not tied to a step, and
  // the answer must reach the student whichever step they are on. The
  // ledger is the rate limit. The word is teacher-authored activity text.
  socket.on(EVENTS.WORD_LOOKUP, async (payload = {}) => {
    if (!checkEventPayload(socket, 'word-lookup', payload)) return;
    const { code, word, sentence } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.wordHelp) return;
    if (!room.engine.players.find(socket.id)) return;
    const state = room.wordHelp;
    const reply = (extra) => socket.emit(EVENTS.WORD_LOOKUP_RESULT, { phaseInstanceId: room.phaseInstanceId || 0, ...extra });
    const normalized = normalizeWord(word);
    if (!normalized) {
      reply({ ok: false, reason: 'not-a-word', left: wordHelpRemaining(state, socket.id) });
      return;
    }
    const purse = wordHelpSpend(state, socket.id);
    if (!purse.ok) {
      reply({ ok: false, reason: 'no-tokens', word: normalized.word, left: 0 });
      return;
    }
    recordEvent(room, 'word-lookup');
    try {
      let translation = cachedTranslation(state, normalized.key);
      if (translation === undefined) {
        const ai = room.simulated ? mockAiService : aiService;
        const result = await ai.translateWord({
          word: normalized.word,
          sentence: String(sentence || '').slice(0, 300),
          from: state.from,
          to: state.to
        });
        if (!result) {
          reply({ ok: false, reason: 'failed', word: normalized.word, left: wordHelpRefund(state, socket.id) });
          return;
        }
        translation = result.translation;
        cacheTranslation(state, normalized.key, translation);
      }
      recordLookup(state, normalized);
      reply({ ok: true, word: normalized.word, translation, left: wordHelpRemaining(state, socket.id) });
      // The consoles see which words the class tapped: counts, no names.
      io.to(teachersChannel(code)).emit(EVENTS.TEACHER_WORD_HELP, { words: summarizeWordHelp(state) });
    } catch (error) {
      console.log(`[word-lookup] Error: ${error.message}`);
      reply({ ok: false, reason: 'failed', word: normalized.word, left: wordHelpRefund(state, socket.id) });
    }
  });

  socket.on(EVENTS.CLOSE_VOTING, async ({ code, phaseInstanceId } = {}) => {
    console.log(`[close-voting] Host closing voting for room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'vote') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-voting')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    recordEvent(room, 'close-voting');

    await tallyAndAdvance(code, room);
  });

  socket.on(EVENTS.ADVANCE_PHASE, async ({ code, phaseInstanceId } = {}) => {
    console.log(`[advance-phase] Advancing phase in room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.engine) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'advance-phase')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    recordEvent(room, 'advance-phase');

    try {
      // A generic "next step" (teacher console, host Continue) during a
      // phase that stores outputs at close must CLOSE it, not blow past it —
      // otherwise downstream templates show raw {{tokens}} and scores are
      // lost. Found by the chaos simulator (one-voice advanced before
      // closeOneVoice stored its stats).
      const vs = room.phaseState;
      // A CONSOLE click (second device, not the host screen) on an open
      // two-stage phase closes it and STOPS, mirroring the host's own
      // close-then-continue buttons — one console click must not blow past
      // the results the class never saw. The host's generic advance keeps
      // close-and-move-on semantics (team-split Continue depends on it).
      const fromConsole = socket.id !== roomToHost.get(code);
      const TWO_STAGE = { rate: 1, estimate: 1, match: 1, sort: 1, checklist: 1, 'solo-quiz': 1 };
      if (vs && !vs.closed) {
        switch (vs.kind) {
          case 'vote':      await tallyAndAdvance(code, room); return;
          case 'rank':      await closeRanking(code, room); return;
          case 'one-voice': await closeOneVoice(code, room); return;
          case 'buzz':      await closeBuzz(code, room); return;
          case 'merge':     await closeMerge(code, room); return;
          case 'rate':
            // closeRating shows results without advancing — store, then move on
            await closeRating(code, room);
            break;
          case 'estimate':
            await closeEstimates(code, room);
            break;
          case 'match':
            // closeMatching shows results without advancing — store, then move on
            await closeMatching(code, room);
            break;
          case 'team-split':
            // finalize teams (auto-fill stragglers) so downstream team
            // consumers have data, then move on
            await closeTeamSplit(code, room);
            break;
          case 'team-roles':
            // finalize roles (auto-fill unpicked) so downstream consumers
            // ({{X.mine}}, checklist rolesFrom) have data, then move on
            await closeTeamRoles(code, room);
            break;
          case 'sort':
            // closeSorting shows results without advancing — store, then move on
            await closeSorting(code, room);
            break;
          case 'checklist':
            // closeChecklist shows the summary without advancing — store, then move on
            await closeChecklist(code, room);
            break;
          case 'solo-quiz':
            // closeSoloQuiz grades and shows the board without advancing
            await closeSoloQuiz(code, room);
            break;
          default:
            break;
        }
        // Stop here: the results just went up on the projector, and the
        // closers notified every console (notifyTeachersClosed). The next
        // console click advances for real.
        if (fromConsole && TWO_STAGE[vs.kind]) return;
      }

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
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
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
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
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
    if (!room || !room.phaseState || room.phaseState.kind !== 'reveal-one') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'reveal-next')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only

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
    // Teacher consoles live in their own channel — mirror the progress
    // (count only) so the console tracks the gallery.
    io.to(teachersChannel(code)).emit(EVENTS.REVEAL_ONE_ITEM, {
      index: state.revealed, total: state.items.length
    });

    // If all revealed, send complete and allow advance
    if (state.revealed >= state.items.length) {
      io.to(code).emit(EVENTS.REVEAL_ONE_COMPLETE, {});
      io.to(teachersChannel(code)).emit(EVENTS.REVEAL_ONE_COMPLETE, {});
    }
  });

  // --- Rank events ---

  socket.on(EVENTS.RANK_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'rank-submit', payload)) return;
    const { code, ranking, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'rank') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'rank-submit')) return;
    const rs = room.phaseState;
    if (!rs.eligibleIds.has(socket.id) || rs.completed.has(socket.id)) return;

    rs.submissions[socket.id] = ranking;
    rs.completed.add(socket.id);
    socket.emit(EVENTS.WAITING, { message: 'Ranking submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.RANK_RECEIVED, { count: rs.completed.size, total: rs.eligibleIds.size });
    // Everyone waiting sees the room fill up — counts only, never names.
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: rs.completed.size, total: rs.eligibleIds.size });

    if (rs.completed.size >= rs.eligibleIds.size) {
      await closeRanking(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_RANKING, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'rank') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-ranking')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    await closeRanking(code, room);
  });

  // --- Merge events (Connection Pack, think-pair-share) ---

  // --- The merge pen: one writer at a time (2026-08-21) ---
  // The shared box used to be whole-text last-write-wins, so two people
  // typing within a debounce+RTT of each other silently destroyed each
  // other's sentences. Now the group has one pen: writing claims it,
  // agreeing releases it, and it goes stale after this much idle so a
  // distracted partner can't hold the box hostage. Checked lazily; no
  // per-group timers.
  const MERGE_PEN_IDLE_MS = 2500;

  function penBlocks(group, playerId) {
    return group.penHolder && group.penHolder !== playerId &&
      (Date.now() - group.penAt) < MERGE_PEN_IDLE_MS;
  }

  function broadcastMergePen(room, group) {
    const engine = room.engine;
    const nameOf = engine ? new Map(engine.players.list().map(p => [p.id, p.name])) : new Map();
    const holderName = group.penHolder ? (nameOf.get(group.penHolder) || 'Someone') : null;
    for (const id of group.members) {
      io.to(id).emit(EVENTS.MERGE_PEN, {
        held: !!group.penHolder,
        mine: group.penHolder === id,
        holderName
      });
    }
  }

  socket.on(EVENTS.MERGE_DRAFT, (payload = {}) => {
    if (!checkEventPayload(socket, 'merge-draft', payload)) return;
    const { code, text, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'merge') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'merge-draft')) return;
    const ms = room.phaseState;
    const group = ms.byPlayer[socket.id];
    if (!group || group.submitted) return;

    // Someone else is actively writing: snap the sender's box back to the
    // shared truth instead of letting the two versions leapfrog.
    if (penBlocks(group, socket.id)) {
      socket.emit(EVENTS.MERGE_DRAFT_UPDATE, { draft: group.draft, agreedCount: group.agreed.size });
      const holderName = (room.engine.players.list().find(p => p.id === group.penHolder) || {}).name || 'Someone';
      socket.emit(EVENTS.MERGE_PEN, { held: true, mine: false, holderName });
      return;
    }

    // Live drafts broadcast to the rest of the group, so they pass the
    // blocklist (word-boundary only — no mash/min-length checks, which
    // would false-positive on half-typed text).
    const filtered = filterContent(text);
    if (filtered.blocked) {
      recordEvent(room, 'merge-draft-rejected', { groupId: group.groupId });
      socket.emit(EVENTS.RESPONSE_REJECTED, {
        reason: 'blocked',
        message: 'That language isn\'t allowed here. Try rephrasing.'
      });
      return;
    }

    const claimed = group.penHolder !== socket.id;
    group.penHolder = socket.id;
    group.penAt = Date.now();

    // Any edit invalidates earlier Agrees (the agreement was for a
    // different text).
    group.draft = String(text).slice(0, 2000);
    group.agreed.clear();

    for (const id of group.members) {
      if (id === socket.id) continue; // the writer's textarea is authoritative for them
      io.to(id).emit(EVENTS.MERGE_DRAFT_UPDATE, { draft: group.draft, agreedCount: 0 });
    }
    if (claimed) broadcastMergePen(room, group);
  });

  // Take the pen: granted once the current holder has idled (or the pen is
  // free). The button only enables client-side after the same idle window,
  // so a denial here is just clock skew; the requester gets the truth back.
  socket.on(EVENTS.MERGE_TAKE_PEN, (payload = {}) => {
    if (!checkEventPayload(socket, 'merge-take-pen', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'merge') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'merge-take-pen')) return;
    const ms = room.phaseState;
    const group = ms.byPlayer[socket.id];
    if (!group || group.submitted) return;

    if (penBlocks(group, socket.id)) {
      const holderName = (room.engine.players.list().find(p => p.id === group.penHolder) || {}).name || 'Someone';
      socket.emit(EVENTS.MERGE_PEN, { held: true, mine: false, holderName });
      return;
    }
    group.penHolder = socket.id;
    group.penAt = Date.now();
    recordEvent(room, 'merge-take-pen', { groupId: group.groupId });
    broadcastMergePen(room, group);
  });

  socket.on(EVENTS.MERGE_AGREE, async (payload = {}) => {
    if (!checkEventPayload(socket, 'merge-agree', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'merge') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'merge-agree')) return;
    const ms = room.phaseState;
    const group = ms.byPlayer[socket.id];
    if (!group || group.submitted) return;
    if (!String(group.draft || '').trim()) return; // nothing to agree to yet

    group.agreed.add(socket.id);
    recordEvent(room, 'merge-agree', { groupId: group.groupId });

    // Agreeing means "I'm done writing": release the pen so a partner can
    // refine without waiting out the idle window.
    if (group.penHolder === socket.id) {
      group.penHolder = null;
      group.penAt = 0;
      broadcastMergePen(room, group);
    }

    const needed = agreesNeeded(ms.agreeMode, group.members.length);
    if (group.agreed.size >= needed) {
      await submitMergeGroup(code, room, group);
      return;
    }
    for (const id of group.members) {
      io.to(id).emit(EVENTS.MERGE_STATUS, {
        agreedCount: group.agreed.size,
        agreesNeeded: needed,
        youAgreed: group.agreed.has(id)
      });
    }
  });

  socket.on(EVENTS.CLOSE_MERGE, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-merge', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'merge') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-merge')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    recordEvent(room, 'close-merge');
    await closeMerge(code, room);
  });

  // --- One Voice events (Connection Pack, cooperative counting) ---

  socket.on(EVENTS.ONE_VOICE_TAP, async (payload = {}) => {
    if (!checkEventPayload(socket, 'one-voice-tap', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.phaseState || room.phaseState.kind !== 'one-voice') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'one-voice-tap')) return;
    const ovs = room.phaseState;

    const players = room.engine.players;
    if (!players.find(socket.id)) return;
    const ovPhase = room.engine.getCurrentPhase();
    const eligible = getEligibleVoters(players, ovPhase.from || 'all');
    if (!eligible.some(p => p.id === socket.id)) return;

    // Server-authoritative: the receive timestamp decides — never the client.
    const result = adjudicateTap(ovs, socket.id, Date.now());

    if (result.type === 'reject') {
      // Personal only — rejections are never broadcast (no blame).
      socket.emit(EVENTS.ONE_VOICE_REJECT, { reason: result.reason });
      return;
    }

    if (result.type === 'count') {
      io.to(code).emit(EVENTS.ONE_VOICE_COUNT, oneVoiceStats(ovs));
      socket.emit(EVENTS.ONE_VOICE_YOU, { number: result.count });
      return;
    }

    if (result.type === 'reset') {
      // Journaled without the tapper — a collision is never attributable.
      recordEvent(room, 'one-voice-reset', { attempt: result.attempt });
      io.to(code).emit(EVENTS.ONE_VOICE_RESET, { ...oneVoiceStats(ovs), lockoutMs: RESET_LOCKOUT_MS });
      return;
    }

    if (result.type === 'success') {
      recordEvent(room, 'one-voice-success', { attempts: ovs.attempt });
      io.to(code).emit(EVENTS.ONE_VOICE_SUCCESS, oneVoiceStats(ovs));
      socket.emit(EVENTS.ONE_VOICE_YOU, { number: result.count });
      const instanceAtSuccess = room.phaseInstanceId;
      ovs.timer = setTimeout(async () => {
        if (room.phaseInstanceId !== instanceAtSuccess) return; // stale guard
        await closeOneVoice(code, room);
      }, SUCCESS_ADVANCE_MS);
      return;
    }

    if (result.type === 'finished-attempts') {
      recordEvent(room, 'one-voice-attempt-cap', { attempts: ovs.attempt });
      io.to(code).emit(EVENTS.ONE_VOICE_RESET, { ...oneVoiceStats(ovs), final: true, lockoutMs: RESET_LOCKOUT_MS });
      const instanceAtCap = room.phaseInstanceId;
      ovs.timer = setTimeout(async () => {
        if (room.phaseInstanceId !== instanceAtCap) return; // stale guard
        await closeOneVoice(code, room);
      }, SUCCESS_ADVANCE_MS);
    }
  });

  socket.on(EVENTS.CLOSE_ONE_VOICE, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-one-voice', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'one-voice') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-one-voice')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    recordEvent(room, 'close-one-voice');
    await closeOneVoice(code, room);
  });

  // --- Buzz events (first-tap-wins buzzer rounds) ---

  socket.on(EVENTS.BUZZ_TAP, (payload = {}) => {
    if (!checkEventPayload(socket, 'buzz-tap', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.phaseState || room.phaseState.kind !== 'buzz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'buzz-tap')) return;
    const state = room.phaseState;
    const player = room.engine.players.find(socket.id);
    if (!player) return;

    // Socket arrival order IS the buzz order — server-authoritative.
    const result = applyBuzz(state, socket.id);
    if (result.type === 'reject') {
      socket.emit(EVENTS.BUZZ_REJECT, { reason: result.reason });
      return;
    }
    recordEvent(room, 'buzz-locked', { playerId: socket.id, question: state.question });
    io.to(code).emit(EVENTS.BUZZ_LOCKED, {
      playerId: socket.id, playerName: player.name, question: state.question,
      phaseInstanceId: room.phaseInstanceId
    });
  });

  socket.on(EVENTS.BUZZ_JUDGE, (payload = {}) => {
    if (!checkEventPayload(socket, 'buzz-judge', payload)) return;
    const { code, correct, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.phaseState || room.phaseState.kind !== 'buzz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'buzz-judge')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    const state = room.phaseState;

    const result = applyJudge(state, correct === true);
    if (result.type === 'reject') return; // nobody buzzed — stray click
    const p = room.engine.players.find(result.playerId);
    recordEvent(room, 'buzz-judge', { playerId: result.playerId, correct: result.type === 'correct' });
    io.to(code).emit(EVENTS.BUZZ_RESULT, {
      correct: result.type === 'correct',
      playerId: result.playerId,
      playerName: p ? p.name : '?',
      scores: state.scores,
      points: state.points,
      question: state.question,
      phaseInstanceId: room.phaseInstanceId
    });
  });

  socket.on(EVENTS.BUZZ_NEXT, (payload = {}) => {
    if (!checkEventPayload(socket, 'buzz-next', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'buzz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'buzz-next')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    const state = room.phaseState;

    applyNextQuestion(state);
    recordEvent(room, 'buzz-next', { question: state.question });
    io.to(code).emit(EVENTS.BUZZ_OPEN, {
      question: state.question, scores: state.scores,
      phaseInstanceId: room.phaseInstanceId
    });
  });

  socket.on(EVENTS.BUZZ_FINISH, async (payload = {}) => {
    if (!checkEventPayload(socket, 'buzz-finish', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'buzz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'buzz-finish')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    recordEvent(room, 'buzz-finish');
    await closeBuzz(code, room);
  });

  // --- Estimate events (numeric guessing) ---

  // --- Solo quiz (self-paced) ---
  socket.on(EVENTS.SOLO_QUIZ_ANSWER, (payload = {}) => {
    if (!checkEventPayload(socket, 'solo-quiz-answer', payload)) return;
    const { code, index, choice, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.phaseState || room.phaseState.kind !== 'solo-quiz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'solo-quiz-answer')) return;
    const state = room.phaseState;
    if (state.closed) return;
    const player = room.engine.players.find(socket.id);
    if (!player) return;
    const phase = room.engine.config.phases[state.phaseId] || {};
    const p = state.progress[socket.id] || (state.progress[socket.id] = { index: 0, answers: [] });
    // Only the question they are on, once (a stale double tap is ignored)
    if (!Number.isInteger(index) || index !== p.index || p.index >= state.questions.length) return;
    const q = state.questions[p.index];
    if (typeof choice !== 'string' || !q.choices.includes(choice)) return;
    const correct = isCorrectAnswer(choice, q.correct);
    p.answers.push({ choice, correct });
    p.index += 1;
    recordEvent(room, 'solo-quiz-answer', { playerId: socket.id, index });
    // Mirror progress for restart survival (the snapshot keeps phaseData)
    const existing = room.engine.phaseData[state.phaseId] || {};
    room.engine.storePhaseData(state.phaseId, { ...existing, progress: state.progress });
    const next = soloQuizPlayerPayload(state, socket.id, soloQuizPoints(phase));
    socket.emit(EVENTS.SOLO_QUIZ_FEEDBACK, {
      answeredIndex: index,
      correct,
      correctAnswer: phase.showAnswers === false ? null : q.correct,
      ...next,
      phaseInstanceId: room.phaseInstanceId
    });
    emitSoloQuizProgress(code, room);
  });

  socket.on(EVENTS.CLOSE_SOLO_QUIZ, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-solo-quiz', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'solo-quiz') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-solo-quiz')) return;
    if (!isTeacherSocket(code, room, socket.id)) return;
    recordEvent(room, 'close-solo-quiz');
    await closeSoloQuiz(code, room);
  });

  socket.on(EVENTS.ESTIMATE_SUBMIT, (payload = {}) => {
    if (!checkEventPayload(socket, 'estimate-submit', payload)) return;
    const { code, value, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.engine || !room.phaseState || room.phaseState.kind !== 'estimate') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'estimate-submit')) return;
    const state = room.phaseState;
    if (state.closed) return;
    const player = room.engine.players.find(socket.id);
    if (!player) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) return;

    // Server-side bounds clamp (the client also enforces the range): the
    // step's min/max, or the question's own "scale of 1 to 10"
    const phase = room.engine.config.phases[state.phaseId] || {};
    const v = clampGuess(value, effectiveRange(phase));

    // Resubmission allowed until close — estimating invites second thoughts
    state.guesses[socket.id] = v;
    recordEvent(room, 'estimate-submit', { playerId: socket.id });
    emitEstimateProgress(code, room, state);
  });

  socket.on(EVENTS.CLOSE_ESTIMATES, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-estimates', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'estimate') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-estimates')) return;
    if (roomToHost.get(code) !== socket.id) return; // host only
    recordEvent(room, 'close-estimates');
    await closeEstimates(code, room);
  });

  // --- Sort events (place items into named buckets) ---

  socket.on(EVENTS.SORT_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'sort-submit', payload)) return;
    const { code, sorting, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'sort') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'sort-submit')) return;
    const state = room.phaseState;
    if (state.closed) return;
    if (!state.eligibleIds.has(socket.id) || state.completed.has(socket.id)) return;

    state.submissions[socket.id] = sorting.map(b => String(b ?? ''));
    state.completed.add(socket.id);
    recordEvent(room, 'sort-submit', { playerId: socket.id });
    socket.emit(EVENTS.WAITING, { message: 'Sorting submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.SORT_RECEIVED, { count: state.completed.size, total: state.eligibleIds.size });
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: state.completed.size, total: state.eligibleIds.size });

    if (state.completed.size >= state.eligibleIds.size) {
      await closeSorting(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_SORTING, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-sorting', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'sort') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-sorting')) return;
    recordEvent(room, 'close-sorting');
    await closeSorting(code, room);
  });

  // --- Checklist events (shared group to-do list) ---

  socket.on(EVENTS.CHECK_ITEM, async (payload = {}) => {
    if (!checkEventPayload(socket, 'check-item', payload)) return;
    const { code, index, checked, team, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'checklist') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'check-item')) return;
    const state = room.phaseState;
    if (state.closed) return;

    // A teacher (host or joined console) may act on any group's behalf;
    // players only ever touch their own group's list.
    const teacher = isTeacherSocket(code, room, socket.id);
    const player = room.engine.players.find(socket.id);
    const res = applyCheck(state, {
      playerId: socket.id,
      playerName: teacher && !player ? 'Teacher' : (player || {}).name || '?',
      index,
      checked: !!checked,
      asTeacher: teacher,
      groupKey: teacher ? team : undefined
    });
    if (!res.ok) return;

    recordEvent(room, 'check-item', { playerId: socket.id, index, checked: !!checked });
    emitChecklistUpdate(code, room, state, res.groupKey);
  });

  socket.on(EVENTS.CLOSE_CHECKLIST, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-checklist', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'checklist') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-checklist')) return;
    if (!isTeacherSocket(code, room, socket.id)) return;
    recordEvent(room, 'close-checklist');
    await closeChecklist(code, room);
  });

  // --- Team-split events (interactive teacher/choice modes) ---

  socket.on(EVENTS.TEAM_ASSIGN, (payload = {}) => {
    if (!checkEventPayload(socket, 'team-assign', payload)) return;
    const { code, playerId, team, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'team-split') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'team-assign')) return;
    if (!isTeacherSocket(code, room, socket.id)) return;
    const state = room.phaseState;
    if (state.mode !== 'teacher' || state.closed) return;
    if (!state.eligibleIds.has(playerId)) return;

    if (team === '') {
      delete state.assignments[playerId]; // back to the unassigned pool
    } else if (state.teamNames.includes(team)) {
      state.assignments[playerId] = team;
    } else {
      return;
    }
    recordEvent(room, 'team-assign', { playerId, team });
    emitTeamSetupUpdate(code, room, state);
  });

  socket.on(EVENTS.TEAM_PICK, async (payload = {}) => {
    if (!checkEventPayload(socket, 'team-pick', payload)) return;
    const { code, team, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'team-split') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'team-pick')) return;
    const state = room.phaseState;
    if (state.mode !== 'choice' || state.closed) return;
    if (!state.eligibleIds.has(socket.id)) return;
    if (!state.teamNames.includes(team)) return;
    if (state.assignments[socket.id] === team) return;

    // Full team: ignore the pick but re-send truth to the tapper (their
    // screen may have raced another student for the last spot). No caps at
    // all when capacity:"open" — students always reach their real team.
    if (state.capacities) {
      const idx = state.teamNames.indexOf(team);
      const current = Object.values(state.assignments).filter(t => t === team).length;
      if (current >= state.capacities[idx]) {
        socket.emit(EVENTS.TEAM_CHOICE_UPDATE, {
          rosters: buildTeamRosters(state, room.engine.players),
          placed: Object.keys(state.assignments).length,
          total: state.eligibleIds.size,
          yourTeam: state.assignments[socket.id] || null,
          full: team,
          phaseInstanceId: room.phaseInstanceId
        });
        return;
      }
    }

    state.assignments[socket.id] = team; // re-picks just move the player
    recordEvent(room, 'team-pick', { playerId: socket.id, team });
    emitTeamChoiceUpdate(code, room, state);

    if (Object.keys(state.assignments).length >= state.eligibleIds.size) {
      await closeTeamSplit(code, room);
    }
  });

  socket.on(EVENTS.ROLE_PICK, async (payload = {}) => {
    if (!checkEventPayload(socket, 'role-pick', payload)) return;
    const { code, role, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'team-roles') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'role-pick')) return;
    const state = room.phaseState;
    if (state.closed) return;

    const res = claimRole(state, socket.id, String(role || ''));
    if (!res.ok) {
      // Full role (or a race): re-send truth to the tapper only.
      const menu = buildRoleMenu(state, socket.id, room.engine.players);
      if (menu) {
        socket.emit(EVENTS.TEAM_ROLES_UPDATE, {
          ...menu, full: res.reason === 'full' ? role : null,
          phaseInstanceId: room.phaseInstanceId
        });
      }
      return;
    }
    recordEvent(room, 'role-pick', { playerId: socket.id, role });
    emitTeamRolesUpdate(code, room, state);

    const total = Object.values(state.groups).reduce((n, g) => n + g.memberIds.length, 0);
    if (Object.keys(state.picks).length >= total) {
      await closeTeamRoles(code, room);
    }
  });

  socket.on(EVENTS.TEAM_SPLIT_CONFIRM, async (payload = {}) => {
    if (!checkEventPayload(socket, 'team-split-confirm', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    // The host's confirm button doubles for team-roles choice mode (the
    // projector reuses the same board): close-only either way, the
    // reveal shows, and Continue advances.
    const confirmKind = room && room.phaseState && room.phaseState.kind;
    if (!room || (confirmKind !== 'team-split' && confirmKind !== 'team-roles')) return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'team-split-confirm')) return;
    if (!isTeacherSocket(code, room, socket.id)) return;
    recordEvent(room, 'team-split-confirm');
    if (confirmKind === 'team-roles') await closeTeamRoles(code, room);
    else await closeTeamSplit(code, room);
  });

  // --- Match events (pair two lists: vocab ↔ definitions) ---

  socket.on(EVENTS.MATCH_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'match-submit', payload)) return;
    const { code, matching, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'match') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'match-submit')) return;
    const state = room.phaseState;
    if (state.closed) return;
    if (!state.eligibleIds.has(socket.id) || state.completed.has(socket.id)) return;

    state.submissions[socket.id] = matching.map(m => String(m ?? ''));
    state.completed.add(socket.id);
    recordEvent(room, 'match-submit', { playerId: socket.id });
    socket.emit(EVENTS.WAITING, { message: 'Matches submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit(EVENTS.MATCH_RECEIVED, { count: state.completed.size, total: state.eligibleIds.size });
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: state.completed.size, total: state.eligibleIds.size });

    if (state.completed.size >= state.eligibleIds.size) {
      await closeMatching(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_MATCHING, async (payload = {}) => {
    if (!checkEventPayload(socket, 'close-matching', payload)) return;
    const { code, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'match') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-matching')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    recordEvent(room, 'close-matching');
    await closeMatching(code, room);
  });

  // --- Rate events ---

  socket.on(EVENTS.RATE_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'rate-submit', payload)) return;
    const { code, ratings, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'rate') return;
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
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: rs.completed.size, total: rs.eligibleIds.size });

    if (rs.completed.size >= rs.eligibleIds.size) {
      await closeRating(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_RATING, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'rate') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-rating')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    recordEvent(room, 'close-rating');
    await closeRating(code, room);
  });

  // --- Wager events ---

  socket.on(EVENTS.WAGER_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'wager-submit', payload)) return;
    const { code, option, amount, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'wager') return;
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
    io.to(code).emit(EVENTS.ROOM_PROGRESS, { count: ws.completed.size, total: ws.eligibleIds.size });

    if (ws.completed.size >= ws.eligibleIds.size) {
      await closeWager(code, room);
    }
  });

  socket.on(EVENTS.CLOSE_WAGER, async ({ code, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'wager') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'close-wager')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    await closeWager(code, room);
  });

  socket.on(EVENTS.WAGER_RESOLVE, async ({ code, winningOption, phaseInstanceId } = {}) => {
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'wager') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'wager-resolve')) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
    await resolveWager(code, room, winningOption);
  });

  // --- Relay events ---

  socket.on(EVENTS.RELAY_SUBMIT, async (payload = {}) => {
    if (!checkEventPayload(socket, 'relay-submit', payload)) return;
    const { code, text, phaseInstanceId } = payload;
    const room = roomManager.find(code);
    if (!room || !room.phaseState || room.phaseState.kind !== 'relay') return;
    if (isStalePhaseEvent(room, phaseInstanceId, 'relay-submit')) return;
    const rs = room.phaseState;
    if (rs.turnOrder[rs.currentTurnIndex] !== socket.id) return;

    // Relay entries broadcast to the whole class (and the projector), so
    // they pass the blocklist like collect responses do. Rejection keeps
    // the player's turn open — they revise and resubmit.
    const relayCheck = filterContent(text || '');
    if (relayCheck.blocked) {
      recordEvent(room, 'relay-rejected', { playerId: socket.id });
      socket.emit(EVENTS.RESPONSE_REJECTED, {
        reason: 'blocked',
        message: 'That language isn\'t allowed here. Try rephrasing.'
      });
      return;
    }

    // Moderation ladder on the line's meaning (relay lines hit the
    // projector directly). The await races the turn timer, so every
    // guard re-runs after it: still a relay, not stale, still this
    // player's turn. A ladder "flag" is journal-only here — relay has no
    // per-entry hide surface, and blocking on uncertainty would strand a
    // turn-based phase.
    if (moderationLadder.enabled && !room.simulated && String(text || '').trim()) {
      const rosterNames = room.engine.players.list().map(p => p.name);
      const verdict = await moderationLadder.check(String(text || ''), { rosterNames });
      if (!room.phaseState || room.phaseState.kind !== 'relay') return;
      if (isStalePhaseEvent(room, phaseInstanceId, 'relay-submit')) return;
      if (rs.turnOrder[rs.currentTurnIndex] !== socket.id) return;
      if (verdict.action === 'reject') {
        recordEvent(room, 'relay-rejected', { playerId: socket.id, reason: 'moderation' });
        socket.emit(EVENTS.RESPONSE_REJECTED, {
          reason: 'moderation',
          message: 'That message can\'t go to the class. Reword it and try again.'
        });
        return;
      }
      if (verdict.action === 'flag') {
        recordEvent(room, 'moderation-flag', { playerId: socket.id, category: verdict.category || 'uncertain' });
      }
    }

    if (rs.turnTimer) { clearTimeout(rs.turnTimer); rs.turnTimer = null; }

    const player = room.engine.players.find(socket.id);
    rs.sharedResult.push({ playerId: socket.id, name: player ? player.name : 'Unknown', text: String(text || '').slice(0, 280) });
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
    if (room && room.phaseState && room.phaseState.kind !== 'relay') return;
    if (!room || !room.phaseState) return;
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only
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

  // Preview events — delegated to handler. Teacher-only: the host screen
  // or a joined teacher console (students must never approve content).
  for (const previewEvent of ['preview-approve', 'preview-reject', 'preview-edit']) {
    socket.on(previewEvent, async (payload = {}) => {
      const { code, phaseInstanceId } = payload;
      const room = roomManager.find(code);
      if (!room || !room.engine) return;
      if (!isTeacherSocket(code, room, socket.id)) return;
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
    if (!isTeacherSocket(code, room, socket.id)) return; // flow control is teacher-only

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

    // Teacher console cleanup (consoles aren't players — separate map)
    const teacherCode = teacherSocketToRoom.get(socket.id);
    if (teacherCode) {
      teacherSocketToRoom.delete(socket.id);
      const teacherRoom = roomManager.find(teacherCode);
      if (teacherRoom && teacherRoom.teacherSocketIds) {
        teacherRoom.teacherSocketIds.delete(socket.id);
      }
    }

    const code = socketToRoom.get(socket.id);
    if (code) {
      const room = roomManager.find(code);
      if (room) {
        const players = room.engine ? room.engine.players : room.playerRegistry;
        const player = players.find(socket.id);
        if (player) {
          console.log(`[disconnect] Marking ${player.id} as disconnected in room ${code}`);
          players.disconnect(socket.id);

          const hostSocketId = roomToHost.get(code);
          if (hostSocketId) {
            io.to(hostSocketId).emit(EVENTS.PLAYER_DISCONNECTED, {
              id: socket.id,
              name: player.name,
              players: players.listPublic()
            });
          }
          emitRoomRoster(code, room);

          // Grace period — remove only if still disconnected when it expires.
          // Kept generous (PLAYER_GRACE_MS): a student who comes back inside
          // the window keeps their identity via token/name reconnect.
          const timerId = setTimeout(() => {
            disconnectTimers.delete(socket.id);
            const p = players.find(socket.id);
            if (p && !p.connected) {
              console.log(`[disconnect] Grace period expired, removing ${p.id} from room ${code}`);
              players.remove(socket.id);
              const hid = roomToHost.get(code);
              if (hid) {
                io.to(hid).emit(EVENTS.PLAYER_LEFT, {
                  id: socket.id,
                  players: players.listPublic()
                });
              }
              emitTeacherRoster(code, room);
              emitRoomRoster(code, room);
            }
          }, PLAYER_GRACE_MS);
          disconnectTimers.set(socket.id, timerId);
        }
      }
      socketToRoom.delete(socket.id);
    }

    for (const [roomCode, hostId] of roomToHost) {
      if (hostId === socket.id) {
        roomToHost.delete(roomCode);
        const room = roomManager.find(roomCode);
        if (!room) continue;

        // Robot-playtest rooms die with their host immediately (old behavior).
        if (room.simulated) {
          roomManager.delete(roomCode);
          io.to(roomCode).emit(EVENTS.ROOM_CLOSED);
          continue;
        }

        // A real host disconnect is usually an F5, a flaky projector laptop,
        // or a server hiccup — hold the room so host-rejoin can rebind.
        // Only if nobody comes back within the grace window does the room close.
        console.log(`[disconnect] Host left ${roomCode}, holding the room ${HOST_GRACE_MS / 60000} min for rejoin`);
        room.hostDisconnectedAt = Date.now();
        // Tell the consoles now: the teacher may be looking at one while
        // the projector tab sleeps behind it.
        emitTeacherRoster(roomCode, room);
        room.hostGraceTimer = setTimeout(() => {
          const still = roomManager.find(roomCode);
          if (!still || roomToHost.has(roomCode)) return; // host came back
          console.log(`[disconnect] Host never returned to ${roomCode}, closing room`);
          roomManager.delete(roomCode);
          io.to(roomCode).emit(EVENTS.ROOM_CLOSED);
          // The snapshot stays (until its TTL): a teacher whose laptop died
          // can still resurrect the game by reopening the host screen.
        }, HOST_GRACE_MS);
      }
    }
  });
});

// Init DB (so durable user recipes are available), then load recipes.
async function startup() {
  if (DB_ENABLED) {
    await initDb();
    console.log('[init] Database ready.');
    await migrateFilesystemGames();
    await migrateFilesystemRecipes();
  }
  const recipes = await reloadRecipes();
  console.log(`[init] Loaded ${recipes.size} recipe(s).`);
}

// Hourly: drop room snapshots too old to be worth resurrecting, and let
// the PIN throttle forget rooms whose lockouts/windows have long expired.
if (DB_ENABLED) {
  setInterval(() => {
    sweepRoomSnapshots(ROOM_SNAPSHOT_TTL_MS / 3600000).catch(e =>
      console.warn(`[snapshot] sweep failed (continuing): ${e.message}`));
  }, 60 * 60 * 1000);
}
setInterval(() => pinThrottle.sweep(Date.now()), 60 * 60 * 1000);

// A stray unawaited promise must not kill every classroom on this server.
// (Node's default since v15 is to crash the process on unhandled rejection.)
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled-rejection] (process kept alive):', reason);
});

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
