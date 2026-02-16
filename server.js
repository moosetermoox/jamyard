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

function resolveTemplate(template, engine) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
    const value = engine.resolve(ref.trim());
    return value !== undefined ? String(value) : match;
  });
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
  delete room.voteState;

  if (phaseConfig.next) {
    engine.transition(phaseConfig.next);
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

      // Clear previous responses for multi-round games
      for (const p of engine.players.list()) {
        if (p.response) engine.players.update(p.id, { response: undefined });
      }

      // Send prompt to host
      if (hostSocketId) {
        io.to(hostSocketId).emit('game-started', { prompt: phase.prompt, timer: phase.timer || null });
      }

      // Send prompt to eligible players
      for (const player of eligible) {
        io.to(player.id).emit('game-started', { prompt: phase.prompt, timer: phase.timer || null });
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
      io.to(code).emit('processing-started');

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
      if (phase.next) {
        engine.transition(phase.next);
        await handlePhase(code, room);
      }
      break;
    }

    case 'eliminate': {
      const result = engine.runPhase(phase.id);

      const eliminatedNames = result.eliminated.map(id => {
        const player = engine.players.find(id);
        return player ? player.name : id;
      });

      console.log(`[handlePhase] Eliminated: ${eliminatedNames.join(', ')} (${result.remaining} remaining)`);

      io.to(code).emit('elimination-results', {
        eliminated: result.eliminated,
        eliminatedNames,
        remaining: result.remaining
      });
      break;
    }

    case 'vote': {
      const candidates = phase.candidates ? engine.resolve(phase.candidates) : [];
      const votersField = phase.voters || 'all';
      const eligible = getEligibleVoters(engine.players, votersField);
      const candidateIds = candidates.map(c => c.playerId || c);

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
            timer: phase.timer || null
          });
        }
      } else if (phase.mode === 'pick-one') {
        for (const voter of eligible) {
          io.to(voter.id).emit('vote-start', {
            mode: 'pick-one',
            candidates,
            timer: phase.timer || null
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
          timer: phase.timer || null
        });
      }

      console.log(`[handlePhase] Vote started: ${phase.mode}, ${candidateIds.length} candidates, ${eligible.length} voters`);
      break;
    }

    case 'winner': {
      const result = engine.runPhase(phase.id);

      console.log(`[handlePhase] Winner: ${result.winnerName} (${result.winnerScore} votes)`);

      io.to(code).emit('winner-announced', {
        winnerId: result.winnerId,
        winnerName: result.winnerName,
        winnerScore: result.winnerScore,
        standings: result.standings
      });
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

      // Send preview to host only
      if (hostSocketId) {
        io.to(hostSocketId).emit('preview-content', {
          content,
          responses,
          phaseId: phase.id
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

      // Find most recent AI result for backward compat
      let aiResult = content;
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'ai-process') {
          const data = engine.getPhaseData(id);
          if (data && data.result) {
            aiResult = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
          }
        }
      }

      // Find most recent responses for backward compat
      let responses = [];
      for (const [id, cfg] of Object.entries(engine.config.phases)) {
        if (cfg.type === 'collect') {
          const data = engine.getPhaseData(id);
          if (data && data.responses) {
            responses = data.responses.map(r => ({ name: r.name, response: r.text }));
          }
        }
      }

      io.to(code).emit('show-results', {
        content,
        aiResult,
        responses
      });
      break;
    }

    case 'end': {
      io.to(code).emit('game-ended', {
        message: phase.message || 'Game over!'
      });
      break;
    }
  }
}

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
    </body>
    </html>
  `);
});

app.use('/host', express.static(join(__dirname, 'screens/host')));
app.use('/player', express.static(join(__dirname, 'screens/player')));

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
      socket.emit('room-created', { code, game: config.name });
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
      players.add(socket.id, name);
      const player = players.find(socket.id);
      socketToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[join-room] ${player.name} (${socket.id}) joined room ${code}`);
      socket.emit('join-success', { name: player.name });

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
        room.engine.storePhaseData(collectPhase.id, { responses });
        console.log(`[close-submissions] Stored ${responses.length} responses for phase '${collectPhase.id}'`);

        // Clear responses for next collect phase
        for (const p of players.list()) {
          if (p.response) players.update(p.id, { response: undefined });
        }

        // Advance to next phase and let handlePhase take over
        if (collectPhase.next) {
          room.engine.transition(collectPhase.next);
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
      const nextPhaseId = currentPhase.next;
      if (nextPhaseId) {
        room.engine.transition(nextPhaseId);
        await handlePhase(code, room);
      }
    } catch (error) {
      console.log(`[advance-phase] Error: ${error.message}`);
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
          console.log(`[disconnect] Removing ${player.name} from room ${code}`);
          players.remove(socket.id);

          const hostSocketId = roomToHost.get(code);
          if (hostSocketId) {
            io.to(hostSocketId).emit('player-left', {
              id: socket.id,
              players: players.list()
            });
          }
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
