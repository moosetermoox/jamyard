const socket = io();

let currentRoomCode = null;
let currentPlayerName = null;
let currentToken = null;
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

// Elements - Leaderboard
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardRank = document.getElementById('leaderboard-rank');
const leaderboardScore = document.getElementById('leaderboard-score');
const leaderboardStandings = document.getElementById('leaderboard-standings');

// Elements - Reveal-one
const revealOneSection = document.getElementById('reveal-one-section');
const revealOneMessage = document.getElementById('reveal-one-message');
const revealOneItems = document.getElementById('reveal-one-items');

// Elements - Team-split
const teamSplitSection = document.getElementById('team-split-section');
const teamSplitMyTeam = document.getElementById('team-split-my-team');
const teamSplitAllTeams = document.getElementById('team-split-all-teams');

// Elements - Rank
const rankSection = document.getElementById('rank-section');
const rankPromptDisplay = document.getElementById('rank-prompt-display');
const rankTimerDisplay = document.getElementById('rank-timer-display');
const rankItems = document.getElementById('rank-items');
const rankSubmitBtn = document.getElementById('rank-submit-btn');

// Elements - Wager
const wagerSection = document.getElementById('wager-section');
const wagerPromptDisplay = document.getElementById('wager-prompt-display');
const wagerPointsDisplay = document.getElementById('wager-points-display');
const wagerTimerDisplay = document.getElementById('wager-timer-display');
const wagerOptionsDisplay = document.getElementById('wager-options-display');
const wagerAmountSection = document.getElementById('wager-amount-section');
const wagerAmountInput = document.getElementById('wager-amount-input');
const wagerSubmitBtn = document.getElementById('wager-submit-btn');

// Elements - Relay
const relaySection = document.getElementById('relay-section');
const relayStatus = document.getElementById('relay-status');
const relayTimerDisplay = document.getElementById('relay-timer-display');
const relaySharedDisplay = document.getElementById('relay-shared-display');
const relayInputSection = document.getElementById('relay-input-section');
const relayInput = document.getElementById('relay-input');
const relaySubmitBtn = document.getElementById('relay-submit-btn');

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

socket.on('join-success', ({ name, reconnected, token, theme }) => {
  if (!reconnected) {
    showSection(waitingSection);
  }
  // If reconnected, sendCurrentState on the server will push the right section
  playerNameDisplay.textContent = name;
  currentPlayerName = name;
  if (token) {
    currentToken = token;
    try { sessionStorage.setItem('playerToken', token); } catch (e) { /* storage unavailable */ }
  }

  // Apply game theme
  if (theme && window.applyGameTheme) {
    window.applyGameTheme(theme);
  }
});

// Auto-rejoin on socket reconnect
socket.on('connect', () => {
  if (currentRoomCode && currentPlayerName) {
    var savedToken = currentToken;
    if (!savedToken) {
      try { savedToken = sessionStorage.getItem('playerToken'); } catch (e) { /* storage unavailable */ }
    }
    console.log('[reconnect] Attempting to rejoin room ' + currentRoomCode + (savedToken ? ' (with token)' : ''));
    socket.emit('join-room', { code: currentRoomCode, name: currentPlayerName, token: savedToken });
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

// --- Socket events - Leaderboard ---

socket.on('leaderboard', ({ standings, allStandings, style, timer, playerTemplate, show }) => {
  showSection(leaderboardSection);
  applyTemplate(leaderboardSection, playerTemplate);
  applyShow(show, {
    rank: leaderboardRank,
    standings: leaderboardStandings
  });

  // Find current player in standings
  var myStanding = (allStandings || standings || []).find(function(s) { return s.playerId === socket.id; });
  if (myStanding) {
    leaderboardRank.textContent = '#' + myStanding.rank + ' — ' + myStanding.name;
    leaderboardScore.textContent = myStanding.score + ' points';
  } else {
    leaderboardRank.textContent = '';
    leaderboardScore.textContent = '';
  }

  // Render standings list
  leaderboardStandings.innerHTML = '';
  var list = allStandings || standings || [];
  for (var i = 0; i < list.length; i++) {
    var p = document.createElement('p');
    var prefix = (i === 0 ? '\u{1F947} ' : i === 1 ? '\u{1F948} ' : i === 2 ? '\u{1F949} ' : (i + 1) + '. ');
    p.textContent = prefix + list[i].name + ' \u2014 ' + list[i].score + ' points';
    if (list[i].playerId === socket.id) {
      p.className = 'leaderboard-highlight';
    }
    leaderboardStandings.appendChild(p);
  }
});

// --- Socket events - Reveal-one ---

socket.on('reveal-one-start', ({ message, total, revealed, timer, playerTemplate, show }) => {
  showSection(revealOneSection);
  applyTemplate(revealOneSection, playerTemplate);
  applyShow(show, {
    message: revealOneMessage,
    items: revealOneItems
  });
  revealOneMessage.textContent = message || 'Revealing...';
  revealOneItems.innerHTML = '';

  // If reconnecting, revealed items come as array
  if (revealed && Array.isArray(revealed)) {
    for (var i = 0; i < revealed.length; i++) {
      appendRevealOneItem(revealed[i]);
    }
  }
});

socket.on('reveal-one-item', ({ item }) => {
  appendRevealOneItem(item);
});

socket.on('reveal-one-complete', () => {
  // No action needed on player
});

function appendRevealOneItem(item) {
  var div = document.createElement('div');
  div.className = 'reveal-one-item';
  div.textContent = typeof item === 'string' ? item : (item.text || item.name || JSON.stringify(item));
  revealOneItems.appendChild(div);
}

// --- Socket events - Team-split ---

socket.on('team-split', ({ myTeam, teams, playerTemplate, show }) => {
  showSection(teamSplitSection);
  applyTemplate(teamSplitSection, playerTemplate);
  applyShow(show, {
    team: teamSplitMyTeam,
    allTeams: teamSplitAllTeams
  });

  teamSplitMyTeam.textContent = myTeam ? 'You are on ' + myTeam + '!' : 'No team assigned';

  teamSplitAllTeams.innerHTML = '';
  for (var teamName in teams) {
    var card = document.createElement('div');
    card.className = 'team-card';
    var h3 = document.createElement('h3');
    h3.textContent = teamName;
    card.appendChild(h3);
    for (var i = 0; i < teams[teamName].length; i++) {
      var p = document.createElement('p');
      p.textContent = teams[teamName][i].name;
      if (teams[teamName][i].playerId === socket.id) {
        p.className = 'team-highlight';
      }
      card.appendChild(p);
    }
    teamSplitAllTeams.appendChild(card);
  }
});

// --- Socket events - Rank ---

var rankCurrentOrder = [];

socket.on('rank-start', ({ prompt, candidates, timer, playerTemplate, show }) => {
  showSection(rankSection);
  rankPromptDisplay.textContent = prompt || 'Rank the items';
  rankSubmitBtn.disabled = false;
  applyTemplate(rankSection, playerTemplate);
  applyShow(show, {
    prompt: rankPromptDisplay,
    items: rankItems,
    timer: rankTimerDisplay,
    submitButton: rankSubmitBtn
  });

  rankCurrentOrder = Array.isArray(candidates) ? candidates.slice() : [];
  renderRankItems();

  if (timer) {
    startTimer(timer, rankTimerDisplay, function() {
      socket.emit('rank-submit', { code: currentRoomCode, ranking: rankCurrentOrder });
      rankSubmitBtn.disabled = true;
      showSection(submittedSection);
    });
  }
});

rankSubmitBtn.addEventListener('click', function() {
  socket.emit('rank-submit', { code: currentRoomCode, ranking: rankCurrentOrder });
  rankSubmitBtn.disabled = true;
  showSection(submittedSection);
});

function renderRankItems() {
  rankItems.innerHTML = '';
  for (var i = 0; i < rankCurrentOrder.length; i++) {
    (function(index) {
      var item = rankCurrentOrder[index];
      var row = document.createElement('div');
      row.className = 'rank-item';

      var label = document.createElement('span');
      label.className = 'rank-item-label';
      label.textContent = (index + 1) + '. ' + (typeof item === 'string' ? item : (item.text || item.name || JSON.stringify(item)));

      var upBtn = document.createElement('button');
      upBtn.className = 'rank-arrow';
      upBtn.textContent = '\u25B2';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', function() {
        var temp = rankCurrentOrder[index - 1];
        rankCurrentOrder[index - 1] = rankCurrentOrder[index];
        rankCurrentOrder[index] = temp;
        renderRankItems();
      });

      var downBtn = document.createElement('button');
      downBtn.className = 'rank-arrow';
      downBtn.textContent = '\u25BC';
      downBtn.disabled = index === rankCurrentOrder.length - 1;
      downBtn.addEventListener('click', function() {
        var temp = rankCurrentOrder[index + 1];
        rankCurrentOrder[index + 1] = rankCurrentOrder[index];
        rankCurrentOrder[index] = temp;
        renderRankItems();
      });

      row.appendChild(upBtn);
      row.appendChild(label);
      row.appendChild(downBtn);
      rankItems.appendChild(row);
    })(i);
  }
}

// --- Socket events - Wager ---

var wagerSelectedOption = null;
var wagerAvailablePoints = 0;

socket.on('wager-start', ({ prompt, options, availablePoints, timer, minBet, maxBetPercent, playerTemplate, show }) => {
  showSection(wagerSection);
  wagerPromptDisplay.textContent = prompt || 'Place your bet!';
  wagerAvailablePoints = availablePoints || 0;
  wagerPointsDisplay.textContent = 'You have ' + wagerAvailablePoints + ' points';
  wagerSelectedOption = null;
  wagerSubmitBtn.disabled = false;
  applyTemplate(wagerSection, playerTemplate);
  applyShow(show, {
    prompt: wagerPromptDisplay,
    options: wagerOptionsDisplay,
    points: wagerPointsDisplay,
    timer: wagerTimerDisplay,
    submitButton: wagerSubmitBtn
  });

  var maxBet = Math.floor(wagerAvailablePoints * ((maxBetPercent || 100) / 100));
  wagerAmountInput.min = minBet || 1;
  wagerAmountInput.max = maxBet;
  wagerAmountInput.value = minBet || 1;

  wagerOptionsDisplay.innerHTML = '';
  var optionsList = Array.isArray(options) ? options : [];
  for (var i = 0; i < optionsList.length; i++) {
    (function(opt) {
      var btn = document.createElement('button');
      btn.className = 'wager-option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', function() {
        wagerSelectedOption = opt;
        var allBtns = wagerOptionsDisplay.querySelectorAll('.wager-option-btn');
        for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('selected');
        btn.classList.add('selected');
      });
      wagerOptionsDisplay.appendChild(btn);
    })(optionsList[i]);
  }

  if (timer) {
    startTimer(timer, wagerTimerDisplay, function() {
      if (!wagerSelectedOption && optionsList.length > 0) {
        wagerSelectedOption = optionsList[Math.floor(Math.random() * optionsList.length)];
      }
      socket.emit('wager-submit', {
        code: currentRoomCode,
        option: wagerSelectedOption,
        amount: parseInt(wagerAmountInput.value) || 1
      });
      wagerSubmitBtn.disabled = true;
      showSection(submittedSection);
    });
  }
});

wagerSubmitBtn.addEventListener('click', function() {
  if (!wagerSelectedOption) return;
  socket.emit('wager-submit', {
    code: currentRoomCode,
    option: wagerSelectedOption,
    amount: parseInt(wagerAmountInput.value) || 1
  });
  wagerSubmitBtn.disabled = true;
  showSection(submittedSection);
});

// --- Socket events - Relay ---

socket.on('relay-turn', ({ prompt, sharedResult, timer, progress, playerTemplate, show }) => {
  showSection(relaySection);
  relayStatus.textContent = "It's your turn!";
  relayInputSection.hidden = false;
  relayInput.value = '';
  relayInput.focus();
  relaySubmitBtn.disabled = false;
  applyTemplate(relaySection, playerTemplate);
  applyShow(show, {
    prompt: relayStatus,
    sharedResult: relaySharedDisplay,
    input: relayInputSection,
    timer: relayTimerDisplay
  });

  renderRelayShared(sharedResult);

  if (timer) {
    startTimer(timer, relayTimerDisplay, function() {
      socket.emit('relay-submit', { code: currentRoomCode, text: relayInput.value || '' });
      relaySubmitBtn.disabled = true;
      relayInputSection.hidden = true;
      relayStatus.textContent = 'Submitted! Waiting...';
    });
  }
});

socket.on('relay-waiting', ({ activePlayerName, sharedResult, progress, playerTemplate, show }) => {
  showSection(relaySection);
  relayStatus.textContent = "Waiting for " + activePlayerName + "...";
  relayInputSection.hidden = true;
  applyTemplate(relaySection, playerTemplate);
  applyShow(show, {
    prompt: relayStatus,
    sharedResult: relaySharedDisplay,
    input: relayInputSection,
    timer: relayTimerDisplay
  });

  renderRelayShared(sharedResult);
});

relaySubmitBtn.addEventListener('click', function() {
  socket.emit('relay-submit', { code: currentRoomCode, text: relayInput.value || '' });
  relaySubmitBtn.disabled = true;
  relayInputSection.hidden = true;
  relayStatus.textContent = 'Submitted! Waiting...';
});

function renderRelayShared(sharedResult) {
  relaySharedDisplay.innerHTML = '';
  if (!sharedResult || !sharedResult.length) return;
  for (var i = 0; i < sharedResult.length; i++) {
    var p = document.createElement('p');
    p.innerHTML = '<strong>' + sharedResult[i].name + ':</strong> ' + sharedResult[i].text;
    relaySharedDisplay.appendChild(p);
  }
}

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
  announceSection, winnerSection, leaderboardSection, revealOneSection,
  teamSplitSection, rankSection, wagerSection, relaySection
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
