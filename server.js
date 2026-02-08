import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';
import { RoomManager } from './engine/room-manager.js';
import { GameEngine } from './engine/game-engine.js';
import { loadGame } from './engine/game-loader.js';
import { gamePhases } from './config/game-phases.js';
import { AIService } from './services/ai-service.js';

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

const DEFAULT_GAME = 'weekend-poem';
const GAMES_DIR = join(__dirname, 'games');

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
    </body>
    </html>
  `);
});

app.use('/host', express.static(join(__dirname, 'screens/host')));
app.use('/player', express.static(join(__dirname, 'screens/player')));

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
      const code = roomManager.create();
      const room = roomManager.find(code);

      room.engine = new GameEngine(config);

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

  socket.on('start-game', ({ code }) => {
    console.log(`[start-game] Starting game in room ${code}`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[start-game] Room ${code} not found`);
      return;
    }

    try {
      if (room.engine) {
        const lobby = room.engine.getCurrentPhase();
        const nextPhaseId = lobby.next;
        room.engine.transition(nextPhaseId);

        const nextPhase = room.engine.getCurrentPhase();
        console.log(`[start-game] Room ${code} now in '${nextPhase.id}' phase`);

        if (nextPhase.type === 'collect') {
          io.to(code).emit('game-started', { prompt: nextPhase.prompt });
        } else {
          io.to(code).emit('game-started', { phase: nextPhase });
        }
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

    const allPlayers = players.list();
    const submitted = allPlayers.filter(p => p.response).length;
    const total = allPlayers.length;

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

        // Gather responses and store as phase data
        const allPlayers = players.list();
        const responses = allPlayers
          .filter(p => p.response)
          .map(p => ({ playerId: p.id, name: p.name, text: p.response }));
        room.engine.storePhaseData(collectPhase.id, { responses });
        console.log(`[close-submissions] Stored ${responses.length} responses for phase '${collectPhase.id}'`);

        // Transition to ai-process phase
        const aiPhaseId = collectPhase.next;
        room.engine.transition(aiPhaseId);
        const aiPhase = room.engine.getCurrentPhase();
        console.log(`[close-submissions] Room ${code} now in '${aiPhase.id}' phase`);

        io.to(code).emit('processing-started');

        // Get instruction from config
        const instruction = aiPhase.instruction;
        console.log(`[close-submissions] AI instruction: ${instruction}`);

        // Call AI service
        const aiResult = await aiService.process({ instruction, responses });
        console.log(`[close-submissions] AI returned: ${aiResult.text}`);

        // Store AI result as phase data
        room.engine.storePhaseData(aiPhase.id, { result: aiResult.text });

        // Transition to reveal phase
        const revealPhaseId = aiPhase.next;
        room.engine.transition(revealPhaseId);
        console.log(`[close-submissions] Room ${code} now in '${revealPhaseId}' phase`);

        io.to(code).emit('show-results', {
          aiResult: aiResult.text,
          responses: responses.map(r => ({ name: r.name, response: r.text }))
        });
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
