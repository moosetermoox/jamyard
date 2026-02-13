const socket = io();

let currentRoomCode = null;
let isEliminated = false;

// Head-to-head vote state
let currentMatchups = [];
let currentMatchupIndex = 0;
let matchupVotes = [];

// Elements - Join
const joinSection = document.getElementById('join-section');
const roomCodeInput = document.getElementById('room-code-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// Elements - Waiting
const waitingSection = document.getElementById('waiting-section');
const playerNameDisplay = document.getElementById('player-name');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const responseInput = document.getElementById('response-input');
const submitBtn = document.getElementById('submit-btn');

// Elements - Other sections
const submittedSection = document.getElementById('submitted-section');
const processSection = document.getElementById('process-section');
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const endSection = document.getElementById('end-section');

// Elements - New sections
const eliminatedBanner = document.getElementById('eliminated-banner');
const gameWaitingSection = document.getElementById('game-waiting-section');
const gameWaitingMessage = document.getElementById('game-waiting-message');
const voteSection = document.getElementById('vote-section');
const voteTitle = document.getElementById('vote-title');
const voteOptions = document.getElementById('vote-options');
const voteProgress = document.getElementById('vote-progress');
const voteSubmittedSection = document.getElementById('vote-submitted-section');
const eliminationResultsSection = document.getElementById('elimination-results-section');
const eliminationDetails = document.getElementById('elimination-details');
const winnerSection = document.getElementById('winner-section');
const winnerTitle = document.getElementById('winner-title');
const winnerDetails = document.getElementById('winner-details');
const standingsList = document.getElementById('standings-list');

// --- Button handlers ---

joinBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.toUpperCase().trim();
  const name = nameInput.value.trim();

  if (code.length !== 4) {
    showError('Please enter a 4-letter room code');
    return;
  }

  errorMessage.hidden = true;
  joinBtn.disabled = true;
  currentRoomCode = code;
  socket.emit('join-room', { code, name });
});

submitBtn.addEventListener('click', () => {
  const response = responseInput.value.trim();

  if (!response) {
    return;
  }

  submitBtn.disabled = true;
  socket.emit('submit-response', { code: currentRoomCode, response });
  collectSection.hidden = true;
  submittedSection.hidden = false;
});

// --- Socket events - Join ---

socket.on('join-success', ({ name }) => {
  joinSection.hidden = true;
  waitingSection.hidden = false;
  playerNameDisplay.textContent = name;
});

socket.on('join-error', ({ message }) => {
  showError(message);
  joinBtn.disabled = false;
  currentRoomCode = null;
});

socket.on('room-closed', () => {
  hideAllSections();
  eliminatedBanner.hidden = true;
  isEliminated = false;
  joinSection.hidden = false;
  joinBtn.disabled = false;
  currentRoomCode = null;
  showError('Room was closed by the host');
});

// --- Socket events - Game phases ---

socket.on('game-started', ({ prompt }) => {
  hideAllSections();
  collectSection.hidden = false;
  promptDisplay.textContent = prompt;
  responseInput.value = '';
  submitBtn.disabled = false;
});

socket.on('processing-started', () => {
  hideAllSections();
  processSection.hidden = false;
});

socket.on('show-results', ({ content, aiResult }) => {
  hideAllSections();
  revealSection.hidden = false;
  aiResultDisplay.textContent = content || aiResult;
});

socket.on('game-ended', () => {
  hideAllSections();
  eliminatedBanner.hidden = true;
  isEliminated = false;
  endSection.hidden = false;
});

// --- Socket events - Waiting ---

socket.on('waiting', ({ message }) => {
  hideAllSections();
  gameWaitingSection.hidden = false;
  gameWaitingMessage.textContent = message;
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, candidates, matchups }) => {
  hideAllSections();
  voteSection.hidden = false;
  voteOptions.innerHTML = '';

  if (mode === 'pick-one') {
    voteTitle.textContent = 'Pick your favorite!';
    voteProgress.hidden = true;
    showPickOneVote(candidates);
  } else if (mode === 'head-to-head') {
    currentMatchups = matchups;
    currentMatchupIndex = 0;
    matchupVotes = [];
    showNextMatchup();
  }
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminated, eliminatedNames, remaining }) => {
  hideAllSections();
  eliminationResultsSection.hidden = false;

  if (eliminated.includes(socket.id)) {
    isEliminated = true;
    eliminatedBanner.hidden = false;
    eliminationDetails.textContent =
      'You were eliminated! ' + remaining + ' players remain.';
  } else {
    eliminationDetails.textContent =
      eliminatedNames.join(', ') + ' eliminated! ' + remaining + ' players remain.';
  }
});

// --- Socket events - Winner ---

socket.on('winner-announced', ({ winnerName, winnerScore, standings }) => {
  hideAllSections();
  winnerSection.hidden = false;
  winnerTitle.textContent = winnerName + ' wins!';
  winnerDetails.textContent = winnerScore + ' votes';

  standingsList.innerHTML = '';
  if (standings && standings.length > 0) {
    for (let i = 0; i < standings.length; i++) {
      const p = document.createElement('p');
      p.textContent = (i + 1) + '. ' + standings[i].name + ' \u2014 ' + standings[i].score + ' votes';
      standingsList.appendChild(p);
    }
  }
});

// --- Voting functions ---

function showPickOneVote(candidates) {
  for (const candidate of candidates) {
    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    btn.textContent = candidate.text || candidate.name || candidate.playerId;
    btn.addEventListener('click', () => {
      socket.emit('submit-vote', { code: currentRoomCode, choice: candidate.playerId });
      hideAllSections();
      voteSubmittedSection.hidden = false;
    });
    voteOptions.appendChild(btn);
  }
}

function showNextMatchup() {
  if (currentMatchupIndex >= currentMatchups.length) {
    // All matchups voted on — send all votes to server
    socket.emit('submit-vote', {
      code: currentRoomCode,
      votes: matchupVotes.map(function(choice) { return { choice: choice }; })
    });
    hideAllSections();
    voteSubmittedSection.hidden = false;
    return;
  }

  const matchup = currentMatchups[currentMatchupIndex];

  voteTitle.textContent = 'Which is better?';
  voteProgress.hidden = false;
  voteProgress.textContent =
    'Match ' + (currentMatchupIndex + 1) + ' of ' + currentMatchups.length;

  voteOptions.innerHTML = '';

  const btnA = document.createElement('button');
  btnA.className = 'vote-btn';
  btnA.textContent = matchup.optionA.text || matchup.optionA.name || matchup.optionA.playerId;
  btnA.addEventListener('click', () => {
    matchupVotes.push(matchup.optionA.playerId);
    currentMatchupIndex++;
    showNextMatchup();
  });

  const vsLabel = document.createElement('p');
  vsLabel.className = 'vs-label';
  vsLabel.textContent = 'VS';

  const btnB = document.createElement('button');
  btnB.className = 'vote-btn';
  btnB.textContent = matchup.optionB.text || matchup.optionB.name || matchup.optionB.playerId;
  btnB.addEventListener('click', () => {
    matchupVotes.push(matchup.optionB.playerId);
    currentMatchupIndex++;
    showNextMatchup();
  });

  voteOptions.appendChild(btnA);
  voteOptions.appendChild(vsLabel);
  voteOptions.appendChild(btnB);
}

// --- Helper functions ---

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideAllSections() {
  joinSection.hidden = true;
  waitingSection.hidden = true;
  collectSection.hidden = true;
  submittedSection.hidden = true;
  processSection.hidden = true;
  revealSection.hidden = true;
  endSection.hidden = true;
  gameWaitingSection.hidden = true;
  voteSection.hidden = true;
  voteSubmittedSection.hidden = true;
  eliminationResultsSection.hidden = true;
  winnerSection.hidden = true;
  // Note: eliminatedBanner is NOT hidden here — it persists once set
}
