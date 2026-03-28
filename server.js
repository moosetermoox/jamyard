import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, writeFile, mkdir, rm, access } from 'fs/promises';
import { RoomManager } from './engine/room-manager.js';
import { GameEngine } from './engine/game-engine.js';
import { loadGame, validate } from './engine/game-loader.js';
import { loadHooks } from './engine/hooks-loader.js';
import { gamePhases } from './config/game-phases.js';
import { AIService } from './services/ai-service.js';
import {
  generateMatchups,
  getEligibleVoters,
  tallyPickOne,
  tallyHeadToHead
} from './engine/phases/vote-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function resolveTemplate(template, engine) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
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
  const rs = room.rankState;
  if (!rs) return;
  if (room.rankTimer) { clearTimeout(room.rankTimer); room.rankTimer = null; }

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
  room.rankState = null;

  console.log(`[closeRanking] Aggregated ${Object.keys(rs.submissions).length} rankings for ${rs.candidates.length} items`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// --- Wager helpers ---

async function closeWager(code, room) {
  const ws = room.wagerState;
  if (!ws) return;
  if (room.wagerTimer) { clearTimeout(room.wagerTimer); room.wagerTimer = null; }

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
      io.to(hostId).emit('wager-need-resolve', { options: ws.options });
    }
  }
}

async function resolveWager(code, room, winningOption) {
  const ws = room.wagerState;
  if (!ws) return;

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
  room.wagerState = null;

  console.log(`[resolveWager] Winner: "${winningOption}", updated ${Object.keys(ws.wagers).length} scores`);

  const nextId = getNextPhaseId(engine, phase);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

// --- Relay helpers ---

function emitRelayTurn(code, room) {
  const rs = room.relayState;
  const activePlayerId = rs.turnOrder[rs.currentTurnIndex];
  const activePlayer = room.engine.players.find(activePlayerId);
  const progress = (rs.currentTurnIndex + 1) + ' / ' + rs.turnOrder.length;
  const hostId = roomToHost.get(code);

  // Tell active player
  io.to(activePlayerId).emit('relay-turn', {
    prompt: rs.prompt, sharedResult: rs.sharedResult,
    timer: rs.timer, progress,
    playerTemplate: rs.sc.playerTemplate, show: rs.sc.playerShow
  });

  // Tell other players to wait
  for (const pid of rs.turnOrder) {
    if (pid !== activePlayerId) {
      io.to(pid).emit('relay-waiting', {
        activePlayerName: activePlayer ? activePlayer.name : 'Someone',
        sharedResult: rs.sharedResult, progress,
        playerTemplate: rs.sc.playerTemplate, show: rs.sc.playerShow
      });
    }
  }

  // Tell host
  if (hostId) {
    io.to(hostId).emit('relay-update', {
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
      if (room.relayState && room.relayState.phaseId === rs.phaseId &&
          room.relayState.currentTurnIndex === rs.currentTurnIndex) {
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

    // Resolve templates with _current
    if (subConfig.message) {
      subConfig.message = resolveTemplate(subConfig.message, engine);
    }
    if (subConfig.prompt) {
      subConfig.prompt = resolveTemplate(subConfig.prompt, engine);
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
      const correctRef = feConfig.scoring.correctAnswer;
      let correctAnswer;
      if (correctRef === '_current.playerId') {
        correctAnswer = item.playerId;
      } else if (correctRef === '_current.playerName') {
        correctAnswer = item.playerName;
      } else if (correctRef.startsWith('_current.')) {
        correctAnswer = engine.resolve(correctRef);
      } else {
        correctAnswer = correctRef;
      }

      // Score based on collect-choice responses
      const responses = subData.responses || [];
      const pointsCorrect = feConfig.scoring.pointsCorrect || 100;
      const pointsDecoy = feConfig.scoring.pointsDecoy || 0;

      for (const r of responses) {
        if (!state.scores[r.playerId]) state.scores[r.playerId] = 0;

        // Check if the player's choice matches the correct answer
        const playerChoice = r.choice || r.text;
        // For player-name matching: find the player whose name matches the choice
        const chosenPlayer = engine.players.list().find(p => p.name === playerChoice);
        const isCorrect = (playerChoice === correctAnswer) ||
                          (chosenPlayer && chosenPlayer.id === correctAnswer);

        if (isCorrect) {
          state.scores[r.playerId] += pointsCorrect;
        } else {
          state.scores[r.playerId] += pointsDecoy;
        }
      }

      console.log(`[foreach] Iteration ${state.currentIndex + 1}/${state.items.length} scored. Scores:`,
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
  const vs = room.voteState;

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
  delete room.voteState;

  const nextId = getNextPhaseId(engine, phaseConfig);
  if (nextId) {
    engine.transition(nextId);
    await handlePhase(code, room);
  }
}

async function handlePhase(code, room) {
  const engine = room.engine;
  const phase = engine.getCurrentPhase();
  const hostSocketId = roomToHost.get(code);

  console.log(`[handlePhase] Room ${code} handling '${phase.id}' (type: ${phase.type})`);

  switch (phase.type) {
    case 'collect': {
      const from = phase.from || 'all';
      const eligible = getEligibleVoters(engine.players, from);
      const eligibleIds = new Set(eligible.map(p => p.id));
      const sc = resolveScreenControl(phase, engine);

      // Clear previous responses for multi-round games
      for (const p of engine.players.list()) {
        if (p.response) engine.players.update(p.id, { response: undefined });
      }

      // Send prompt to host
      if (hostSocketId) {
        io.to(hostSocketId).emit('game-started', {
          prompt: phase.prompt, timer: phase.timer || null,
          hostTemplate: sc.hostTemplate, show: sc.hostShow
        });
      }

      // Send prompt to eligible players
      for (const player of eligible) {
        io.to(player.id).emit('game-started', {
          prompt: phase.prompt, timer: phase.timer || null,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }

      // Send waiting to non-eligible players
      for (const player of engine.players.list()) {
        if (!eligibleIds.has(player.id)) {
          io.to(player.id).emit('waiting', { message: 'Waiting for other players...' });
        }
      }
      break;
    }

    case 'ai-process': {
      const scAi = resolveScreenControl(phase, engine);
      io.to(code).emit('processing-started', { task: phase.task, ...scAi });

      const input = engine.resolve(phase.input);
      const instruction = phase.instruction;
      const responses = Array.isArray(input) ? input : [];

      console.log(`[handlePhase] AI instruction: ${instruction}`);
      const aiResult = await aiService.process({ instruction, responses });
      console.log(`[handlePhase] AI returned: ${aiResult.text}`);

      let result;
      if (phase.format === 'json') {
        try {
          result = JSON.parse(aiResult.text);
        } catch {
          // AI may wrap JSON in preamble text — try to extract it
          const match = aiResult.text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
          if (match) {
            try {
              result = JSON.parse(match[0]);
            } catch {
              result = aiResult.text;
            }
          } else {
            result = aiResult.text;
          }
        }
      } else {
        result = aiResult.text;
      }

      engine.storePhaseData(phase.id, { result });

      // Auto-advance to next phase
      const aiNextId = getNextPhaseId(engine, phase);
      if (aiNextId) {
        engine.transition(aiNextId);
        await handlePhase(code, room);
      }
      break;
    }

    case 'eliminate': {
      const result = engine.runPhase(phase.id);
      const scElim = resolveScreenControl(phase, engine);

      const eliminatedNames = result.eliminated.map(id => {
        const player = engine.players.find(id);
        return player ? player.name : id;
      });

      console.log(`[handlePhase] Eliminated: ${eliminatedNames.join(', ')} (${result.remaining} remaining)`);

      const pauseSeconds = phase.pause || 3;
      io.to(code).emit('elimination-results', {
        eliminated: result.eliminated,
        eliminatedNames,
        remaining: result.remaining,
        pause: pauseSeconds,
        ...scElim
      });

      // Auto-advance after pause
      const elimNextId = getNextPhaseId(engine, phase);
      if (elimNextId) {
        setTimeout(async () => {
          engine.transition(elimNextId);
          await handlePhase(code, room);
        }, pauseSeconds * 1000);
      }
      break;
    }

    case 'vote': {
      const candidates = phase.candidates ? engine.resolve(phase.candidates) : [];
      const votersField = phase.voters || 'all';
      const eligible = getEligibleVoters(engine.players, votersField);
      const candidateIds = candidates.map(c => c.playerId || c);
      const scVote = resolveScreenControl(phase, engine);

      room.voteState = {
        phaseId: phase.id,
        mode: phase.mode,
        candidates,
        candidateIds,
        eligibleVoterIds: eligible.map(p => p.id),
        votes: [],
        votersCompleted: new Set()
      };

      if (phase.mode === 'head-to-head') {
        const { matchups, comparisons } = generateMatchups(candidateIds);
        room.voteState.matchups = matchups;
        room.voteState.comparisons = comparisons;

        for (const voter of eligible) {
          io.to(voter.id).emit('vote-start', {
            mode: 'head-to-head',
            matchups: matchups.map(([a, b]) => ({
              optionA: candidates.find(c => (c.playerId || c) === a) || { playerId: a },
              optionB: candidates.find(c => (c.playerId || c) === b) || { playerId: b }
            })),
            timer: phase.timer || null,
            playerTemplate: scVote.playerTemplate, show: scVote.playerShow
          });
        }
      } else if (phase.mode === 'pick-one') {
        for (const voter of eligible) {
          io.to(voter.id).emit('vote-start', {
            mode: 'pick-one',
            candidates,
            timer: phase.timer || null,
            playerTemplate: scVote.playerTemplate, show: scVote.playerShow
          });
        }
      }

      // Notify non-voters they're waiting
      const eligibleIds = new Set(eligible.map(p => p.id));
      for (const player of engine.players.list()) {
        if (!eligibleIds.has(player.id)) {
          io.to(player.id).emit('waiting', { message: 'Waiting for votes...' });
        }
      }

      // Notify host
      if (hostSocketId) {
        io.to(hostSocketId).emit('vote-start', {
          mode: phase.mode,
          totalVoters: eligible.length,
          timer: phase.timer || null,
          hostTemplate: scVote.hostTemplate, show: scVote.hostShow
        });
      }

      console.log(`[handlePhase] Vote started: ${phase.mode}, ${candidateIds.length} candidates, ${eligible.length} voters`);
      break;
    }

    case 'winner': {
      const result = engine.runPhase(phase.id);
      const scWin = resolveScreenControl(phase, engine);

      console.log(`[handlePhase] Winner: ${result.winnerName} (${result.winnerScore} votes)`);

      const winnerPause = phase.pause || 5;
      io.to(code).emit('winner-announced', {
        winnerId: result.winnerId,
        winnerName: result.winnerName,
        winnerScore: result.winnerScore,
        standings: result.standings,
        pause: winnerPause,
        ...scWin
      });

      // Auto-advance after pause
      const winNextId = getNextPhaseId(engine, phase);
      if (winNextId) {
        setTimeout(async () => {
          engine.transition(winNextId);
          await handlePhase(code, room);
        }, winnerPause * 1000);
      }
      break;
    }

    case 'leaderboard': {
      const rawScores = engine.resolve(phase.from) || {};
      const style = phase.style || 'full';

      // Build standings array — scores can be object { playerId: score } or array
      let standings = [];
      if (Array.isArray(rawScores)) {
        standings = rawScores.map((entry, i) => ({
          rank: i + 1,
          playerId: entry.playerId || entry.id,
          name: (engine.players.find(entry.playerId || entry.id) || {}).name || 'Unknown',
          score: entry.score || 0
        }));
      } else if (typeof rawScores === 'object') {
        standings = Object.entries(rawScores).map(([pid, score]) => ({
          playerId: pid,
          name: (engine.players.find(pid) || {}).name || pid,
          score: typeof score === 'number' ? score : 0
        }));
      }

      // Sort by score descending
      standings.sort((a, b) => b.score - a.score);
      standings.forEach((s, i) => { s.rank = i + 1; });

      const display = style === 'top3' ? standings.slice(0, 3) : standings;
      engine.storePhaseData(phase.id, { standings, style });
      const scLb = resolveScreenControl(phase, engine);

      console.log(`[handlePhase] Leaderboard: ${standings.length} players, style=${style}`);

      // Send to host
      if (hostSocketId) {
        io.to(hostSocketId).emit('leaderboard', {
          standings: display, allStandings: standings, style,
          timer: phase.timer || null,
          hostTemplate: scLb.hostTemplate, show: scLb.hostShow
        });
      }

      // Send to players — each gets their own rank highlighted
      for (const player of engine.players.list()) {
        io.to(player.id).emit('leaderboard', {
          standings: display, allStandings: standings, style,
          timer: phase.timer || null,
          playerTemplate: scLb.playerTemplate, show: scLb.playerShow
        });
      }

      // Auto-advance with timer
      if (phase.timer) {
        const lbNextId = getNextPhaseId(engine, phase);
        if (lbNextId) {
          setTimeout(async () => {
            engine.transition(lbNextId);
            await handlePhase(code, room);
          }, phase.timer * 1000);
        }
      }
      break;
    }

    case 'reveal-one': {
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

      const roMessage = phase.message ? resolveTemplate(phase.message, engine) : 'Reveal Time!';

      room.revealOneState = { phaseId: phase.id, items, revealed: 0, message: roMessage };
      engine.storePhaseData(phase.id, { items, revealed: 0 });
      const scRo = resolveScreenControl(phase, engine);

      console.log(`[handlePhase] Reveal-one: ${items.length} items to reveal`);

      // Send start to host
      if (hostSocketId) {
        io.to(hostSocketId).emit('reveal-one-start', {
          message: roMessage, total: items.length, revealed: 0,
          timer: phase.timer || null,
          hostTemplate: scRo.hostTemplate, show: scRo.hostShow
        });
      }

      // Send start to players
      for (const player of engine.players.list()) {
        io.to(player.id).emit('reveal-one-start', {
          message: roMessage, total: items.length, revealed: 0,
          timer: phase.timer || null,
          playerTemplate: scRo.playerTemplate, show: scRo.playerShow
        });
      }
      break;
    }

    case 'team-split': {
      const tsFrom = phase.from || 'all';
      const eligible = getEligibleVoters(engine.players, tsFrom);
      const teamCount = phase.teamCount || 2;
      const teamNames = Array.isArray(phase.teamNames) && phase.teamNames.length === teamCount
        ? phase.teamNames
        : Array.from({length: teamCount}, (_, i) => 'Team ' + (i + 1));
      const sc = resolveScreenControl(phase, engine);

      let ordered;
      if (phase.method === 'balanced' && phase.balanceFrom) {
        const scores = engine.resolve(phase.balanceFrom) || {};
        ordered = [...eligible].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
      } else {
        ordered = [...eligible].sort(() => Math.random() - 0.5);
      }

      // Distribute into teams via snake draft
      const teams = {};
      const playerTeam = {};
      for (const name of teamNames) teams[name] = [];

      for (let i = 0; i < ordered.length; i++) {
        const round = Math.floor(i / teamCount);
        const idx = round % 2 === 0 ? i % teamCount : teamCount - 1 - (i % teamCount);
        const tName = teamNames[idx];
        teams[tName].push({ playerId: ordered[i].id, name: ordered[i].name });
        playerTeam[ordered[i].id] = tName;
      }

      engine.storePhaseData(phase.id, { teams, playerTeam });

      console.log(`[handlePhase] Team-split: ${ordered.length} players into ${teamCount} teams`);

      if (hostSocketId) {
        io.to(hostSocketId).emit('team-split', {
          teams, hostTemplate: sc.hostTemplate, show: sc.hostShow
        });
      }

      for (const player of engine.players.list()) {
        io.to(player.id).emit('team-split', {
          myTeam: playerTeam[player.id] || null,
          teams,
          playerTemplate: sc.playerTemplate, show: sc.playerShow
        });
      }
      break;
    }

    case 'rank': {
      const rkFrom = phase.from || 'all';
      const rkEligible = getEligibleVoters(engine.players, rkFrom);
      let rkCandidates = phase.candidates ? engine.resolve(phase.candidates) : [];
      if (!Array.isArray(rkCandidates)) {
        if (typeof rkCandidates === 'object') {
          rkCandidates = Object.values(rkCandidates);
        } else {
          rkCandidates = [rkCandidates];
        }
      }
      // Normalize items to strings for display
      const rkItems = rkCandidates.map(c => {
        if (typeof c === 'string') return c;
        if (c && c.text) return c.text;
        if (c && c.name) return c.name;
        if (c && c.response) return c.response;
        return JSON.stringify(c);
      });

      const rkEligibleIds = new Set(rkEligible.map(p => p.id));
      room.rankState = {
        phaseId: phase.id, candidates: rkItems,
        submissions: {}, eligibleIds: rkEligibleIds, completed: new Set()
      };

      const scRk = resolveScreenControl(phase, engine);

      console.log(`[handlePhase] Rank: ${rkItems.length} items, ${rkEligible.length} rankers`);

      if (hostSocketId) {
        io.to(hostSocketId).emit('rank-start', {
          prompt: phase.prompt, totalRankers: rkEligible.length,
          timer: phase.timer || null,
          hostTemplate: scRk.hostTemplate, show: scRk.hostShow
        });
      }

      for (const player of engine.players.list()) {
        if (rkEligibleIds.has(player.id)) {
          io.to(player.id).emit('rank-start', {
            prompt: phase.prompt, candidates: rkItems,
            timer: phase.timer || null,
            playerTemplate: scRk.playerTemplate, show: scRk.playerShow
          });
        } else {
          io.to(player.id).emit('waiting', { message: 'Waiting for others to rank...' });
        }
      }

      if (phase.timer) {
        room.rankTimer = setTimeout(async () => {
          if (room.rankState && room.rankState.phaseId === phase.id) {
            await closeRanking(room.code || code, room);
          }
        }, phase.timer * 1000);
      }
      break;
    }

    case 'wager': {
      const wgFrom = phase.from || 'all';
      const wgEligible = getEligibleVoters(engine.players, wgFrom);
      let wgOptions = phase.options;
      if (typeof wgOptions === 'string' && wgOptions.includes('.')) {
        wgOptions = engine.resolve(wgOptions);
      }
      if (!Array.isArray(wgOptions)) wgOptions = [];
      wgOptions = wgOptions.map(o => typeof o === 'string' ? o : (o.text || o.name || JSON.stringify(o)));

      const wgScores = phase.scoresFrom ? (engine.resolve(phase.scoresFrom) || {}) : {};
      const wgEligibleIds = new Set(wgEligible.map(p => p.id));

      room.wagerState = {
        phaseId: phase.id, options: wgOptions, scores: { ...wgScores },
        wagers: {}, eligibleIds: wgEligibleIds, completed: new Set(),
        minBet: phase.minBet || 1,
        maxBetPercent: phase.maxBetPercent || 100,
        correctOption: phase.correctOption || null
      };

      const scWg = resolveScreenControl(phase, engine);

      console.log(`[handlePhase] Wager: ${wgOptions.length} options, ${wgEligible.length} wagerers`);

      if (hostSocketId) {
        io.to(hostSocketId).emit('wager-start', {
          prompt: phase.prompt, options: wgOptions,
          totalWagerers: wgEligible.length,
          timer: phase.timer || null,
          hostTemplate: scWg.hostTemplate, show: scWg.hostShow
        });
      }

      for (const player of engine.players.list()) {
        if (wgEligibleIds.has(player.id)) {
          const availPts = wgScores[player.id] || 0;
          io.to(player.id).emit('wager-start', {
            prompt: phase.prompt, options: wgOptions,
            availablePoints: availPts,
            minBet: room.wagerState.minBet,
            maxBetPercent: room.wagerState.maxBetPercent,
            timer: phase.timer || null,
            playerTemplate: scWg.playerTemplate, show: scWg.playerShow
          });
        } else {
          io.to(player.id).emit('waiting', { message: 'Waiting for others to place wagers...' });
        }
      }

      if (phase.timer) {
        room.wagerTimer = setTimeout(async () => {
          if (room.wagerState && room.wagerState.phaseId === phase.id) {
            await closeWager(room.code || code, room);
          }
        }, phase.timer * 1000);
      }
      break;
    }

    case 'relay': {
      const rlFrom = phase.from || 'all';
      const rlEligible = getEligibleVoters(engine.players, rlFrom);
      const scRl = resolveScreenControl(phase, engine);

      let turnOrder;
      if (phase.order === 'join-order') {
        turnOrder = rlEligible.map(p => p.id);
      } else {
        turnOrder = rlEligible.map(p => p.id).sort(() => Math.random() - 0.5);
      }

      room.relayState = {
        phaseId: phase.id, turnOrder, currentTurnIndex: 0,
        sharedResult: [], sc: scRl, prompt: phase.prompt,
        timer: phase.timer || null
      };

      console.log(`[handlePhase] Relay: ${turnOrder.length} players, order=${phase.order || 'random'}`);

      emitRelayTurn(code, room);
      break;
    }

    case 'foreach': {
      const feData = engine.resolve(phase.data) || [];
      const items = (phase.shuffle !== false ? shuffleArray(feData) : feData).map(item => {
        // Normalize items: if it's a response object {playerId, name, text}, keep it
        // If it's a string, wrap it
        if (typeof item === 'object' && item !== null) {
          return { ...item, playerName: item.name || (engine.players.find(item.playerId) || {}).name || 'Unknown' };
        }
        return { text: item, playerName: 'Unknown' };
      });

      if (items.length === 0) {
        console.log(`[foreach] '${phase.id}' has 0 items — skipping to next`);
        const feNextId = phase.next;
        if (feNextId) {
          engine.transition(feNextId);
          await handlePhase(code, room);
        }
        break;
      }

      engine.foreachState[phase.id] = {
        items,
        currentIndex: 0,
        scores: {}
      };

      console.log(`[foreach] '${phase.id}' starting with ${items.length} items`);

      const firstSubId = setupForeachIteration(engine, phase.id, phase, 0);
      engine.transition(firstSubId);
      await handlePhase(code, room);
      break;
    }

    case '_foreach_advance': {
      const fePhaseId = phase.foreachPhaseId;
      await advanceForeach(code, room, fePhaseId);
      break;
    }

    case 'preview': {
      let content = '';
      if (phase.template) {
        content = resolveTemplate(phase.template, engine);
      } else if (phase.content) {
        const resolved = engine.resolve(phase.content);
        content = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
      }

      // Gather responses if showResponses !== false
      let responses = [];
      if (phase.showResponses !== false) {
        for (const [id, cfg] of Object.entries(engine.config.phases)) {
          if (cfg.type === 'collect') {
            const data = engine.getPhaseData(id);
            if (data && data.responses) {
              responses = data.responses.map(r => ({ name: r.name, response: r.text }));
            }
          }
        }
      }

      engine.storePhaseData(phase.id, { content, responses });
      const scPreview = resolveScreenControl(phase, engine);

      // Send preview to host only
      if (hostSocketId) {
        io.to(hostSocketId).emit('preview-content', {
          content,
          responses,
          phaseId: phase.id,
          hostTemplate: scPreview.hostTemplate, show: scPreview.hostShow
        });
      }

      // Tell players to wait
      for (const player of engine.players.list()) {
        io.to(player.id).emit('waiting', { message: 'Waiting for teacher...' });
      }
      break;
    }

    case 'reveal': {
      let content = '';
      if (phase.template) {
        content = resolveTemplate(phase.template, engine);
      }

      let aiResult = content;
      let responses = [];

      // Only scan for backward compat when no template is provided
      if (!phase.template) {
        // Find most recent AI result for backward compat
        for (const [id, cfg] of Object.entries(engine.config.phases)) {
          if (cfg.type === 'ai-process') {
            const data = engine.getPhaseData(id);
            if (data && data.result) {
              aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
            }
          }
        }

        // Find most recent responses for backward compat
        for (const [id, cfg] of Object.entries(engine.config.phases)) {
          if (cfg.type === 'collect') {
            const data = engine.getPhaseData(id);
            if (data && data.responses) {
              responses = data.responses.map(r => ({ name: r.name, response: r.text }));
            }
          }
        }
      }

      const scReveal = resolveScreenControl(phase, engine);
      io.to(code).emit('show-results', {
        content,
        aiResult,
        responses,
        ...scReveal
      });
      break;
    }

    case 'announce': {
      let message = phase.message;
      if (message.includes('{{')) {
        message = resolveTemplate(message, engine);
      }
      engine.storePhaseData(phase.id, { message });
      const scAnn = resolveScreenControl(phase, engine);

      io.to(code).emit('announce', { message, timer: phase.timer || null, ...scAnn });

      // Auto-advance after timer, or wait for host advance-phase
      if (phase.timer) {
        setTimeout(async () => {
          const annNextId = getNextPhaseId(engine, phase);
          if (annNextId) {
            engine.transition(annNextId);
            await handlePhase(code, room);
          }
        }, phase.timer * 1000);
      }
      break;
    }

    case 'collect-choice': {
      const from = phase.from || 'all';
      const eligible = getEligibleVoters(engine.players, from);
      const eligibleIds = new Set(eligible.map(p => p.id));
      const scChoice = resolveScreenControl(phase, engine);

      // Resolve choices — literal array or data ref string
      let choices = phase.choices;
      if (typeof choices === 'string') {
        choices = engine.resolve(choices);
        if (!Array.isArray(choices)) choices = [];
      }

      // Clear previous responses
      for (const p of engine.players.list()) {
        if (p.response) engine.players.update(p.id, { response: undefined });
      }

      // Send to host
      if (hostSocketId) {
        io.to(hostSocketId).emit('game-started', {
          prompt: phase.prompt,
          choices,
          timer: phase.timer || null,
          isChoice: true,
          hostTemplate: scChoice.hostTemplate, show: scChoice.hostShow
        });
      }

      // Send to eligible players
      for (const player of eligible) {
        io.to(player.id).emit('game-started', {
          prompt: phase.prompt,
          choices,
          timer: phase.timer || null,
          isChoice: true,
          playerTemplate: scChoice.playerTemplate, show: scChoice.playerShow
        });
      }

      // Send waiting to non-eligible players
      for (const player of engine.players.list()) {
        if (!eligibleIds.has(player.id)) {
          io.to(player.id).emit('waiting', { message: 'Waiting for other players...' });
        }
      }
      break;
    }

    case 'ai-eliminate': {
      const scAiElim = resolveScreenControl(phase, engine);
      io.to(code).emit('processing-started', { task: 'judge', ...scAiElim });

      try {
        const input = engine.resolve(phase.input);
        const responses = Array.isArray(input) ? input : [];

        // Build AI prompt
        const playerList = responses.map(r =>
          `- ${r.playerId}: "${r.text || r.response || r.name}"`
        ).join('\n');

        const systemPrompt = `You are a game judge. Apply the rules strictly and return JSON only.
Return format: { "eliminate": [{"playerId":"...","reason":"..."}], "keep": [{"playerId":"...","reason":"..."}] }`;

        const userPrompt = `Rules: ${phase.instruction}

Player responses:
${playerList}

Apply the rules and return JSON indicating who to eliminate and who to keep.`;

        console.log(`[handlePhase] AI eliminate instruction: ${phase.instruction}`);
        console.log(`[handlePhase] AI eliminate input (${responses.length} responses): ${playerList}`);
        const aiResult = await aiService.process({
          instruction: userPrompt,
          responses: [],
          systemPrompt
        });
        console.log(`[handlePhase] AI eliminate returned: ${aiResult.text}`);

        // Parse AI response
        let parsed;
        try {
          parsed = JSON.parse(aiResult.text);
        } catch {
          const match = aiResult.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              parsed = JSON.parse(match[0]);
            } catch {
              parsed = { eliminate: [], keep: [] };
            }
          } else {
            parsed = { eliminate: [], keep: [] };
          }
        }

        const eliminatedIds = [];
        const eliminatedNames = [];
        const reasons = {};

        if (parsed.eliminate && Array.isArray(parsed.eliminate)) {
          for (const entry of parsed.eliminate) {
            const pid = entry.playerId || entry.id;
            if (pid && engine.players.find(pid)) {
              engine.players.eliminate(pid);
              eliminatedIds.push(pid);
              const player = engine.players.find(pid);
              eliminatedNames.push(player ? player.name : pid);
              reasons[pid] = entry.reason || 'Rule violation';
            }
          }
        }

        const remaining = engine.players.remaining().length;

        // Build survivors list — input responses minus eliminated
        const eliminatedSet = new Set(eliminatedIds);
        const survivors = responses
          .filter(r => !eliminatedSet.has(r.playerId))
          .map(r => ({ playerId: r.playerId, name: r.name, text: r.text || r.response || '' }));

        engine.storePhaseData(phase.id, {
          eliminated: eliminatedIds,
          eliminatedNames,
          remaining,
          reasons,
          survivors
        });

        console.log(`[handlePhase] AI eliminated: ${eliminatedNames.join(', ')} (${remaining} remaining)`);

        const aiElimPause = phase.pause || 3;
        io.to(code).emit('elimination-results', {
          eliminated: eliminatedIds,
          eliminatedNames,
          remaining,
          reasons,
          pause: aiElimPause,
          ...scAiElim
        });

        // Auto-advance after pause
        const aiElimNextId = getNextPhaseId(engine, phase);
        if (aiElimNextId) {
          setTimeout(async () => {
            engine.transition(aiElimNextId);
            await handlePhase(code, room);
        }, aiElimPause * 1000);
      }
      } catch (error) {
        console.error(`[handlePhase] AI eliminate error: ${error.message}`);
        io.to(code).emit('elimination-results', {
          eliminated: [],
          eliminatedNames: [],
          remaining: engine.players.remaining().length,
          reasons: {},
          error: error.message
        });
      }
      break;
    }

    case 'end': {
      const scEnd = resolveScreenControl(phase, engine);
      io.to(code).emit('game-ended', {
        message: phase.message || 'Game over!',
        ...scEnd
      });
      break;
    }
  }
}

// --- Reconnection: send current state to a reconnecting player ---

function sendCurrentState(socket, code, room) {
  if (!room.engine) return;

  const phase = room.engine.getCurrentPhase();
  if (!phase) return;

  console.log(`[sendCurrentState] Sending phase '${phase.id}' (${phase.type}) to ${socket.id}`);
  const rsc = resolveScreenControl(phase, room.engine);

  switch (phase.type) {
    case 'lobby':
      // Nothing extra — they'll see the waiting screen
      break;

    case 'collect': {
      const player = room.engine.players.find(socket.id);
      if (player && player.response) {
        socket.emit('waiting', { message: 'Answer submitted. Waiting for others...' });
      } else {
        socket.emit('game-started', {
          prompt: phase.prompt, timer: null,
          playerTemplate: rsc.playerTemplate, show: rsc.playerShow
        });
      }
      break;
    }

    case 'ai-process':
      socket.emit('processing-started', { task: phase.task, ...rsc });
      break;

    case 'preview':
      socket.emit('waiting', { message: 'Waiting for teacher...' });
      break;

    case 'reveal': {
      let content = '';
      if (phase.template) {
        content = resolveTemplate(phase.template, room.engine);
      }
      let aiResult = content;
      if (!phase.template) {
        for (const [id, cfg] of Object.entries(room.engine.config.phases)) {
          if (cfg.type === 'ai-process') {
            const data = room.engine.getPhaseData(id);
            if (data && data.result) {
              aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
            }
          }
        }
      }
      socket.emit('show-results', { content, aiResult, ...rsc });
      break;
    }

    case 'vote': {
      if (!room.voteState) break;
      const vs = room.voteState;
      if (vs.votersCompleted.has(socket.id)) {
        socket.emit('waiting', { message: 'Vote submitted. Waiting for results...' });
      } else if (vs.eligibleVoterIds.includes(socket.id)) {
        if (vs.mode === 'head-to-head') {
          socket.emit('vote-start', {
            mode: 'head-to-head',
            matchups: vs.matchups.map(([a, b]) => ({
              optionA: vs.candidates.find(c => (c.playerId || c) === a) || { playerId: a },
              optionB: vs.candidates.find(c => (c.playerId || c) === b) || { playerId: b }
            })),
            timer: null,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        } else {
          socket.emit('vote-start', {
            mode: 'pick-one',
            candidates: vs.candidates,
            timer: null,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        }
      } else {
        socket.emit('waiting', { message: 'Waiting for votes...' });
      }
      break;
    }

    case 'announce': {
      const announceData = room.engine.getPhaseData(phase.id);
      if (announceData) {
        socket.emit('announce', { message: announceData.message, timer: null, ...rsc });
      }
      break;
    }

    case 'collect-choice': {
      const choicePlayer = room.engine.players.find(socket.id);
      if (choicePlayer && choicePlayer.response) {
        socket.emit('waiting', { message: 'Answer submitted. Waiting for others...' });
      } else {
        let choices = phase.choices;
        if (typeof choices === 'string') {
          choices = room.engine.resolve(choices);
          if (!Array.isArray(choices)) choices = [];
        }
        socket.emit('game-started', {
          prompt: phase.prompt,
          choices,
          timer: null,
          isChoice: true,
          playerTemplate: rsc.playerTemplate, show: rsc.playerShow
        });
      }
      break;
    }

    case 'ai-eliminate':
      socket.emit('processing-started', { task: 'judge', ...rsc });
      break;

    case 'eliminate':
    case 'winner':
      socket.emit('waiting', { message: 'Game in progress...' });
      break;

    case 'leaderboard': {
      const lbData = room.engine.getPhaseData(phase.id);
      if (lbData) {
        const lbStyle = lbData.style || 'full';
        const lbDisplay = lbStyle === 'top3' ? lbData.standings.slice(0, 3) : lbData.standings;
        socket.emit('leaderboard', {
          standings: lbDisplay, allStandings: lbData.standings, style: lbStyle,
          timer: null,
          playerTemplate: rsc.playerTemplate, show: rsc.playerShow
        });
      }
      break;
    }

    case 'reveal-one': {
      const roState = room.revealOneState;
      if (roState) {
        socket.emit('reveal-one-start', {
          message: roState.message, total: roState.items.length, revealed: roState.revealed,
          timer: null,
          playerTemplate: rsc.playerTemplate, show: rsc.playerShow
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
      break;
    }

    case 'team-split': {
      const tsData = room.engine.getPhaseData(phase.id);
      if (tsData) {
        socket.emit('team-split', {
          myTeam: tsData.playerTeam[socket.id] || null,
          teams: tsData.teams,
          playerTemplate: rsc.playerTemplate, show: rsc.playerShow
        });
      }
      break;
    }

    case 'rank': {
      const rkState = room.rankState;
      if (rkState) {
        if (rkState.completed.has(socket.id)) {
          socket.emit('waiting', { message: 'Ranking submitted. Waiting for others...' });
        } else if (rkState.eligibleIds.has(socket.id)) {
          socket.emit('rank-start', {
            prompt: phase.prompt, candidates: rkState.candidates,
            timer: null,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        } else {
          socket.emit('waiting', { message: 'Waiting for others to rank...' });
        }
      }
      break;
    }

    case 'wager': {
      const wgState = room.wagerState;
      if (wgState) {
        if (wgState.completed.has(socket.id)) {
          socket.emit('waiting', { message: 'Wager placed. Waiting for others...' });
        } else if (wgState.eligibleIds.has(socket.id)) {
          const availPts = wgState.scores[socket.id] || 0;
          socket.emit('wager-start', {
            prompt: phase.prompt, options: wgState.options,
            availablePoints: availPts,
            minBet: wgState.minBet, maxBetPercent: wgState.maxBetPercent,
            timer: null,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        } else {
          socket.emit('waiting', { message: 'Waiting for others to place wagers...' });
        }
      }
      break;
    }

    case 'relay': {
      const rlState = room.relayState;
      if (rlState) {
        const activeId = rlState.turnOrder[rlState.currentTurnIndex];
        const activePlayer = room.engine.players.find(activeId);
        const progress = (rlState.currentTurnIndex + 1) + ' / ' + rlState.turnOrder.length;

        if (socket.id === activeId) {
          socket.emit('relay-turn', {
            prompt: rlState.prompt, sharedResult: rlState.sharedResult,
            timer: null, progress,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        } else {
          socket.emit('relay-waiting', {
            activePlayerName: activePlayer ? activePlayer.name : 'Someone',
            sharedResult: rlState.sharedResult, progress,
            playerTemplate: rsc.playerTemplate, show: rsc.playerShow
          });
        }
      }
      break;
    }

    case 'end':
      socket.emit('game-ended', { message: phase.message || 'Game over!', ...rsc });
      break;
  }
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
    validate(config, gameId);
    const configPath = join(GAMES_DIR, gameId, 'config.json');
    await access(configPath);
    await writeFile(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.log(`[api/games PUT] Error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

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

  socket.on('get-games', async () => {
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

      socket.emit('games-list', { games });
    } catch (error) {
      console.log(`[get-games] Error: ${error.message}`);
      socket.emit('games-list', { games: [] });
    }
  });

  socket.on('create-room', async ({ gameId } = {}) => {
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
      socket.emit('room-created', { code, game: config.name, theme: config.theme || null });
    } catch (error) {
      console.log(`[create-room] Error loading game "${selectedGame}": ${error.message}`);
      socket.emit('create-room-error', { message: error.message });
    }
  });

  socket.on('join-room', ({ code, name }) => {
    console.log(`[join-room] ${socket.id} trying to join ${code} as "${name}"`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[join-room] Room ${code} not found`);
      socket.emit('join-error', { message: 'Room not found' });
      return;
    }

    const players = room.engine ? room.engine.players : room.playerRegistry;

    try {
      // Check for reconnection: find disconnected player with same name
      const processedName = name || 'Anonymous';
      const existing = players.findByName(processedName);
      if (existing && !existing.connected) {
        console.log(`[join-room] Reconnecting ${processedName} (old: ${existing.id} -> new: ${socket.id})`);
        players.reconnect(existing.id, socket.id);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        const player = players.find(socket.id);
        const theme = room.engine ? (room.engine.config.theme || null) : null;
        socket.emit('join-success', { name: player.name, reconnected: true, theme });

        const hostSocketId = roomToHost.get(code);
        if (hostSocketId) {
          io.to(hostSocketId).emit('player-reconnected', {
            id: socket.id,
            name: player.name,
            players: players.list()
          });
        }

        // Send current game state to reconnecting player
        sendCurrentState(socket, code, room);
        return;
      }

      players.add(socket.id, name);
      const player = players.find(socket.id);
      socketToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[join-room] ${player.name} (${socket.id}) joined room ${code}`);
      const theme = room.engine ? (room.engine.config.theme || null) : null;
      socket.emit('join-success', { name: player.name, theme });

      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) {
        io.to(hostSocketId).emit('player-joined', {
          id: socket.id,
          name: player.name,
          players: players.list()
        });
      }
    } catch (error) {
      console.log(`[join-room] Error: ${error.message}`);
      socket.emit('join-error', { message: error.message });
    }
  });

  socket.on('start-game', async ({ code }) => {
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
        io.to(code).emit('game-started', { prompt });
      }
    } catch (error) {
      console.log(`[start-game] Error: ${error.message}`);
    }
  });

  socket.on('submit-response', ({ code, response }) => {
    console.log(`[submit-response] Response from ${socket.id} in room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[submit-response] Room ${code} not found`);
      return;
    }

    const players = room.engine ? room.engine.players : room.playerRegistry;
    const player = players.find(socket.id);
    if (!player) {
      console.log(`[submit-response] Player ${socket.id} not found in room`);
      return;
    }

    players.update(socket.id, { response });
    console.log(`[submit-response] Stored response from ${player.name}`);

    // Count based on eligible players for current collect phase
    let eligible;
    if (room.engine) {
      const phase = room.engine.getCurrentPhase();
      const from = phase.from || 'all';
      eligible = getEligibleVoters(room.engine.players, from);
    } else {
      eligible = players.list();
    }
    const submitted = eligible.filter(p => p.response).length;
    const total = eligible.length;

    const hostSocketId = roomToHost.get(code);
    if (hostSocketId) {
      io.to(hostSocketId).emit('response-received', {
        playerName: player.name,
        count: submitted,
        total
      });
    }
  });

  socket.on('close-submissions', async ({ code }) => {
    console.log(`[close-submissions] Closing submissions for room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[close-submissions] Room ${code} not found`);
      return;
    }

    try {
      if (room.engine) {
        const collectPhase = room.engine.getCurrentPhase();
        const players = room.engine.players;
        const from = collectPhase.from || 'all';

        // Gather responses from eligible players and store as phase data
        const eligible = getEligibleVoters(players, from);
        const responses = eligible
          .filter(p => p.response)
          .map(p => ({ playerId: p.id, name: p.name, text: p.response }));

        // For collect-choice, also compute tally
        if (collectPhase.type === 'collect-choice') {
          const tally = {};
          for (const r of responses) {
            tally[r.text] = (tally[r.text] || 0) + 1;
          }
          // Store with choice field for clarity
          const choiceResponses = responses.map(r => ({ playerId: r.playerId, name: r.name, choice: r.text }));
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
        io.to(code).emit('processing-started');

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

        io.to(code).emit('show-results', {
          aiResult: aiResult.text,
          responses: responses.map(r => ({ name: r.name, response: r.text }))
        });
      }
    } catch (error) {
      console.log(`[close-submissions] Error: ${error.message}`);
    }
  });

  socket.on('submit-vote', async ({ code, choice, votes: votesList }) => {
    const room = roomManager.find(code);
    if (!room || !room.voteState) return;

    const vs = room.voteState;
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
      io.to(hostSocketId).emit('vote-received', {
        count: vs.votersCompleted.size,
        total: vs.eligibleVoterIds.length
      });
    }

    // Auto-tally when all eligible voters have voted
    if (vs.votersCompleted.size >= vs.eligibleVoterIds.length) {
      await tallyAndAdvance(code, room);
    }
  });

  socket.on('close-voting', async ({ code }) => {
    console.log(`[close-voting] Host closing voting for room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.voteState) return;

    await tallyAndAdvance(code, room);
  });

  socket.on('advance-phase', async ({ code }) => {
    console.log(`[advance-phase] Advancing phase in room ${code}`);

    const room = roomManager.find(code);
    if (!room || !room.engine) return;

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

  socket.on('reveal-next', async ({ code }) => {
    const room = roomManager.find(code);
    if (!room || !room.revealOneState) return;

    const state = room.revealOneState;
    if (state.revealed >= state.items.length) return;

    const item = state.items[state.revealed];
    state.revealed++;
    room.engine.storePhaseData(state.phaseId, { items: state.items, revealed: state.revealed });

    console.log(`[reveal-next] Revealed item ${state.revealed}/${state.items.length} in room ${code}`);

    // Send to everyone
    io.to(code).emit('reveal-one-item', {
      item, index: state.revealed, total: state.items.length
    });

    // If all revealed, send complete and allow advance
    if (state.revealed >= state.items.length) {
      io.to(code).emit('reveal-one-complete', {});
    }
  });

  // --- Rank events ---

  socket.on('rank-submit', async ({ code, ranking }) => {
    const room = roomManager.find(code);
    if (!room || !room.rankState) return;
    const rs = room.rankState;
    if (!rs.eligibleIds.has(socket.id) || rs.completed.has(socket.id)) return;

    rs.submissions[socket.id] = ranking;
    rs.completed.add(socket.id);
    socket.emit('waiting', { message: 'Ranking submitted. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit('rank-received', { count: rs.completed.size, total: rs.eligibleIds.size });

    if (rs.completed.size >= rs.eligibleIds.size) {
      await closeRanking(code, room);
    }
  });

  socket.on('close-ranking', async ({ code }) => {
    const room = roomManager.find(code);
    if (!room || !room.rankState) return;
    await closeRanking(code, room);
  });

  // --- Wager events ---

  socket.on('wager-submit', async ({ code, option, amount }) => {
    const room = roomManager.find(code);
    if (!room || !room.wagerState) return;
    const ws = room.wagerState;
    if (!ws.eligibleIds.has(socket.id) || ws.completed.has(socket.id)) return;

    const availPts = ws.scores[socket.id] || 0;
    const maxBet = Math.floor(availPts * (ws.maxBetPercent / 100));
    const clampedAmt = Math.max(ws.minBet, Math.min(amount || ws.minBet, maxBet));

    ws.wagers[socket.id] = { option, amount: clampedAmt };
    ws.completed.add(socket.id);
    socket.emit('waiting', { message: 'Wager placed. Waiting for others...' });

    const hostId = roomToHost.get(code);
    if (hostId) io.to(hostId).emit('wager-received', { count: ws.completed.size, total: ws.eligibleIds.size });

    if (ws.completed.size >= ws.eligibleIds.size) {
      await closeWager(code, room);
    }
  });

  socket.on('close-wager', async ({ code }) => {
    const room = roomManager.find(code);
    if (!room || !room.wagerState) return;
    await closeWager(code, room);
  });

  socket.on('wager-resolve', async ({ code, winningOption }) => {
    const room = roomManager.find(code);
    if (!room || !room.wagerState) return;
    await resolveWager(code, room, winningOption);
  });

  // --- Relay events ---

  socket.on('relay-submit', async ({ code, text }) => {
    const room = roomManager.find(code);
    if (!room || !room.relayState) return;
    const rs = room.relayState;
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

  socket.on('preview-approve', async ({ code }) => {
    console.log(`[preview-approve] Host approved preview in room ${code}`);
    const room = roomManager.find(code);
    if (!room || !room.engine) return;

    try {
      const currentPhase = room.engine.getCurrentPhase();
      if (currentPhase.approveNext) {
        room.engine.transition(currentPhase.approveNext);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.log(`[preview-approve] Error: ${error.message}`);
    }
  });

  socket.on('preview-reject', async ({ code }) => {
    console.log(`[preview-reject] Host rejected preview in room ${code}`);
    const room = roomManager.find(code);
    if (!room || !room.engine) return;

    try {
      const currentPhase = room.engine.getCurrentPhase();
      if (currentPhase.rejectNext) {
        room.engine.transition(currentPhase.rejectNext);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.log(`[preview-reject] Error: ${error.message}`);
    }
  });

  socket.on('preview-edit', async ({ code, content }) => {
    console.log(`[preview-edit] Host edited preview content in room ${code}`);
    const room = roomManager.find(code);
    if (!room || !room.engine) return;

    try {
      const currentPhase = room.engine.getCurrentPhase();
      // Update the stored content with the edited version
      const existingData = room.engine.getPhaseData(currentPhase.id) || {};
      room.engine.storePhaseData(currentPhase.id, { ...existingData, content });

      if (currentPhase.approveNext) {
        room.engine.transition(currentPhase.approveNext);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.log(`[preview-edit] Error: ${error.message}`);
    }
  });

  socket.on('end-game', ({ code }) => {
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
      io.to(code).emit('game-ended');
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
            io.to(hostSocketId).emit('player-disconnected', {
              id: socket.id,
              name: player.name,
              players: players.list()
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
                io.to(hid).emit('player-left', {
                  id: socket.id,
                  players: players.list()
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
        io.to(roomCode).emit('room-closed');
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
