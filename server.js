import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './engine/room-manager.js';
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

  socket.on('create-room', () => {
    const code = roomManager.create();
    roomToHost.set(code, socket.id);
    socket.join(code);
    console.log(`[create-room] Room ${code} created by ${socket.id}`);
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code, name }) => {
    console.log(`[join-room] ${socket.id} trying to join ${code} as "${name}"`);

    const room = roomManager.find(code);
    if (!room) {
      console.log(`[join-room] Room ${code} not found`);
      socket.emit('join-error', { message: 'Room not found' });
      return;
    }

    try {
      room.playerRegistry.add(socket.id, name);
      const player = room.playerRegistry.find(socket.id);
      socketToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[join-room] ${player.name} (${socket.id}) joined room ${code}`);
      socket.emit('join-success', { name: player.name });

      const hostSocketId = roomToHost.get(code);
      if (hostSocketId) {
        io.to(hostSocketId).emit('player-joined', {
          id: socket.id,
          name: player.name,
          players: room.playerRegistry.list()
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
      room.stateMachine.transition('collect');
      const prompt = "What did you do this weekend?";
      console.log(`[start-game] Room ${code} now in 'collect' state`);
      io.to(code).emit('game-started', { prompt });
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

    const player = room.playerRegistry.find(socket.id);
    if (!player) {
      console.log(`[submit-response] Player ${socket.id} not found in room`);
      return;
    }

    room.playerRegistry.update(socket.id, { response });
    console.log(`[submit-response] Stored response from ${player.name}`);

    const players = room.playerRegistry.list();
    const submitted = players.filter(p => p.response).length;
    const total = players.length;

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
      // Transition to process phase
      room.stateMachine.transition('process');
      console.log(`[close-submissions] Room ${code} now in 'process' state`);

      // Notify everyone that processing has started
      io.to(code).emit('processing-started');
      console.log(`[close-submissions] Broadcast 'processing-started' to room ${code}`);

      // Gather all responses from players
      const players = room.playerRegistry.list();
      const responses = players
        .filter(p => p.response)
        .map(p => ({ name: p.name, text: p.response }));
      console.log(`[close-submissions] Gathered ${responses.length} responses`);

      // Call AI service to process responses
      console.log(`[close-submissions] Calling AI service...`);
      const aiResult = await aiService.process({
        instruction: 'Write a short, funny poem combining all these weekend activities',
        responses
      });
      console.log(`[close-submissions] AI returned: ${aiResult.text}`);

      // Transition to reveal phase
      room.stateMachine.transition('reveal');
      console.log(`[close-submissions] Room ${code} now in 'reveal' state`);

      // Broadcast results to everyone
      io.to(code).emit('show-results', {
        aiResult: aiResult.text,
        responses: responses.map(r => ({ name: r.name, response: r.text }))
      });
      console.log(`[close-submissions] Broadcast 'show-results' to room ${code}`);
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
      room.stateMachine.transition('end');
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
        const player = room.playerRegistry.find(socket.id);
        if (player) {
          console.log(`[disconnect] Removing ${player.name} from room ${code}`);
          room.playerRegistry.remove(socket.id);

          const hostSocketId = roomToHost.get(code);
          if (hostSocketId) {
            io.to(hostSocketId).emit('player-left', {
              id: socket.id,
              players: room.playerRegistry.list()
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
