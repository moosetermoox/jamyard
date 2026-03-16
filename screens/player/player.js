const socket = io();

let currentRoomCode = null;
let currentPlayerName = null;
let isEliminated = false;

// Timer state
let timerInterval = null;
const collectTimerDisplay = document.getElementById('collect-timer');
const voteTimerDisplay = document.getElementById('vote-timer');

// Head-to-head vote state
let currentMatchups = [];
let currentMatchupIndex = 0;
let matchupVotes = [];
let currentCandidates = [];

// --- Screen control helpers ---

function applyShow(show, elementMap) {
  if (!show) return; // null/undefined = show all defaults
  for (const [key, el] of Object.entries(elementMap)) {
    if (el) el.hidden = !show.includes(key);
  }
}

function applyTemplate(section, templateText) {
  var tmplDiv = section.querySelector('.screen-template');
  if (!tmplDiv) return;
  if (templateText) {
    tmplDiv.textContent = templateText;
    tmplDiv.hidden = false;
  } else {
    tmplDiv.textContent = '';
    tmplDiv.hidden = true;
  }
}

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
const announceSection = document.getElementById('announce-section');
const announceMessage = document.getElementById('announce-message');
const announceTimerDisplay = document.getElementById('announce-timer');
const winnerSection = document.getElementById('winner-section');
const winnerTitle = document.getElementById('winner-title');
const winnerDetails = document.getElementById('winner-details');
const standingsList = document.getElementById('standings-list');

// --- Button handlers ---

// Prototype mode: auto-fill and auto-join
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true') {
    const code = params.get('code');
    const name = params.get('name');
    if (code && name) {
      roomCodeInput.value = code;
      nameInput.value = name;
      // Delay to ensure socket is connected
      setTimeout(() => joinBtn.click(), 500);
    }
  }
})();

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
  currentPlayerName = name;
  socket.emit('join-room', { code, name });
});

submitBtn.addEventListener('click', () => {
  const response = responseInput.value.trim();

  if (!response) {
    return;
  }

  submitBtn.disabled = true;
  socket.emit('submit-response', { code: currentRoomCode, response });
  showSection(submittedSection);
});

// --- Socket events - Join ---

socket.on('join-success', ({ name, reconnected }) => {
  if (!reconnected) {
    showSection(waitingSection);
  }
  // If reconnected, sendCurrentState on the server will push the right section
  playerNameDisplay.textContent = name;
  currentPlayerName = name;
});

// Auto-rejoin on socket reconnect
socket.on('connect', () => {
  if (currentRoomCode && currentPlayerName) {
    console.log('[reconnect] Attempting to rejoin room ' + currentRoomCode);
    socket.emit('join-room', { code: currentRoomCode, name: currentPlayerName });
  }
});

socket.on('join-error', ({ message }) => {
  showError(message);
  joinBtn.disabled = false;
  currentRoomCode = null;
});

socket.on('room-closed', () => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  showSection(joinSection);
  joinBtn.disabled = false;
  currentRoomCode = null;
  currentPlayerName = null;
  showError('Room was closed by the host');
});

// --- Timer ---
function startTimer(seconds, wrapperEl, onExpire) {
  clearTimer();
  let remaining = seconds;
  const total = seconds;
  const textEl = wrapperEl.querySelector('.timer-bar-text');
  const fillEl = wrapperEl.querySelector('.timer-bar-fill');

  wrapperEl.hidden = false;
  wrapperEl.classList.remove('timer-warning');
  textEl.textContent = remaining + 's';
  fillEl.style.width = '100%';

  timerInterval = setInterval(() => {
    remaining--;
    textEl.textContent = remaining + 's';
    fillEl.style.width = ((remaining / total) * 100) + '%';
    if (remaining <= 5) {
      wrapperEl.classList.add('timer-warning');
    }
    if (remaining <= 0) {
      clearTimer();
      wrapperEl.hidden = true;
      if (onExpire) onExpire();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  collectTimerDisplay.hidden = true;
  collectTimerDisplay.classList.remove('timer-warning');
  voteTimerDisplay.hidden = true;
  voteTimerDisplay.classList.remove('timer-warning');
  announceTimerDisplay.hidden = true;
  announceTimerDisplay.classList.remove('timer-warning');
}

// --- Socket events - Game phases ---

socket.on('game-started', ({ prompt, timer, playerTemplate, show }) => {
  showSection(collectSection);
  promptDisplay.textContent = prompt;
  responseInput.value = '';
  submitBtn.disabled = false;
  applyTemplate(collectSection, playerTemplate);
  applyShow(show, {
    prompt: promptDisplay,
    input: responseInput,
    timer: collectTimerDisplay,
    submitButton: submitBtn
  });
  if (timer) {
    startTimer(timer, collectTimerDisplay, () => {
      submitBtn.disabled = true;
      socket.emit('submit-response', { code: currentRoomCode, response: responseInput.value.trim() || '' });
      showSection(submittedSection);
    });
  }
});

const processTitle = document.getElementById('process-title');

const AI_TASK_MESSAGES = {
  'summarize': 'AI is summarizing answers...',
  'generate': 'AI is creating something...',
  'generate-choices': 'AI is generating choices...',
  'compare': 'AI is comparing answers...',
  'rank': 'AI is ranking answers...',
  'judge': 'AI is judging answers...'
};

socket.on('processing-started', ({ task, playerTemplate, playerShow } = {}) => {
  processTitle.textContent = AI_TASK_MESSAGES[task] || 'AI is working on something special...';
  showSection(processSection);
  applyTemplate(processSection, playerTemplate);
  applyShow(playerShow, { message: processTitle });
});

socket.on('show-results', ({ content, aiResult, playerTemplate, playerShow }) => {
  showSection(revealSection);
  aiResultDisplay.textContent = content || aiResult;
  applyTemplate(revealSection, playerTemplate);
  applyShow(playerShow, { content: aiResultDisplay });
});

socket.on('announce', ({ message, timer, playerTemplate, playerShow }) => {
  showSection(announceSection);
  announceMessage.textContent = message;
  applyTemplate(announceSection, playerTemplate);
  applyShow(playerShow, {
    message: announceMessage,
    timer: announceTimerDisplay
  });
  if (timer) {
    startTimer(timer, announceTimerDisplay, () => {
      // Timer auto-advances on server side
    });
  }
});

socket.on('game-ended', ({ message, playerTemplate, playerShow } = {}) => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  showSection(endSection);
  applyTemplate(endSection, playerTemplate);
  const endMsg = endSection.querySelector('h1');
  applyShow(playerShow, { message: endMsg });
});

// --- Socket events - Waiting ---

socket.on('waiting', ({ message }) => {
  showSection(gameWaitingSection);
  gameWaitingMessage.textContent = message;
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, candidates, matchups, timer, playerTemplate, show }) => {
  showSection(voteSection);
  voteOptions.innerHTML = '';
  applyTemplate(voteSection, playerTemplate);
  applyShow(show, {
    title: voteTitle,
    options: voteOptions,
    timer: voteTimerDisplay,
    progress: voteProgress
  });

  if (mode === 'pick-one') {
    voteTitle.textContent = 'Pick your favorite!';
    voteProgress.hidden = true;
    currentCandidates = candidates || [];
    showPickOneVote(candidates);
    if (timer) {
      startTimer(timer, voteTimerDisplay, () => {
        // Auto-vote: pick a random candidate
        if (currentCandidates.length > 0) {
          const randomIdx = Math.floor(Math.random() * currentCandidates.length);
          socket.emit('submit-vote', { code: currentRoomCode, choice: currentCandidates[randomIdx].playerId });
        }
        showSection(voteSubmittedSection);
      });
    }
  } else if (mode === 'head-to-head') {
    currentMatchups = matchups;
    currentMatchupIndex = 0;
    matchupVotes = [];
    showNextMatchup();
    if (timer) {
      startTimer(timer, voteTimerDisplay, () => {
        // Auto-vote: randomly pick remaining matchups
        for (let i = currentMatchupIndex; i < currentMatchups.length; i++) {
          const matchup = currentMatchups[i];
          const pick = Math.random() < 0.5 ? matchup.optionA.playerId : matchup.optionB.playerId;
          matchupVotes.push(pick);
        }
        socket.emit('submit-vote', {
          code: currentRoomCode,
          votes: matchupVotes.map(function(choice) { return { choice: choice }; })
        });
        showSection(voteSubmittedSection);
      });
    }
  }
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminated, eliminatedNames, remaining, playerTemplate, playerShow }) => {
  showSection(eliminationResultsSection);
  applyTemplate(eliminationResultsSection, playerTemplate);
  applyShow(playerShow, { details: eliminationDetails });

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

socket.on('winner-announced', ({ winnerName, winnerScore, standings, playerTemplate, playerShow }) => {
  showSection(winnerSection);
  winnerTitle.textContent = winnerName + ' wins!';
  winnerDetails.textContent = winnerScore + ' votes';
  applyTemplate(winnerSection, playerTemplate);
  applyShow(playerShow, {
    name: winnerTitle,
    details: winnerDetails,
    standings: standingsList
  });

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
      showSection(voteSubmittedSection);
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
    showSection(voteSubmittedSection);
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

const allPlayerSections = [
  joinSection, waitingSection, collectSection, submittedSection,
  processSection, revealSection, endSection, gameWaitingSection,
  voteSection, voteSubmittedSection, eliminationResultsSection,
  announceSection, winnerSection
];

function showSection(el) {
  clearTimer();
  for (const s of allPlayerSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('active');
}

function hideAllSections() {
  clearTimer();
  for (const s of allPlayerSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  // Note: eliminatedBanner is NOT hidden here — it persists once set
}
