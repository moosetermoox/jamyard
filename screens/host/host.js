const socket = io();

let currentRoomCode = null;

// Elements - Lobby
const lobbySection = document.getElementById('lobby-section');
const gameSelectSection = document.getElementById('game-select-section');
const gameSelect = document.getElementById('game-select');
const roomCodeSection = document.getElementById('room-code-section');
const roomCodeDisplay = document.getElementById('room-code');
const gameNameDisplay = document.getElementById('game-name-display');
const createRoomBtn = document.getElementById('create-room-btn');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const collectTimer = document.getElementById('collect-timer');
const submissionCount = document.getElementById('submission-count');
const closeSubmissionsBtn = document.getElementById('close-submissions-btn');

// Elements - Process
const processSection = document.getElementById('process-section');

// Elements - Preview
const previewSection = document.getElementById('preview-section');
const previewContent = document.getElementById('preview-content');
const previewResponses = document.getElementById('preview-responses');
const previewResponsesList = document.getElementById('preview-responses-list');
const previewApproveBtn = document.getElementById('preview-approve-btn');
const previewRejectBtn = document.getElementById('preview-reject-btn');

// Elements - Reveal
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const revealResponses = document.getElementById('reveal-responses');
const responsesList = document.getElementById('responses-list');
const continueBtn = document.getElementById('continue-btn');

// Elements - Vote
const voteSection = document.getElementById('vote-section');
const voteModeDisplay = document.getElementById('vote-mode-display');
const voteTimer = document.getElementById('vote-timer');
const voteCount = document.getElementById('vote-count');
const closeVotingBtn = document.getElementById('close-voting-btn');

// Elements - Elimination
const eliminationSection = document.getElementById('elimination-section');
const eliminatedNamesDisplay = document.getElementById('eliminated-names');
const remainingCount = document.getElementById('remaining-count');
const eliminationContinueBtn = document.getElementById('elimination-continue-btn');

// Elements - Winner
const winnerSection = document.getElementById('winner-section');
const winnerNameDisplay = document.getElementById('winner-name');
const standingsList = document.getElementById('standings-list');
const winnerEndBtn = document.getElementById('winner-end-btn');

// Elements - End
const endSection = document.getElementById('end-section');
const playAgainBtn = document.getElementById('play-again-btn');

// Fetch available games on connect
socket.emit('get-games');

socket.on('games-list', ({ games }) => {
  gameSelect.innerHTML = '';
  if (games.length === 0) {
    gameSelect.innerHTML = '<option value="">No games available</option>';
    createRoomBtn.disabled = true;
    return;
  }
  for (const game of games) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  }
});

// --- Button handlers ---

createRoomBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;
  socket.emit('create-room', { gameId });
  createRoomBtn.disabled = true;
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start-game', { code: currentRoomCode });
});

closeSubmissionsBtn.addEventListener('click', () => {
  socket.emit('close-submissions', { code: currentRoomCode });
});

continueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

closeVotingBtn.addEventListener('click', () => {
  socket.emit('close-voting', { code: currentRoomCode });
});

previewApproveBtn.addEventListener('click', () => {
  socket.emit('preview-approve', { code: currentRoomCode });
});

previewRejectBtn.addEventListener('click', () => {
  socket.emit('preview-reject', { code: currentRoomCode });
});

eliminationContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

winnerEndBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

playAgainBtn.addEventListener('click', () => {
  location.reload();
});

// --- Socket events - Room setup ---

socket.on('room-created', ({ code, game }) => {
  currentRoomCode = code;
  roomCodeDisplay.textContent = code;
  gameNameDisplay.textContent = game || '';
  gameSelectSection.hidden = true;
  roomCodeSection.hidden = false;
});

socket.on('player-joined', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

socket.on('player-left', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

// --- Timer ---
let timerInterval = null;

function startTimer(seconds, displayEl, onExpire) {
  clearTimer();
  let remaining = seconds;
  displayEl.textContent = remaining + 's';
  displayEl.hidden = false;
  displayEl.classList.remove('timer-warning');

  timerInterval = setInterval(() => {
    remaining--;
    displayEl.textContent = remaining + 's';
    if (remaining <= 5) {
      displayEl.classList.add('timer-warning');
    }
    if (remaining <= 0) {
      clearTimer();
      displayEl.hidden = true;
      if (onExpire) onExpire();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  collectTimer.hidden = true;
  collectTimer.classList.remove('timer-warning');
  voteTimer.hidden = true;
  voteTimer.classList.remove('timer-warning');
}

// --- Socket events - Game phases ---

socket.on('game-started', ({ prompt, timer }) => {
  hideAllSections();
  collectSection.hidden = false;
  promptDisplay.textContent = prompt;
  submissionCount.textContent = '0 of 0 submitted';
  if (timer) {
    startTimer(timer, collectTimer, () => {
      closeSubmissionsBtn.click();
    });
  }
});

socket.on('response-received', ({ playerName, count, total }) => {
  submissionCount.textContent = count + ' of ' + total + ' submitted';
});

socket.on('processing-started', () => {
  hideAllSections();
  processSection.hidden = false;
});

socket.on('preview-content', ({ content, responses }) => {
  hideAllSections();
  previewSection.hidden = false;
  previewContent.textContent = content;

  if (responses && responses.length > 0) {
    previewResponses.hidden = false;
    previewResponsesList.innerHTML = '';
    for (const { name, response } of responses) {
      const li = document.createElement('li');
      li.innerHTML = '<strong>' + name + ':</strong> ' + response;
      previewResponsesList.appendChild(li);
    }
  } else {
    previewResponses.hidden = true;
  }
});

socket.on('show-results', ({ content, aiResult, responses }) => {
  hideAllSections();
  revealSection.hidden = false;
  aiResultDisplay.textContent = content || aiResult;

  if (responses && responses.length > 0) {
    revealResponses.hidden = false;
    renderResponses(responses);
  } else {
    revealResponses.hidden = true;
  }
});

socket.on('game-ended', () => {
  hideAllSections();
  endSection.hidden = false;
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, totalVoters, timer }) => {
  hideAllSections();
  voteSection.hidden = false;
  voteModeDisplay.textContent = mode === 'head-to-head' ? 'Head-to-Head' : 'Pick One';
  voteCount.textContent = '0 of ' + totalVoters + ' votes received';
  if (timer) {
    startTimer(timer, voteTimer, () => {
      closeVotingBtn.click();
    });
  }
});

socket.on('vote-received', ({ count, total }) => {
  voteCount.textContent = count + ' of ' + total + ' votes received';
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminatedNames, remaining }) => {
  hideAllSections();
  eliminationSection.hidden = false;
  eliminatedNamesDisplay.textContent = eliminatedNames.join(', ') + ' eliminated!';
  remainingCount.textContent = remaining + ' players remaining';
});

// --- Socket events - Winner ---

socket.on('winner-announced', ({ winnerName, winnerScore, standings }) => {
  hideAllSections();
  winnerSection.hidden = false;
  winnerNameDisplay.textContent = winnerName + ' wins!';

  standingsList.innerHTML = '';
  if (standings && standings.length > 0) {
    for (var i = 0; i < standings.length; i++) {
      var p = document.createElement('p');
      p.textContent = (i + 1) + '. ' + standings[i].name + ' \u2014 ' + standings[i].score + ' votes';
      standingsList.appendChild(p);
    }
  }
});

// --- Render functions ---

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
    li.innerHTML = '<strong>' + name + ':</strong> ' + response;
    responsesList.appendChild(li);
  }
}

function hideAllSections() {
  clearTimer();
  lobbySection.hidden = true;
  collectSection.hidden = true;
  processSection.hidden = true;
  previewSection.hidden = true;
  revealSection.hidden = true;
  voteSection.hidden = true;
  eliminationSection.hidden = true;
  winnerSection.hidden = true;
  endSection.hidden = true;
}
