const socket = io();

let currentRoomCode = null;

// Elements - Lobby
const lobbySection = document.getElementById('lobby-section');
const roomCodeDisplay = document.getElementById('room-code');
const createRoomBtn = document.getElementById('create-room-btn');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const submissionCount = document.getElementById('submission-count');
const closeSubmissionsBtn = document.getElementById('close-submissions-btn');

// Elements - Process
const processSection = document.getElementById('process-section');

// Elements - Reveal
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const responsesList = document.getElementById('responses-list');
const endGameBtn = document.getElementById('end-game-btn');

// Elements - End
const endSection = document.getElementById('end-section');
const playAgainBtn = document.getElementById('play-again-btn');

// Button handlers
createRoomBtn.addEventListener('click', () => {
  socket.emit('create-room');
  createRoomBtn.disabled = true;
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start-game', { code: currentRoomCode });
});

closeSubmissionsBtn.addEventListener('click', () => {
  socket.emit('close-submissions', { code: currentRoomCode });
});

endGameBtn.addEventListener('click', () => {
  socket.emit('end-game', { code: currentRoomCode });
});

playAgainBtn.addEventListener('click', () => {
  location.reload();
});

// Socket events - Room setup
socket.on('room-created', ({ code }) => {
  currentRoomCode = code;
  roomCodeDisplay.textContent = code;
  createRoomBtn.style.display = 'none';
});

socket.on('player-joined', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

socket.on('player-left', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

// Socket events - Game phases
socket.on('game-started', ({ prompt }) => {
  lobbySection.hidden = true;
  collectSection.hidden = false;
  promptDisplay.textContent = prompt;
  submissionCount.textContent = '0 of 0 submitted';
});

socket.on('response-received', ({ playerName, count, total }) => {
  submissionCount.textContent = `${count} of ${total} submitted`;
});

socket.on('processing-started', () => {
  collectSection.hidden = true;
  processSection.hidden = false;
});

socket.on('show-results', ({ aiResult, responses }) => {
  processSection.hidden = true;
  revealSection.hidden = false;
  aiResultDisplay.textContent = aiResult;
  renderResponses(responses);
});

socket.on('game-ended', () => {
  revealSection.hidden = true;
  endSection.hidden = false;
});

// Render functions
function renderPlayerList(players) {
  playerList.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.textContent = player.name;
    li.dataset.id = player.id;
    playerList.appendChild(li);
  }
}

function updateStartButton(playerCount) {
  startGameBtn.disabled = playerCount < 1;
}

function renderResponses(responses) {
  responsesList.innerHTML = '';
  for (const { name, response } of responses) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${name}:</strong> ${response}`;
    responsesList.appendChild(li);
  }
}
