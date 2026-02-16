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

  // Auto-select game from URL param and create room
  const params = new URLSearchParams(window.location.search);
  const autoGame = params.get('game');
  if (autoGame) {
    const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
    if (match) {
      gameSelect.value = autoGame;
      createRoomBtn.click();
    }
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

socket.on('player-disconnected', ({ players }) => {
  renderPlayerList(players);
});

socket.on('player-reconnected', ({ players }) => {
  renderPlayerList(players);
});

// --- Timer ---
let timerInterval = null;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

function startTimer(seconds, containerEl, onExpire) {
  clearTimer();
  let remaining = seconds;
  const total = seconds;
  const textEl = containerEl.querySelector('.timer-ring-text');
  const fillEl = containerEl.querySelector('.timer-ring-fill');

  containerEl.hidden = false;
  containerEl.classList.remove('timer-warning');
  textEl.textContent = remaining;
  fillEl.style.strokeDashoffset = '0';

  timerInterval = setInterval(() => {
    remaining--;
    textEl.textContent = remaining;
    const offset = RING_CIRCUMFERENCE * (1 - remaining / total);
    fillEl.style.strokeDashoffset = offset;
    if (remaining <= 5) {
      containerEl.classList.add('timer-warning');
    }
    if (remaining <= 0) {
      clearTimer();
      containerEl.hidden = true;
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
  showSection(collectSection);
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
  showSection(processSection);
});

socket.on('preview-content', ({ content, responses }) => {
  showSection(previewSection);
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
  showSection(revealSection);
  aiResultDisplay.textContent = content || aiResult;

  if (responses && responses.length > 0) {
    revealResponses.hidden = false;
    renderResponses(responses);
  } else {
    revealResponses.hidden = true;
  }
});

socket.on('game-ended', () => {
  showSection(endSection);
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, totalVoters, timer }) => {
  showSection(voteSection);
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
  showSection(eliminationSection);
  eliminatedNamesDisplay.textContent = eliminatedNames.join(', ') + ' eliminated!';
  remainingCount.textContent = remaining + ' players remaining';
});

// --- Socket events - Winner ---

socket.on('winner-announced', ({ winnerName, winnerScore, standings }) => {
  showSection(winnerSection);
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

function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return 'hsl(' + hue + ', 55%, 50%)';
}

function renderPlayerList(players) {
  playerList.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.dataset.id = player.id;

    if (player.connected === false) {
      li.classList.add('player-disconnected');
    }

    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.textContent = player.name.charAt(0).toUpperCase();
    avatar.style.background = nameToColor(player.name);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;

    li.appendChild(avatar);
    li.appendChild(nameSpan);
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

const allSections = [
  lobbySection, collectSection, processSection, previewSection,
  revealSection, voteSection, eliminationSection, winnerSection, endSection
];

function showSection(el) {
  clearTimer();
  for (const s of allSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  // Force reflow so transition triggers
  void el.offsetWidth;
  el.classList.add('active');
}

function hideAllSections() {
  clearTimer();
  for (const s of allSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
}
